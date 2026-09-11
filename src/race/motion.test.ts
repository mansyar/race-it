import { describe, expect, it } from 'vitest';
import { CURVE_PACE_FACTOR, createMotionProfile, LAUNCH_SECONDS, WOBBLE_AMPLITUDE } from './motion';
import type { LoopCell } from './path';

function pathOfTypes(types: Array<LoopCell['type']>): LoopCell[] {
  return types.map((type, index) => ({ x: index, y: 0, type, orientation: 0 }));
}

const CORNERED_TYPES: Array<LoopCell['type']> = [
  'straight',
  'straight',
  'curve',
  'curve',
  'straight',
  'straight',
];

function baseOptions() {
  return {
    path: pathOfTypes(CORNERED_TYPES),
    lapLength: CORNERED_TYPES.length * 2,
    kartCount: 4,
  };
}

describe('createMotionProfile', () => {
  describe('launch ramp', () => {
    it('starts from standstill and reaches pace within the launch window', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 1 });
      expect(profile.launchFactor(0)).toBe(0);
      expect(profile.launchFactor(LAUNCH_SECONDS)).toBeGreaterThanOrEqual(0.95);
      expect(profile.launchFactor(LAUNCH_SECONDS * 4)).toBe(1);
      let previous = -1;
      for (let t = 0; t <= LAUNCH_SECONDS * 1.5; t += 0.05) {
        const factor = profile.launchFactor(t);
        expect(factor).toBeGreaterThanOrEqual(previous);
        previous = factor;
      }
    });

    it('covers less distance than a constant pace in the first quarter-second', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 1 });
      const steps = 200;
      const horizon = 0.25;
      const dt = horizon / steps;
      let distance = 0;
      for (let step = 0; step < steps; step += 1) {
        distance += profile.launchFactor((step + 0.5) * dt) * dt;
      }
      expect(distance).toBeLessThan(horizon * 0.5);
    });
  });

  describe('cornering modulation', () => {
    it('slows the shared pace on curves and keeps straights at full pace', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 1 });
      const midStraight = profile.curvatureFactor(1); // cell 0, halfway in
      const midCurve = profile.curvatureFactor(5); // cell 2, halfway in
      expect(midStraight).toBe(1);
      expect(midCurve).toBe(CURVE_PACE_FACTOR);
      expect(CURVE_PACE_FACTOR).toBeLessThan(1);
    });

    it('blends continuously across cell boundaries and wraps with the lap', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 1 });
      const lapLength = CORNERED_TYPES.length * 2;
      const step = 0.05;
      let previous = profile.curvatureFactor(0);
      for (let progress = step; progress <= lapLength; progress += step) {
        const factor = profile.curvatureFactor(progress);
        expect(Math.abs(factor - previous)).toBeLessThan(0.01);
        expect(factor).toBeGreaterThanOrEqual(CURVE_PACE_FACTOR - 1e-9);
        expect(factor).toBeLessThanOrEqual(1 + 1e-9);
        previous = factor;
      }
      expect(profile.curvatureFactor(lapLength)).toBeCloseTo(profile.curvatureFactor(0), 10);
    });
  });

  describe('seeded wobble', () => {
    it('is disabled without a seed', () => {
      const profile = createMotionProfile(baseOptions());
      for (let t = 0; t <= 10; t += 0.25) {
        expect(profile.wobbleFactor(0, t)).toBe(1);
      }
      const shared = profile.launchFactor(2) * profile.curvatureFactor(3);
      expect(profile.paceFactor(0, 3, 2)).toBeCloseTo(shared, 10);
    });

    it('stays bounded around identity for every kart', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 7 });
      for (let t = 0; t <= 120; t += 0.1) {
        for (let kart = 0; kart < 4; kart += 1) {
          const factor = profile.wobbleFactor(kart, t);
          expect(factor).toBeGreaterThanOrEqual(1 - WOBBLE_AMPLITUDE - 1e-9);
          expect(factor).toBeLessThanOrEqual(1 + WOBBLE_AMPLITUDE + 1e-9);
        }
      }
    });

    it('averages out to identity over time', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 7 });
      let sum = 0;
      let count = 0;
      for (let t = 0; t <= 200; t += 0.01) {
        sum += profile.wobbleFactor(0, t);
        count += 1;
      }
      expect(Math.abs(sum / count - 1)).toBeLessThan(0.001);
    });

    it('is deterministic for the same seed and varies across seeds', () => {
      const a = createMotionProfile({ ...baseOptions(), seed: 7 });
      const b = createMotionProfile({ ...baseOptions(), seed: 7 });
      const c = createMotionProfile({ ...baseOptions(), seed: 8 });
      const samples = [0.5, 2.75, 9.1, 31.4];
      for (const t of samples) {
        expect(a.wobbleFactor(0, t)).toBe(b.wobbleFactor(0, t));
        expect(a.wobbleFactor(3, t)).toBe(b.wobbleFactor(3, t));
      }
      expect(samples.some((t) => a.wobbleFactor(0, t) !== c.wobbleFactor(0, t))).toBe(true);
    });

    it('varies between karts within a race', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 7 });
      let distinct = false;
      for (let t = 0; t <= 10 && !distinct; t += 0.05) {
        if (profile.wobbleFactor(0, t) !== profile.wobbleFactor(1, t)) {
          distinct = true;
        }
      }
      expect(distinct).toBe(true);
    });
  });

  describe('paceFactor', () => {
    it('combines launch, curvature and wobble multiplicatively', () => {
      const profile = createMotionProfile({ ...baseOptions(), seed: 7 });
      const t = 3.21;
      const progress = 5.5;
      const expected =
        profile.launchFactor(t) * profile.curvatureFactor(progress) * profile.wobbleFactor(1, t);
      expect(profile.paceFactor(1, progress, t)).toBeCloseTo(expected, 10);
      expect(profile.paceFactor(1, progress, 0)).toBe(0);
    });
  });
});
