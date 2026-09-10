import { describe, expect, it } from 'vitest';
import { pwaManifest } from './pwa-manifest';

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
    const sizes = pwaManifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(pwaManifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
});
