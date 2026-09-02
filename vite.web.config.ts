/**
 * Runs the renderer on its own in a browser, backed by the in-memory dev mock
 * in `src/renderer/src/lib/devMock.ts`. Useful for UI work without launching
 * Electron; not used for any production build.
 */
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  server: { port: 5180, strictPort: true }
})
