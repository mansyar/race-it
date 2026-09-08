import { describe, expect, it } from 'vitest';
import { MODELS, SFX } from './assets/manifest';

describe('asset import pipeline', () => {
  it('resolves every track piece model to a URL', () => {
    expect(MODELS.straight).toMatch(/roadStraight.*\.glb$/);
    expect(MODELS.corner).toMatch(/roadCornerSmall.*\.glb$/);
    expect(MODELS.start).toMatch(/roadStart.*\.glb$/);
    expect(MODELS.finishFlag).toMatch(/flagCheckers.*\.glb$/);
  });

  it('resolves every sound effect to a URL', () => {
    expect(SFX.click).toMatch(/click_001.*\.ogg$/);
    expect(SFX.confirmA).toMatch(/confirmation_001.*\.ogg$/);
    expect(SFX.confirmB).toMatch(/confirmation_002.*\.ogg$/);
  });
});
