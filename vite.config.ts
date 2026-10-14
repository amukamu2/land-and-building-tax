import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Relative asset paths so the built site works from any sub-path
  // (GitHub Pages project sites, Netlify, Vercel, or a plain folder).
  base: './',
  // MapLibre alone is ~1 MB; that's expected, not a problem worth splitting for.
  build: { chunkSizeWarningLimit: 1500 },
})
