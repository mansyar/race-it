import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { GRID_SIZE, type GridSnapshot } from '../grid/grid-model';
import { createDemoLoop } from '../grid/track-store';
import { gridToWorld } from './layout';
import { SCENERY_KINDS, SceneryRenderer } from './scenery-render';

function template(): THREE.Object3D {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }),
  );
  const root = new THREE.Object3D();
  root.add(mesh);
  return root;
}

function fakeLoaderFactory(loaded: string[]) {
  return {
    loadAsync: async (url: string) => {
      loaded.push(url);
      return { scene: template() };
    },
  };
}

describe('SceneryRenderer', () => {
  let renderer: SceneryRenderer;

  beforeEach(() => {
    renderer = new SceneryRenderer();
  });

  it('loads one tinted template per scenery kind', async () => {
    const loaded: string[] = [];
    await renderer.load(fakeLoaderFactory(loaded));
    expect(loaded.length).toBe(SCENERY_KINDS.length);
    expect(loaded.length).toBe(3);
    expect(renderer.templates.size).toBe(3);
    for (const kind of SCENERY_KINDS) {
      expect(renderer.templates.has(kind)).toBe(true);
    }
    const sourceMesh = template().children[0] as THREE.Mesh;
    const tintedMesh = renderer.templates.get('tree')?.children[0] as THREE.Mesh;
    const sourceHsl = { h: 0, s: 0, l: 0 };
    const tintedHsl = { h: 0, s: 0, l: 0 };
    (sourceMesh.material as THREE.MeshStandardMaterial).color.getHSL(sourceHsl);
    (tintedMesh.material as THREE.MeshStandardMaterial).color.getHSL(tintedHsl);
    expect(tintedHsl.l).toBeGreaterThan(sourceHsl.l);
  });

  it('places one object per planned scenery item with yaw and scale jitter', async () => {
    await renderer.load(fakeLoaderFactory([]));
    const demo = createDemoLoop().toSnapshot();
    const group = renderer.update(demo);
    const plan = renderer.lastPlan;
    expect(plan.length).toBeGreaterThan(0);
    expect(group.children.length).toBe(plan.length);
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      const child = group.children[i];
      if (!item || !child) {
        throw new Error('plan and group length mismatch');
      }
      const world = gridToWorld(item.x, item.y);
      expect(child.position.x).toBeCloseTo(world.x, 5);
      expect(child.position.z).toBeCloseTo(world.z, 5);
      expect(child.rotation.y).toBeCloseTo(-(item.rotationDeg * Math.PI) / 180, 5);
      expect(child.scale.x).toBeCloseTo(item.scaleJitter, 5);
    }
  });

  it('clears previous children on rebuild', async () => {
    await renderer.load(fakeLoaderFactory([]));
    const demo = createDemoLoop().toSnapshot();
    renderer.update(demo);
    expect(renderer.group.children.length).toBeGreaterThan(0);
    // Fully occupied board leaves no free cells, so the plan is empty.
    const full: GridSnapshot = new Array(GRID_SIZE * GRID_SIZE).fill({
      type: 'straight' as const,
      orientation: 0 as const,
    });
    renderer.update(full);
    expect(renderer.group.children.length).toBe(0);
  });

  it('is deterministic for the same snapshot and seed', async () => {
    await renderer.load(fakeLoaderFactory([]));
    const demo = createDemoLoop().toSnapshot();
    const first = renderer.update(demo).children.map((c) => c.position.toArray().join(','));
    const second = renderer.update(demo).children.map((c) => c.position.toArray().join(','));
    expect(second).toEqual(first);
  });
});
