import { GRID_SIZE, type GridModel, type Orientation, type PieceType } from '../grid/grid-model';

/** A single cell of the ordered circuit, in driving order. */
export interface LoopCell {
  x: number;
  y: number;
  type: PieceType;
  orientation: Orientation;
}

/** Sides of a cell: 0 = north, 1 = east, 2 = south, 3 = west. */
type Side = 0 | 1 | 2 | 3;

const DELTAS: Record<Side, { dx: number; dy: number }> = {
  0: { dx: 0, dy: -1 },
  1: { dx: 1, dy: 0 },
  2: { dx: 0, dy: 1 },
  3: { dx: -1, dy: 0 },
};

/** The two sides a piece connects, derived from its type and orientation. */
function connectedSides(type: PieceType, orientation: Orientation): [Side, Side] {
  if (type === 'curve') {
    // 0deg = N+E, then clockwise quarter turns.
    const first = (orientation / 90) as Side;
    const second = ((first + 1) % 4) as Side;
    return [first, second];
  }
  // straight / start / finish are through-pieces: opposite sides.
  return orientation % 180 === 0 ? [0, 2] : [1, 3];
}

interface CellRef {
  x: number;
  y: number;
  type: PieceType;
  orientation: Orientation;
}

/** Reads a grid cell with its coordinates, or null when empty / out of bounds. */
function cellAt(grid: GridModel, x: number, y: number): CellRef | null {
  if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
    return null;
  }
  const cell = grid.getCell(x, y);
  if (cell === null) {
    return null;
  }
  return { x, y, type: cell.type, orientation: cell.orientation };
}

/**
 * Extracts the ordered circuit from a build grid as a list of cells starting at
 * the start piece. The first step follows the start piece's side[0] neighbor
 * (0 = north, 1 = east, 2 = south, 3 = west); every subsequent step follows the
 * piece's remaining connection. Dangling pieces are ignored.
 *
 * @throws Error when the grid has no start piece, when the start piece is not
 *   part of a closed loop, or when more than one closed loop exists.
 */
export function extractLoopPath(grid: GridModel): LoopCell[] {
  // Locate the start piece (a valid track has exactly one loop containing it).
  let start: CellRef | null = null;
  for (let y = 0; y < GRID_SIZE && start === null; y++) {
    for (let x = 0; x < GRID_SIZE && start === null; x++) {
      const cell = grid.getCell(x, y);
      if (cell !== null && cell.type === 'start') {
        start = { x, y, type: cell.type, orientation: cell.orientation };
      }
    }
  }
  if (start === null) {
    throw new Error('extractLoopPath: grid contains no start piece');
  }

  // First step: the start piece's side[0] neighbor, which must connect back.
  const [firstSide] = connectedSides(start.type, start.orientation);
  const first = cellAt(grid, start.x + DELTAS[firstSide].dx, start.y + DELTAS[firstSide].dy);
  if (
    first === null ||
    !connectedSides(first.type, first.orientation).includes(((firstSide + 2) % 4) as Side)
  ) {
    throw new Error('extractLoopPath: start piece is not part of a closed loop');
  }

  // Walk the circuit until we return to the start cell.
  const path: LoopCell[] = [start];
  let current = first;
  let entrySide = ((firstSide + 2) % 4) as Side; // side of `first` pointing back at the start
  let steps = 0;
  while (current.x !== start.x || current.y !== start.y) {
    path.push(current);
    const exit = connectedSides(current.type, current.orientation).find(
      (side) => side !== entrySide,
    );
    if (exit === undefined) {
      throw new Error('extractLoopPath: start piece is not part of a closed loop');
    }
    const next = cellAt(grid, current.x + DELTAS[exit].dx, current.y + DELTAS[exit].dy);
    if (next === null) {
      throw new Error('extractLoopPath: start piece is not part of a closed loop');
    }
    entrySide = ((exit + 2) % 4) as Side;
    current = next;
    steps++;
    if (steps > GRID_SIZE * GRID_SIZE) {
      throw new Error('extractLoopPath: start piece is not part of a closed loop');
    }
  }
  if (path.length < 4) {
    throw new Error('extractLoopPath: start piece is not part of a closed loop');
  }

  // Reject grids carrying a second closed loop outside the start's circuit.
  const onPath = new Set(path.map((cell) => cell.y * GRID_SIZE + cell.x));
  const connections = new Map<number, number[]>();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const index = y * GRID_SIZE + x;
      if (onPath.has(index)) {
        continue;
      }
      const cell = grid.getCell(x, y);
      if (cell === null) {
        continue;
      }
      const links: number[] = [];
      for (const side of connectedSides(cell.type, cell.orientation)) {
        const nx = x + DELTAS[side].dx;
        const ny = y + DELTAS[side].dy;
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) {
          continue;
        }
        if (onPath.has(ny * GRID_SIZE + nx)) {
          continue;
        }
        const neighbor = grid.getCell(nx, ny);
        if (neighbor === null) {
          continue;
        }
        if (
          connectedSides(neighbor.type, neighbor.orientation).includes(((side + 2) % 4) as Side)
        ) {
          links.push(ny * GRID_SIZE + nx);
        }
      }
      connections.set(index, links);
    }
  }
  const visited = new Set<number>();
  for (const index of connections.keys()) {
    if (visited.has(index)) {
      continue;
    }
    // Flood-fill this component.
    const component: number[] = [];
    const queue = [index];
    visited.add(index);
    while (queue.length > 0) {
      const member = queue.pop();
      if (member === undefined) {
        break;
      }
      component.push(member);
      for (const linked of connections.get(member) ?? []) {
        if (!visited.has(linked)) {
          visited.add(linked);
          queue.push(linked);
        }
      }
    }
    if (component.every((member) => (connections.get(member)?.length ?? 0) === 2)) {
      throw new Error('extractLoopPath: grid contains multiple closed loops');
    }
  }

  return path;
}
