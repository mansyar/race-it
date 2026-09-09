/**
 * Seeded pseudo-random number generator (mulberry32). Deterministic for a
 * given seed, which makes race simulations reproducible in tests.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Samples uniformly from [min, max] using a rng draw in [0, 1]. */
export function sampleUniform(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}
