import { describe, expect, it } from 'vitest';
import { CONFETTI_COUNT, CONFETTI_GRAVITY, CONFETTI_LIFE, createConfetti, stepConfetti } from './confetti';

const origin = { x: 0, z: 0 };

describe('confetti particles', () => {
  it('creates the configured particle count at the burst origin', () => {
    const particles = createConfetti(7, CONFETTI_COUNT, origin);
    expect(particles).toHaveLength(CONFETTI_COUNT);
    for (const particle of particles) {
      expect(Math.abs(particle.x - origin.x)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(particle.z - origin.z)).toBeLessThanOrEqual(1.5);
      expect(particle.y).toBeGreaterThan(0.2);
      expect(particle.age).toBe(0);
      expect(particle.life).toBeLessThanOrEqual(CONFETTI_LIFE);
      expect(particle.life).toBeGreaterThan(0);
    }
  });

  it('throws away particles whose life expired after stepping', () => {
    const particles = createConfetti(7, CONFETTI_COUNT, origin);
    const stepped = stepConfetti(particles, CONFETTI_LIFE + 1);
    expect(stepped).toHaveLength(0);
  });

  it('keeps particles alive while their life has not expired', () => {
    const particles = createConfetti(7, CONFETTI_COUNT, origin);
    const stepped = stepConfetti(particles, CONFETTI_LIFE / 2);
    expect(stepped.length).toBeGreaterThan(0);
    expect(stepped.length).toBeLessThanOrEqual(CONFETTI_COUNT);
    for (const particle of stepped) {
      expect(particle.age).toBeCloseTo(CONFETTI_LIFE / 2);
    }
  });

  it('applies gravity and velocity each step', () => {
    const [particle] = createConfetti(7, 1, origin);
    const vy = particle.vy;
    const beforeY = particle.y;
    const stepped = stepConfetti([particle], 0.1);
    const moved = stepped[0];
    expect(moved.vy).toBeCloseTo(vy + CONFETTI_GRAVITY * 0.1); // gravity reduced upward speed
    expect(moved.y).not.toBeCloseTo(beforeY); // vertical motion applied
    expect(moved.age).toBeCloseTo(0.1);
  });

  it('launches every particle upward', () => {
    const particles = createConfetti(7, 50, origin);
    for (const particle of particles) {
      expect(particle.vy).toBeGreaterThan(0);
    }
  });

  it('is deterministic per seed', () => {
    const a = createConfetti(42, 20, origin);
    const b = createConfetti(42, 20, origin);
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const a = createConfetti(42, 20, origin);
    const b = createConfetti(43, 20, origin);
    expect(a).not.toEqual(b);
  });

  it('returns an empty array when stepping nothing', () => {
    expect(stepConfetti([], 0.1)).toEqual([]);
  });
});