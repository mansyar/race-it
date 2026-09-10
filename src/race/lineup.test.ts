import { beforeEach, describe, expect, it } from 'vitest';
import type { CarLineup } from './lineup';
import { DEFAULT_LINEUP, isLineupValid, loadLineup, saveLineup, toggleKart } from './lineup';

const STORAGE_KEY = 'race-it:lineup';

describe('DEFAULT_LINEUP', () => {
  it('contains all four colors', () => {
    expect(DEFAULT_LINEUP).toEqual({ karts: ['red', 'blue', 'green', 'yellow'] });
  });

  it('is a valid lineup', () => {
    expect(isLineupValid(DEFAULT_LINEUP)).toBe(true);
  });
});

describe('toggleKart', () => {
  it('removes an active kart and keeps the rest', () => {
    const lineup = toggleKart(DEFAULT_LINEUP, 'red');
    expect(lineup.karts).toEqual(['blue', 'green', 'yellow']);
  });

  it('adds a removed kart back at the end', () => {
    const two = { karts: ['red', 'blue'] } satisfies CarLineup;
    const lineup = toggleKart(two, 'green');
    expect(lineup.karts).toEqual(['red', 'blue', 'green']);
  });

  it('never contains duplicates', () => {
    const lineup = toggleKart(DEFAULT_LINEUP, 'blue');
    expect(lineup.karts.filter((color) => color === 'blue')).toHaveLength(0);
  });

  it('returns a new lineup without mutating the input', () => {
    const before = DEFAULT_LINEUP.karts;
    toggleKart(DEFAULT_LINEUP, 'blue');
    expect(DEFAULT_LINEUP.karts).toEqual(before);
  });
});

describe('isLineupValid', () => {
  it('rejects fewer than two karts', () => {
    expect(isLineupValid({ karts: [] })).toBe(false);
    expect(isLineupValid({ karts: ['red'] })).toBe(false);
  });

  it('accepts two, three, and four karts', () => {
    expect(isLineupValid({ karts: ['red', 'blue'] })).toBe(true);
    expect(isLineupValid({ karts: ['red', 'blue', 'green'] })).toBe(true);
    expect(isLineupValid(DEFAULT_LINEUP)).toBe(true);
  });
});

describe('lineup persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a saved lineup through loadLineup', () => {
    const lineup: CarLineup = { karts: ['yellow', 'green'] };
    saveLineup(lineup);
    expect(loadLineup()).toEqual(lineup);
  });

  it('falls back to the default lineup when nothing is stored', () => {
    expect(loadLineup()).toEqual(DEFAULT_LINEUP);
  });

  it('falls back to the default lineup for corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(loadLineup()).toEqual(DEFAULT_LINEUP);
  });

  it('falls back to the default lineup for an invalid stored lineup', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ karts: ['red'] }));
    expect(loadLineup()).toEqual(DEFAULT_LINEUP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ karts: ['red', 'red'] }));
    expect(loadLineup()).toEqual(DEFAULT_LINEUP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ karts: ['red', 'purple'] }));
    expect(loadLineup()).toEqual(DEFAULT_LINEUP);
  });
});
