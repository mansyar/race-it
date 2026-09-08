import { GRID_SIZE } from '../grid/grid-model';

/** World units spanned by one grid cell. */
export const CELL_WORLD_SIZE = 2;

/** World units spanned by the whole 12x12 board. */
export const BOARD_WORLD_SIZE = CELL_WORLD_SIZE * GRID_SIZE;

/** Ground-plane position of the center of cell (x, y). Cell (0,0) is top-left (−x, −z). */
export function gridToWorld(x: number, y: number): { x: number; z: number } {
  const half = BOARD_WORLD_SIZE / 2;
  return {
    x: x * CELL_WORLD_SIZE - half + CELL_WORLD_SIZE / 2,
    z: y * CELL_WORLD_SIZE - half + CELL_WORLD_SIZE / 2,
  };
}

/** A grid cell coordinate. */
export interface GridCoord {
  x: number;
  y: number;
}

/**
 * Grid cell under a world-space ground-plane point, or null when the point
 * lies outside the board.
 */
export function worldToGrid(wx: number, wz: number): GridCoord | null {
  const half = BOARD_WORLD_SIZE / 2;
  if (wx < -half || wx >= half || wz < -half || wz >= half) {
    return null;
  }
  const x = Math.floor((wx + half) / CELL_WORLD_SIZE);
  const y = Math.floor((wz + half) / CELL_WORLD_SIZE);
  return { x, y };
}

export interface CameraPlacement {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/** Diorama viewing angle (degrees above the horizon). */
const CAMERA_ELEVATION_DEG = 50;

/** Vertical FOV of the build camera; must match the PerspectiveCamera in scene.ts. */
export const CAMERA_VERTICAL_FOV_DEG = 60;

/** Fraction of the frustum half-extent the board may occupy when framed. */
const FRAMING_FILL = 0.94;

/**
 * Largest |NDC| coordinate of any board corner when viewed from `dist` along
 * the fixed diorama angle at the given aspect. Monotonically decreasing in
 * `dist`; the camera solver binary-searches this to frame the board exactly.
 */
export function maxCornerNdc(aspect: number, dist: number): number {
  const halfBoard = BOARD_WORLD_SIZE / 2;
  const elevation = (CAMERA_ELEVATION_DEG * Math.PI) / 180;
  const sinE = Math.sin(elevation);
  const cosE = Math.cos(elevation);
  // Camera sits on the elevation arc; view axis aims at the board center
  // nudged toward the near edge so the board sits centered on screen.
  const targetZ = halfBoard * 0.1;
  const camY = dist * sinE;
  const camZ = dist * cosE;
  const dirY = -camY;
  const dirZ = targetZ - camZ;
  const len = Math.hypot(dirY, dirZ);
  const dY = dirY / len;
  const dZ = dirZ / len;
  // View basis: right = +x; up = perpendicular to view axis in the y/z plane.
  const uY = -dZ;
  const uZ = dY;
  const tanV = Math.tan((CAMERA_VERTICAL_FOV_DEG * Math.PI) / 360);
  const tanH = tanV * aspect;
  let maxNdc = 0;
  for (const px of [-halfBoard, halfBoard]) {
    for (const pz of [-halfBoard, halfBoard]) {
      const vy = -camY;
      const vz = pz - camZ;
      const depth = vy * dY + vz * dZ;
      if (depth <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      const ndcX = px / (depth * tanH);
      const ndcY = (vy * uY + vz * uZ) / (depth * tanV);
      maxNdc = Math.max(maxNdc, Math.abs(ndcX), Math.abs(ndcY));
    }
  }
  return maxNdc;
}

/**
 * Fixed tilted diorama camera that frames the whole board for a given viewport
 * aspect ratio (width / height). The viewing angle stays constant across
 * portrait and landscape; only the distance changes so every board corner is
 * inside the frustum with a small margin, at the largest possible size.
 */
export function computeCameraPlacement(aspect: number): CameraPlacement {
  let low = 5;
  let high = 200;
  // Binary search the smallest distance whose worst corner fits the margin.
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (maxCornerNdc(aspect, mid) > FRAMING_FILL) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const dist = high;
  const elevation = (CAMERA_ELEVATION_DEG * Math.PI) / 180;
  const halfBoard = BOARD_WORLD_SIZE / 2;
  return {
    position: {
      x: 0,
      y: dist * Math.sin(elevation),
      z: dist * Math.cos(elevation),
    },
    target: { x: 0, y: 0, z: halfBoard * 0.1 },
  };
}
