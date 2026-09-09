import { describe, expect, it } from 'vitest';
import { PieceFeedback, POP_IN_SECONDS, popInScale, removeWiggleRadians } from './toy-feedback';

describe('popInScale', () => {
  it('starts near the rest scale and ends at 1', () => {
    expect(popInScale(0)).toBeCloseTo(0.55, 5);
    expect(popInScale(POP_IN_SECONDS)).toBeCloseTo(1, 5);
  });

  it('overshoots past 1 mid-curve then settles', () => {
    let max = 0;
    for (let t = 0; t <= POP_IN_SECONDS; t += 0.01) {
      max = Math.max(max, popInScale(t));
    }
    expect(max).toBeGreaterThan(1.02);
    expect(popInScale(POP_IN_SECONDS * 0.5)).toBeGreaterThan(0.9);
  });

  it('clamps times outside the animation window', () => {
    expect(popInScale(-1)).toBeCloseTo(0.55, 5);
    expect(popInScale(POP_IN_SECONDS + 10)).toBeCloseTo(1, 5);
  });
});

describe('removeWiggleRadians', () => {
  it('stays within about ±4 degrees', () => {
    const limit = (4 * Math.PI) / 180;
    for (let t = 0; t < 2; t += 0.05) {
      expect(Math.abs(removeWiggleRadians(t))).toBeLessThanOrEqual(limit + 1e-6);
    }
  });

  it('oscillates over time', () => {
    const a = removeWiggleRadians(0);
    const b = removeWiggleRadians(0.15);
    expect(b).not.toBeCloseTo(a, 3);
  });
});

describe('PieceFeedback', () => {
  it('tracks a pending pop that finishes after POP_IN_SECONDS', () => {
    const feedback = new PieceFeedback();
    feedback.notePlaced(3);
    expect(feedback.isActive(3)).toBe(true);
    const first = feedback.scaleFor(3);
    expect(first).toBeLessThan(1);
    feedback.tick(POP_IN_SECONDS + 0.01);
    expect(feedback.scaleFor(3)).toBeCloseTo(1, 5);
    expect(feedback.isActive(3)).toBe(false);
  });

  it('exposes remove-mode wiggle and tint flag while active', () => {
    const feedback = new PieceFeedback();
    expect(feedback.removeMode).toBe(false);
    expect(feedback.tintPulse(0.2)).toBe(0);
    feedback.setRemoveMode(true);
    expect(feedback.removeMode).toBe(true);
    expect(Math.abs(feedback.wiggleYaw(0.1))).toBeGreaterThan(0);
    expect(feedback.tintPulse(0.2)).toBeGreaterThan(0);
  });

  it('clears remove-mode state when turned off', () => {
    const feedback = new PieceFeedback();
    feedback.setRemoveMode(true);
    feedback.setRemoveMode(false);
    expect(feedback.removeMode).toBe(false);
    expect(feedback.wiggleYaw(0.1)).toBe(0);
    expect(feedback.tintPulse(0.2)).toBe(0);
  });

  it('ignores unknown cells and finished pops', () => {
    const feedback = new PieceFeedback();
    expect(feedback.isActive(99)).toBe(false);
    expect(feedback.scaleFor(99)).toBe(1);
    feedback.notePlaced(1);
    feedback.tick(1);
    expect(feedback.scaleFor(1)).toBeCloseTo(1, 5);
  });
});
