import { SEGMENT_LENGTH } from '../race/engine';
import type { LoopCell } from '../race/path';
import { type KartPose, kartPose } from './kart-rig';

/** Half-width (world units) of the analytic heading-smoothing window. */
export const HEADING_WINDOW = 0.6;

/** Maximum cornering lean, radians (subtle toy tilt). */
export const MAX_ROLL = 0.12;

/** Maximum suspension pitch under acceleration, radians. */
export const MAX_PITCH = 0.06;

/** Peak vertical suspension bob, world units (reached at full pace). */
export const BOB_AMPLITUDE = 0.02;

/** Suspension bob wavelength along the track, world units. */
export const BOB_WAVELENGTH = 1.6;

/** Acceleration (world units per second squared) that reaches full pitch. */
export const PITCH_REFERENCE_ACCEL = 2;

/** Seconds of post-finish roll-out: the winner decelerates to rest. */
export const RUNOUT_SECONDS = 1;

/** Phase offset per kart slot so the pack does not bob in lockstep. */
const BOB_PHASE_STEP = 2.1;

/**
 * Turn angle at which a 90 degree corner reaches full roll: the blend factor
 * peaks at f = 0.5, so full turn x 0.25 x this response equals MAX_ROLL.
 */
const ROLL_RESPONSE = MAX_ROLL / (Math.PI / 8);

/** Extended kart pose: base placement plus suspension visuals. */
export interface VisualPose extends KartPose {
  /** Cornering lean (radians); positive/negative follow the turn direction. */
  roll: number;
  /** Suspension pitch under acceleration (radians); positive = nose up. */
  pitch: number;
  /** Vertical suspension bob, world units; zero when stopped. */
  bob: number;
}

export interface VisualPoseOptions {
  /** World units along the loop (same domain as kartPose progress). */
  progress: number;
  /** Lane offset, same convention as kartPose. */
  lane: number;
  /** Speed relative to steady race pace (1 = racing pace, 0 = stopped). */
  pace: number;
  /** Instantaneous pace change per second, used for pitch. */
  accel: number;
  /** Starting slot; varies the bob phase per kart. Default 0. */
  kartIndex?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Distance travelled during the post-finish roll-out: the kart decelerates
 * linearly from `pace` to rest over RUNOUT_SECONDS, then holds. Bounded by
 * pace x RUNOUT_SECONDS / 2 (half a world unit at racing pace).
 */
export function runoutOffset(elapsed: number, pace: number): number {
  const t = clamp(elapsed, 0, RUNOUT_SECONDS);
  const boundedPace = clamp(pace, 0, 1);
  return boundedPace * (t - (t * t) / (2 * RUNOUT_SECONDS));
}

function wrapAngle(a: number): number {
  const t = (((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return t - Math.PI;
}

/** Heading of the straight line from cell `segIndex` to the next cell. */
function headingOfSegment(path: LoopCell[], segIndex: number): number {
  const count = path.length;
  const wrapped = ((segIndex % count) + count) % count;
  return kartPose(path, (wrapped + 0.5) * SEGMENT_LENGTH, 0).heading;
}

/**
 * Visual extension of kartPose: keeps the exact kartPose placement, then
 * smooths the heading with an analytic window so tile-boundary turns read as
 * continuous cornering, and derives toy roll/pitch/bob from the window blend,
 * acceleration, and pace. Pure and deterministic.
 */
export function visualPose(path: LoopCell[], options: VisualPoseOptions): VisualPose {
  const base = kartPose(path, options.progress, options.lane);
  const lapLength = path.length * SEGMENT_LENGTH;
  const wrapped = ((options.progress % lapLength) + lapLength) % lapLength;
  const seg = Math.floor(wrapped / SEGMENT_LENGTH);
  const bStart = seg * SEGMENT_LENGTH;
  const bEnd = (seg + 1) * SEGMENT_LENGTH;
  const a = wrapped - HEADING_WINDOW;
  const c = wrapped + HEADING_WINDOW;

  // At most one boundary intersects the window because 2 x HEADING_WINDOW is
  // smaller than a segment; blend between the two segments it straddles.
  let firstDir = headingOfSegment(path, seg);
  let secondDir = firstDir;
  let blend = 0;
  if (a < bStart) {
    firstDir = headingOfSegment(path, seg - 1);
    secondDir = headingOfSegment(path, seg);
    blend = (c - bStart) / (HEADING_WINDOW * 2);
  } else if (c > bEnd) {
    secondDir = headingOfSegment(path, seg + 1);
    blend = (c - bEnd) / (HEADING_WINDOW * 2);
  }

  const sin = (1 - blend) * Math.sin(firstDir) + blend * Math.sin(secondDir);
  const cos = (1 - blend) * Math.cos(firstDir) + blend * Math.cos(secondDir);
  const heading = Math.atan2(sin, cos);

  const turn = wrapAngle(secondDir - firstDir);
  const roll = clamp(turn * blend * (1 - blend) * ROLL_RESPONSE, -MAX_ROLL, MAX_ROLL);

  const pitch = clamp(options.accel * (MAX_PITCH / PITCH_REFERENCE_ACCEL), -MAX_PITCH, MAX_PITCH);

  const boundedPace = clamp(options.pace, 0, 1);
  const phase = (options.kartIndex ?? 0) * BOB_PHASE_STEP;
  const bob =
    BOB_AMPLITUDE *
    boundedPace *
    Math.sin((2 * Math.PI * options.progress) / BOB_WAVELENGTH + phase);

  return { x: base.x, z: base.z, heading, roll, pitch, bob };
}
