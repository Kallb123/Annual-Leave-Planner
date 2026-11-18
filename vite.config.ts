import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serviceWorkerPlugin } from './vite-plugins/pwa.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
})
