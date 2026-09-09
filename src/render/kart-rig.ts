import { SEGMENT_LENGTH } from '../race/engine';
import type { LoopCell } from '../race/path';
import { gridToWorld } from './layout';

/** World-space kart placement: ground position plus yaw heading (radians). */
export interface KartPose {
  x: number;
  z: number;
  heading: number;
}

/**
 * Maps engine progress (world units along the loop) plus lane offset to a
 * world-space kart pose. Progress is continuous across the loop: values at or
 * beyond the lap length wrap back to the start, and negative progress (start
 * lineup rows behind the line) retraces the tail of the loop.
 */
export function kartPose(path: LoopCell[], progress: number, lane: number): KartPose {
  if (path.length === 0) {
    throw new RangeError('kartPose: path must not be empty');
  }
  const lapLength = path.length * SEGMENT_LENGTH;
  const wrapped = ((progress % lapLength) + lapLength) % lapLength;
  const seg = Math.min(path.length - 1, Math.floor(wrapped / SEGMENT_LENGTH));
  const frac = wrapped / SEGMENT_LENGTH - seg;
  const curCell = path[seg];
  const nextCell = path[(seg + 1) % path.length];
  if (!curCell || !nextCell) {
    throw new RangeError('kartPose: path index out of range');
  }
  const cur = gridToWorld(curCell.x, curCell.y);
  const next = gridToWorld(nextCell.x, nextCell.y);
  const x = cur.x + (next.x - cur.x) * frac;
  const z = cur.z + (next.z - cur.z) * frac;
  const heading = Math.atan2(-(next.z - cur.z), next.x - cur.x);
  // Perpendicular lane offset (left of travel direction for positive lane).
  return {
    x: x + -Math.sin(heading) * lane,
    z: z + Math.cos(heading) * lane,
    heading,
  };
}
