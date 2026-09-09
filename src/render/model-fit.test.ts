import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyModelFit, FLAG_FIT, PIECE_FIT, SCENERY_FIT } from './model-fit';

describe('SCENERY_FIT', () => {
  it('defines a fit for every scenery kind', () => {
    for (const kind of ['tree', 'grandstand', 'barrier'] as const) {
      expect(SCENERY_FIT[kind], `missing fit for ${kind}`).toBeDefined();
    }
  });

  it('recenters each prop on the cell origin using measured GLB centers', () => {
    // Measured centers: tree (-0.35, 0.525, -0.65), grandstand (0.15, 0.438, -1.15),
    // barrier (-0.225, 0.056, -0.712). Offset must cancel scale * center on x/z.
    const tree = SCENERY_FIT.tree;
    expect(tree.position[0]).toBeCloseTo(-tree.scale[0] * -0.35, 5);
    expect(tree.position[2]).toBeCloseTo(-tree.scale[2] * -0.65, 5);
    const stand = SCENERY_FIT.grandstand;
    expect(stand.position[0]).toBeCloseTo(-stand.scale[0] * 0.15, 5);
    expect(stand.position[2]).toBeCloseTo(-stand.scale[2] * -1.15, 5);
    const barrier = SCENERY_FIT.barrier;
    expect(barrier.position[0]).toBeCloseTo(-barrier.scale[0] * -0.225, 5);
    expect(barrier.position[2]).toBeCloseTo(-barrier.scale[2] * -0.712, 5);
  });

  it('keeps props readable on a 2-unit cell (scale > 0.5)', () => {
    for (const kind of ['tree', 'grandstand', 'barrier'] as const) {
      expect(SCENERY_FIT[kind].scale[0]).toBeGreaterThan(0.5);
    }
  });
});

describe('PIECE_FIT', () => {
  it('defines a fit for every piece type', () => {
    const types = ['straight', 'curve', 'start', 'finish'] as const;
    for (const type of types) {
      expect(PIECE_FIT[type], `missing fit for ${type}`).toBeDefined();
    }
  });

  it('scales one-cell tiles (straight/curve/finish) to fill the 2x2 cell', () => {
    // Kenney tiles have a 1x1 footprint; our cells are 2 world units wide.
    expect(PIECE_FIT.straight.scale).toEqual([2, 2, 2]);
    expect(PIECE_FIT.curve.scale).toEqual([2, 2, 2]);
    expect(PIECE_FIT.finish.scale).toEqual([2, 2, 2]);
  });

  it('scales the start gantry road to fill the cell without stretching its length', () => {
    // roadStart is 1.26 wide (1.0 road + gantry) and 2 deep: widen the road,
    // keep the length so the gantry stays at the cell edge.
    expect(PIECE_FIT.start.scale).toEqual([2, 2, 1]);
  });

  it('offsets tile centers so the footprint is centered on the cell', () => {
    // Measured world-space center of the 1x1 tiles is (0.15, -1.15) — the GLB
    // root nodes translate the mesh off the origin; after x2 scale the
    // recentering offset is (-0.3, +2.3).
    expect(PIECE_FIT.straight.position).toEqual([-0.3, 0, 2.3]);
    expect(PIECE_FIT.curve.position).toEqual([-0.3, 0, 2.3]);
  });
});

describe('applyModelFit', () => {
  it('applies the fit scale and offset to an object', () => {
    const obj = new THREE.Object3D();
    applyModelFit(obj, PIECE_FIT.straight);
    expect(obj.scale.x).toBe(2);
    expect(obj.scale.z).toBe(2);
    expect(obj.position.x).toBe(-0.3);
    expect(obj.position.y).toBe(0.03);
    expect(obj.position.z).toBe(2.3);
  });

  it('places the finish flag at a cell corner, clear of the road centerline', () => {
    const flag = new THREE.Object3D();
    applyModelFit(flag, FLAG_FIT);
    expect(flag.scale.x).toBe(2);
    expect(Math.abs(flag.position.x)).toBeGreaterThan(0.5);
    expect(Math.abs(flag.position.z)).toBeGreaterThan(0.5);
  });
});
