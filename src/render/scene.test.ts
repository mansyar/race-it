import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contactShadowTexture } from './scene';

describe('contactShadowTexture', () => {
  it('returns a canvas texture sized for the shadow disc', () => {
    const texture = contactShadowTexture(32);
    expect(texture).toBeInstanceOf(THREE.Texture);
    expect(texture.image?.width).toBe(32);
    expect(texture.image?.height).toBe(32);
    texture.dispose();
  });

  it('defaults to 64px when size is omitted', () => {
    const texture = contactShadowTexture();
    expect(texture.image?.width).toBe(64);
    texture.dispose();
  });
});
