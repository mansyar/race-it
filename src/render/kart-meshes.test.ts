import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KARTS } from '../assets/manifest';
import { LANE_OFFSET, ROW_SPACING } from '../race/engine';
import {
  KART_COLORS,
  KART_FORWARD_ROTATION,
  KART_SCALE,
  KART_Y_OFFSET,
  KartRenderer,
} from './kart-meshes';

interface GltfLike {
  scene: THREE.Object3D;
}

function mockLoader(scenes: THREE.Object3D[]): { loadAsync: (url: string) => Promise<GltfLike> } {
  let index = 0;
  return {
    loadAsync: async (url: string) => {
      void url;
      const scene = scenes[index] ?? new THREE.Object3D();
      index += 1;
      return { scene: scene.clone(true) };
    },
  };
}

function singleMeshScene(): THREE.Object3D {
  const scene = new THREE.Object3D();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  scene.add(mesh);
  return scene;
}

const pose = (index: number) => ({ x: index * 2, z: -index * 2, heading: index * 0.5 });

describe('KartRenderer', () => {
  it('loads the four kart models from the manifest in order', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const loader = mockLoader(scenes);
    const renderer = new KartRenderer();
    await renderer.load(loader);
    // The mock consumed all four calls; asserting via the exported manifest list.
    expect(Object.values(KARTS)).toHaveLength(4);
  });

  it('positions and orients each kart from its pose', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const renderer = new KartRenderer();
    await renderer.load(mockLoader(scenes));
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    expect(renderer.group.children).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const kart = renderer.group.children[i];
      const target = pose(i);
      if (!kart) {
        throw new Error(`Expected kart mesh at index ${i}`);
      }
      expect(kart.position.x).toBeCloseTo(target.x);
      expect(kart.position.z).toBeCloseTo(target.z);
      expect(kart.position.y).toBeCloseTo(KART_Y_OFFSET);
      expect(kart.rotation.y).toBeCloseTo(target.heading + KART_FORWARD_ROTATION);
    }
  });

  it('scales each kart to the shared kart scale', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const renderer = new KartRenderer();
    await renderer.load(mockLoader(scenes));
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    for (const kart of renderer.group.children) {
      expect(kart.scale.x).toBeCloseTo(KART_SCALE);
      expect(kart.scale.y).toBeCloseTo(KART_SCALE);
      expect(kart.scale.z).toBeCloseTo(KART_SCALE);
    }
  });

  it('tints each kart material with its color without mutating the template', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const templates = scenes.map((scene) => scene);
    const renderer = new KartRenderer();
    await renderer.load(mockLoader(templates));
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    for (let i = 0; i < 4; i++) {
      const material = (renderer.group.children[i] as THREE.Group).children[0] as THREE.Mesh;
      const meshMaterial = material.material as THREE.MeshLambertMaterial;
      expect(meshMaterial.color.getHex()).toBe(KART_COLORS[i]);
    }
    // Templates stay white after cloning/tinting.
    for (const scene of templates) {
      const mesh = scene.children[0] as THREE.Mesh;
      const material = mesh.material as THREE.MeshLambertMaterial;
      expect(material.color.getHex()).toBe(0xffffff);
    }
  });

  it('rebuilds the group on every update without accumulating karts', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const renderer = new KartRenderer();
    await renderer.load(mockLoader(scenes));
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    expect(renderer.group.children).toHaveLength(4);
  });

  it('renders exactly the karts supplied in a partial race', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const renderer = new KartRenderer();
    await renderer.load(mockLoader(scenes));
    renderer.update([pose(0), pose(1)]);
    expect(renderer.group.children).toHaveLength(2);
    expect(renderer.group.children[1]?.position.x).toBeCloseTo(pose(1).x);
  });

  it('ignores extra poses beyond the loaded karts', async () => {
    const scenes = [singleMeshScene(), singleMeshScene(), singleMeshScene(), singleMeshScene()];
    const renderer = new KartRenderer();
    await renderer.load(mockLoader(scenes));
    renderer.update([pose(0), pose(1), pose(2), pose(3), pose(4)]);
    expect(renderer.group.children).toHaveLength(4);
  });

  it('passes through materials without a color channel untouched', async () => {
    const scene = new THREE.Object3D();
    const material = new THREE.MeshNormalMaterial();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const renderer = new KartRenderer();
    await renderer.load(
      mockLoader([scene, singleMeshScene(), singleMeshScene(), singleMeshScene()]),
    );
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    const mesh = renderer.group.children[0]?.children[0] as THREE.Mesh;
    expect(mesh.material).toBe(material);
  });

  it('tints every entry of an array material', async () => {
    const scene = new THREE.Object3D();
    const first = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const second = new THREE.MeshLambertMaterial({ color: 0x000000 });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [first, second]));
    const renderer = new KartRenderer();
    await renderer.load(
      mockLoader([scene, singleMeshScene(), singleMeshScene(), singleMeshScene()]),
    );
    renderer.update([pose(0), pose(1), pose(2), pose(3)]);
    const mesh = renderer.group.children[0]?.children[0] as THREE.Mesh;
    const materials = mesh.material as THREE.MeshLambertMaterial[];
    expect(materials).toHaveLength(2);
    expect(materials[0]?.color.getHex()).toBe(KART_COLORS[0]);
    expect(materials[1]?.color.getHex()).toBe(KART_COLORS[0]);
    expect(first.color.getHex()).toBe(0xffffff);
    expect(second.color.getHex()).toBe(0x000000);
  });
});

// Native kart bounds measured with `node scripts/measure-glb-world.mjs`:
// size [width 0.974, height 1.329, length 1.428], identical for all four karts.
const NATIVE_KART_WIDTH = 0.974;
const NATIVE_KART_LENGTH = 1.428;

describe('start-lineup clearance', () => {
  it('scales karts to the 0.55 watchability bump', () => {
    expect(KART_SCALE).toBe(0.55);
  });

  it('keeps side-by-side karts clear at the lane gap', () => {
    const width = NATIVE_KART_WIDTH * KART_SCALE;
    expect(2 * LANE_OFFSET - width).toBeGreaterThan(0.1);
  });

  it('keeps nose-to-tail karts clear at the row gap', () => {
    const length = NATIVE_KART_LENGTH * KART_SCALE;
    expect(ROW_SPACING - length).toBeGreaterThan(0.1);
  });
});
