import type { GridSnapshot, Orientation, PieceType } from './grid-model';
import { GRID_SIZE, GridModel } from './grid-model';

/** localStorage key for the auto-saved track. */
export const STORAGE_KEY = 'race-it:track';

const PIECE_TYPES: readonly PieceType[] = ['straight', 'curve', 'start', 'finish'];
const ORIENTATIONS: readonly Orientation[] = [0, 90, 180, 270];

/**
 * Builds the pre-built demo track shown on first launch: a rounded rectangle
 * loop with start and finish pieces, large enough to teach placement and rotation.
 */
export function createDemoLoop(): GridModel {
  const grid = new GridModel();
  const pieces: Array<[number, number, PieceType, Orientation]> = [
    [3, 3, 'curve', 90],
    [4, 3, 'start', 90],
    [5, 3, 'straight', 90],
    [6, 3, 'straight', 90],
    [7, 3, 'curve', 180],
    [7, 4, 'straight', 0],
    [7, 5, 'straight', 0],
    [7, 6, 'curve', 270],
    [6, 6, 'straight', 90],
    [5, 6, 'finish', 90],
    [4, 6, 'straight', 90],
    [3, 6, 'curve', 0],
    [3, 4, 'straight', 0],
    [3, 5, 'straight', 0],
  ];
  for (const [x, y, type, orientation] of pieces) {
    grid.setCell(x, y, { type, orientation });
  }
  return grid;
}

/**
 * Checks that parsed JSON has the exact snapshot shape (size, piece types, orientations).
 */
function isSnapshot(value: unknown): value is GridSnapshot {
  if (!Array.isArray(value) || value.length !== GRID_SIZE * GRID_SIZE) {
    return false;
  }
  return value.every(
    (cell) =>
      cell === null ||
      (typeof cell === 'object' &&
        cell !== null &&
        PIECE_TYPES.includes((cell as { type: PieceType }).type) &&
        ORIENTATIONS.includes((cell as { orientation: Orientation }).orientation)),
  );
}

/**
 * Persistence for the build grid: saves the full snapshot to localStorage and
 * loads it back defensively (any corruption yields null, never a throw).
 */

/**
 * Saves the grid state to localStorage.
 */
export function saveTrack(grid: GridModel): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(grid.toSnapshot()));
}

/**
 * Loads the saved grid, or null when nothing valid is stored.
 */
export function loadTrack(): GridModel | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) {
      return null;
    }
    return GridModel.fromSnapshot(parsed);
  } catch {
    return null;
  }
}

/**
 * Loads the saved track; on first launch (or after corruption) seeds and
 * persists the demo loop instead.
 */
export function loadOrSeedTrack(): GridModel {
  const saved = loadTrack();
  if (saved !== null) {
    return saved;
  }
  const demo = createDemoLoop();
  saveTrack(demo);
  return demo;
}
