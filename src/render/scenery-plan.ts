import { GRID_SIZE, type GridSnapshot, type Orientation } from '../grid/grid-model';
import { mulberry32 } from '../race/rng';

/** Maximum scenery items placed on the board (draw-call budget). */
export const MAX_SCENERY = 14;

/** Grandstands allowed on the board at once. */
const MAX_GRANDSTANDS = 2;

/** Barriers allowed on the board at once. */
const MAX_BARRIERS = 4;

export type SceneryKind = 'tree' | 'grandstand' | 'barrier';

/** One auto-placed decorative prop on an empty, non-adjacent cell. */
export interface SceneryItem {
  kind: SceneryKind;
  x: number;
  y: number;
  rotationDeg: Orientation;
  scaleJitter: number;
}

/** Default seed when none is provided (stable across reloads for same board). */
const DEFAULT_SEED = 0xc0ffee;

/**
 * Plans decorative scenery for empty cells that are not adjacent to any track
 * piece. Deterministic for a given snapshot and seed. Grandstands sit only on
 * the outer ring and face inward; trees dominate the mix.
 */
export function planScenery(snapshot: GridSnapshot, seed: number = DEFAULT_SEED): SceneryItem[] {
  const rng = mulberry32(seed);
  const occupied = new Set<string>();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (snapshot[y * GRID_SIZE + x]) {
        occupied.add(cellKey(x, y));
      }
    }
  }

  const blocked = new Set<string>(occupied);
  for (const key of occupied) {
    const [x, y] = parseKey(key);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < GRID_SIZE && ny < GRID_SIZE) {
          blocked.add(cellKey(nx, ny));
        }
      }
    }
  }

  const free: Array<{ x: number; y: number; border: boolean }> = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!blocked.has(cellKey(x, y))) {
        free.push({ x, y, border: isBorder(x, y) });
      }
    }
  }
  // Prefer border cells so props hug the table edge, then fill inward.
  free.sort((a, b) => Number(b.border) - Number(a.border) || a.y - b.y || a.x - b.x);

  const items: SceneryItem[] = [];
  let grandstands = 0;
  let barriers = 0;

  for (const cell of free) {
    if (items.length >= MAX_SCENERY) {
      break;
    }
    const roll = rng();
    let kind: SceneryKind;
    if (cell.border && grandstands < MAX_GRANDSTANDS && roll < 0.12) {
      kind = 'grandstand';
      grandstands += 1;
    } else if (barriers < MAX_BARRIERS && roll < 0.35) {
      kind = 'barrier';
      barriers += 1;
    } else {
      kind = 'tree';
    }

    const scaleJitter = 0.85 + rng() * 0.3;
    const rotationDeg = pickRotation(kind, cell.x, cell.y, rng);
    items.push({ kind, x: cell.x, y: cell.y, rotationDeg, scaleJitter });
  }

  return items;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseKey(key: string): [number, number] {
  const parts = key.split(',');
  return [Number(parts[0]), Number(parts[1])];
}

function isBorder(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1;
}

function pickRotation(kind: SceneryKind, x: number, y: number, rng: () => number): Orientation {
  if (kind === 'grandstand') {
    // Face inward from the nearest board edge.
    if (y === 0) return 180;
    if (y === GRID_SIZE - 1) return 0;
    if (x === 0) return 90;
    if (x === GRID_SIZE - 1) return 270;
    return 0;
  }
  const steps: Orientation[] = [0, 90, 180, 270];
  return steps[Math.floor(rng() * steps.length)] ?? 0;
}
