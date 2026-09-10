import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPLE_SPLASH_DEVICES, APPLE_SPLASH_SIZES, SPLASH_BACKGROUND } from './pwa-splash-screens';

const repoRoot = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
const publicDir = resolve(repoRoot, 'public');

describe('iOS splash screens', () => {
  it('targets the device floor: iPhone 11+ and iPad 9th gen+', () => {
    expect(APPLE_SPLASH_DEVICES).toContain('iPhone 11');
    expect(APPLE_SPLASH_DEVICES).toContain('iPhone 16 Pro Max');
    expect(APPLE_SPLASH_DEVICES).toContain('iPad 10.2"');
    expect(APPLE_SPLASH_DEVICES).toContain('iPad Pro 12.9"');
  });

  it('uses the toy-cream background', () => {
    expect(SPLASH_BACKGROUND).toBe('#f6f1e7');
  });

  it('links a portrait and landscape splash for every device size in index.html', () => {
    const links = indexHtml.match(/<link rel="apple-touch-startup-image"[^>]*>/g) ?? [];
    expect(links).toHaveLength(APPLE_SPLASH_SIZES.length * 2);
    for (const link of links) {
      expect(link).toContain('media=');
      expect(link).toMatch(/orientation: (portrait|landscape)/);
    }
  });

  it('covers the device-floor media queries', () => {
    expect(indexHtml).toContain('(device-width: 414px)');
    expect(indexHtml).toContain('(device-width: 810px)');
    expect(indexHtml).toContain('(device-width: 1024px)');
  });

  it('generated assets exist, match device resolutions, and stay under the 1 MB budget', () => {
    const files = readdirSync(publicDir).filter(
      (f) => f.startsWith('apple-splash-') && f.endsWith('.png'),
    );
    const expected = new Set<string>();
    for (const [w, h] of APPLE_SPLASH_SIZES) {
      for (const orientation of ['portrait', 'landscape']) {
        const name =
          orientation === 'portrait'
            ? `apple-splash-portrait-${w}x${h}.png`
            : `apple-splash-landscape-${h}x${w}.png`;
        expected.add(name);
        expect(files).toContain(name);
      }
    }
    expect(files).toHaveLength(expected.size);
    let total = 0;
    for (const f of files) {
      total += statSync(resolve(publicDir, f)).size;
    }
    expect(total).toBeLessThan(1024 * 1024);
  });

  it('encodes the correct pixel dimensions in the PNG header', () => {
    for (const [w, h] of APPLE_SPLASH_SIZES) {
      const buf = readFileSync(resolve(publicDir, `apple-splash-portrait-${w}x${h}.png`));
      expect(buf.readUInt32BE(16)).toBe(w);
      expect(buf.readUInt32BE(20)).toBe(h);
    }
  });
});
