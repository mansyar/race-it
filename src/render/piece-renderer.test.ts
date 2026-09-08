import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Cell, GridSnapshot } from '../grid/grid-model';
import { gridToWorld } from './layout';
import { buildPiece, PieceRenderer } from './piece-renderer';
import { checkerTexture } from './piece-visuals';

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
    expect(
      buildPiece(template(), { type: 'finish', orientation: 90 }, 1, 1, checkers).children.length,
    ).toBe(2);
  });
});

describe('PieceRenderer', () => {
  let renderer: PieceRenderer;

  beforeEach(() => {
    renderer = new PieceRenderer();
  });

  it('loads one tinted template per piece type', async () => {
    const loaded: string[] = [];
    await renderer.load(fakeLoaderFactory(loaded));
    expect(loaded.length).toBe(4);
    expect(renderer.templates.size).toBe(4);
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
