import type { PieceType } from '../grid/grid-model';
import type { LoopCell } from './path';

/** Seconds the pack takes to reach full pace after the green light. */
export const LAUNCH_SECONDS = 1.0;
/** Shared pace multiplier while driving through a curve piece. */
export const CURVE_PACE_FACTOR = 0.93;
/** Fraction of a segment used to blend between adjacent cell factors. */
export const CURVATURE_BLEND = 0.35;
/** Maximum relative pace deviation of the per-kart wobble. */
export const WOBBLE_AMPLITUDE = 0.006;
/** Shortest and longest seconds of one wobble cycle per kart. */
export const WOBBLE_PERIOD_RANGE: readonly [number, number] = [5, 9];

export interface MotionProfile {
  /** Shared launch ramp: 0 at the green light, 1 once the pack is at pace. */
  launchFactor(elapsed: number): number;
  /** Shared curvature factor at a lap position, blended across boundaries. */
  curvatureFactor(progress: number): number;
  /** Per-kart wobble factor at `elapsed` seconds; exactly 1 when disabled. */
  wobbleFactor(kartIndex: number, elapsed: number): number;
  /** Combined pace multiplier: launch * curvature * wobble. */
  paceFactor(kartIndex: number, progress: number, elapsed: number): number;
}

export interface MotionProfileOptions {
  path: LoopCell[];
  /** Path length in world units (path.length * SEGMENT_LENGTH). */
  lapLength: number;
  kartCount: number;
  /**
   * Deterministic wobble salt. Seeded runs wobble reproducibly; when omitted
   * the wobble term is exactly 1 so manually injected rng streams stay exact.
   */
  seed?: number;
}

function cellFactor(type: PieceType): number {
  return type === 'curve' ? CURVE_PACE_FACTOR : 1;
}

/** Cheap deterministic value in [0, 1) derived from a seed and an index. */
function hashParam(seed: number, index: number, salt: number): number {
  let value = (seed + index * 0x9e3779b9 + salt) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Creates the pure pace-motion profile for one race. Every factor is
 * pace-multiplicative, so swapping grid slots keeps identical outcome
 * distributions (guarded by fairness.test.ts).
 */
export function createMotionProfile(options: MotionProfileOptions): MotionProfile {
  const { path, kartCount } = options;
  const cellCount = path.length;
  const segmentLength = options.lapLength / cellCount;
  const factors = path.map((cell) => cellFactor(cell.type));
  const wobbleSeed = options.seed;
  const wobbleParams =
    wobbleSeed === undefined
      ? null
      : Array.from({ length: kartCount }, (_, index) => ({
          amplitude: WOBBLE_AMPLITUDE * (0.4 + 0.6 * hashParam(wobbleSeed, index, 1)),
          period:
            WOBBLE_PERIOD_RANGE[0] +
            (WOBBLE_PERIOD_RANGE[1] - WOBBLE_PERIOD_RANGE[0]) * hashParam(wobbleSeed, index, 2),
          phase: 2 * Math.PI * hashParam(wobbleSeed, index, 3),
        }));

  function launchFactor(elapsed: number): number {
    if (elapsed <= 0) {
      return 0;
    }
    if (elapsed >= LAUNCH_SECONDS) {
      return 1;
    }
    const t = elapsed / LAUNCH_SECONDS;
    return 1 - (1 - t) * (1 - t);
  }

  function curvatureFactor(progress: number): number {
    if (cellCount === 0) {
      return 1;
    }
    const wrapped = ((progress % options.lapLength) + options.lapLength) % options.lapLength;
    const u = wrapped / segmentLength;
    const index = Math.floor(u) % cellCount;
    const current = factors[index] ?? 1;
    const frac = u - Math.floor(u);
    if (frac < 1 - CURVATURE_BLEND) {
      return current;
    }
    const next = factors[(index + 1) % cellCount] ?? 1;
    const t = (frac - (1 - CURVATURE_BLEND)) / CURVATURE_BLEND;
    return current + (next - current) * smoothstep(t);
  }

  function wobbleFactor(kartIndex: number, elapsed: number): number {
    const params = wobbleParams?.[kartIndex];
    if (params === undefined) {
      return 1;
    }
    return 1 + params.amplitude * Math.sin((2 * Math.PI * elapsed) / params.period + params.phase);
  }

  function paceFactor(kartIndex: number, progress: number, elapsed: number): number {
    return launchFactor(elapsed) * curvatureFactor(progress) * wobbleFactor(kartIndex, elapsed);
  }

  return { launchFactor, curvatureFactor, wobbleFactor, paceFactor };
}
