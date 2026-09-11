import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cell, GridSnapshot, PieceType } from '../grid/grid-model';
import { GRID_SIZE } from '../grid/grid-model';
import { gridToWorld } from './layout';
import { applyPieceFeedback } from './piece-feedback-apply';
import { buildPiece, PieceRenderer } from './piece-renderer';
import { checkerTexture } from './piece-visuals';
import { PieceFeedback, removeWiggleRadians } from './toy-feedback';

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

describe('buildPiece', () => {
  it('places the cloned model at the cell center with clockwise rotation', () => {
    const cell: Cell = { type: 'straight', orientation: 90 };
    const piece = buildPiece(template(), cell, 3, 5, checkerTexture());
    const pos = gridToWorld(3, 5);
    expect(piece.position.x).toBeCloseTo(pos.x);
    expect(piece.position.z).toBeCloseTo(pos.z);
    expect(piece.rotation.y).toBe(-Math.PI / 2);
  });

  it('pre-rotates curve pieces +90 degrees (raw asset road hugs S+E, validator expects N+E)', () => {
    const piece = buildPiece(template(), { type: 'curve', orientation: 0 }, 3, 5, checkerTexture());
    expect(piece.rotation.y).toBeCloseTo(Math.PI / 2);
    // Non-curve pieces keep the plain orientation rotation.
    const straight = buildPiece(
      template(),
      { type: 'straight', orientation: 0 },
      3,
      5,
      checkerTexture(),
    );
    expect(straight.rotation.y).toBe(0);
  });

  it('does not mutate the source template', () => {
    const source = template();
    buildPiece(source, { type: 'curve', orientation: 180 }, 0, 0, checkerTexture());
    expect(source.position.x).toBe(0);
    expect(source.rotation.y).toBe(0);
  });

  it('adds a checker overlay on start and finish cells only', () => {
    const checkers = checkerTexture();
    expect(
      buildPiece(template(), { type: 'straight', orientation: 0 }, 1, 1, checkers).children.length,
    ).toBe(1);
    expect(
      buildPiece(template(), { type: 'start', orientation: 90 }, 1, 1, checkers).children.length,
    ).toBe(2);
    // Finish = road + checker overlay + accessory flag.
    expect(
      buildPiece(template(), { type: 'finish', orientation: 90 }, 1, 1, checkers, template())
        .children.length,
    ).toBe(3);
  });

  it('fits the model to the cell (scale + recentering offset on the clone)', () => {
    const source = template();
    const piece = buildPiece(source, { type: 'straight', orientation: 0 }, 1, 1, checkerTexture());
    const model = piece.children[0] as THREE.Object3D;
    expect(model.scale.x).toBe(2);
    expect(model.position.x).toBe(-0.3);
    expect(model.position.z).toBe(2.3);
  });
});

describe('PieceRenderer', () => {
  let renderer: PieceRenderer;

  beforeEach(() => {
    renderer = new PieceRenderer();
  });

  it('loads one tinted template per piece type plus the finish flag', async () => {
    const loaded: string[] = [];
    await renderer.load(fakeLoaderFactory(loaded));
    expect(loaded.length).toBe(5);
    expect(renderer.templates.size).toBe(5);
    // Bright toy tint: lightness boosted above the source's 0.5.
    const sourceMesh = template().children[0] as THREE.Mesh;
    const tintedMesh = renderer.templates.get('straight')?.children[0] as THREE.Mesh;
    const sourceHsl = { h: 0, s: 0, l: 0 };
    const tintedHsl = { h: 0, s: 0, l: 0 };
    (sourceMesh.material as THREE.MeshStandardMaterial).color.getHSL(sourceHsl);
    (tintedMesh.material as THREE.MeshStandardMaterial).color.getHSL(tintedHsl);
    expect(tintedHsl.l).toBeGreaterThan(sourceHsl.l);
  });

  it('renders one group child per placed piece and rebuilds on update', async () => {
    await renderer.load(fakeLoaderFactory([]));
    const empty: GridSnapshot = new Array(144).fill(null);
    renderer.update(empty);
    expect(renderer.group.children.length).toBe(0);

    const snapshot = new Array<GridSnapshot[number]>(144).fill(null);
    snapshot[0] = { type: 'curve', orientation: 0 };
    snapshot[143] = { type: 'finish', orientation: 270 };
    renderer.update(snapshot);
    expect(renderer.group.children.length).toBe(2);

    renderer.update(empty);
    expect(renderer.group.children.length).toBe(0);
  });
});

