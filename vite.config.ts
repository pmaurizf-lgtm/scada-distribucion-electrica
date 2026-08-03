import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativo: funciona en local y en GitHub Pages (project site)
export default defineConfig({
  plugins: [react()],
  base: './',
})
