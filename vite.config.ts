import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base relativo: funciona en local y en GitHub Pages (project site)
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'F110 - Distribution Power System',
        short_name: 'F110 DPS',
        description:
          'SCADA de distribución eléctrica de un buque — consulta y simulación unifilar',
        lang: 'es',
        theme_color: '#0e1614',
        background_color: '#0e1614',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Revisar actualizaciones al enfocar la app y en red
        clientsClaim: true,
        skipWaiting: true,
        // El bundle unifilar supera el límite por defecto de 2 MiB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: [
          '**/*.{js,css,html,ico,svg,png,woff2,json,xlsx}',
        ],
        navigateFallback: 'index.html',
      },
      devOptions: {
        // Evita ruido del SW en desarrollo local
        enabled: false,
      },
    }),
  ],
  base: './',
})
