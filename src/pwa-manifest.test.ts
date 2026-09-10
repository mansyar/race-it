import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pwaManifest } from './pwa-manifest';

/** Chrome only shows the rich install UI for screenshots inside these bounds. */
const CHROME_MIN_PX = 320;
const CHROME_MAX_PX = 3840;

describe('PWA manifest contract', () => {
  it('is installable: standalone display with a stable app id', () => {
    expect(pwaManifest.display).toBe('standalone');
    expect(pwaManifest.id).toBe('/');
  });

  it('keeps the toy palette theme colors', () => {
    expect(pwaManifest.theme_color).toBe('#e63946');
    expect(pwaManifest.background_color).toBe('#f6f1e7');
  });

  it('declares language and kids-game categories', () => {
    expect(pwaManifest.lang).toBe('en');
    expect(pwaManifest.categories).toEqual(['games', 'kids']);
  });

  it('speaks warmly to the parent in the store description', () => {
    expect(pwaManifest.description).toMatch(/toy/i);
    expect(pwaManifest.description).toMatch(/race/i);
  });

  it('stays installable on any orientation with the full icon set', () => {
    expect(pwaManifest.orientation).toBe('any');
    const icons = pwaManifest.icons ?? [];
    const sizes = icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('ships narrow and wide screenshots for the rich install UI', () => {
    const shots = pwaManifest.screenshots ?? [];
    expect(shots.map((shot) => shot.form_factor)).toEqual(
      expect.arrayContaining(['narrow', 'wide']),
    );
    for (const shot of shots) {
      expect(shot.platform).toBe('web');
      expect(shot.type).toBe('image/png');
    }
  });

  it('keeps screenshot sizes inside the Chrome install-UI bounds', () => {
    const shots = pwaManifest.screenshots ?? [];
    expect(shots.length).toBeGreaterThanOrEqual(2);
    for (const shot of shots) {
      const [width, height] = (shot.sizes ?? '')
        .split('x')
        .map((value) => Number.parseInt(value, 10));
      expect(width).toBeGreaterThanOrEqual(CHROME_MIN_PX);
      expect(width).toBeLessThanOrEqual(CHROME_MAX_PX);
      expect(height).toBeGreaterThanOrEqual(CHROME_MIN_PX);
      expect(height).toBeLessThanOrEqual(CHROME_MAX_PX);
    }
  });

  it('references real scene screenshots matching the declared sizes', () => {
    const shots = pwaManifest.screenshots ?? [];
    for (const shot of shots) {
      const file = readFileSync(join('public', shot.src));
      // PNG magic bytes.
      expect([...file.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      // IHDR dimensions must match the declared `sizes`.
      const [width, height] = (shot.sizes ?? '')
        .split('x')
        .map((value) => Number.parseInt(value, 10));
      expect(file.readUInt32BE(16)).toBe(width);
      expect(file.readUInt32BE(20)).toBe(height);
    }
  });
});
