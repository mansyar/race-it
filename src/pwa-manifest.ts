import type { ManifestOptions } from 'vite-plugin-pwa';

/**
 * Single source of truth for the PWA web manifest. `vite.config.ts` feeds this
 * to VitePWA; `pwa-manifest.test.ts` pins the installability contract.
 *
 * Colors come from the toy palette in `style.css` (toy-red / toy-cream) so the
 * app shell, splash, and home-screen tile feel continuous with the game.
 */
export const pwaManifest: Partial<ManifestOptions> = {
  id: '/',
  name: 'Race-It',
  short_name: 'Race-It',
  description: 'Build a toy race track together, then watch the karts race to the finish!',
  lang: 'en',
  categories: ['games', 'kids'],
  theme_color: '#e63946',
  background_color: '#f6f1e7',
  display: 'standalone',
  orientation: 'any',
  icons: [
    { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    {
      src: 'maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
