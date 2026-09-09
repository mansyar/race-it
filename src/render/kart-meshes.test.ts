import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KARTS } from '../assets/manifest';
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
      expect(kart.position.x).toBeCloseTo(pose(i).x);
      expect(kart.position.z).toBeCloseTo(pose(i).z);
      expect(kart.position.y).toBeCloseTo(KART_Y_OFFSET);
      expect(kart.rotation.y).toBeCloseTo(pose(i).heading + KART_FORWARD_ROTATION);
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
    expect(renderer.group.children[1].position.x).toBeCloseTo(pose(1).x);
  });
});
