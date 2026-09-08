import type * as THREE from 'three';
import type { PieceType } from '../grid/grid-model';

/**
 * Per-type transform that fits a Kenney Racing Kit model into one grid cell.
 *
 * The kit tiles are authored for a large ground-plane scene with inconsistent
 * footprints (straight 1x1, start 1.26x2) and root-node translations that move
 * the mesh off the origin. Measured world-space bounds (see
 * scripts/measure-glb-world.mjs):
 * - roadStraight / roadCornerSmall: 1x1 footprint, center (0.5, -0.5)
 * - roadStart: 1.0 road + 0.26 gantry overhang wide, 2 deep
 * - flagCheckers: 0.2 wide, 1.25 tall flag on a pole (no road)
 *
 * Our grid cells are CELL_WORLD_SIZE (2) world units, so each model is scaled
 * and recentered so its road footprint exactly fills the cell, centered on the
 * cell origin. Rotation is applied afterwards by the piece holder.
 */
export interface ModelFit {
  /** Scale applied to the cloned model. */
  scale: [number, number, number];
  /** Local offset that re-centers the road footprint on the cell origin. */
  position: [number, number, number];
}

/** Fit transforms for the road part of every piece type. */
export const PIECE_FIT: Record<PieceType, ModelFit> = {
  straight: { scale: [2, 2, 2], position: [-0.3, 0, 2.3] },
  curve: { scale: [2, 2, 2], position: [-0.3, 0, 2.3] },
  start: { scale: [2, 2, 1], position: [-1, 0, 1.65] },
  finish: { scale: [2, 2, 2], position: [-0.3, 0, 2.3] },
};

/** Finish-cell accessory: checkered flag plate at the cell corner. */
export const FLAG_FIT: ModelFit = { scale: [2, 2, 2], position: [1.25, 0, 0.59] };

/** Kenney tile roots sit at y=0 (coplanar with the table top); lift avoids z-fighting. */
export const MODEL_LIFT_Y = 0.03;

/** Applies a fit (scale + recentering offset) to a model instance. */
export function applyModelFit(object: THREE.Object3D, fit: ModelFit): void {
  object.scale.set(fit.scale[0], fit.scale[1], fit.scale[2]);
  object.position.set(fit.position[0], fit.position[1] + MODEL_LIFT_Y, fit.position[2]);
}
