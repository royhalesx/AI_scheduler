/** Load before any module that imports pdfjs-dist in Node (DOMMatrix). */
globalThis.DOMMatrix ??= class DOMMatrix {}
