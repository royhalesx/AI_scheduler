import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Appifex visual editing support
// This enables click-to-edit functionality in the Appifex preview iframe
// The script stays dormant until activated by a postMessage from the parent
import('./_appifex/visual-edit')

if (!import.meta.env.VITE_API_URL) {
  // eslint-disable-next-line no-console
  console.warn('import.meta.env.VITE_API_URL not set, using localhost fallback')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
