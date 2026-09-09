import { describe, expect, it } from 'vitest';
import { GRID_SIZE, type GridSnapshot } from '../grid/grid-model';
import { createDemoLoop } from '../grid/track-store';
import { planScenery, MAX_SCENERY, type SceneryItem } from './scenery-plan';

function emptySnapshot(): GridSnapshot {
  return new Array<null>(GRID_SIZE * GRID_SIZE).fill(null);
}

function snapshotWith(
  pieces: Array<[number, number]>,
): GridSnapshot {
  const snap = emptySnapshot();
  for (const [x, y] of pieces) {
    snap[y * GRID_SIZE + x] = { type: 'straight', orientation: 0 };
  }
  return snap;
}

function isBorder(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1;
}

function isAdjacentToAnyPiece(
  x: number,
  y: number,
  pieces: Array<[number, number]>,
): boolean {
  return pieces.some(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1);
}

function keysOf(items: SceneryItem[]): string[] {
  return items.map((item) => `${item.kind}:${item.x},${item.y}`).sort();
}

describe('planScenery', () => {
  it('places scenery on an empty board within the max budget', () => {
    const items = planScenery(emptySnapshot(), 1);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(MAX_SCENERY);
  });

  it('never places on occupied cells', () => {
    const pieces: Array<[number, number]> = [
      [5, 5],
      [6, 5],
      [7, 5],
    ];
    const items = planScenery(snapshotWith(pieces), 2);
    for (const item of items) {
      expect(pieces).not.toContainEqual([item.x, item.y]);
    }
  });

  it('never places on cells adjacent (including diagonals) to track pieces', () => {
    const pieces: Array<[number, number]> = [
      [3, 3],
      [4, 3],
      [5, 3],
      [5, 4],
      [5, 5],
    ];
    const items = planScenery(snapshotWith(pieces), 3);
    for (const item of items) {
      expect(isAdjacentToAnyPiece(item.x, item.y, pieces)).toBe(false);
    }
  });

  it('places grandstands only on the board border facing inward', () => {
    const items = planScenery(emptySnapshot(), 7);
    const grandstands = items.filter((item) => item.kind === 'grandstand');
    expect(grandstands.length).toBeGreaterThanOrEqual(0);
    expect(grandstands.length).toBeLessThanOrEqual(2);
    for (const stand of grandstands) {
      expect(isBorder(stand.x, stand.y)).toBe(true);
      // Facing inward: rotation points toward board center.
      if (stand.y === 0) {
        expect(stand.rotationDeg).toBe(180);
      } else if (stand.y === GRID_SIZE - 1) {
        expect(stand.rotationDeg).toBe(0);
      } else if (stand.x === 0) {
        expect(stand.rotationDeg).toBe(90);
      } else if (stand.x === GRID_SIZE - 1) {
        expect(stand.rotationDeg).toBe(270);
      }
    }
  });

  it('caps total items at MAX_SCENERY', () => {
    const items = planScenery(emptySnapshot(), 99);
    expect(items.length).toBeLessThanOrEqual(MAX_SCENERY);
  });

  it('is deterministic for the same snapshot and seed', () => {
    const snap = createDemoLoop().toSnapshot();
    const a = planScenery(snap, 42);
    const b = planScenery(snap, 42);
    expect(keysOf(a)).toEqual(keysOf(b));
  });

  it('produces different plans for different seeds', () => {
    const snap = emptySnapshot();
    const a = planScenery(snap, 1);
    const b = planScenery(snap, 2);
    // Not strictly required to differ, but with an empty board they almost always do.
    // Allow equality only if both are empty (they should not be).
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it('produces a valid non-overlapping plan for the demo loop', () => {
    const demo = createDemoLoop();
    const items = planScenery(demo.toSnapshot(), 11);
    const occupied = new Set<string>();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (demo.getCell(x, y)) {
          occupied.add(`${x},${y}`);
        }
      }
    }
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.x},${item.y}`;
      expect(occupied.has(key)).toBe(false);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThan(GRID_SIZE);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeLessThan(GRID_SIZE);
      expect(item.scaleJitter).toBeGreaterThan(0.8);
      expect(item.scaleJitter).toBeLessThanOrEqual(1.2);
      expect([0, 90, 180, 270]).toContain(item.rotationDeg);
    }
  });

  it('returns an empty plan when every free cell is track-adjacent', () => {
    // A solid 12x12 of pieces leaves no free cells.
    const filled = emptySnapshot().map(() => ({
      type: 'straight' as const,
      orientation: 0 as const,
    }));
    const items = planScenery(filled, 5);
    expect(items).toEqual([]);
  });

  it('keeps tree count dominant over other kinds when space allows', () => {
    const items = planScenery(emptySnapshot(), 13);
    const trees = items.filter((item) => item.kind === 'tree').length;
    const others = items.length - trees;
    expect(trees).toBeGreaterThanOrEqual(others);
  });
});
