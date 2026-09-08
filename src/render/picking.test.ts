import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRID_SIZE } from '../grid/grid-model';
import { CELL_WORLD_SIZE, computeCameraPlacement, gridToWorld } from './layout';
import { pickCell } from './picking';

function makeCamera(aspect = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
  const placement = computeCameraPlacement(aspect);
  camera.position.set(placement.position.x, placement.position.y, placement.position.z);
  camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** Projects a world point to NDC using the camera (inverse of picking). */
function project(
  camera: THREE.PerspectiveCamera,
  wx: number,
  wz: number,
): { x: number; y: number } {
  const v = new THREE.Vector3(wx, 0, wz).project(camera);
  return { x: v.x, y: v.y };
}

describe('pickCell', () => {
  it('returns the cell containing a projected world point (round-trip)', () => {
    const camera = makeCamera();
    const pos = gridToWorld(3, 7);
    const ndc = project(camera, pos.x, pos.z);
    expect(pickCell(ndc, camera)).toEqual({ x: 3, y: 7 });
  });

  it('picks the center cell for the screen center', () => {
    const camera = makeCamera();
    const cell = pickCell({ x: 0, y: 0 }, camera);
    expect(cell).not.toBeNull();
    expect(cell?.x).toBeGreaterThanOrEqual(0);
    expect(cell?.x).toBeLessThan(GRID_SIZE);
  });

  it('returns null for taps outside the board', () => {
    const camera = makeCamera();
    const ndc = project(camera, 40, 40); // far off the 12x12 board
    expect(pickCell(ndc, camera)).toBeNull();
  });

  it('adapts to portrait aspect ratio', () => {
    const camera = makeCamera(0.6);
    const pos = gridToWorld(8, 2);
    const ndc = project(camera, pos.x, pos.z);
    expect(pickCell(ndc, camera)).toEqual({ x: 8, y: 2 });
  });

  it('taps land within one cell of their world position', () => {
    const camera = makeCamera();
    const pos = gridToWorld(6, 6);
    const ndc = project(camera, pos.x + CELL_WORLD_SIZE * 0.4, pos.z + CELL_WORLD_SIZE * 0.4);
    expect(pickCell(ndc, camera)).toEqual({ x: 6, y: 6 });
  });
});
