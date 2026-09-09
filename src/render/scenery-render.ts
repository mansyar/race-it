import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SCENERY } from '../assets/manifest';
import type { GridSnapshot } from '../grid/grid-model';
import { gridToWorld } from './layout';
import { applyModelFit, SCENERY_FIT } from './model-fit';
import { tintBright } from './piece-visuals';
import { planScenery, type SceneryItem, type SceneryKind } from './scenery-plan';

/** Manifest keys for the three decorative props. */
export const SCENERY_KINDS: readonly SceneryKind[] = ['tree', 'grandstand', 'barrier'];

interface GltfLike {
  scene: THREE.Object3D;
}

interface LoaderLike {
  loadAsync: (url: string) => Promise<GltfLike>;
}

/**
 * Builds one scenery holder: fit-adjusted clone at the cell center with yaw
 * and scale-jitter so props read as chunky toys, not uniform stamps.
 */
export function buildScenery(template: THREE.Object3D, item: SceneryItem): THREE.Object3D {
  const holder = new THREE.Object3D();
  const model = template.clone(true);
  applyModelFit(model, SCENERY_FIT[item.kind]);
  holder.add(model);
  const world = gridToWorld(item.x, item.y);
  holder.position.set(world.x, 0, world.z);
  holder.rotation.y = -(item.rotationDeg * Math.PI) / 180;
  holder.scale.setScalar(item.scaleJitter);
  return holder;
}

/**
 * Renders auto-placed decorative scenery. Mirrors PieceRenderer: injectable
 * loader, bright-tinted templates, full rebuild on grid update.
 */
export class SceneryRenderer {
  readonly group = new THREE.Group();
  readonly templates = new Map<SceneryKind, THREE.Object3D>();
  /** Last planned items (kind/cell/yaw/scale), aligned with group children. */
  lastPlan: SceneryItem[] = [];

  /** Loads and bright-tints one template per scenery kind. */
  async load(loader: LoaderLike = new GLTFLoader()): Promise<void> {
    for (const kind of SCENERY_KINDS) {
      const gltf = await loader.loadAsync(SCENERY[kind]);
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const material of materials) {
            if ('color' in material) {
              tintBright(material.color);
            }
          }
        }
      });
      this.templates.set(kind, gltf.scene);
    }
  }

  /**
   * Rebuilds the scenery group from a grid snapshot. Plans are deterministic
   * for the same snapshot + default seed so the table feels stable.
   */
  update(grid: GridSnapshot): THREE.Group {
    this.group.clear();
    this.lastPlan = planScenery(grid);
    for (const item of this.lastPlan) {
      const template = this.templates.get(item.kind);
      if (!template) {
        continue;
      }
      this.group.add(buildScenery(template, item));
    }
    return this.group;
  }
}
