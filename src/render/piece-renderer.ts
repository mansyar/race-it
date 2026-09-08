import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Cell, GridSnapshot, PieceType } from '../grid/grid-model';
import { GRID_SIZE } from '../grid/grid-model';
import { CELL_WORLD_SIZE, gridToWorld } from './layout';
import { checkerTexture, MODEL_FOR_PIECE, rotationY } from './piece-visuals';

/** Shared checker overlay geometry for start/finish cells. */
const CHECKER_GEOMETRY = new THREE.PlaneGeometry(CELL_WORLD_SIZE, CELL_WORLD_SIZE);

/** Shared checker overlay material; one instance avoids GPU material churn on rebuilds. */
const CHECKER_MATERIAL = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9 });

/** Boosts a color toward the chunky bright toy look. */
function tintBright(color: THREE.Color): void {
  color.offsetHSL(0, 0.25, 0.08);
}

/**
 * Builds one placeable piece: a clone of the loaded template, positioned at the
 * cell center, rotated clockwise by the cell orientation, with a checker
 * overlay on start/finish cells.
 */
export function buildPiece(
  template: THREE.Object3D,
  cell: Cell,
  x: number,
  y: number,
  checkers: THREE.Texture,
): THREE.Object3D {
  const piece = template.clone(true);
  const pos = gridToWorld(x, y);
  piece.position.set(pos.x, 0, pos.z);
  piece.rotation.y = rotationY(cell.orientation);

  if (cell.type === 'start' || cell.type === 'finish') {
    CHECKER_MATERIAL.map = checkers;
    CHECKER_MATERIAL.needsUpdate = true;
    const overlay = new THREE.Mesh(CHECKER_GEOMETRY, CHECKER_MATERIAL);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.02;
    piece.add(overlay);
  }
  return piece;
}

interface GltfLike {
  scene: THREE.Object3D;
}

interface LoaderLike {
  loadAsync: (url: string) => Promise<GltfLike>;
}

/** Renders the grid state as a group of piece meshes; rebuild-all on update. */
export class PieceRenderer {
  readonly group = new THREE.Group();
  readonly templates = new Map<PieceType, THREE.Object3D>();
  private readonly checkers = checkerTexture();

  /** Loads and bright-tints one template per piece type. */
  async load(loader: LoaderLike = new GLTFLoader()): Promise<void> {
    for (const [type, url] of Object.entries(MODEL_FOR_PIECE) as [PieceType, string][]) {
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
      this.templates.set(type, gltf.scene);
    }
  }

  /** Rebuilds the piece group from a grid snapshot (≤150 pieces, cheap). */
  update(grid: GridSnapshot): THREE.Group {
    this.group.clear();
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
        this.group.add(buildPiece(template, cell, x, y, this.checkers));
      }
    }
    return this.group;
  }
}
