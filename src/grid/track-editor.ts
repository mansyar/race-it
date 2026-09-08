import type { GridModel, Orientation, PieceType } from './grid-model';

/**
 * A captured prior state of one cell, used to reverse a single edit.
 */
interface CellRecord {
  x: number;
  y: number;
  before: import('./grid-model').CellState;
}

/**
 * Edit operations on the build grid (place, rotate, remove) with a one-step-per-action
 * undo history. Each public method records enough state to restore the previous piece.
 */
export class TrackEditor {
  private readonly grid: GridModel;
  private history: CellRecord[] = [];

  constructor(grid: GridModel) {
    this.grid = grid;
  }

  /**
   * Places a piece of the given type and orientation on a cell (replacing any piece there).
   * @throws RangeError when coordinates or orientation are invalid (from GridModel).
   */
  place(x: number, y: number, type: PieceType, orientation: Orientation): void {
    const before = this.grid.getCell(x, y);
    this.grid.setCell(x, y, { type, orientation });
    this.history.push({ x, y, before });
  }

  /**
   * Rotates the piece in a cell 90 degrees clockwise (270 wraps to 0). No-op on empty cells.
   */
  rotate(x: number, y: number): void {
    const cell = this.grid.getCell(x, y);
    if (cell === null) {
      return;
    }
    const before = { ...cell };
    const next = ((cell.orientation + 90) % 360) as Orientation;
    this.grid.setCell(x, y, { type: cell.type, orientation: next });
    this.history.push({ x, y, before });
  }

  /**
   * Removes the piece from a cell. No-op on empty cells.
   */
  remove(x: number, y: number): void {
    const cell = this.grid.getCell(x, y);
    if (cell === null) {
      return;
    }
    this.grid.setCell(x, y, null);
    this.history.push({ x, y, before: cell });
  }

  /**
   * Reads the piece in a cell (null when empty).
   */
  getCell(x: number, y: number): import('./grid-model').CellState {
    return this.grid.getCell(x, y);
  }

  /**
   * Reverts the most recent edit. No-op when the history is empty.
   */
  undo(): void {
    const record = this.history.pop();
    if (record === undefined) {
      return;
    }
    this.grid.setCell(record.x, record.y, record.before);
  }

  /**
   * Whether there is at least one edit to undo.
   */
  canUndo(): boolean {
    return this.history.length > 0;
  }
}
