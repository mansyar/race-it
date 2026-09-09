import type { PieceType } from './grid-model';
import { GRID_SIZE, type GridModel } from './grid-model';

/** Sides of a cell: 0 = north, 1 = east, 2 = south, 3 = west. */
type Side = 0 | 1 | 2 | 3;

const DELTAS: Record<Side, { dx: number; dy: number }> = {
  0: { dx: 0, dy: -1 },
  1: { dx: 1, dy: 0 },
  2: { dx: 0, dy: 1 },
  3: { dx: -1, dy: 0 },
};

/**
 * The two sides a piece connects, derived from its type and orientation.
 */
function connectedSides(type: PieceType, orientation: number): [Side, Side] {
  if (type === 'curve') {
    // 0deg = N+E, then clockwise quarter turns.
    const first = (orientation / 90) as Side;
    const second = ((first + 1) % 4) as Side;
    return [first, second];
  }
  // straight / start / finish are through-pieces: opposite sides.
  return orientation % 180 === 0 ? [0, 2] : [1, 3];
}

/**
 * Why the track is not race-ready (used for feedback hints).
 */
export type InvalidReason = 'empty' | 'no-loop' | 'multiple-loops' | 'missing-start';

export interface ValidationResult {
  valid: boolean;
  reason?: InvalidReason;
}

interface Piece {
  type: PieceType;
  sides: [Side, Side];
}

/**
 * Validates a build grid: race-ready iff the pieces form exactly one connected
 * closed circuit that contains the start piece. The finish piece is optional
 * decoration (F1-style: the start line is the start/finish line). Unconnected
 * leftover pieces are ignored.
 */
export function validateTrack(grid: GridModel): ValidationResult {
  const pieces = new Map<number, Piece>();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid.getCell(x, y);
      if (cell !== null) {
        pieces.set(y * GRID_SIZE + x, {
          type: cell.type,
          sides: connectedSides(cell.type, cell.orientation),
        });
      }
    }
  }
  if (pieces.size === 0) {
    return { valid: false, reason: 'empty' };
  }
  if (![...pieces.values()].some((piece) => piece.type === 'start')) {
    return { valid: false, reason: 'missing-start' };
  }

  // Count mutual connections per piece (max 2 by construction).
  const connections = new Map<number, number[]>();
  for (const [index, piece] of pieces) {
    const links: number[] = [];
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    for (const side of piece.sides) {
      const nx = x + DELTAS[side].dx;
      const ny = y + DELTAS[side].dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) {
        continue;
      }
      const neighbor = pieces.get(ny * GRID_SIZE + nx);
      if (neighbor === undefined) {
        continue;
      }
      // The neighbor must have an end pointing back at us.
      if (neighbor.sides.includes(((side + 2) % 4) as Side)) {
        links.push(ny * GRID_SIZE + nx);
      }
    }
    connections.set(index, links);
  }

  // Find cycles: a connected component where every piece has exactly 2 links.
  const visited = new Set<number>();
  let cycles = 0;
  let loopContainsStart = false;
  for (const index of pieces.keys()) {
    if (visited.has(index)) {
      continue;
    }
    // Flood-fill this component.
    const component: number[] = [];
    const queue = [index];
    visited.add(index);
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) {
        break;
      }
      component.push(current);
      for (const linked of connections.get(current) ?? []) {
        if (!visited.has(linked)) {
          visited.add(linked);
          queue.push(linked);
        }
      }
    }
    const isCycle = component.every((member) => (connections.get(member)?.length ?? 0) === 2);
    if (isCycle) {
      cycles++;
      loopContainsStart ||= component.some((member) => pieces.get(member)?.type === 'start');
    }
  }

  if (cycles === 0) {
    return { valid: false, reason: 'no-loop' };
  }
  if (cycles > 1) {
    return { valid: false, reason: 'multiple-loops' };
  }
  if (!loopContainsStart) {
    return { valid: false, reason: 'no-loop' };
  }
  return { valid: true };
}
