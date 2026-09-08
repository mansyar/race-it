import { beforeEach, describe, expect, it } from 'vitest';
import { GRID_SIZE, GridModel, type Orientation } from '../grid/grid-model';
import { fillPerfPattern } from './perf-harness';

describe('fillPerfPattern', () => {
  let model: GridModel;

  beforeEach(() => {
    model = new GridModel();
  });

  it('fills every cell of the board (worst-case piece count)', () => {
    const placed = fillPerfPattern(model);
    expect(placed).toBe(GRID_SIZE * GRID_SIZE);
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        expect(model.getCell(x, y)).not.toBeNull();
      }
    }
  });

  it('cycles piece types and orientations deterministically', () => {
    fillPerfPattern(model);
    expect(model.getCell(0, 0)).toEqual({ type: 'straight', orientation: 0 });
    expect(model.getCell(1, 0)).toEqual({ type: 'curve', orientation: 90 });
    expect(model.getCell(2, 0)).toEqual({ type: 'start', orientation: 180 });
    expect(model.getCell(3, 0)).toEqual({ type: 'finish', orientation: 270 });
    expect(model.getCell(4, 0)?.type).toBe('straight');
  });

  it('uses all four orientations as Orientation values', () => {
    fillPerfPattern(model);
    const orientations = new Set<number>();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = model.getCell(x, y);
        if (cell) {
          orientations.add(cell.orientation);
        }
      }
    }
    expect([...orientations].sort((a, b) => a - b)).toEqual([0, 90, 180, 270] as Orientation[]);
  });
});
