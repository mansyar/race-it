import type { CameraPlacement } from './layout';

/** Maximum target offset from the build placement toward the lead kart. */
export const MAX_DRIFT = 3.0;

/** Camera orbit is capped at ~15 degrees so the board stays mostly visible. */
export const MAX_ORBIT_RAD = (Math.PI * 15) / 180;

/** Maximum camera push-in factor toward the target during drift (8%). */
export const PUSH_IN_MAX = 0.08;

/** Drift begins easing back to the build placement when the lead passes 75% of the lap. */
export const FINISH_SETTLE_START = 0.75;

/** Presentation phases the race camera understands. */
export type RaceCameraPhase = 'build' | 'countdown' | 'running' | 'finished';

/**
 * Pure camera pose math for the race. Build/countdown/finished phases keep the
 * exact build placement; while running, the camera gently drifts toward the
 * lead kart (clamped orbit + push-in) and settles back onto the finish line
 * (the start piece) as the race nears completion. Stateless: callers smooth
 * between frames and recompute the build placement on resize.
 */
export function raceCameraPose(
  phase: RaceCameraPhase,
  lead: { x: number; z: number },
  finishRatio: number,
  buildPlacement: CameraPlacement,
): CameraPlacement {
  if (phase !== 'running' || finishRatio >= 1) {
    return buildPlacement;
  }

  // Clamp the target offset toward the lead kart.
  const offset = { x: lead.x - buildPlacement.target.x, z: lead.z - buildPlacement.target.z };
  const offsetMag = Math.hypot(offset.x, offset.z);
  const clampedMag = Math.min(offsetMag, MAX_DRIFT);
  const offsetDir = offsetMag > 0 ? { x: offset.x / offsetMag, z: offset.z / offsetMag } : { x: 0, z: 0 };

  // Ease the drift out as the race approaches the finish line.
  const settle = Math.min(1, Math.max(0, (finishRatio - FINISH_SETTLE_START) / (1 - FINISH_SETTLE_START)));
  const driftScale = 1 - settle;

  const target = {
    x: buildPlacement.target.x + offsetDir.x * clampedMag * driftScale,
    y: buildPlacement.target.y,
    z: buildPlacement.target.z + offsetDir.z * clampedMag * driftScale,
  };

  // Orbit the camera around the target, capped at ~15 degrees.
  const yaw = Math.atan2(offsetDir.x, offsetDir.z);
  const rotY = Math.max(-MAX_ORBIT_RAD, Math.min(MAX_ORBIT_RAD, yaw)) * driftScale;
  const baseDir = {
    x: buildPlacement.position.x - buildPlacement.target.x,
    y: buildPlacement.position.y - buildPlacement.target.y,
    z: buildPlacement.position.z - buildPlacement.target.z,
  };
  const baseDist = Math.hypot(baseDir.x, baseDir.y, baseDir.z);
  const pushIn = 1 - PUSH_IN_MAX * (clampedMag / MAX_DRIFT) * driftScale;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const dir = {
    x: (baseDir.x / baseDist) * cos + (baseDir.z / baseDist) * sin,
    y: baseDir.y / baseDist,
    z: -(baseDir.x / baseDist) * sin + (baseDir.z / baseDist) * cos,
  };

  return {
    position: {
      x: target.x + dir.x * baseDist * pushIn,
      y: target.y + dir.y * baseDist * pushIn,
      z: target.z + dir.z * baseDist * pushIn,
    },
    target,
  };
}