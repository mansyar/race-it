import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AssetGroupDefinition,
  type AssetReadinessSnapshot,
  createAssetReadiness,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  STALL_AFTER_MS,
  STALL_ATTEMPTS,
} from './asset-readiness';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolveFn: (value: T) => void = () => {};
  let rejectFn: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

function attemptAt<T>(attempts: Deferred<T>[], index: number): Deferred<T> {
  const attempt = attempts[index];
  if (attempt === undefined) {
    throw new Error(`missing attempt at index ${index}`);
  }
  return attempt;
}

function group(
  name: string,
  load: () => Promise<unknown>,
  critical = false,
): AssetGroupDefinition {
  return { name, critical, load };
}

function stateOf(snapshot: AssetReadinessSnapshot, name: string) {
  const state = snapshot.groups[name];
  if (state === undefined) {
    throw new Error(`missing group state: ${name}`);
  }
  return state;
}

/** Lets pending promise callbacks run under fake timers. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createAssetReadiness', () => {
  it('is idle before start and reports loading once started', async () => {
    const pieces = deferred<void>();
    const load = vi.fn(() => pieces.promise);
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    const before = readiness.snapshot();
    expect(stateOf(before, 'pieces').status).toBe('idle');
    expect(before.raceReady).toBe(false);
    expect(before.cue).toBe(false);

    readiness.start();
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('loading');
    expect(load).toHaveBeenCalledTimes(1);

    pieces.resolve();
    await flush();
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('ready');
    expect(readiness.snapshot().raceReady).toBe(true);
  });

  it('starts every group independently', async () => {
    const pieces = deferred<void>();
    const scenery = deferred<void>();
    const piecesLoad = vi.fn(() => pieces.promise);
    const sceneryLoad = vi.fn(() => scenery.promise);
    const readiness = createAssetReadiness({
      groups: [group('pieces', piecesLoad, true), group('scenery', sceneryLoad)],
    });

    readiness.start();
    expect(piecesLoad).toHaveBeenCalledTimes(1);
    expect(sceneryLoad).toHaveBeenCalledTimes(1);

    scenery.resolve();
    await flush();
    expect(stateOf(readiness.snapshot(), 'scenery').status).toBe('ready');
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('loading');
  });

  it('keeps a failing critical group from blocking other groups', async () => {
    const piecesLoad = vi.fn(() => Promise.reject(new Error('offline')));
    const scenery = deferred<void>();
    const sceneryLoad = vi.fn(() => scenery.promise);
    const readiness = createAssetReadiness({
      groups: [group('pieces', piecesLoad, true), group('scenery', sceneryLoad)],
    });

    readiness.start();
    await flush();
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('failed');

    scenery.resolve();
    await flush();
    expect(stateOf(readiness.snapshot(), 'scenery').status).toBe('ready');
    expect(readiness.snapshot().raceReady).toBe(false);

    // The failed group keeps retrying on its own; scenery is untouched.
    await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS);
    await flush();
    expect(piecesLoad).toHaveBeenCalledTimes(2);
    expect(sceneryLoad).toHaveBeenCalledTimes(1);
  });

  it('requires pieces and karts for race readiness, ignoring scenery', async () => {
    const pieces = deferred<void>();
    const karts = deferred<void>();
    const scenery = deferred<void>();
    const readiness = createAssetReadiness({
      groups: [
        group('pieces', () => pieces.promise, true),
        group('karts', () => karts.promise, true),
        group('scenery', () => scenery.promise),
      ],
    });

    readiness.start();
    pieces.resolve();
    await flush();
    expect(readiness.snapshot().raceReady).toBe(false);

    karts.resolve();
    await flush();
    expect(readiness.snapshot().raceReady).toBe(true);

    scenery.resolve();
    await flush();
    expect(readiness.snapshot().raceReady).toBe(true);
  });

  it('backs off exponentially up to a cap and keeps retrying', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    readiness.start();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);

    const delays = [
      RETRY_BASE_DELAY_MS,
      RETRY_BASE_DELAY_MS * 2,
      RETRY_BASE_DELAY_MS * 4,
      RETRY_BASE_DELAY_MS * 8,
      RETRY_BASE_DELAY_MS * 16,
      RETRY_MAX_DELAY_MS,
      RETRY_MAX_DELAY_MS,
    ];
    for (const [index, delay] of delays.entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(load).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(load).toHaveBeenCalledTimes(index + 2);
    }
  });

  it('flags the retry cue after consecutive failures on a critical group', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    readiness.start();
    await flush();
    let snapshot = readiness.snapshot();
    expect(stateOf(snapshot, 'pieces').attempts).toBe(1);
    expect(stateOf(snapshot, 'pieces').stalled).toBe(false);
    expect(snapshot.cue).toBe(false);

    for (let attempt = 2; attempt <= STALL_ATTEMPTS; attempt += 1) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 2);
      await vi.advanceTimersByTimeAsync(delay);
      await flush();
      snapshot = readiness.snapshot();
      expect(stateOf(snapshot, 'pieces').attempts).toBe(attempt);
      expect(stateOf(snapshot, 'pieces').stalled).toBe(attempt >= STALL_ATTEMPTS);
    }
    expect(snapshot.cue).toBe(true);
  });

  it('flags the cue after a long stall even below the failure count', async () => {
    const attempts: Deferred<void>[] = [];
    const load = vi.fn(() => {
      const attempt = deferred<void>();
      attempts.push(attempt);
      return attempt.promise;
    });
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    readiness.start();
    await vi.advanceTimersByTimeAsync(STALL_AFTER_MS);
    attemptAt(attempts, 0).reject(new Error('timeout'));
    await flush();
    expect(stateOf(readiness.snapshot(), 'pieces').attempts).toBe(1);
    expect(readiness.snapshot().cue).toBe(false);

    await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS);
    await vi.advanceTimersByTimeAsync(STALL_AFTER_MS);
    attemptAt(attempts, 1).reject(new Error('timeout'));
    await flush();
    const snapshot = readiness.snapshot();
    expect(stateOf(snapshot, 'pieces').attempts).toBe(2);
    expect(stateOf(snapshot, 'pieces').attempts).toBeLessThan(STALL_ATTEMPTS);
    expect(stateOf(snapshot, 'pieces').stalled).toBe(true);
    expect(snapshot.cue).toBe(true);
  });

  it('never raises the cue for a stalled decorative group', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    const pieces = deferred<void>();
    const readiness = createAssetReadiness({
      groups: [group('scenery', load), group('pieces', () => pieces.promise, true)],
    });

    readiness.start();
    await flush();
    await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS + RETRY_BASE_DELAY_MS * 2);
    await flush();
    const snapshot = readiness.snapshot();
    expect(stateOf(snapshot, 'scenery').attempts).toBe(STALL_ATTEMPTS);
    expect(stateOf(snapshot, 'scenery').stalled).toBe(true);
    expect(snapshot.cue).toBe(false);
  });

  it('forces an immediate retry of failed groups and coalesces duplicates', async () => {
    const attempts: Deferred<void>[] = [];
    const load = vi.fn(() => {
      const attempt = deferred<void>();
      attempts.push(attempt);
      return attempt.promise;
    });
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    readiness.start();
    attemptAt(attempts, 0).reject(new Error('offline'));
    await flush();
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('failed');
    expect(load).toHaveBeenCalledTimes(1);

    readiness.retryFailed();
    expect(load).toHaveBeenCalledTimes(2);
    readiness.retryFailed();
    expect(load).toHaveBeenCalledTimes(2);

    attemptAt(attempts, 1).resolve();
    await flush();
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('ready');
    expect(readiness.snapshot().raceReady).toBe(true);

    readiness.retryFailed();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('clears the stall and attempts once a retry succeeds', async () => {
    let attempt = 0;
    const load = vi.fn(() => {
      attempt += 1;
      return attempt <= STALL_ATTEMPTS
        ? Promise.reject(new Error('offline'))
        : Promise.resolve();
    });
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    readiness.start();
    await flush();
    await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS + RETRY_BASE_DELAY_MS * 2);
    await flush();
    let snapshot = readiness.snapshot();
    expect(stateOf(snapshot, 'pieces').attempts).toBe(STALL_ATTEMPTS);
    expect(stateOf(snapshot, 'pieces').stalled).toBe(true);
    expect(snapshot.cue).toBe(true);

    await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS * 4);
    await flush();
    snapshot = readiness.snapshot();
    expect(stateOf(snapshot, 'pieces').status).toBe('ready');
    expect(stateOf(snapshot, 'pieces').attempts).toBe(0);
    expect(stateOf(snapshot, 'pieces').stalled).toBe(false);
    expect(snapshot.raceReady).toBe(true);
    expect(snapshot.cue).toBe(false);
  });

  it('makes start idempotent', async () => {
    const load = vi.fn(() => Promise.resolve());
    const readiness = createAssetReadiness({ groups: [group('pieces', load, true)] });

    readiness.start();
    readiness.start();
    expect(load).toHaveBeenCalledTimes(1);

    await flush();
    expect(stateOf(readiness.snapshot(), 'pieces').status).toBe('ready');
  });

  it('notifies subscribers on state changes', async () => {
    const pieces = deferred<void>();
    const scenery = deferred<void>();
    const onStateChange = vi.fn();
    const readiness = createAssetReadiness({
      groups: [
        group('pieces', () => pieces.promise, true),
        group('scenery', () => scenery.promise),
      ],
      onStateChange,
    });

    readiness.start();
    expect(onStateChange).toHaveBeenCalled();
    pieces.resolve();
    scenery.resolve();
    await flush();

    expect(onStateChange.mock.calls.length).toBeGreaterThanOrEqual(4);
    const lastCall = onStateChange.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ raceReady: true, cue: false });
  });
});