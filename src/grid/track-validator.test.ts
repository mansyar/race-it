import { describe, expect, it } from 'vitest';
import { GridModel } from './grid-model';
import { validateTrack } from './track-validator';

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

/**
 * Connection conventions (orientation 0 = north):
 * - straight / start / finish: two opposite ends (0deg = N+S, 90deg = E+W).
 * - curve: two adjacent ends (0deg = N+E, 90deg = E+S, 180deg = S+W, 270deg = W+N).
 * Minimal valid loop is a 3x2 ring: 4 curves + start & finish as the edge through-pieces.
 * Since the race-engine track, the finish piece is optional decoration.
 */
function minimalLoop(x0 = 1, y0 = 1): Array<[number, number, string, number]> {
  return [
    [x0, y0, 'curve', 90], // E+S
    [x0 + 1, y0, 'start', 90], // E+W
    [x0 + 2, y0, 'curve', 180], // S+W
    [x0 + 2, y0 + 1, 'curve', 270], // N+W
    [x0 + 1, y0 + 1, 'finish', 90], // E+W
    [x0, y0 + 1, 'curve', 0], // N+E
  ];
}

describe('TrackValidator', () => {
  it('accepts the minimal valid loop containing start and finish', () => {
    expect(validateTrack(build(minimalLoop())).valid).toBe(true);
  });

  it('accepts the minimal loop with only the start piece (finish is optional)', () => {
    const tuples = minimalLoop();
    tuples[4] = [2, 2, 'straight', 90]; // finish -> straight
    expect(validateTrack(build(tuples)).valid).toBe(true);
  });

  it('accepts a larger rectangle loop with straight edges and both special pieces', () => {
    const grid = build([
      [2, 2, 'curve', 90],
      [3, 2, 'start', 90],
      [4, 2, 'straight', 90],
      [5, 2, 'curve', 180],
      [2, 3, 'straight', 0],
      [5, 3, 'straight', 0],
      [2, 4, 'curve', 0],
      [3, 4, 'straight', 90],
      [4, 4, 'finish', 90],
      [5, 4, 'curve', 270],
    ]);
    expect(validateTrack(grid).valid).toBe(true);
  });

  it('rejects an empty grid with reason empty', () => {
    const result = validateTrack(new GridModel());
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('empty');
  });

  it('rejects an open path (no loop) with reason no-loop', () => {
    const grid = build([
      [1, 1, 'start', 90],
      [2, 1, 'straight', 90],
      [3, 1, 'finish', 90],
    ]);
    const result = validateTrack(grid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no-loop');
  });

  it('rejects a closed loop without the start piece (finish only) with reason missing-start', () => {
    const tuples = minimalLoop();
    tuples[1] = [2, 1, 'straight', 90]; // start -> straight
    const result = validateTrack(build(tuples));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing-start');
  });

  it('rejects two separate closed loops with reason multiple-loops', () => {
    const grid = build([
      ...minimalLoop(1, 1),
      ...minimalLoop(6, 5).map(
        ([x, y, t, o]) =>
          [x, y, t === 'start' ? 'straight' : t, o] as [number, number, string, number],
      ),
    ]);
    const result = validateTrack(grid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('multiple-loops');
  });

  it('rejects a closed loop that does not contain the start piece', () => {
    // A closed ring with the start piece stranded outside it.
    const tuples = minimalLoop();
    tuples[1] = [2, 1, 'straight', 90]; // start -> straight
    tuples.push([9, 9, 'start', 0]); // lone start, disconnected
    const result = validateTrack(build(tuples));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no-loop');
  });

  it('ignores dangling chains and isolated pieces away from the loop', () => {
    const grid = build([
      ...minimalLoop(1, 1),
      // A disconnected chain of two straights plus one lone curve, far from the loop
      [6, 0, 'straight', 90],
      [7, 0, 'straight', 90],
      [9, 9, 'curve', 0],
    ]);
    expect(validateTrack(grid).valid).toBe(true);
  });

  it('rejects pieces whose ends do not meet (mismatched connections)', () => {
    const tuples = minimalLoop();
    tuples[2] = [3, 1, 'curve', 270]; // corner rotated wrong: no longer connects to the ring below
    expect(validateTrack(build(tuples)).valid).toBe(false);
  });

  it('rejects a loop whose finish is rotated so the ring does not close', () => {
    const tuples = minimalLoop();
    tuples[4] = [2, 2, 'finish', 0]; // through-piece pointing N+S instead of E+W
    expect(validateTrack(build(tuples)).valid).toBe(false);
  });
});