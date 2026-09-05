import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

// Identité de la version, injectée dans le bundle. Railway expose le SHA
// du commit déployé ; en local on interroge git ; à défaut on ne bloque
// pas la compilation pour si peu.
const buildId = (() => {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
})()
const buildTime = new Date().toISOString()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'TubiScope',
        short_name: 'TubiScope',
        description: 'Votre organisateur vidéo personnel pour YouTube',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0f1c',
        theme_color: '#0a0f1c',
        lang: 'fr',
        orientation: 'any',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cache des bundles JS/CSS/HTML générés par Vite
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Purge les précaches des versions précédentes. Sans ça, un
        // ancien cache peut survivre à une mise à jour et resservir du
        // code périmé pendant des jours.
        cleanupOutdatedCaches: true,
        // Plafond raisonnable, on cache pas les gros assets accidentels
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Stratégie pour les vignettes YouTube : cache puis réseau
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/img\.youtube\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'youtube-thumbnails',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 jours
              }
            }
          },
          {
            urlPattern: /^https:\/\/i\.ytimg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ytimg-thumbnails',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          }
        ],
        // Permet à l'app d'être servie depuis le cache si offline
        navigateFallback: '/index.html',
        // Skip les routes Firestore (toujours réseau)
        navigateFallbackDenylist: [/^\/api/, /^\/__/, /^\/a-propos/]
      },
      devOptions: {
        // Désactivé en dev pour pas embêter les tests locaux
        enabled: false
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // En dev (npm run dev), Vite sert le front sur 5173 mais ne connaît
    // pas les routes /api/* qui vivent dans server.js. On proxy donc vers
    // Express (port 3000) pour que les hooks qui tapent /api/* marchent
    // sans dépendre du build prod. Lance Express en parallèle :
    //   node server.js (ou npm start)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
