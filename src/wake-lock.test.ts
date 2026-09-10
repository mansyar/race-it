import { describe, expect, it, vi } from 'vitest';
import {
  createScreenWakeLock,
  type WakeLockHostLike,
  type WakeLockSentinelLike,
} from './wake-lock';

function createSentinel() {
  let released = false;
  const listeners = new Set<() => void>();
  const sentinel = {
    get released(): boolean {
      return released;
    },
    release: vi.fn(async () => {
      released = true;
    }),
    addEventListener(type: 'release', listener: () => void): void {
      if (type === 'release') {
        listeners.add(listener);
      }
    },
    removeEventListener(type: 'release', listener: () => void): void {
      if (type === 'release') {
        listeners.delete(listener);
      }
    },
    fireRelease(): void {
      released = true;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
  return sentinel;
}

type Sentinel = ReturnType<typeof createSentinel>;

function createHost() {
  const request = vi.fn<(type: 'screen') => Promise<WakeLockSentinelLike>>();
  const host: WakeLockHostLike = { wakeLock: { request } };
  return { host, request };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createScreenWakeLock', () => {
  it('requests a screen wake lock when set visible', async () => {
    const { host, request } = createHost();
    request.mockResolvedValue(createSentinel());
    const lock = createScreenWakeLock(host);

    expect(lock.active).toBe(false);
    lock.setVisible(true);
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    expect(lock.active).toBe(true);
  });

  it('stays silent when the wake lock API is unavailable', () => {
    const lock = createScreenWakeLock({});

    expect(() => lock.setVisible(true)).not.toThrow();
    expect(() => lock.setVisible(false)).not.toThrow();
    expect(lock.active).toBe(false);
  });

  it('defaults to the global navigator when no host is given', () => {
    const lock = createScreenWakeLock();

    expect(() => lock.setVisible(true)).not.toThrow();
    expect(() => lock.setVisible(false)).not.toThrow();
    expect(lock.active).toBe(false);
  });

  it('releases the lock when hidden', async () => {
    const { host, request } = createHost();
    const sentinel = createSentinel();
    request.mockResolvedValue(sentinel);
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    await flush();
    expect(lock.active).toBe(true);

    lock.setVisible(false);
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(lock.active).toBe(false);
  });

  it('re-acquires after being hidden and shown again', async () => {
    const { host, request } = createHost();
    request.mockResolvedValueOnce(createSentinel()).mockResolvedValueOnce(createSentinel());
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    await flush();
    lock.setVisible(false);
    lock.setVisible(true);
    await flush();

    expect(request).toHaveBeenCalledTimes(2);
    expect(lock.active).toBe(true);
  });

  it('does not issue duplicate requests while visible', async () => {
    const { host, request } = createHost();
    request.mockResolvedValue(createSentinel());
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    lock.setVisible(true);
    await flush();
    lock.setVisible(true);
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('re-acquires once after a system release while still visible', async () => {
    const { host, request } = createHost();
    const first = createSentinel();
    const second = createSentinel();
    const third = createSentinel();
    request
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(third);
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    await flush();

    first.fireRelease();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(lock.active).toBe(true);

    second.fireRelease();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(lock.active).toBe(false);

    lock.setVisible(false);
    lock.setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(3);
    expect(lock.active).toBe(true);
  });

  it('swallows request failures and retries on the next visibility flip', async () => {
    const { host, request } = createHost();
    request
      .mockRejectedValueOnce(new Error('blocked by low power mode'))
      .mockResolvedValueOnce(createSentinel());
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    await flush();
    expect(lock.active).toBe(false);

    lock.setVisible(false);
    lock.setVisible(true);
    await flush();

    expect(request).toHaveBeenCalledTimes(2);
    expect(lock.active).toBe(true);
  });

  it('releases a lock that resolves after the page was hidden', async () => {
    const { host, request } = createHost();
    const sentinel = createSentinel();
    let resolveRequest!: (value: Sentinel) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    lock.setVisible(false);
    resolveRequest(sentinel);
    await flush();

    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(lock.active).toBe(false);
  });

  it('dispose releases the lock and blocks future requests', async () => {
    const { host, request } = createHost();
    const sentinel = createSentinel();
    request.mockResolvedValue(sentinel);
    const lock = createScreenWakeLock(host);

    lock.setVisible(true);
    await flush();
    lock.dispose();

    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(lock.active).toBe(false);

    lock.setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
