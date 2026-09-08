/**
 * The four track piece types available on the build palette.
 */
export type PieceType = 'straight' | 'curve' | 'start' | 'finish';

/**
 * Clockwise rotation of a piece in degrees. Only right-angle steps are valid.
 */
export type Orientation = 0 | 90 | 180 | 270;

const ORIENTATIONS: readonly Orientation[] = [0, 90, 180, 270];

/**
 * One placed track piece.
 */
export interface Cell {
  type: PieceType;
  orientation: Orientation;
}

/** A cell is either an occupied piece or empty (null). */
export type CellState = Cell | null;

/** The fixed grid is always GRID_SIZE x GRID_SIZE cells. */
export const GRID_SIZE = 12;

/**
 * Serializable snapshot of the whole grid, stored row-major (y * GRID_SIZE + x).
 */
export type GridSnapshot = CellState[];

/**
 * Pure state container for the 12x12 build grid. Holds at most one piece per
 * cell and knows nothing about rendering or interaction.
 */
export class GridModel {
  private cells: CellState[];

  constructor() {
    this.cells = new Array<CellState>(GRID_SIZE * GRID_SIZE).fill(null);
  }

  /**
   * Reads the cell at grid coordinates (x, y).
   * @returns The piece in that cell, or null when empty.
   * @throws RangeError when coordinates are outside the grid.
   */
  getCell(x: number, y: number): CellState {
    this.assertInBounds(x, y);
    return this.cells[y * GRID_SIZE + x] ?? null;
  }

  /**
   * Writes a piece to cell (x, y), or clears the cell with null.
   * @throws RangeError when coordinates or the orientation are invalid.
   */
  setCell(x: number, y: number, cell: CellState): void {
    this.assertInBounds(x, y);
    if (cell !== null && !ORIENTATIONS.includes(cell.orientation)) {
      throw new RangeError(`Invalid orientation: ${String(cell.orientation)}`);
    }
    this.cells[y * GRID_SIZE + x] = cell === null ? null : { ...cell };
  }

  /**
   * Returns a plain serializable copy of the full grid state.
   */
  toSnapshot(): GridSnapshot {
    return this.cells.map((cell) => (cell === null ? null : { ...cell }));
  }

  /**
   * Rebuilds a grid from a snapshot produced by toSnapshot().
   * @throws RangeError when the snapshot size or any cell content is invalid.
   */
  static fromSnapshot(snapshot: GridSnapshot): GridModel {
    if (snapshot.length !== GRID_SIZE * GRID_SIZE) {
      throw new RangeError(`Snapshot must contain exactly ${String(GRID_SIZE * GRID_SIZE)} cells`);
    }
    const grid = new GridModel();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        grid.setCell(x, y, snapshot[y * GRID_SIZE + x] ?? null);
      }
    }
    return grid;
  }

  private assertInBounds(x: number, y: number): void {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= GRID_SIZE ||
      y >= GRID_SIZE
    ) {
      throw new RangeError(
        `Cell (${String(x)}, ${String(y)}) is outside the ${String(GRID_SIZE)}x${String(GRID_SIZE)} grid`,
      );
    }
  }
}
