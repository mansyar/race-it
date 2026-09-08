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

/**
 * Fixed tilted diorama camera that frames the whole board for a given viewport
 * aspect ratio (width / height). The viewing angle stays constant across
 * portrait and landscape; only the distance changes to fit the board.
 */
export function computeCameraPlacement(aspect: number): CameraPlacement {
  const halfBoard = BOARD_WORLD_SIZE / 2;
  // Horizontal half-FOV implied by the vertical FOV at this aspect.
  const verticalFovRad = (60 * Math.PI) / 180;
  const horizontalHalfFov = Math.atan(Math.tan(verticalFovRad / 2) * aspect);
  // Distance so the board's diagonal half-width fits the view, with headroom.
  const requiredHalfWidth = halfBoard * Math.SQRT2;
  const horizontalDistance = requiredHalfWidth / Math.tan(horizontalHalfFov);
  const elevation = (CAMERA_ELEVATION_DEG * Math.PI) / 180;
  const dist = Math.max(horizontalDistance / Math.cos(elevation), halfBoard * 1.2);
  const run = dist * Math.cos(elevation);
  return {
    position: { x: 0, y: dist * Math.sin(elevation), z: run },
    target: { x: 0, y: 0, z: 0 },
  };
}
