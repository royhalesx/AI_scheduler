import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import checker from "vite-plugin-checker"
import { defineConfig, type Plugin } from "vite"

/**
 * Vite plugin that injects error reporting into the preview iframe.
 * Captures runtime errors, unhandled rejections, and Vite HMR compilation
 * errors, forwarding them to the parent Appifex frame via postMessage.
 *
 * Two scripts are injected into <head> so they run before React mounts:
 * 1. A regular <script> for window.onerror / unhandledrejection (sync, runs first)
 * 2. A <script type="module"> for import.meta.hot HMR error events
 */
function appifexErrorReporter(): Plugin {
  return {
    name: "appifex-error-reporter",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: {},
          injectTo: "head",
          children: `
(function() {
  var seen = {};
  function send(err) {
    try { window.parent.postMessage({ type: "appifex:web-error", error: err }, "*"); } catch(e) {}
  }
  window.addEventListener("error", function(e) {
    var key = e.message + "|" + e.filename + "|" + e.lineno;
    if (seen[key]) return;
    seen[key] = 1;
    if (e.filename && e.filename.indexOf(location.host) === -1) return;
    send({
      category: "runtime",
      message: e.message,
      file: e.filename ? e.filename.replace(location.origin, "") : undefined,
      line: e.lineno || undefined,
      column: e.colno || undefined,
      stack: e.error && e.error.stack ? e.error.stack : undefined
    });
  });
  window.addEventListener("unhandledrejection", function(e) {
    var r = e.reason;
    var msg = r && r.message ? r.message : String(r);
    var key = "rejection|" + msg;
    if (seen[key]) return;
    seen[key] = 1;
    send({
      category: "runtime",
      message: "Unhandled Promise Rejection: " + msg,
      stack: r && r.stack ? r.stack : undefined
    });
  });
  window.__appifexClearErrors = function() { seen = {}; };
})();
`,
        },
        {
          tag: "script",
          attrs: { type: "module" },
          injectTo: "head",
          children: `
if (import.meta.hot) {
  import.meta.hot.on("vite:error", function(data) {
    var err = data.err;
    try {
      window.parent.postMessage({
        type: "appifex:web-error",
        error: {
          category: "compile",
          message: err.message,
          file: err.loc && err.loc.file ? err.loc.file : undefined,
          line: err.loc && err.loc.line ? err.loc.line : undefined,
          column: err.loc && err.loc.column ? err.loc.column : undefined,
          stack: err.stack
        }
      }, "*");
    } catch(e) {}
  });
  import.meta.hot.on("vite:beforeUpdate", function() {
    try {
      window.parent.postMessage({ type: "appifex:web-error-cleared" }, "*");
      if (window.__appifexClearErrors) window.__appifexClearErrors();
    } catch(e) {}
  });
}
`,
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    checker({
      typescript: {
        tsconfigPath: "./tsconfig.app.json",
      },
    }),
    appifexErrorReporter(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Allow requests from any host (needed for E2B sandbox preview)
    allowedHosts: true,
    watch: {
      usePolling: true
    },
    // Prevent browser from caching dev server responses across code generations.
    // Without this, the iframe reloads the HTML (cache-busted via ?_cb=) but the
    // entry-point scripts (e.g. /src/main.jsx) are served from HTTP cache with
    // stale module imports, showing old code until the user does a hard refresh.
    headers: {
      "Cache-Control": "no-store",
    },
  },
})
