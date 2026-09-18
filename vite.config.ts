import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset URLs so Electron can load dist/index.html over file://.
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  // Only scan the real entry — otherwise Vite's dep scanner also crawls the
  // prebuilt bundles under android/app/build and fails on their imports.
  optimizeDeps: { entries: ['index.html'] },
  build: { outDir: 'dist', target: 'es2022' },
})
