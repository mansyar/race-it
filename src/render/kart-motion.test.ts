import { describe, expect, it } from 'vitest';
import { SEGMENT_LENGTH } from '../race/engine';
import type { LoopCell } from '../race/path';
import {
  BOB_AMPLITUDE,
  HEADING_WINDOW,
  MAX_PITCH,
  MAX_ROLL,
  RUNOUT_SECONDS,
  runoutOffset,
  type VisualPose,
  visualPose,
} from './kart-motion';
import { kartPose } from './kart-rig';

/** Grid-cell helper: visual motion only reads x/y, so type/orientation are fixed. */
function pathOf(cells: Array<[number, number]>): LoopCell[] {
  return cells.map(([x, y]): LoopCell => ({ x, y, type: 'curve', orientation: 0 }));
}

/** Convex square: every segment boundary is a +90 degree turn. */
const SQUARE = pathOf([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

/**
 * Closed loop with straight runs and one reflex corner. Segment boundaries sit
 * at p = 2, 4, 6, 8, ... ; p = 4 is a +90 corner, p = 8 is a -90 reflex.
 */
const REFLEX = pathOf([
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
]);

function lapLengthOf(path: LoopCell[]): number {
  return path.length * SEGMENT_LENGTH;
}

function wrapAngle(a: number): number {
  const t = (((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return t - Math.PI;
}

interface PoseOverrides {
  lane: number;
  pace: number;
  accel: number;
  kartIndex: number;
}

function poseAt(
  path: LoopCell[],
  progress: number,
  overrides: Partial<PoseOverrides> = {},
): VisualPose {
  return visualPose(path, {
    progress,
    lane: overrides.lane ?? 0,
    pace: overrides.pace ?? 1,
    accel: overrides.accel ?? 0,
    kartIndex: overrides.kartIndex ?? 0,
  });
}

/** Samples `sample` around the lap at a fixed step. */
function scan(path: LoopCell[], step: number, sample: (p: number) => number): number[] {
  const lapLength = lapLengthOf(path);
  const values: number[] = [];
  for (let p = 0; p < lapLength; p += step) {
    values.push(sample(p));
  }
  return values;
}

function maxStep(values: number[]): number {
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1] ?? 0;
    const cur = values[i] ?? 0;
    const delta = Math.abs(wrapAngle(cur - prev));
    if (delta > max) {
      max = delta;
    }
  }
  return max;
}

describe('heading smoothing', () => {
  it('keeps the heading continuous and turn-rate bounded across tile boundaries', () => {
    const smoothed = scan(REFLEX, 0.01, (p) => poseAt(REFLEX, p).heading);
    expect(maxStep(smoothed)).toBeLessThan(0.03);
  });

  it('detects the snapping problem the smoothing removes (raw heading jumps)', () => {
    const raw = scan(REFLEX, 0.01, (p) => kartPose(REFLEX, p, 0).heading);
    // The raw per-segment heading snaps a full 90 degrees at corridor corners.
    expect(maxStep(raw)).toBeGreaterThan(1.4);
  });

  it('blends through the middle of a corner instead of snapping', () => {
    const before = kartPose(REFLEX, 3.0, 0).heading;
    const after = kartPose(REFLEX, 5.0, 0).heading;
    const mid = poseAt(REFLEX, 4.0).heading;
    expect(Math.abs(wrapAngle(mid - before))).toBeGreaterThan(0.3);
    expect(Math.abs(wrapAngle(mid - after))).toBeGreaterThan(0.3);

    const reflex = poseAt(REFLEX, 8.0).heading;
    const reflexBefore = kartPose(REFLEX, 7.0, 0).heading;
    const reflexAfter = kartPose(REFLEX, 9.0, 0).heading;
    expect(Math.abs(wrapAngle(reflex - reflexBefore))).toBeGreaterThan(0.3);
    expect(Math.abs(wrapAngle(reflex - reflexAfter))).toBeGreaterThan(0.3);
  });

  it('matches the raw heading exactly in the middle of straights', () => {
    for (const p of [1.0, 3.0, 13.0]) {
      expect(poseAt(REFLEX, p).heading).toBeCloseTo(kartPose(REFLEX, p, 0).heading, 10);
    }
  });
});

describe('cornering roll', () => {
  it('is exactly zero in the middle of straights and outside the blend window', () => {
    for (const p of [1.0, 3.0, 13.0]) {
      expect(poseAt(REFLEX, p).roll).toBe(0);
    }
    // Just outside the smoothing window around the p = 4 corner.
    const outside = HEADING_WINDOW + 0.2;
    expect(poseAt(REFLEX, 4.0 - outside).roll).toBe(0);
    expect(poseAt(REFLEX, 4.0 + outside).roll).toBe(0);
  });

  it('leans opposite ways through opposite corners, bounded by MAX_ROLL', () => {
    const rolls = scan(REFLEX, 0.005, (p) => poseAt(REFLEX, p).roll);
    for (const roll of rolls) {
      expect(Math.abs(roll)).toBeLessThanOrEqual(MAX_ROLL + 1e-9);
    }
    const peakPlus = Math.max(...rolls);
    const peakMinus = Math.min(...rolls);
    expect(peakPlus).toBeGreaterThanOrEqual(0.5 * MAX_ROLL);
    expect(peakMinus).toBeLessThanOrEqual(-0.5 * MAX_ROLL);
  });

  it('varies smoothly (no roll steps)', () => {
    const rolls = scan(REFLEX, 0.005, (p) => poseAt(REFLEX, p).roll);
    expect(maxStep(rolls)).toBeLessThan(0.01);
  });
});

describe('suspension pitch', () => {
  it('settles to zero at steady pace', () => {
    for (const p of [1.0, 4.0, 8.0]) {
      expect(poseAt(REFLEX, p, { accel: 0 }).pitch).toBe(0);
    }
  });

  it('lifts under launch acceleration and saturates nose-up', () => {
    const quarter = poseAt(SQUARE, 1.0, { accel: 0.25 }).pitch;
    const half = poseAt(SQUARE, 1.0, { accel: 0.5 }).pitch;
    const full = poseAt(SQUARE, 1.0, { accel: 1 }).pitch;
    expect(quarter).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(quarter);
    expect(full).toBeGreaterThan(half);
    expect(full).toBeLessThanOrEqual(MAX_PITCH);
    expect(poseAt(SQUARE, 1.0, { accel: 10 }).pitch).toBe(MAX_PITCH);
    expect(poseAt(SQUARE, 1.0, { accel: -10 }).pitch).toBe(-MAX_PITCH);
  });

  it('is symmetric for acceleration and braking', () => {
    expect(poseAt(SQUARE, 1.0, { accel: 0.5 }).pitch).toBeCloseTo(
      -poseAt(SQUARE, 1.0, { accel: -0.5 }).pitch,
      10,
    );
  });

  it('settles as acceleration fades after launch', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const accel of [2, 1.5, 1, 0.5, 0.1, 0]) {
      const pitch = poseAt(SQUARE, 1.0, { accel }).pitch;
      expect(pitch).toBeLessThan(previous);
      previous = pitch;
    }
    expect(previous).toBe(0);
  });
});

describe('suspension bob', () => {
  it('is zero when stopped and bounded by BOB_AMPLITUDE when racing', () => {
    const stopped = scan(REFLEX, 0.01, (p) => poseAt(REFLEX, p, { pace: 0 }).bob);
    for (const bob of stopped) {
      expect(bob).toBeCloseTo(0, 12);
    }
    const racing = scan(REFLEX, 0.01, (p) => poseAt(REFLEX, p, { pace: 1 }).bob).map((b) =>
      Math.abs(b),
    );
    expect(Math.max(...racing)).toBeLessThanOrEqual(BOB_AMPLITUDE + 1e-12);
    expect(Math.max(...racing)).toBeGreaterThanOrEqual(0.8 * BOB_AMPLITUDE);
    expect(Math.min(...racing)).toBeLessThan(0.2 * BOB_AMPLITUDE);
  });

  it('scales its amplitude with pace', () => {
    const amplitudes = [0.5, 1].map((pace) => {
      const values = scan(REFLEX, 0.01, (p) => Math.abs(poseAt(REFLEX, p, { pace }).bob));
      return Math.max(...values);
    });
    const half = amplitudes[0] ?? 0;
    const full = amplitudes[1] ?? 0;
    expect(half).toBeLessThanOrEqual(0.501 * BOB_AMPLITUDE);
    expect(half).toBeGreaterThanOrEqual(0.35 * BOB_AMPLITUDE);
    expect(full).toBeGreaterThan(half);
  });

  it('gives each kart slot its own bob phase', () => {
    let differs = false;
    for (let p = 0; p < lapLengthOf(REFLEX); p += 0.05) {
      const a = poseAt(REFLEX, p, { kartIndex: 0 }).bob;
      const b = poseAt(REFLEX, p, { kartIndex: 1 }).bob;
      if (Math.abs(a - b) > 1e-6) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});

describe('purity', () => {
  it('is deterministic: identical inputs give identical poses', () => {
    const first = poseAt(REFLEX, 5.123456789, { lane: 0.35, pace: 0.87, accel: 0.4 });
    const second = poseAt(REFLEX, 5.123456789, { lane: 0.35, pace: 0.87, accel: 0.4 });
    expect(second).toEqual(first);
  });

  it('places the kart exactly where kartPose places it', () => {
    for (const p of [0.37, 3.14, 8.0, 12.9, 15.5]) {
      for (const lane of [0, 0.35, -0.35]) {
        const base = kartPose(REFLEX, p, lane);
        const pose = poseAt(REFLEX, p, { lane });
        expect(pose.x).toBeCloseTo(base.x, 10);
        expect(pose.z).toBeCloseTo(base.z, 10);
      }
    }
  });

  it('stays finite and bounded for negative progress (start rows behind the line)', () => {
    const pose = poseAt(REFLEX, -1.2, { pace: 0.4, accel: 0.8 });
    expect(Number.isFinite(pose.x)).toBe(true);
    expect(Number.isFinite(pose.z)).toBe(true);
    expect(Number.isFinite(pose.heading)).toBe(true);
    expect(Math.abs(pose.roll)).toBeLessThanOrEqual(MAX_ROLL + 1e-9);
    expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(MAX_PITCH + 1e-9);
    expect(Math.abs(pose.bob)).toBeLessThanOrEqual(BOB_AMPLITUDE + 1e-12);
  });
});

describe('finish run-out', () => {
  it('holds the kart still before crossing and for zero pace', () => {
    expect(runoutOffset(0, 1)).toBe(0);
    expect(runoutOffset(-0.5, 1)).toBe(0);
    expect(runoutOffset(0.4, 0)).toBe(0);
  });

  it('decelerates monotonically and settles inside the run-out window', () => {
    let previous = 0;
    let previousDelta = Number.POSITIVE_INFINITY;
    for (let t = 0.05; t <= 2; t += 0.05) {
      const offset = runoutOffset(t, 1);
      expect(offset).toBeGreaterThanOrEqual(previous);
      if (t <= RUNOUT_SECONDS) {
        const delta = offset - previous;
        expect(delta).toBeLessThanOrEqual(previousDelta + 1e-12);
        previousDelta = delta;
      }
      previous = offset;
    }
    // Linear deceleration to rest: total roll-out is half the window x pace.
    expect(runoutOffset(RUNOUT_SECONDS, 1)).toBeCloseTo(RUNOUT_SECONDS / 2, 10);
    // Fully settled once the window elapses (well under the ~2 unit cap).
    expect(runoutOffset(RUNOUT_SECONDS + 0.5, 1)).toBe(runoutOffset(RUNOUT_SECONDS, 1));
    expect(runoutOffset(2, 1)).toBeLessThan(2);
  });

  it('scales with pace and clamps out-of-range pace', () => {
    expect(runoutOffset(RUNOUT_SECONDS, 0.5)).toBeCloseTo(RUNOUT_SECONDS / 4, 10);
    expect(runoutOffset(RUNOUT_SECONDS, 2)).toBe(runoutOffset(RUNOUT_SECONDS, 1));
  });
});
