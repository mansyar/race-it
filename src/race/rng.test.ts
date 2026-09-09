import { describe, expect, it } from 'vitest';
import { mulberry32, sampleUniform } from './rng';

describe('mulberry32', () => {
  it('produces values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is deterministic: the same seed yields the same sequence', () => {
    const first = Array.from({ length: 5 }, () => mulberry32(1234)());
    const second = Array.from({ length: 5 }, () => mulberry32(1234)());
    expect(first).toEqual(second);
  });

  it('yields different sequences for different seeds', () => {
    const first = mulberry32(1)();
    const second = mulberry32(2)();
    expect(first).not.toBe(second);
  });
});

describe('sampleUniform', () => {
  it('returns values inside the band, scaled by the rng draw', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const value = sampleUniform(0.985, 1.015, rng);
      expect(value).toBeGreaterThanOrEqual(0.985);
      expect(value).toBeLessThanOrEqual(1.015);
    }
  });

  it('hits the band minimum for a rng draw of 0 and maximum for a draw of 1', () => {
    expect(sampleUniform(0.985, 1.015, () => 0)).toBe(0.985);
    expect(sampleUniform(0.985, 1.015, () => 1)).toBe(1.015);
  });

  it('is deterministic for a seeded rng', () => {
    const a = sampleUniform(0.985, 1.015, mulberry32(99));
    const b = sampleUniform(0.985, 1.015, mulberry32(99));
    expect(a).toBe(b);
  });
});