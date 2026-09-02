import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'

async function start(): Promise<void> {
  // Opened in a plain browser rather than Electron: fall back to the in-memory
  // demo backend so the UI can be developed without the desktop shell.
  if (import.meta.env.DEV && typeof window.api === 'undefined') {
    const { installDevMock } = await import('./lib/devMock')
    installDevMock()
  }

  const container = document.getElementById('root')
  if (!container) throw new Error('Missing #root element')

  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void start()
