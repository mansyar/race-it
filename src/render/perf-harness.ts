import { GRID_SIZE, type GridModel, type Orientation, type PieceType } from '../grid/grid-model';

const CYCLE: readonly PieceType[] = ['straight', 'curve', 'start', 'finish'];

/**
 * Fills every cell of the board with a deterministic piece mix —
 * the worst case for draw calls and triangles (used by `?perf` debug mode).
 * @param model - Grid to fill in place.
 * @returns Number of pieces placed (always GRID_SIZE × GRID_SIZE).
 */
export function fillPerfPattern(model: GridModel): number {
  let placed = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const type = CYCLE[placed % CYCLE.length] as PieceType;
      const orientation = ((placed % 4) * 90) as Orientation;
      model.setCell(x, y, { type, orientation });
      placed++;
    }
  }
  return placed;
}
