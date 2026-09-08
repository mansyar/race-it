import * as THREE from 'three';
import { MODELS } from '../assets/manifest';
import type { Orientation, PieceType } from '../grid/grid-model';

/** Which Kenney GLB represents each logical piece type. */
export const MODEL_FOR_PIECE: Record<PieceType, string> = {
  straight: MODELS.straight,
  curve: MODELS.corner,
  start: MODELS.start,
  finish: MODELS.finishFlag,
};

/**
 * Y rotation (radians) for a piece orientation. Positive Y rotation is
 * counter-clockwise seen from above, so clockwise steps are negative.
 */
export function rotationY(orientation: Orientation): number {
  return orientation === 0 ? 0 : -(orientation * Math.PI) / 180;
}

const CHECKER_DARK: readonly [number, number, number, number] = [40, 40, 40, 255];
const CHECKER_LIGHT: readonly [number, number, number, number] = [245, 245, 245, 255];

/** Crisp black-and-white checker texture (1 texel per square, nearest-filtered). */
export function checkerTexture(squares = 8): THREE.DataTexture {
  const data = new Uint8Array(squares * squares * 4);
  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      const i = (y * squares + x) * 4;
      const color = (x + y) % 2 === 0 ? CHECKER_DARK : CHECKER_LIGHT;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
  const texture = new THREE.DataTexture(data, squares, squares);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