describe('PieceRenderer instanced mode', () => {
  let renderer: PieceRenderer;

  beforeEach(async () => {
    renderer = new PieceRenderer();
    await renderer.load(fakeLoaderFactory([]));
  });

  function emptyGrid(): GridSnapshot {
    return new Array<GridSnapshot[number]>(144).fill(null);
  }

  function place(grid: GridSnapshot, x: number, y: number, cell: Cell): void {
    grid[y * GRID_SIZE + x] = cell;
  }

  function instancedMeshes(): THREE.InstancedMesh[] {
    return renderer.group.children.filter(
      (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh,
    );
  }

  function instancedFor(type: PieceType): THREE.InstancedMesh | undefined {
    return instancedMeshes().find((mesh) => mesh.userData.pieceType === type);
  }

  function expectMatrixToBeClose(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
    actual.elements.forEach((value, index) => {
      expect(value).toBeCloseTo(expected.elements[index] ?? 0, 5);
    });
  }

  it('batches placed road tiles into one InstancedMesh per type with per-type counts', () => {
    const grid = emptyGrid();
    place(grid, 1, 1, { type: 'straight', orientation: 0 });
    place(grid, 2, 1, { type: 'straight', orientation: 90 });
    place(grid, 3, 1, { type: 'curve', orientation: 0 });
    place(grid, 4, 1, { type: 'finish', orientation: 180 });

    renderer.setRenderMode('instanced');
    renderer.update(grid);

    expect(instancedMeshes().length).toBe(3);
    expect(instancedFor('straight')?.count).toBe(2);
    expect(instancedFor('curve')?.count).toBe(1);
    expect(instancedFor('finish')?.count).toBe(1);
  });

  it('matches the individual path matrices exactly (position, rotation, seam fix, fit)', () => {
    const grid = emptyGrid();
    place(grid, 2, 3, { type: 'straight', orientation: 90 });
    place(grid, 5, 7, { type: 'curve', orientation: 180 });
    renderer.setRenderMode('instanced');
    renderer.update(grid);

    const references: [PieceType, Cell, number, number][] = [
      ['straight', { type: 'straight', orientation: 90 }, 2, 3],
      ['curve', { type: 'curve', orientation: 180 }, 5, 7],
    ];
    for (const [type, cell, x, y] of references) {
      const mesh = instancedFor(type);
      if (!mesh) {
        throw new Error(`no instanced mesh for ${type}`);
      }
      const reference = buildPiece(
        renderer.templates.get(type) as THREE.Object3D,
        cell,
        x,
        y,
        checkerTexture(),
      );
      reference.updateMatrix();
      const model = reference.children[0] as THREE.Object3D;
      model.updateMatrix();
      const expected = new THREE.Matrix4().multiplyMatrices(reference.matrix, model.matrix);
      const actual = new THREE.Matrix4();
      mesh.getMatrixAt(0, actual);
      expectMatrixToBeClose(actual, expected);
    }
  });

  it('rebuilds instances on update and disposes stale buffers', () => {
    const grid = emptyGrid();
    place(grid, 1, 1, { type: 'straight', orientation: 0 });
    place(grid, 2, 1, { type: 'straight', orientation: 0 });
    renderer.setRenderMode('instanced');
    renderer.update(grid);
    const stale = instancedMeshes();
    expect(stale.length).toBe(1);
    const disposeSpies = stale.map((mesh) => vi.spyOn(mesh, 'dispose'));

    const smaller = emptyGrid();
    place(smaller, 4, 4, { type: 'curve', orientation: 0 });
    renderer.update(smaller);

    expect(instancedFor('straight')).toBeUndefined();
    expect(instancedFor('curve')?.count).toBe(1);
    expect(disposeSpies[0]?.mock.calls.length).toBe(1);
  });

  it('switches modes cleanly and leaves individual output unchanged', () => {
    const grid = emptyGrid();
    place(grid, 1, 1, { type: 'straight', orientation: 0 });
    place(grid, 2, 1, { type: 'finish', orientation: 0 });
    renderer.update(grid);

    expect(instancedMeshes().length).toBe(0);
    expect(renderer.group.children.length).toBe(2);
    const straightHolder = renderer.group.children[0] as THREE.Object3D;
    expect(straightHolder.children.length).toBe(1);
    const finishHolder = renderer.group.children[1] as THREE.Object3D;
    expect(finishHolder.children.length).toBe(3);

    renderer.setRenderMode('instanced');
    expect(instancedMeshes().length).toBe(2);
    const holders = renderer.group.children.filter(
      (child) => child.userData.cellIndex !== undefined,
    );
    expect(holders.length).toBe(2);

    renderer.setRenderMode('individual');
    expect(instancedMeshes().length).toBe(0);
    expect(renderer.group.children.length).toBe(2);
    expect((renderer.group.children[0] as THREE.Object3D).children.length).toBe(1);
  });

  it('keeps checker overlays and finish flags per-piece in instanced mode', () => {
    const grid = emptyGrid();
    place(grid, 1, 1, { type: 'start', orientation: 0 });
    place(grid, 2, 1, { type: 'finish', orientation: 0 });
    place(grid, 3, 1, { type: 'straight', orientation: 0 });
    renderer.setRenderMode('instanced');
    renderer.update(grid);

    const holders = new Map(
      renderer.group.children
        .filter((child) => child.userData.cellIndex !== undefined)
        .map((child) => [child.userData.cellIndex as number, child] as const),
    );
    expect(holders.get(1 * GRID_SIZE + 1)?.children.length).toBe(1);
    expect(holders.get(1 * GRID_SIZE + 2)?.children.length).toBe(2);
    expect(holders.get(1 * GRID_SIZE + 3)?.children.length).toBe(0);
  });
});

describe('PieceRenderer instanced feedback', () => {
  let renderer: PieceRenderer;

  beforeEach(async () => {
    renderer = new PieceRenderer();
    await renderer.load(fakeLoaderFactory([]));
  });

  function emptyGrid(): GridSnapshot {
    return new Array<GridSnapshot[number]>(144).fill(null);
  }

  function place(grid: GridSnapshot, x: number, y: number, cell: Cell): void {
    grid[y * GRID_SIZE + x] = cell;
  }

  function instancedMeshes(): THREE.InstancedMesh[] {
    return renderer.group.children.filter(
      (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh,
    );
  }

  function instancedFor(type: PieceType): THREE.InstancedMesh | undefined {
    return instancedMeshes().find((mesh) => mesh.userData.pieceType === type);
  }

  function countInstanced(root: THREE.Object3D): number {
    let count = 0;
    root.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        count += 1;
      }
    });
    return count;
  }

  function instanceMatrix(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return matrix;
  }

  it('place pop-in scales batched tiles through the holder contract', () => {
    const grid = emptyGrid();
    place(grid, 2, 3, { type: 'straight', orientation: 0 });
    renderer.setRenderMode('instanced');
    renderer.update(grid);
    const mesh = instancedFor('straight');
    if (!mesh) {
      throw new Error('no instanced straight mesh');
    }
    const restScale = new THREE.Vector3();
    instanceMatrix(mesh, 0).decompose(new THREE.Vector3(), new THREE.Quaternion(), restScale);

    const feedback = new PieceFeedback();
    feedback.notePlaced(3 * GRID_SIZE + 2);
    applyPieceFeedback(renderer.group, feedback, feedback.time);
    const holder = renderer.group.children.find(
      (child) => child.userData.cellIndex === 3 * GRID_SIZE + 2,
    );
    expect(holder?.scale.x).toBeCloseTo(0.55, 5);

    renderer.syncInstances();
    const poppedScale = new THREE.Vector3();
    instanceMatrix(mesh, 0).decompose(new THREE.Vector3(), new THREE.Quaternion(), poppedScale);
    expect(poppedScale.x).toBeCloseTo(restScale.x * 0.55, 4);
  });

  it('remove-mode wiggle and red tint reach batched tiles', () => {
    const grid = emptyGrid();
    place(grid, 2, 3, { type: 'straight', orientation: 0 });
    place(grid, 4, 5, { type: 'straight', orientation: 0 });
    renderer.setRenderMode('instanced');
    renderer.update(grid);
    const mesh = instancedFor('straight');
    if (!mesh) {
      throw new Error('no instanced straight mesh');
    }

    const feedback = new PieceFeedback();
    feedback.setRemoveMode(true);
    applyPieceFeedback(renderer.group, feedback, 0.1);
    renderer.syncInstances();

    const expectedYaw = removeWiggleRadians(0.1);
    for (const index of [0, 1]) {
      const quaternion = new THREE.Quaternion();
      instanceMatrix(mesh, index).decompose(new THREE.Vector3(), quaternion, new THREE.Vector3());
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
      expect(euler.y).toBeCloseTo(expectedYaw, 5);
    }

    const firstMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!firstMaterial) {
      throw new Error('instanced mesh has no material');
    }
    const material = firstMaterial as THREE.MeshStandardMaterial;
    const base = material.userData.baseColor as THREE.Color;
    const expected = base.clone().lerp(new THREE.Color(0xe63946), 0.7);
    expect(material.color.r).toBeCloseTo(expected.r, 5);
    expect(material.color.g).toBeCloseTo(expected.g, 5);
    expect(material.color.b).toBeCloseTo(expected.b, 5);
  });

  it('keeps repeated individual→instanced toggles stable with no stale meshes', () => {
    const grid = emptyGrid();
    place(grid, 1, 1, { type: 'straight', orientation: 0 });
    place(grid, 2, 1, { type: 'curve', orientation: 90 });
    place(grid, 3, 1, { type: 'finish', orientation: 0 });
    renderer.update(grid);
    expect(renderer.group.children.length).toBe(3);

    for (let round = 0; round < 3; round++) {
      renderer.setRenderMode('instanced');
      expect(countInstanced(renderer.group)).toBe(3);
      const holders = renderer.group.children.filter(
        (child) => child.userData.cellIndex !== undefined,
      );
      expect(holders.length).toBe(3);

      renderer.setRenderMode('individual');
      expect(countInstanced(renderer.group)).toBe(0);
      expect(renderer.group.children.length).toBe(3);
    }
  });
});

