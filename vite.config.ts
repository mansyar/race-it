import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest } from './src/pwa-manifest.ts';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: pwaManifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,glb,ogg,png,svg,ico,webmanifest}'],
      },
    }),
  ],
});
