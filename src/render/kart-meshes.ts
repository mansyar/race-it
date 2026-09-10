import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KARTS } from '../assets/manifest';
import type { KartPose } from './kart-rig';

/** Vivid toy palette per kart index (product guidelines: red/blue/green/yellow). */
export const KART_COLORS: readonly number[] = [0xef3340, 0x2f6fed, 0x2ecc71, 0xf7c948];

/** Kenney kart GLBs are roughly 2 units long natively; 0.4 fits the 2-unit track cells (~0.8 units). */
export const KART_SCALE = 0.4;

/** Wheels hover just above the road surface (y = 0). */
export const KART_Y_OFFSET = 0.05;

/** Kenney vehicles face -Z natively; +pi/2 yaw points them toward +X (heading 0). */
export const KART_FORWARD_ROTATION = Math.PI / 2;

interface GltfLike {
  scene: THREE.Object3D;
}

interface LoaderLike {
  loadAsync: (url: string) => Promise<GltfLike>;
}

/**
 * Loads the four Kenney kart models once and rebuilds a tinted, scaled clone
 * per kart. Per-frame updates only reposition/rotate the prepared clones.
 */
export class KartRenderer {
  readonly group = new THREE.Group();
  private karts: THREE.Object3D[] = [];
  /** Optional remap: pose slot i renders kart model `kartOrder[i]`. */
  private kartOrder: number[] = [];

  /** Sets which prepared kart model each pose slot renders (picker lineup). */
  setKartOrder(order: number[]): void {
    this.kartOrder = order;
  }

  /** Loads the four manifest kart models and prepares tinted clones. */
  async load(loader: LoaderLike = new GLTFLoader()): Promise<void> {
    const urls = Object.values(KARTS);
    const templates: THREE.Object3D[] = [];
    for (const url of urls) {
      const gltf = await loader.loadAsync(url);
      templates.push(gltf.scene);
    }
    this.karts = templates.map((template, kartIndex) => {
      const kart = template.clone(true);
      kart.scale.setScalar(KART_SCALE);
      this.tintKart(kart, KART_COLORS[kartIndex] ?? 0xffffff);
      return kart;
    });
  }

  /** Rebuilds the group with one clone per pose (kart index = pose index). */
  update(poses: KartPose[]): THREE.Group {
    this.group.clear();
    for (let i = 0; i < poses.length; i++) {
      const modelIndex = this.kartOrder[i] ?? i;
      const kart = this.karts[modelIndex];
      const pose = poses[i];
      if (!kart || !pose) {
        continue;
      }
      kart.position.set(pose.x, KART_Y_OFFSET, pose.z);
      kart.rotation.y = pose.heading + KART_FORWARD_ROTATION;
      this.group.add(kart);
    }
    return this.group;
  }

  /** Replaces every mesh material with a cloned, color-tinted copy. */
  private tintKart(kart: THREE.Object3D, color: number): void {
    kart.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) {
        return;
      }
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const tinted = materials.map((material) => {
        if (!('color' in material)) {
          return material;
        }
        const clone = material.clone();
        clone.color.setHex(color);
        return clone;
      });
      obj.material = Array.isArray(obj.material) ? tinted : tinted[0];
    });
  }
}
