import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_RELOAD_KEY,
  createContextLossGuard,
  GRACE_MS,
  MAX_RELOAD_ATTEMPTS,
  type ContextLossGuard,
  type StorageLike,
} from './context-loss';

const TEST_GRACE_MS = 1_000;

function fakeTarget() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  return {
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type: string): { preventDefault: ReturnType<typeof vi.fn> } {
      const event = { preventDefault: vi.fn() };
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(event as unknown as Event);
      }
      return event;
    },
    listenerCount(type: string): number {
      return listeners.get(type)?.size ?? 0;
    },
    registeredTypes(): string[] {
      return [...listeners.keys()].filter((type) => (listeners.get(type)?.size ?? 0) > 0);
    },
  };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    data,
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
}

interface Harness {
  target: ReturnType<typeof fakeTarget>;
  visibility: ReturnType<typeof fakeTarget>;
  storage: ReturnType<typeof fakeStorage>;
  reload: ReturnType<typeof vi.fn>;
  lost: ReturnType<typeof vi.fn>;
  restored: ReturnType<typeof vi.fn>;
  failed: ReturnType<typeof vi.fn>;
  guard: ContextLossGuard;
  setVisible(value: boolean): void;
}

function createHarness(
  options: {
    graceMs?: number;
    visible?: boolean;
    storage?: ReturnType<typeof fakeStorage> | null;
  } = {},
): Harness {
  const target = fakeTarget();
  const visibility = fakeTarget();
  const storage = options.storage === undefined ? fakeStorage() : options.storage;
  const reload = vi.fn();
  const lost = vi.fn();
  const restored = vi.fn();
  const failed = vi.fn();
  let visible = options.visible ?? true;
  const guard = createContextLossGuard({
    target,
    visibilityTarget: visibility,
    isVisible: () => visible,
    storage,
    graceMs: options.graceMs ?? TEST_GRACE_MS,
    reload,
    onLost: lost,
    onRestored: restored,
    onFailed: failed,
  });
  return {
    target,
    visibility,
    storage: storage ?? fakeStorage(),
    reload,
    lost,
    restored,
    failed,
    guard,
    setVisible(value: boolean): void {
      visible = value;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('constants', () => {
  it('documents the grace window and reload cap', () => {
    expect(GRACE_MS).toBe(3_000);
    expect(MAX_RELOAD_ATTEMPTS).toBe(2);
    expect(CONTEXT_RELOAD_KEY).toBe('race-it:context-reloads');
  });
});

describe('createContextLossGuard', () => {
  it('listens for both context events and visibility changes', () => {
    const harness = createHarness();
    expect(harness.target.registeredTypes().sort()).toEqual([
      'webglcontextlost',
      'webglcontextrestored',
    ]);
    expect(harness.visibility.registeredTypes()).toEqual(['visibilitychange']);
    harness.guard.dispose();
  });

  it('enters lost, notifies, and prevents the default on context loss', () => {
    const harness = createHarness();
    const event = harness.target.dispatch('webglcontextlost');
    expect(harness.guard.state).toBe('lost');
    expect(harness.lost).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores duplicate loss events without restarting the grace window', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS - 400);
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(200);
    expect(harness.failed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(harness.lost).toHaveBeenCalledTimes(1);
    expect(harness.failed).toHaveBeenCalledTimes(1);
  });

  it('restores within the grace without failing', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS - 100);
    harness.target.dispatch('webglcontextrestored');
    expect(harness.guard.state).toBe('stable');
    expect(harness.restored).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.failed).not.toHaveBeenCalled();
    expect(harness.reload).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails once, reloads once, and persists the attempt count when the grace expires', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(harness.guard.state).toBe('failed');
    expect(harness.failed).toHaveBeenCalledTimes(1);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.storage.setItem).toHaveBeenCalledWith(CONTEXT_RELOAD_KEY, '1');
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.failed).toHaveBeenCalledTimes(1);
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it('uses the default grace window when none is injected', () => {
    const harness = createHarness();
    const guard = createContextLossGuard({
      target: harness.target,
      visibilityTarget: harness.visibility,
      isVisible: () => true,
      storage: harness.storage,
      reload: vi.fn(),
    });
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(guard.state).toBe('lost');
    vi.advanceTimersByTime(1);
    expect(guard.state).toBe('failed');
    guard.dispose();
  });

  it('caps reload attempts per session across instances sharing storage', () => {
    const storage = fakeStorage();
    const first = createHarness({ storage });
    first.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(first.reload).toHaveBeenCalledTimes(1);
    expect(storage.data.get(CONTEXT_RELOAD_KEY)).toBe('1');

    const second = createHarness({ storage });
    second.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(second.reload).toHaveBeenCalledTimes(1);
    expect(storage.data.get(CONTEXT_RELOAD_KEY)).toBe('2');

    const third = createHarness({ storage });
    third.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(third.failed).toHaveBeenCalledTimes(1);
    expect(third.reload).not.toHaveBeenCalled();
    expect(storage.data.get(CONTEXT_RELOAD_KEY)).toBe('2');
  });

  it('accepts a late restore after failure and resets the attempt counter', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.target.dispatch('webglcontextrestored');
    expect(harness.restored).toHaveBeenCalledTimes(1);
    expect(harness.guard.state).toBe('stable');
    expect(harness.storage.setItem).toHaveBeenLastCalledWith(CONTEXT_RELOAD_KEY, '0');
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(harness.reload).toHaveBeenCalledTimes(2);
    expect(harness.storage.setItem).toHaveBeenLastCalledWith(CONTEXT_RELOAD_KEY, '1');
  });

  it('defers the grace for a hidden loss until the document is visible again', () => {
    const harness = createHarness({ visible: false });
    harness.target.dispatch('webglcontextlost');
    expect(harness.guard.state).toBe('lost');
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.failed).not.toHaveBeenCalled();
    harness.setVisible(true);
    harness.visibility.dispatch('visibilitychange');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.failed).toHaveBeenCalledTimes(1);
  });

  it('does not fail while the document is hidden mid-grace', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS / 2);
    harness.setVisible(false);
    harness.visibility.dispatch('visibilitychange');
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.reload).not.toHaveBeenCalled();
    harness.setVisible(true);
    harness.visibility.dispatch('visibilitychange');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it('restores while hidden without ever failing', () => {
    const harness = createHarness({ visible: false });
    harness.target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    harness.target.dispatch('webglcontextrestored');
    expect(harness.restored).toHaveBeenCalledTimes(1);
    expect(harness.guard.state).toBe('stable');
    harness.setVisible(true);
    harness.visibility.dispatch('visibilitychange');
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.failed).not.toHaveBeenCalled();
    expect(harness.reload).not.toHaveBeenCalled();
  });

  it('ignores a restore when nothing was lost', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextrestored');
    expect(harness.restored).not.toHaveBeenCalled();
    expect(harness.guard.state).toBe('stable');
  });

  it('ignores visibility changes unrelated to a loss', () => {
    const harness = createHarness();
    harness.setVisible(false);
    harness.visibility.dispatch('visibilitychange');
    harness.setVisible(true);
    harness.visibility.dispatch('visibilitychange');
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.failed).not.toHaveBeenCalled();
  });

  it('detaches listeners and clears timers on dispose', () => {
    const harness = createHarness();
    harness.target.dispatch('webglcontextlost');
    harness.guard.dispose();
    expect(harness.target.listenerCount('webglcontextlost')).toBe(0);
    expect(harness.target.listenerCount('webglcontextrestored')).toBe(0);
    expect(harness.visibility.listenerCount('visibilitychange')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TEST_GRACE_MS * 10);
    expect(harness.failed).not.toHaveBeenCalled();
    harness.guard.dispose();
  });

  it('survives storage failures', () => {
    const target = fakeTarget();
    const guard = createContextLossGuard({
      target,
      storage: throwingStorage(),
      graceMs: TEST_GRACE_MS,
      reload: vi.fn(),
    });
    target.dispatch('webglcontextlost');
    vi.advanceTimersByTime(TEST_GRACE_MS);
    expect(guard.state).toBe('failed');
  });
});