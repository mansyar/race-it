import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Cell, GRID_SIZE, GridModel } from './grid-model';
import {
  deleteFromShelf,
  loadShelf,
  SHELF_CAPACITY,
  SHELF_STORAGE_KEY,
  type ShelfEntry,
  saveToShelf,
} from './shelf-store';
import { saveTrack, STORAGE_KEY as TRACK_STORAGE_KEY } from './track-store';

/** Builds a grid containing a small 3x2 loop at the given origin. */
function loopGrid(x0 = 1, y0 = 1): GridModel {
  const grid = new GridModel();
  const tuples: Array<
    [number, number, 'straight' | 'curve' | 'start' | 'finish', 0 | 90 | 180 | 270]
  > = [
    [x0, y0, 'curve', 90],
    [x0 + 1, y0, 'start', 90],
    [x0 + 2, y0, 'curve', 180],
    [x0 + 2, y0 + 1, 'curve', 270],
    [x0 + 1, y0 + 1, 'finish', 90],
    [x0, y0 + 1, 'curve', 0],
  ];
  for (const [x, y, type, orientation] of tuples) {
    grid.setCell(x, y, { type, orientation });
  }
  return grid;
}

beforeEach(() => {
  localStorage.clear();
});

describe('saveToShelf / loadShelf', () => {
  it('round-trips a track through localStorage', () => {
    const grid = loopGrid();
    expect(saveToShelf(grid)).toBe('saved');

    const entries = loadShelf();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.snapshot).toEqual(grid.toSnapshot());
    expect(typeof entries[0]?.id).toBe('string');
    expect(typeof entries[0]?.createdAt).toBe('number');
  });

  it('returns an empty shelf when nothing was saved', () => {
    expect(loadShelf()).toEqual([]);
  });

  it('orders saved tracks newest-first', () => {
    const first = loopGrid(1, 1);
    const second = loopGrid(6, 6);
    saveToShelf(first);
    saveToShelf(second);

    const entries = loadShelf();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.snapshot).toEqual(second.toSnapshot());
    expect(entries[1]?.snapshot).toEqual(first.toSnapshot());
  });

  it('returns an empty shelf for corrupt JSON instead of throwing', () => {
    localStorage.setItem(SHELF_STORAGE_KEY, '{not json');
    expect(loadShelf()).toEqual([]);
  });

  it('silently drops corrupt entries while keeping healthy ones', () => {
    const grid = loopGrid();
    const healthy: ShelfEntry = {
      id: 'healthy-1',
      createdAt: 1_700_000_000_000,
      snapshot: grid.toSnapshot(),
    };
    localStorage.setItem(
      SHELF_STORAGE_KEY,
      JSON.stringify([
        healthy,
        null,
        { id: 'no-snapshot' },
        { id: 42, createdAt: 1, snapshot: healthy.snapshot },
        { id: 'bad-snapshot', createdAt: 1, snapshot: [null, null] },
        {
          id: 'bad-piece',
          createdAt: 1,
          snapshot: grid.toSnapshot().toSpliced(0, 1, {
            type: 'bomb',
            orientation: 0,
          } as unknown as Cell),
        },
      ]),
    );
    const entries = loadShelf();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('healthy-1');
  });
});

describe('shelf capacity', () => {
  it('allows up to SHELF_CAPACITY saves and reports full afterwards', () => {
    for (let i = 0; i < SHELF_CAPACITY; i++) {
      const x0 = 1 + (i % (GRID_SIZE - 3));
      const y0 = 1 + Math.floor(i / (GRID_SIZE - 3));
      expect(saveToShelf(loopGrid(x0, y0))).toBe('saved');
    }
    expect(loadShelf()).toHaveLength(SHELF_CAPACITY);

    expect(saveToShelf(loopGrid(GRID_SIZE - 3, GRID_SIZE - 3))).toBe('full');
    expect(loadShelf()).toHaveLength(SHELF_CAPACITY);
  });

  it('exposes the capacity contract of 12 slots', () => {
    expect(SHELF_CAPACITY).toBe(12);
  });
});

describe('deleteFromShelf', () => {
  it('removes exactly the requested entry', () => {
    const first = loopGrid(1, 1);
    const second = loopGrid(6, 6);
    saveToShelf(first);
    saveToShelf(second);
    const entries = loadShelf();
    expect(entries).toHaveLength(2);

    const target = entries[1];
    if (!target) {
      throw new Error('expected two entries');
    }
    deleteFromShelf(target.id);
    const remaining = loadShelf();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.snapshot).toEqual(second.toSnapshot());
  });

  it('is a no-op for an unknown id', () => {
    saveToShelf(loopGrid());
    deleteFromShelf('does-not-exist');
    expect(loadShelf()).toHaveLength(1);
  });
});

describe('storage resilience', () => {
  it('never throws when persisting fails', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveToShelf(loopGrid())).not.toThrow();
    expect(saveToShelf(loopGrid())).toBe('saved');
    vi.restoreAllMocks();
  });

  it('keeps the working-board auto-save untouched', () => {
    const board = loopGrid(3, 3);
    saveTrack(board);
    saveToShelf(loopGrid());

    const shelfEntries = loadShelf();
    const saved = shelfEntries[0];
    if (!saved) {
      throw new Error('expected one shelf entry');
    }
    deleteFromShelf(saved.id);

    expect(localStorage.getItem(TRACK_STORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(TRACK_STORAGE_KEY) ?? 'null')).toEqual(
      board.toSnapshot(),
    );
  });
});
