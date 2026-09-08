import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Cell, GridSnapshot, PieceType } from '../grid/grid-model';
import { GRID_SIZE } from '../grid/grid-model';
import { CELL_WORLD_SIZE, gridToWorld } from './layout';
import { applyModelFit, FLAG_FIT, PIECE_FIT } from './model-fit';
import { checkerTexture, FLAG_URL, MODEL_FOR_PIECE, rotationY } from './piece-visuals';

/** Shared checker overlay geometry for start/finish cells. */
const CHECKER_GEOMETRY = new THREE.PlaneGeometry(CELL_WORLD_SIZE, CELL_WORLD_SIZE);

/** Shared checker overlay material; one instance avoids GPU material churn on rebuilds. */
const CHECKER_MATERIAL = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9 });

/** Light toy-gray that brightens the flat vertex colors without hue-shifting grays. */
const TOY_TINT = new THREE.Color(0xdfe4ea);

/** Pulls a material color toward the chunky bright toy look (no hue shift). */
function tintBright(color: THREE.Color): void {
  color.lerp(TOY_TINT, 0.35);
}

/**
 * Builds one placeable piece: a holder positioned at the cell center with
 * clockwise rotation, containing the fit-adjusted model clone, a checker
 * overlay on start/finish cells, and the flag accessory on finish cells.
 */
export function buildPiece(
  template: THREE.Object3D,
  cell: Cell,
  x: number,
  y: number,
  checkers: THREE.Texture,
  flag?: THREE.Object3D,
): THREE.Object3D {
  const holder = new THREE.Object3D();
  const model = template.clone(true);
  applyModelFit(model, PIECE_FIT[cell.type]);
  holder.add(model);

  if (cell.type === 'start' || cell.type === 'finish') {
    CHECKER_MATERIAL.map = checkers;
    CHECKER_MATERIAL.needsUpdate = true;
    const overlay = new THREE.Mesh(CHECKER_GEOMETRY, CHECKER_MATERIAL);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.07;
    holder.add(overlay);
  }

  if (cell.type === 'finish' && flag) {
    const flagClone = flag.clone(true);
    applyModelFit(flagClone, FLAG_FIT);
    holder.add(flagClone);
  }

  holder.position.set(gridToWorld(x, y).x, 0, gridToWorld(x, y).z);
  // roadCornerSmall's raw road hugs the S and E edges (verified live: an
  // unrotated curve renders its road in the cell's SE quadrant); the grid
  // convention (piece-visuals/track-validator) expects curve 0 deg to connect
  // N + E, so curve pieces carry a built-in 90-degree counter-clockwise turn
  // (+pi/2). Added on the holder so the fit recentering offset rotates with it.
  holder.rotation.y = rotationY(cell.orientation) + (cell.type === 'curve' ? Math.PI / 2 : 0);
  return holder;
}

interface GltfLike {
  scene: THREE.Object3D;
}

interface LoaderLike {
  loadAsync: (url: string) => Promise<GltfLike>;
}

/** Template map keys: one per piece type plus the finish flag accessory. */
export type TemplateKey = PieceType | 'flag';

/** Renders the grid state as a group of piece meshes; rebuild-all on update. */
export class PieceRenderer {
  readonly group = new THREE.Group();
  readonly templates = new Map<TemplateKey, THREE.Object3D>();
  private readonly checkers = checkerTexture();

  /** Loads and bright-tints one template per piece type plus the flag. */
  async load(loader: LoaderLike = new GLTFLoader()): Promise<void> {
    const sources: [TemplateKey, string][] = [
      ...(Object.entries(MODEL_FOR_PIECE) as [PieceType, string][]),
      ['flag', FLAG_URL],
    ];
    for (const [key, url] of sources) {
      const gltf = await loader.loadAsync(url);
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
      this.templates.set(key, gltf.scene);
    }
  }

  /** Rebuilds the piece group from a grid snapshot (≤150 pieces, cheap). */
  update(grid: GridSnapshot): THREE.Group {
    this.group.clear();
    const flag = this.templates.get('flag');
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid[y * GRID_SIZE + x];
        if (!cell) {
          continue;
        }
        const template = this.templates.get(cell.type);
        if (!template) {
          continue;
        }
        this.group.add(buildPiece(template, cell, x, y, this.checkers, flag));
      }
    }
    return this.group;
  }
}
