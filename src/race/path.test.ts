import { describe, expect, it } from 'vitest';
import { GridModel } from '../grid/grid-model';
import { extractLoopPath, type LoopCell } from './path';

/** Helper to build a grid from [x, y, type, orientation] tuples. */
function build(tuples: Array<[number, number, string, number]>): GridModel {
  const grid = new GridModel();
  for (const [x, y, type, orientation] of tuples) {
    grid.setCell(x, y, {
      type: type as 'straight' | 'curve' | 'start' | 'finish',
      orientation: orientation as 0 | 90 | 180 | 270,
    });
  }
  return grid;
}

/** Asserts the extracted path equals the expected [x, y, type, orientation] sequence. */
function expectPath(grid: GridModel, expected: Array<[number, number, string, number]>): void {
  const actual = extractLoopPath(grid).map((cell: LoopCell): [number, number, string, number] => [
    cell.x,
    cell.y,
    cell.type,
    cell.orientation,
  ]);
  expect(actual).toEqual(expected);
}

/**
 * Known 8-cell rectangular loop (3 wide x 3 tall ring):
 * start at (3,2) oriented 90 (E+W) -> side[0] = east, first step east.
 */
function eightCellLoop(): Array<[number, number, string, number]> {
  return [
    [2, 2, 'curve', 90],
    [3, 2, 'start', 90],
    [4, 2, 'curve', 180],
    [4, 3, 'straight', 0],
    [4, 4, 'curve', 270],
    [3, 4, 'straight', 90],
    [2, 4, 'curve', 0],
    [2, 3, 'straight', 0],
  ];
}

/**
 * Known 48-cell loop: 12x12 border ring (44 cells) with two +2 bump detours on
 * the bottom row (replacing/repurposing 4 cells with 8) -> 48 cells, no dangling.
 * Start at (6,0) oriented 90 (E+W) -> side[0] = east.
 */
function fortyEightCellLoop(): Array<[number, number, string, number]> {
  const pieces: Array<[number, number, string, number]> = [];
  // Top row (y=0): x=0..11, curves at corners, straights elsewhere; start at (6,0).
  for (let x = 0; x < 12; x++) {
    if (x === 0 || x === 11) {
      pieces.push([x, 0, 'curve', x === 0 ? 90 : 180]);
    } else if (x === 6) {
      pieces.push([x, 0, 'start', 90]);
    } else {
      pieces.push([x, 0, 'straight', 90]);
    }
  }
  // Right column (x=11): y=1..11, straight until the corner at (11,11).
  for (let y = 1; y < 12; y++) {
    pieces.push([11, y, y === 11 ? 'curve' : 'straight', y === 11 ? 270 : 0]);
  }
  // Bottom row (y=11): x=0..10 (corner at (0,11)); bumps detour north at x=7 and x=3.
  for (let x = 0; x < 11; x++) {
    if (x === 7) {
      pieces.push([7, 11, 'curve', 0]); // enter from east, exit north
      pieces.push([7, 10, 'curve', 270]); // enter south, exit west
      pieces.push([6, 10, 'curve', 90]); // enter east, exit south
      pieces.push([6, 11, 'curve', 270]); // enter north, exit west
    } else if (x === 3) {
      pieces.push([3, 11, 'curve', 0]); // enter from east, exit north
      pieces.push([3, 10, 'curve', 270]); // enter south, exit west
      pieces.push([2, 10, 'curve', 90]); // enter east, exit south
      pieces.push([2, 11, 'curve', 270]); // enter north, exit west
    } else if (x === 0) {
      pieces.push([0, 11, 'curve', 0]); // N+E corner
    } else {
      pieces.push([x, 11, 'straight', 90]);
    }
  }
  // Left column (x=0): y=1..10, straights.
  for (let y = 1; y < 11; y++) {
    pieces.push([0, y, 'straight', 0]);
  }
  return pieces;
}

describe('extractLoopPath', () => {
  it('returns the ordered circuit for a known 8-cell loop, starting at the start piece', () => {
    expectPath(build(eightCellLoop()), [
      [3, 2, 'start', 90],
      [4, 2, 'curve', 180],
      [4, 3, 'straight', 0],
      [4, 4, 'curve', 270],
      [3, 4, 'straight', 90],
      [2, 4, 'curve', 0],
      [2, 3, 'straight', 0],
      [2, 2, 'curve', 90],
    ]);
  });

  it('returns the full ordered circuit for a known 48-cell loop', () => {
    const path = extractLoopPath(build(fortyEightCellLoop()));
    expect(path).toHaveLength(48);
    expect(path[0]).toEqual({ x: 6, y: 0, type: 'start', orientation: 90 });
    // First step follows side[0] (east) of the start piece.
    expect(path[1]).toEqual({ x: 7, y: 0, type: 'straight', orientation: 90 });
    // Last cell connects back to the start piece.
    expect(path[47]).toEqual({ x: 5, y: 0, type: 'straight', orientation: 90 });
    // Every cell of the ring is visited exactly once.
    const seen = new Set(path.map((cell) => `${cell.x},${cell.y}`));
    expect(seen.size).toBe(48);
  });

  it('takes the first step along the start piece side[0] (north for orientation 0)', () => {
    const grid = build([
      [2, 3, 'start', 0], // N+S -> side[0] = north
      [2, 2, 'curve', 90],
      [3, 2, 'straight', 90],
      [4, 2, 'curve', 180],
      [4, 3, 'straight', 0],
      [4, 4, 'curve', 270],
      [3, 4, 'straight', 90],
      [2, 4, 'curve', 0],
    ]);
    expectPath(grid, [
      [2, 3, 'start', 0],
      [2, 2, 'curve', 90],
      [3, 2, 'straight', 90],
      [4, 2, 'curve', 180],
      [4, 3, 'straight', 0],
      [4, 4, 'curve', 270],
      [3, 4, 'straight', 90],
      [2, 4, 'curve', 0],
    ]);
  });

  it('excludes dangling pieces away from the loop', () => {
    const grid = build([
      ...eightCellLoop(),
      [6, 0, 'straight', 90],
      [7, 0, 'straight', 90],
      [9, 9, 'finish', 90],
    ]);
    expect(extractLoopPath(grid)).toHaveLength(8);
  });

  it('is deterministic: repeated extraction returns the identical sequence', () => {
    const grid = build(eightCellLoop());
    expect(extractLoopPath(grid)).toEqual(extractLoopPath(grid));
  });

  it('throws when no start piece exists', () => {
    const tuples = eightCellLoop();
    tuples[1] = [3, 2, 'straight', 90];
    expect(() => extractLoopPath(build(tuples))).toThrow(/start/);
  });

  it('throws when there is no loop (open path)', () => {
    const grid = build([
      [1, 1, 'start', 90],
      [2, 1, 'straight', 90],
      [3, 1, 'straight', 90],
    ]);
    expect(() => extractLoopPath(grid)).toThrow(/loop/);
  });

  it('throws when the start piece is not part of any loop', () => {
    const grid = build([
      ...eightCellLoop().filter(([, , type]) => type !== 'start'),
      [9, 9, 'start', 0], // lone start, stranded far from the ring
    ]);
    expect(() => extractLoopPath(grid)).toThrow(/loop/);
  });

  it('throws when the grid contains multiple loops', () => {
    const grid = build([
      ...eightCellLoop(),
      [7, 7, 'curve', 90],
      [8, 7, 'curve', 180],
      [8, 8, 'curve', 270],
      [7, 8, 'curve', 0],
    ]);
    expect(() => extractLoopPath(grid)).toThrow(/loop/);
  });
});
