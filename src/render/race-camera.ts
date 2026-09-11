import { CAMERA_VERTICAL_FOV_DEG, type CameraPlacement } from './layout';

/** Zoom floor while running: never closer than 0.4x the full-board camera distance. */
export const RACE_ZOOM_FLOOR = 0.4;

/** Zoom ceiling while running: never farther than the full-board camera distance. */
export const RACE_ZOOM_CEILING = 1;

/** Fraction of the frustum half-extent the framed pair may occupy while running. */
export const PACK_FRAMING_FILL = 0.55;

/** Look-ahead nudge (world units) applied to the pair midpoint along the lead heading. */
export const LOOK_AHEAD_DISTANCE = 1.2;

/** Deepest photo-finish push at full push: the finished hold tightens by 12.5%. */
export const PHOTO_FINISH_PUSH = 0.125;

/** Presentation phases the race camera understands. */
export type RaceCameraPhase = 'build' | 'countdown' | 'running' | 'finished';

/** Everything the race camera solve needs for one frame. */
export interface RaceCameraInput {
  /** `build` and `countdown` return the untouched full-board placement. */
  phase: RaceCameraPhase;
  /** World position of the leading kart. */
  lead: { x: number; z: number };
  /** World position of the closest rival, or null when the leader is alone. */
  rival: { x: number; z: number } | null;
  /** Unit direction of travel at the leader, used for the look-ahead nudge. */
  heading: { x: number; z: number };
  /** World position of the finish line (the start piece). */
  finishPoint: { x: number; z: number };
  /** Full-board placement for the current viewport (build/countdown framing). */
  buildPlacement: CameraPlacement;
  /** Viewport aspect ratio (width / height) for the frustum-fit solve. */
  aspect: number;
  /**
   * Photo-finish push amount, clamped to [0, 1]. Only the finished hold is
   * affected: 1 tightens the close hold by {@link PHOTO_FINISH_PUSH} and eases
   * back to the standard distance as the amount returns to 0.
   */
  push?: number;
}

/** Distance between the build camera and its target. */
function buildDistance(build: CameraPlacement): number {
  return Math.hypot(
    build.position.x - build.target.x,
    build.position.y - build.target.y,
    build.position.z - build.target.z,
  );
}

/** Unit vector from the build target toward the build camera (fixed diorama direction). */
function buildDirection(build: CameraPlacement): { x: number; y: number; z: number } {
  const dx = build.position.x - build.target.x;
  const dy = build.position.y - build.target.y;
  const dz = build.position.z - build.target.z;
  const length = Math.hypot(dx, dy, dz);
  return { x: dx / length, y: dy / length, z: dz / length };
}

/**
 * Largest |NDC| coordinate of any ground-plane point when the camera sits
 * `dist` behind `target` along the fixed diorama direction. Monotonically
 * decreasing in `dist`; the solver binary-searches this value.
 */
function maxPointNdc(
  aspect: number,
  dist: number,
  target: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  points: readonly { x: number; z: number }[],
): number {
  const camX = target.x + direction.x * dist;
  const camY = target.y + direction.y * dist;
  const camZ = target.z + direction.z * dist;
  const dY = -direction.y;
  const dZ = -direction.z;
  const uY = -dZ;
  const uZ = dY;
  const tanV = Math.tan((CAMERA_VERTICAL_FOV_DEG * Math.PI) / 360);
  const tanH = tanV * aspect;
  let max = 0;
  for (const point of points) {
    const vx = point.x - camX;
    const vy = -camY;
    const vz = point.z - camZ;
    const depth = vy * dY + vz * dZ;
    if (depth <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const ndcX = vx / (depth * tanH);
    const ndcY = (vy * uY + vz * uZ) / (depth * tanV);
    max = Math.max(max, Math.abs(ndcX), Math.abs(ndcY));
  }
  return max;
}

/** Smallest camera distance that keeps every point inside the pack margin. */
function solveFitDistance(
  aspect: number,
  target: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  points: readonly { x: number; z: number }[],
): number {
  let low = 1;
  let high = 200;
  // Binary search the smallest distance whose worst point fits the margin.
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (maxPointNdc(aspect, mid, target, direction, points) > PACK_FRAMING_FILL) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return high;
}

/**
 * Pure camera pose math for the race. Build and countdown keep the exact
 * full-board placement. While running, the camera follows the lead battle: it
 * aims at the pair midpoint nudged ahead of the leader and zooms just enough
 * to fit both karts with margin, clamped between {@link RACE_ZOOM_FLOOR} and
 * {@link RACE_ZOOM_CEILING} times the full-board distance. Once finished it
 * holds close on the finish point through the celebration, optionally pushed
 * in by the bounded photo-finish `push`. Stateless: callers
 * smooth between frames and recompute the build placement on resize.
 */
export function raceCameraPose(input: RaceCameraInput): CameraPlacement {
  const { phase, lead, rival, heading, finishPoint, buildPlacement, aspect } = input;
  if (phase !== 'running' && phase !== 'finished') {
    return buildPlacement;
  }

  const distance = buildDistance(buildPlacement);
  const direction = buildDirection(buildPlacement);

  if (phase === 'finished') {
    const target = { x: finishPoint.x, y: 0, z: finishPoint.z };
    const push = Math.min(1, Math.max(0, input.push ?? 0));
    const hold = distance * RACE_ZOOM_FLOOR * (1 - PHOTO_FINISH_PUSH * push);
    return {
      position: {
        x: target.x + direction.x * hold,
        y: target.y + direction.y * hold,
        z: target.z + direction.z * hold,
      },
      target,
    };
  }

  const midpoint = rival
    ? { x: (lead.x + rival.x) / 2, z: (lead.z + rival.z) / 2 }
    : { x: lead.x, z: lead.z };
  const target = {
    x: midpoint.x + heading.x * LOOK_AHEAD_DISTANCE,
    y: 0,
    z: midpoint.z + heading.z * LOOK_AHEAD_DISTANCE,
  };

  const points = rival ? [lead, rival] : [lead];
  const fitDistance = solveFitDistance(aspect, target, direction, points);
  const dist = Math.min(
    Math.max(fitDistance, distance * RACE_ZOOM_FLOOR),
    distance * RACE_ZOOM_CEILING,
  );

  return {
    position: {
      x: target.x + direction.x * dist,
      y: target.y + direction.y * dist,
      z: target.z + direction.z * dist,
    },
    target,
  };
}
