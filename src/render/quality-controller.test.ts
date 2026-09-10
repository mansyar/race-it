import { describe, expect, it, vi } from 'vitest';
import {
  createQualityController,
  DEGRADE_FPS,
  DEGRADE_WINDOW_SECONDS,
  parseForcedTier,
  QUALITY_STORAGE_KEY,
  readStoredTier,
  RECOVER_FPS,
  RECOVER_WINDOW_SECONDS,
  resolveStartTier,
  type QualityController,
  type QualityStorage,
} from './quality-controller';

const SLOW_FPS = DEGRADE_FPS - 25;
const FAST_FPS = RECOVER_FPS + 2;
const BAND_FPS = (DEGRADE_FPS + RECOVER_FPS) / 2;

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const getItem = vi.fn((key: string) => data.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => {
    data.set(key, value);
  });
  return { getItem, setItem, data };
}

function throwingStorage(): QualityStorage {
  return {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
}

function tickAt(controller: QualityController, seconds: number, fps: number): void {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i += 1) {
    controller.tick(1 / fps);
  }
}

describe('parseForcedTier', () => {
  it('reads a valid tier from the search string', () => {
    expect(parseForcedTier('?tier=low')).toBe('low');
    expect(parseForcedTier('?perf&tier=mid')).toBe('mid');
    expect(parseForcedTier('tier=high')).toBe('high');
  });

  it('accepts mixed case', () => {
    expect(parseForcedTier('?tier=LOW')).toBe('low');
  });

  it('returns null for missing or unknown values', () => {
    expect(parseForcedTier('')).toBeNull();
    expect(parseForcedTier('?perf')).toBeNull();
    expect(parseForcedTier('?tier=ultra')).toBeNull();
  });
});

describe('readStoredTier', () => {
  it('returns the stored tier when valid', () => {
    expect(readStoredTier(fakeStorage({ [QUALITY_STORAGE_KEY]: 'mid' }))).toBe('mid');
  });

  it('falls back to high when missing, corrupt, or absent', () => {
    expect(readStoredTier(fakeStorage())).toBe('high');
    expect(readStoredTier(fakeStorage({ [QUALITY_STORAGE_KEY]: 'banana' }))).toBe('high');
    expect(readStoredTier(null)).toBe('high');
    expect(readStoredTier(undefined)).toBe('high');
  });

  it('never throws when the storage read fails', () => {
    expect(readStoredTier(throwingStorage())).toBe('high');
  });
});

describe('resolveStartTier', () => {
  it('prefers the forced URL tier over the stored tier', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'mid' });
    expect(resolveStartTier('?tier=low', storage)).toBe('low');
  });

  it('uses the stored tier when no override exists', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'mid' });
    expect(resolveStartTier('', storage)).toBe('mid');
  });

  it('falls back to high by default', () => {
    expect(resolveStartTier('')).toBe('high');
  });
});

describe('createQualityController', () => {
  it('starts at the stored tier, or high when nothing is stored', () => {
    expect(createQualityController().tier).toBe('high');
    expect(createQualityController({ storage: fakeStorage() }).tier).toBe('high');
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'mid' });
    expect(createQualityController({ storage }).tier).toBe('mid');
  });

  it('steps down one tier after a full window of poor frames', () => {
    const controller = createQualityController({ storage: fakeStorage() });
    tickAt(controller, DEGRADE_WINDOW_SECONDS - 0.5, SLOW_FPS);
    expect(controller.tier).toBe('high');
    tickAt(controller, 1, SLOW_FPS);
    expect(controller.tier).toBe('mid');
  });

  it('requires a fresh window of poor frames before stepping down again', () => {
    const controller = createQualityController({ storage: fakeStorage() });
    tickAt(controller, DEGRADE_WINDOW_SECONDS + 0.2, SLOW_FPS);
    expect(controller.tier).toBe('mid');
    tickAt(controller, DEGRADE_WINDOW_SECONDS - 0.5, SLOW_FPS);
    expect(controller.tier).toBe('mid');
    tickAt(controller, 1, SLOW_FPS);
    expect(controller.tier).toBe('low');
  });

  it('clamps at low when poor frames persist', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'low' });
    const controller = createQualityController({ storage });
    tickAt(controller, 20, SLOW_FPS);
    expect(controller.tier).toBe('low');
  });

  it('requires the long headroom window before stepping back up', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'low' });
    const controller = createQualityController({ storage });
    tickAt(controller, RECOVER_WINDOW_SECONDS - 1, FAST_FPS);
    expect(controller.tier).toBe('low');
    tickAt(controller, 2, FAST_FPS);
    expect(controller.tier).toBe('mid');
    tickAt(controller, RECOVER_WINDOW_SECONDS + 1, FAST_FPS);
    expect(controller.tier).toBe('high');
  });

  it('clamps at high when fast frames persist', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'high' });
    const controller = createQualityController({ storage });
    tickAt(controller, 30, FAST_FPS);
    expect(controller.tier).toBe('high');
  });

  it('does not oscillate on frame rates inside the hysteresis band', () => {
    const high = createQualityController({
      storage: fakeStorage({ [QUALITY_STORAGE_KEY]: 'high' }),
    });
    tickAt(high, 20, BAND_FPS);
    expect(high.tier).toBe('high');

    const mid = createQualityController({
      storage: fakeStorage({ [QUALITY_STORAGE_KEY]: 'mid' }),
    });
    tickAt(mid, 20, BAND_FPS);
    expect(mid.tier).toBe('mid');
  });

  it('blocks sampling and never persists while the URL tier is forced', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'high' });
    const onChange = vi.fn();
    const controller = createQualityController({ search: '?tier=low', storage, onChange });
    expect(controller.tier).toBe('low');
    tickAt(controller, 20, SLOW_FPS);
    tickAt(controller, 20, FAST_FPS);
    expect(controller.tier).toBe('low');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('persists and announces every sampled change', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'high' });
    const onChange = vi.fn();
    const controller = createQualityController({ storage, onChange });
    tickAt(controller, DEGRADE_WINDOW_SECONDS + 1, SLOW_FPS);
    expect(controller.tier).toBe('mid');
    expect(storage.setItem).toHaveBeenLastCalledWith(QUALITY_STORAGE_KEY, 'mid');
    expect(onChange).toHaveBeenLastCalledWith('mid');
    tickAt(controller, DEGRADE_WINDOW_SECONDS + 1, SLOW_FPS);
    expect(controller.tier).toBe('low');
    expect(storage.setItem).toHaveBeenLastCalledWith(QUALITY_STORAGE_KEY, 'low');
    expect(onChange).toHaveBeenLastCalledWith('low');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when the tier never changes', () => {
    const storage = fakeStorage({ [QUALITY_STORAGE_KEY]: 'mid' });
    const controller = createQualityController({ storage });
    tickAt(controller, 30, BAND_FPS);
    expect(controller.tier).toBe('mid');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('survives storage write failures', () => {
    const controller = createQualityController({ storage: throwingStorage() });
    tickAt(controller, DEGRADE_WINDOW_SECONDS + 1, SLOW_FPS);
    expect(controller.tier).toBe('mid');
  });

  it('ignores invalid frame deltas', () => {
    const controller = createQualityController({ storage: fakeStorage() });
    for (let i = 0; i < 1000; i += 1) {
      controller.tick(0);
    }
    controller.tick(Number.NaN);
    expect(controller.tier).toBe('high');
  });
});
