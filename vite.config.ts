import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const devServerOrigin = process.env.CLASHDASH_DEV_SERVER_ORIGIN ?? 'http://127.0.0.1:43127'

export default defineConfig({
  root: 'ui',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: devServerOrigin, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ui': fileURLToPath(new URL('./ui/src', import.meta.url)),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
