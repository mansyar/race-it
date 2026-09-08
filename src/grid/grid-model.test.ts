import { describe, expect, it } from 'vitest';
import type { Cell, Orientation } from './grid-model';
import { GRID_SIZE, GridModel } from './grid-model';

describe('GridModel', () => {
  it('exposes a fixed 12x12 grid size', () => {
    expect(GRID_SIZE).toBe(12);
  });

  it('starts empty: every cell is null', () => {
    const grid = new GridModel();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        expect(grid.getCell(x, y)).toBeNull();
      }
    }
  });

  it('stores a placed piece and reads it back', () => {
    const grid = new GridModel();
    grid.setCell(3, 5, { type: 'straight', orientation: 90 });
    expect(grid.getCell(3, 5)).toEqual({ type: 'straight', orientation: 90 });
  });

  it('overwrites a cell with a new piece', () => {
    const grid = new GridModel();
    grid.setCell(0, 0, { type: 'curve', orientation: 0 });
    grid.setCell(0, 0, { type: 'finish', orientation: 180 });
    expect(grid.getCell(0, 0)).toEqual({ type: 'finish', orientation: 180 });
  });

  it('clears a cell when set to null', () => {
    const grid = new GridModel();
    grid.setCell(7, 2, { type: 'start', orientation: 0 });
    grid.setCell(7, 2, null);
    expect(grid.getCell(7, 2)).toBeNull();
  });

  it('does not leak stored cells when one is mutated externally', () => {
    const grid = new GridModel();
    const piece: Cell = { type: 'curve', orientation: 0 };
    grid.setCell(1, 1, piece);
    piece.orientation = 270;
    expect(grid.getCell(1, 1)?.orientation).toBe(0);
  });

  it('throws for out-of-bounds coordinates', () => {
    const grid = new GridModel();
    expect(() => grid.getCell(-1, 0)).toThrow(RangeError);
    expect(() => grid.getCell(0, GRID_SIZE)).toThrow(RangeError);
    expect(() => grid.setCell(GRID_SIZE, 0, null)).toThrow(RangeError);
    expect(() => grid.setCell(0, -1, null)).toThrow(RangeError);
  });

  it('throws for an orientation that is not a multiple of 90', () => {
    const grid = new GridModel();
    // Deliberately invalid values (rejected at runtime, not representable in the type).
    expect(() => grid.setCell(0, 0, { type: 'straight', orientation: 45 as Orientation })).toThrow(
      RangeError,
    );
    expect(() => grid.setCell(0, 0, { type: 'straight', orientation: 360 as Orientation })).toThrow(
      RangeError,
    );
  });

  it('serializes to a plain snapshot and restores from it', () => {
    const grid = new GridModel();
    grid.setCell(2, 3, { type: 'straight', orientation: 90 });
    grid.setCell(3, 3, { type: 'curve', orientation: 180 });
    const snapshot = grid.toSnapshot();

    const restored = GridModel.fromSnapshot(snapshot);
    expect(restored.getCell(2, 3)).toEqual({ type: 'straight', orientation: 90 });
    expect(restored.getCell(3, 3)).toEqual({ type: 'curve', orientation: 180 });
    expect(restored.getCell(4, 4)).toBeNull();
  });

  it('round-trips through JSON', () => {
    const grid = new GridModel();
    grid.setCell(5, 6, { type: 'finish', orientation: 270 });
    const json = JSON.stringify(grid.toSnapshot());
    const restored = GridModel.fromSnapshot(JSON.parse(json));
    expect(restored.getCell(5, 6)).toEqual({ type: 'finish', orientation: 270 });
  });
});
