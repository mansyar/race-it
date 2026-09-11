import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Cell, GridSnapshot, PieceType } from '../grid/grid-model';
import { GRID_SIZE } from '../grid/grid-model';
import { CELL_WORLD_SIZE, gridToWorld } from './layout';
import { applyModelFit, FLAG_FIT, PIECE_FIT } from './model-fit';
import { checkerTexture, FLAG_URL, MODEL_FOR_PIECE, rotationY, tintBright } from './piece-visuals';

/** Shared checker overlay geometry for start/finish cells. */
const CHECKER_GEOMETRY = new THREE.PlaneGeometry(CELL_WORLD_SIZE, CELL_WORLD_SIZE);

/** Shared checker overlay material; one instance avoids GPU material churn on rebuilds. */
const CHECKER_MATERIAL = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9 });

/** How placed road tiles render: per-piece object graphs or batched instances. */
export type PieceRenderMode = 'individual' | 'instanced';

/** One mesh part of a fit-adjusted road template, shared by every instance. */
interface InstancedPart {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
  readonly matrix: THREE.Matrix4;
}

/** One InstancedMesh plus the holder↔instance mapping used for feedback sync. */
interface InstancedBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly partMatrix: THREE.Matrix4;
  readonly holders: THREE.Object3D[];
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
  holder.userData.cellIndex = y * GRID_SIZE + x;
  holder.userData.baseRotY = holder.rotation.y;
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
  private mode: PieceRenderMode = 'individual';
  private lastGrid: GridSnapshot | null = null;
  private readonly prepared = new Map<PieceType, InstancedPart[]>();
  private instanceBatches: InstancedBatch[] = [];
  private readonly scratch = new THREE.Matrix4();

  /** Loads and bright-tints one template per piece type plus the flag. */
  async load(loader: LoaderLike = new GLTFLoader()): Promise<void> {
    // Instanced parts derive from the templates below; drop them so a re-load
    // can never leave batches bound to stale geometry/materials.
    this.prepared.clear();
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
              // Snapshot the bright-tinted base so remove-mode can pulse red
              // without drifting the color permanently.
              (material as { userData: Record<string, unknown> }).userData = {
                ...(material.userData ?? {}),
                baseColor: material.color.clone(),
              };
            }
          }
        }
      });
      this.templates.set(key, gltf.scene);
    }
  }

  /**
   * Switches render mode and rebuilds the current grid immediately.
   * `individual` (default) keeps the per-piece object graphs; `instanced`
   * batches road tiles per piece type. No-op when the mode is unchanged.
   */
  setRenderMode(mode: PieceRenderMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.rebuild(this.lastGrid);
  }

  /** Rebuilds the piece group from a grid snapshot (≤150 pieces, cheap). */
  update(grid: GridSnapshot): THREE.Group {
    this.lastGrid = grid;
    this.rebuild(grid);
    return this.group;
  }

  /**
   * Copies the holders' current transforms (place pop-in scale, remove-mode
   * wiggle) into the instance matrices so batched tiles animate identically.
   * No-op in individual mode.
   */
  syncInstances(): void {
    if (this.mode !== 'instanced') {
      return;
    }
    for (const batch of this.instanceBatches) {
      for (let i = 0; i < batch.holders.length; i++) {
        const holder = batch.holders[i];
        if (!holder) {
          continue;
        }
        holder.updateMatrix();
        this.scratch.copy(holder.matrix).multiply(batch.partMatrix);
        batch.mesh.setMatrixAt(i, this.scratch);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private rebuild(grid: GridSnapshot | null): void {
    // Free stale instance GPU buffers before dropping the old children;
    // geometries and materials stay shared with the templates.
    for (const child of this.group.children) {
      if (child instanceof THREE.InstancedMesh) {
        child.dispose();
      }
    }
    this.group.clear();
    this.instanceBatches = [];
    if (!grid) {
      return;
    }
    if (this.mode === 'instanced') {
      this.rebuildInstanced(grid);
    } else {
      this.rebuildIndividual(grid);
    }
  }

  private rebuildIndividual(grid: GridSnapshot): void {
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
  }

  private rebuildInstanced(grid: GridSnapshot): void {
    const holdersByType = new Map<PieceType, THREE.Object3D[]>();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid[y * GRID_SIZE + x];
        if (!cell || !this.templates.get(cell.type)) {
          continue;
        }
        const holder = this.buildInstancedHolder(cell, x, y);
        this.group.add(holder);
        const holders = holdersByType.get(cell.type) ?? [];
        holders.push(holder);
        holdersByType.set(cell.type, holders);
      }
    }
    for (const [type, holders] of holdersByType) {
      for (const part of this.prepareInstanced(type)) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, holders.length);
        mesh.userData.pieceType = type;
        for (let i = 0; i < holders.length; i++) {
          const holder = holders[i];
          if (!holder) {
            continue;
          }
          holder.updateMatrix();
          this.scratch.copy(holder.matrix).multiply(part.matrix);
          mesh.setMatrixAt(i, this.scratch);
        }
        this.group.add(mesh);
        this.instanceBatches.push({ mesh, partMatrix: part.matrix, holders });
      }
    }
  }

  /** Bare holder: cell transform + feedback metadata + start/finish accessories. */
  private buildInstancedHolder(cell: Cell, x: number, y: number): THREE.Object3D {
    const holder = new THREE.Object3D();
    holder.position.set(gridToWorld(x, y).x, 0, gridToWorld(x, y).z);
    // Curve pieces carry the same built-in +90° seam fix as the individual path.
    holder.rotation.y = rotationY(cell.orientation) + (cell.type === 'curve' ? Math.PI / 2 : 0);
    holder.userData.cellIndex = y * GRID_SIZE + x;
    holder.userData.baseRotY = holder.rotation.y;

    if (cell.type === 'start' || cell.type === 'finish') {
      CHECKER_MATERIAL.map = this.checkers;
      CHECKER_MATERIAL.needsUpdate = true;
      const overlay = new THREE.Mesh(CHECKER_GEOMETRY, CHECKER_MATERIAL);
      overlay.rotation.x = -Math.PI / 2;
      overlay.position.y = 0.07;
      holder.add(overlay);
    }
    const flag = this.templates.get('flag');
    if (cell.type === 'finish' && flag) {
      const flagClone = flag.clone(true);
      applyModelFit(flagClone, FLAG_FIT);
      holder.add(flagClone);
    }
    return holder;
  }

  /** Cached per-type road parts, fit-adjusted; matrices are relative to the fit root. */
  private prepareInstanced(type: PieceType): InstancedPart[] {
    const cached = this.prepared.get(type);
    if (cached) {
      return cached;
    }
    const template = this.templates.get(type);
    if (!template) {
      return [];
    }
    const fitRoot = template.clone(true);
    applyModelFit(fitRoot, PIECE_FIT[type]);
    fitRoot.updateMatrixWorld(true);
    const parts: InstancedPart[] = [];
    fitRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) {
        return;
      }
      parts.push({
        geometry: obj.geometry,
        material: obj.material,
        matrix: obj.matrixWorld.clone(),
      });
    });
    this.prepared.set(type, parts);
    return parts;
  }
}
