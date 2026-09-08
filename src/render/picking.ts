import * as THREE from 'three';
import type { GridCoord } from './layout';
import { worldToGrid } from './layout';

/**
 * Picks the grid cell under a screen position. `ndc` is the pointer position in
 * normalized device coordinates (-1..1); returns the cell or null when the ray
 * misses the board.
 */
export function pickCell(
  ndc: { x: number; y: number },
  camera: THREE.PerspectiveCamera,
): GridCoord | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(boardPlane, hit)) {
    return null;
  }
  return worldToGrid(hit.x, hit.z);
}
