import type { AppleDeviceName } from '@vite-pwa/assets-generator/config';

/**
 * Toy-cream background for iOS splash screens, from the palette in `style.css`
 * (`--toy-cream`) so cold-start blends into the app shell without a white flash.
 */
export const SPLASH_BACKGROUND = '#f6f1e7';

/**
 * Device-floor splash devices: iPhone 11+, iPad 9th gen+ (see
 * `conductor/product.md`). One entry per unique screen resolution — sibling
 * devices that share a resolution (e.g. iPhone 12/13/14) are covered by the
 * same media query, keeping the precached PNG set small.
 */
export const APPLE_SPLASH_DEVICES = [
  'iPhone 11',
  'iPhone 11 Pro Max',
  'iPhone 12',
  'iPhone 12 Pro Max',
  'iPhone 14 Pro',
  'iPhone 14 Pro Max',
  'iPhone 16',
  'iPhone 16 Pro',
  'iPhone 16 Pro Max',
  'iPad 10.2"',
  'iPad Air 10.9"',
  'iPad Pro 11"',
  'iPad Pro 12.9"',
] as const satisfies readonly AppleDeviceName[];

/**
 * Physical pixel resolutions for the devices above (portrait), pinned by
 * `pwa-splash-screens.test.ts` against the generated PNG headers.
 */
export const APPLE_SPLASH_SIZES = [
  [828, 1792],
  [1242, 2688],
  [1170, 2532],
  [1284, 2778],
  [1179, 2556],
  [1290, 2796],
  [1206, 2622],
  [1320, 2868],
  [1620, 2160],
  [1640, 2360],
  [1668, 2388],
  [2048, 2732],
] as const;
