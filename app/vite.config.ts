import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sanket - rural cash flow',
        short_name: 'Sanket',
        theme_color: '#111816',
        background_color: '#111816',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        runtimeCaching: [{
          urlPattern: /\/api\/.*/,
          handler: 'NetworkFirst',
          options: { cacheName: 'sanket-api', networkTimeoutSeconds: 3 },
        }],
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', rewrite: (p: string) => p.replace(/^\/api/, '') } },
  },
})
