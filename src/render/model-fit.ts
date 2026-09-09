import type * as THREE from 'three';
import type { PieceType } from '../grid/grid-model';
import type { SceneryKind } from './scenery-plan';

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

/**
 * Fit transforms for decorative scenery. Measured world-space centers
 * (scripts/measure-glb-world.mjs):
 * - treeSmall: size (0.253, 1.070, 0.292), center (-0.350, 0.525, -0.650)
 * - grandStand: size (1.000, 0.896, 1.000), center (0.150, 0.438, -1.150)
 * - barrierWhite: size (0.250, 0.131, 0.123), center (-0.225, 0.056, -0.712)
 *
 * Offsets cancel scale * center on x/z so each prop sits on the cell origin;
 * scale keeps props readable on a 2-unit cell. applyModelFit adds MODEL_LIFT_Y.
 */
export const SCENERY_FIT: Record<SceneryKind, ModelFit> = {
  tree: { scale: [1.6, 1.6, 1.6], position: [0.56, 0, 1.04] },
  grandstand: { scale: [1.4, 1.4, 1.4], position: [-0.21, 0, 1.61] },
  barrier: { scale: [2.0, 2.0, 2.0], position: [0.45, 0, 1.424] },
};

/** Kenney tile roots sit at y=0 (coplanar with the table top); lift avoids z-fighting. */
export const MODEL_LIFT_Y = 0.03;

/** Applies a fit (scale + recentering offset) to a model instance. */
export function applyModelFit(object: THREE.Object3D, fit: ModelFit): void {
  object.scale.set(fit.scale[0], fit.scale[1], fit.scale[2]);
  object.position.set(fit.position[0], fit.position[1] + MODEL_LIFT_Y, fit.position[2]);
}
