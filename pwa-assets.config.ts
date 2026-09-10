import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';
import { APPLE_SPLASH_DEVICES, SPLASH_BACKGROUND } from './src/pwa-splash-screens.ts';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // iOS cold-start splash screens (portrait + landscape per device size),
    // with matching `apple-touch-startup-image` head links.
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.3,
        resizeOptions: { fit: 'contain', background: SPLASH_BACKGROUND },
        linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/' },
        // Only light variants are generated (the app is always toy-cream), so
        // keep the default generator from appending a 'light-' qualifier that
        // would desync the emitted head links from the emitted files.
        name: (landscape, size) =>
          `apple-splash-${landscape ? 'landscape' : 'portrait'}-${size.width}x${size.height}.png`,
      },
      [...APPLE_SPLASH_DEVICES],
    ),
  },
  images: ['public/logo.svg'],
});
