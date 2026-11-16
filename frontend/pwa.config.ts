import type { VitePWAOptions } from 'vite-plugin-pwa'

/**
 * PWA: instala no celular e abre rápido (app shell em cache).
 * Dado financeiro NUNCA vai para o cache: /api fica fora do service worker.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Bússola Financeira',
    short_name: 'Bússola',
    description: 'Controle financeiro pessoal com dashboards.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#131b1f',
    background_color: '#131b1f',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [], // nada de cache em runtime: a API é sempre rede
    cleanupOutdatedCaches: true,
  },
}
