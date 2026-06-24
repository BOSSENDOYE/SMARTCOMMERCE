import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', '*.png', '*.svg'],
      manifest: {
        name: 'Baobab — SmartCommerce',
        short_name: 'Baobab',
        description: 'Gestion commerciale intelligente pour l\'Afrique',
        theme_color: '#ff7631',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg',     sizes: 'any',      type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Caisse POS', short_name: 'POS', url: '/pos', description: 'Ouvrir la caisse' },
          { name: 'Tableau de bord', short_name: 'Dashboard', url: '/', description: 'Tableau de bord' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Produits — cache 24h, fallback offline
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/products'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-products-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 500, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Dashboard & rapports — cache 1h
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/dashboard'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-dashboard-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Toutes les autres routes API — cache 1h
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-general-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,          // ← mettre true pour tester le SW en dev
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
