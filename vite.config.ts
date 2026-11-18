import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { serviceWorkerPlugin } from './vite-plugins/pwa.ts'

// The app version shown in the footer comes from package.json. Bump it with
// `npm run bump <major|minor|patch>`.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
