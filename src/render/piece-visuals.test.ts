import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MODELS } from '../assets/manifest';
import { checkerTexture, MODEL_FOR_PIECE, rotationY } from './piece-visuals';

describe('MODEL_FOR_PIECE', () => {
  it('maps each piece type to its Kenney GLB URL', () => {
    expect(MODEL_FOR_PIECE.straight).toBe(MODELS.straight);
    expect(MODEL_FOR_PIECE.curve).toBe(MODELS.corner);
    expect(MODEL_FOR_PIECE.start).toBe(MODELS.start);
    expect(MODEL_FOR_PIECE.finish).toBe(MODELS.finishFlag);
  });
});

describe('rotationY', () => {
  it('rotates pieces clockwise (negative Y) per orientation step', () => {
    expect(rotationY(0)).toBe(0);
    expect(rotationY(90)).toBeCloseTo(-Math.PI / 2);
    expect(rotationY(180)).toBeCloseTo(-Math.PI);
    expect(rotationY(270)).toBeCloseTo((-3 * Math.PI) / 2);
  });
});

describe('checkerTexture', () => {
  it('builds an alternating dark/light checker pattern', () => {
    const tex = checkerTexture();
    const data = tex.image.data as Uint8Array;
    expect(tex.image.width).toBe(8);
    expect(data.length).toBe(8 * 8 * 4);
    // (0,0) is dark, (1,0) is light, (0,1) is light.
    expect([...data.slice(0, 4)]).toEqual([40, 40, 40, 255]);
    expect([...data.slice(4, 8)]).toEqual([245, 245, 245, 255]);
    expect([...data.slice(8 * 4, 8 * 4 + 4)]).toEqual([245, 245, 245, 255]);
  });

  it('produces crisp squares (nearest filtering)', () => {
    expect(checkerTexture().magFilter).toBe(THREE.NearestFilter);
  });
});