describe('PieceRenderer template reload', () => {
  let renderer: PieceRenderer;

  beforeEach(() => {
    renderer = new PieceRenderer();
  });

  function emptyGrid(): GridSnapshot {
    return new Array<Cell | null>(GRID_SIZE * GRID_SIZE).fill(null);
  }

  function place(grid: GridSnapshot, x: number, y: number, cell: Cell): void {
    grid[y * GRID_SIZE + x] = cell;
  }

  function instancedFor(type: PieceType): THREE.InstancedMesh | undefined {
    return renderer.group.children.find(
      (child) => child instanceof THREE.InstancedMesh && child.userData.pieceType === type,
    ) as THREE.InstancedMesh | undefined;
  }

  function templateGeometry(root: THREE.Object3D | undefined): THREE.BufferGeometry {
    let geometry: THREE.BufferGeometry | undefined;
    root?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        geometry = obj.geometry;
      }
    });
    if (!geometry) {
      throw new Error('template fixture has no mesh geometry');
    }
    return geometry;
  }

  it('drops cached instanced parts when templates re-load', async () => {
    const grid = emptyGrid();
    place(grid, 2, 3, { type: 'straight', orientation: 0 });

    await renderer.load(fakeLoaderFactory([]));
    renderer.setRenderMode('instanced');
    renderer.update(grid);
    const stale = instancedFor('straight');
    if (!stale) {
      throw new Error('no instanced straight mesh after first load');
    }
    const firstGeometry = templateGeometry(renderer.templates.get('straight'));
    expect(stale.geometry).toBe(firstGeometry);

    await renderer.load(fakeLoaderFactory([]));
    renderer.update(grid);

    const fresh = instancedFor('straight');
    if (!fresh) {
      throw new Error('no instanced straight mesh after reload');
    }
    const secondGeometry = templateGeometry(renderer.templates.get('straight'));
    expect(secondGeometry).not.toBe(firstGeometry);
    expect(fresh.geometry).toBe(secondGeometry);
  });
});
