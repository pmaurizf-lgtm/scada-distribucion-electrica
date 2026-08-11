import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base relativo: funciona en local, GitHub Pages y PWA instalada
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'pwa-icon.svg',
        'navantia-logo.webp',
        'icons.svg',
      ],
      manifest: {
        name: 'F110 · Distribution Power System',
        short_name: 'F110 DPS',
        description:
          'Unifilar SCADA de distribución eléctrica del buque F110. Instalable y usable sin conexión.',
        lang: 'es',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0e1614',
        background_color: '#0e1614',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        categories: ['utilities', 'productivity'],
      },
      workbox: {
        // Un solo build: desktop y móvil comparten el mismo precache
        // (el bundle incluye JSON de topología ≈ 2.7 MB)
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,svg,webp,woff2,json}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'scada-pages',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
      devOptions: {
        // En `npm run dev` el SW no molesta; probar PWA con `npm run build && npm run preview`
        enabled: false,
      },
    }),
  ],
  base: './',
})
