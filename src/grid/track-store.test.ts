import { beforeEach, describe, expect, it } from 'vitest';
import { GRID_SIZE, GridModel } from './grid-model';
import { createDemoLoop, loadOrSeedTrack, loadTrack, STORAGE_KEY, saveTrack } from './track-store';

/** Builds a valid 3x2 loop of tuples at the given origin. */
function validLoopTuples(
  x0 = 1,
  y0 = 1,
): Array<[number, number, 'straight' | 'curve' | 'start' | 'finish', 0 | 90 | 180 | 270]> {
  return [
    [x0, y0, 'curve', 90],
    [x0 + 1, y0, 'start', 90],
    [x0 + 2, y0, 'curve', 180],
    [x0 + 2, y0 + 1, 'curve', 270],
    [x0 + 1, y0 + 1, 'finish', 90],
    [x0, y0 + 1, 'curve', 0],
  ];
}

beforeEach(() => {
  localStorage.clear();
});

describe('createDemoLoop', () => {
  it('produces a populated grid with start and finish pieces', () => {
    const grid = createDemoLoop();
    let count = 0;
    let hasStart = false;
    let hasFinish = false;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid.getCell(x, y);
        if (cell !== null) {
          count++;
          hasStart ||= cell.type === 'start';
          hasFinish ||= cell.type === 'finish';
        }
      }
    }
    expect(count).toBeGreaterThan(6);
    expect(hasStart).toBe(true);
    expect(hasFinish).toBe(true);
  });
});

describe('saveTrack / loadTrack', () => {
  it('round-trips a track through localStorage', () => {
    const grid = new GridModel();
    for (const [x, y, type, orientation] of validLoopTuples()) {
      grid.setCell(x, y, { type, orientation });
    }
    saveTrack(grid);

    const loaded = loadTrack();
    expect(loaded).not.toBeNull();
    expect(loaded?.getCell(1, 1)).toEqual({ type: 'curve', orientation: 90 });
    expect(loaded?.getCell(2, 1)).toEqual({ type: 'start', orientation: 90 });
  });

  it('returns null when nothing was saved', () => {
    expect(loadTrack()).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadTrack()).toBeNull();
  });

  it('returns null for a snapshot with the wrong size', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([null, null, null]));
    expect(loadTrack()).toBeNull();
  });

  it('rejects a snapshot whose data does not match the schema', () => {
    const grid = new GridModel();
    for (const [x, y, type, orientation] of validLoopTuples()) {
      grid.setCell(x, y, { type, orientation });
    }
    const snapshot = grid.toSnapshot();
    snapshot[0] = { type: 'bomb', orientation: 0 } as unknown as (typeof snapshot)[number];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    expect(loadTrack()).toBeNull();
  });
});

describe('loadOrSeedTrack', () => {
  it('seeds the demo loop on first launch and persists it', () => {
    const grid = loadOrSeedTrack();
    expect(grid.getCell(4, 3)).toEqual({ type: 'start', orientation: 90 });
    // The seeded demo was also saved, so a reload finds it.
    expect(loadTrack()).not.toBeNull();
  });

  it('returns the saved track when one exists', () => {
    const grid = new GridModel();
    grid.setCell(0, 0, { type: 'curve', orientation: 0 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grid.toSnapshot()));
    const loaded = loadOrSeedTrack();
    expect(loaded.getCell(0, 0)).toEqual({ type: 'curve', orientation: 0 });
  });
});
