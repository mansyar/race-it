import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  createUpdateController,
  QUIET_MS,
  type UpdateInput,
} from './update-controller';

/** Minimal controllable timer/clock double: advance() runs due timers in time order. */
function createFakeClock() {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; handler: () => void }>();
  return {
    now: () => now,
    setTimeout(handler: () => void, ms: number): number {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: now + ms, handler });
      return handle;
    },
    clearTimeout(handle: number): void {
      timers.delete(handle);
    },
    advance(ms: number): void {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) {
          break;
        }
        const [handle, timer] = due;
        timers.delete(handle);
        now = timer.at;
        timer.handler();
      }
      now = target;
    },
    pendingTimers: () => timers.size,
  };
}

function createHarness(options: { supported?: boolean } = {}) {
  let online = true;
  let visible = true;
  let build = true;
  let holding = false;
  let lastActivityAt = 0;
  const clock = createFakeClock();
  const update = vi.fn(() => Promise.resolve());
  const apply = vi.fn();
  const listeners = new Set<() => void>();
  const input: UpdateInput = {
    idleMs: (now: number) => now - lastActivityAt,
    isHolding: () => holding,
    onActivity: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const controller = createUpdateController({
    update,
    apply,
    isOnline: () => online,
    isVisible: () => visible,
    isBuildScreen: () => build,
    input,
    clock,
    supported: options.supported,
  });
  const activity = (): void => {
    lastActivityAt = clock.now();
    for (const listener of [...listeners]) {
      listener();
    }
  };
  return {
    controller,
    update,
    apply,
    clock,
    activity,
    press: (): void => {
      holding = true;
      activity();
    },
    release: (): void => {
      holding = false;
      activity();
    },
    setOnline: (value: boolean): void => {
      online = value;
    },
    setVisible: (value: boolean): void => {
      visible = value;
    },
    setBuild: (value: boolean): void => {
      build = value;
    },
    listenerCount: () => listeners.size,
  };
}

/** Lets pending promise callbacks settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe('createUpdateController — discovery', () => {
  it('starts idle and checks once at launch', async () => {
    const h = createHarness();
    expect(h.controller.status).toBe('idle');
    h.controller.noteLaunch();
    expect(h.update).toHaveBeenCalledTimes(1);
    await settle();
    expect(h.controller.status).toBe('idle');
  });

  it('reports checking while the check is in flight', async () => {
    let resolveUpdate: () => void = () => {};
    const h = createHarness();
    h.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = () => resolve();
        }),
    );
    h.controller.noteLaunch();
    expect(h.controller.status).toBe('checking');
    resolveUpdate();
    await settle();
    expect(h.controller.status).toBe('idle');
  });

  it('skips the launch check silently while offline and checks on reconnect', async () => {
    const h = createHarness();
    h.setOnline(false);
    h.controller.noteLaunch();
    expect(h.update).not.toHaveBeenCalled();
    h.setOnline(true);
    h.controller.noteOnline();
    expect(h.update).toHaveBeenCalledTimes(1);
    await settle();
  });

  it('skips checks while hidden and checks again on foreground', async () => {
    const h = createHarness();
    h.setVisible(false);
    h.controller.noteLaunch();
    expect(h.update).not.toHaveBeenCalled();
    h.setVisible(true);
    h.controller.noteForeground();
    expect(h.update).toHaveBeenCalledTimes(1);
    await settle();
  });

  it('runs the periodic check while visible and online', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.clock.advance(CHECK_INTERVAL_MS - 1);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.clock.advance(1);
    expect(h.update).toHaveBeenCalledTimes(2);
    await settle();
    h.clock.advance(CHECK_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(3);
    await settle();
  });

  it('stops the cadence while hidden and resumes on foreground', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.setVisible(false);
    h.clock.advance(CHECK_INTERVAL_MS * 2);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.setVisible(true);
    h.controller.noteForeground();
    expect(h.update).toHaveBeenCalledTimes(2);
    await settle();
    h.clock.advance(CHECK_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(3);
    await settle();
  });

  it('stops the cadence while offline and resumes when connectivity returns', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.setOnline(false);
    h.clock.advance(CHECK_INTERVAL_MS * 2);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.setOnline(true);
    h.controller.noteOnline();
    expect(h.update).toHaveBeenCalledTimes(2);
    await settle();
    h.clock.advance(CHECK_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(3);
    await settle();
  });

  it('does not overlap checks while one is in flight', async () => {
    let resolveUpdate: () => void = () => {};
    const h = createHarness();
    h.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = () => resolve();
        }),
    );
    h.controller.noteLaunch();
    h.controller.noteForeground();
    h.controller.noteOnline();
    expect(h.update).toHaveBeenCalledTimes(1);
    resolveUpdate();
    await settle();
    h.controller.noteForeground();
    expect(h.update).toHaveBeenCalledTimes(2);
    await settle();
  });

  it('survives a failed check silently and keeps the cadence', async () => {
    const h = createHarness();
    h.update.mockImplementationOnce(() => Promise.reject(new Error('network down')));
    h.controller.noteLaunch();
    await settle();
    expect(h.controller.status).toBe('idle');
    h.clock.advance(CHECK_INTERVAL_MS);
    expect(h.update).toHaveBeenCalledTimes(2);
    await settle();
  });

  it('stops checking once an update is waiting', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.setBuild(false);
    h.controller.notifyUpdateReady();
    expect(h.controller.status).toBe('ready');
    h.clock.advance(CHECK_INTERVAL_MS * 2);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.apply).not.toHaveBeenCalled();
  });
});

describe('createUpdateController — safe-moment gate', () => {
  it('applies immediately when ready on a quiet Build screen', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.clock.advance(QUIET_MS);
    h.controller.notifyUpdateReady();
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.controller.status).toBe('applying');
  });

  it('waits out the quiet window before applying', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.controller.notifyUpdateReady();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.controller.status).toBe('ready');
    h.clock.advance(QUIET_MS - 1);
    expect(h.apply).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.controller.status).toBe('applying');
  });

  it('restarts the quiet window when input arrives', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.controller.notifyUpdateReady();
    h.clock.advance(2000);
    h.activity();
    h.clock.advance(QUIET_MS - 1);
    expect(h.apply).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it('blocks application while a pointer is held and resumes after release', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.controller.notifyUpdateReady();
    h.clock.advance(1000);
    h.press();
    h.clock.advance(10_000);
    expect(h.apply).not.toHaveBeenCalled();
    h.release();
    h.clock.advance(QUIET_MS - 1);
    expect(h.apply).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it('does not apply outside Build mode', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.clock.advance(10_000);
    h.setBuild(false);
    h.controller.notifyUpdateReady();
    h.clock.advance(60_000);
    expect(h.apply).not.toHaveBeenCalled();
    h.setBuild(true);
    h.controller.noteScreenChange();
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.controller.status).toBe('applying');
  });

  it('cancels the pending quiet window when leaving Build mode', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.controller.notifyUpdateReady();
    h.clock.advance(2000);
    h.setBuild(false);
    h.controller.noteScreenChange();
    h.clock.advance(10_000);
    expect(h.apply).not.toHaveBeenCalled();
    h.setBuild(true);
    h.controller.noteScreenChange();
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it('does not apply while hidden and resumes on foreground', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.clock.advance(QUIET_MS);
    h.setVisible(false);
    h.controller.notifyUpdateReady();
    h.clock.advance(10_000);
    expect(h.apply).not.toHaveBeenCalled();
    h.setVisible(true);
    h.controller.noteForeground();
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it('applies only once even when more events arrive', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.clock.advance(QUIET_MS);
    h.controller.notifyUpdateReady();
    expect(h.apply).toHaveBeenCalledTimes(1);
    h.activity();
    h.controller.noteForeground();
    h.controller.notifyUpdateReady();
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.controller.status).toBe('applying');
  });

  it('tracks a newer waiting update without double-applying', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.controller.notifyUpdateReady();
    h.clock.advance(1000);
    h.controller.notifyUpdateReady();
    h.clock.advance(QUIET_MS - 1000);
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it('keeps the ready status when a check was in flight', async () => {
    let resolveUpdate: () => void = () => {};
    const h = createHarness();
    h.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = () => resolve();
        }),
    );
    h.controller.noteLaunch();
    h.controller.notifyUpdateReady();
    resolveUpdate();
    await settle();
    expect(h.controller.status).toBe('ready');
    h.clock.advance(QUIET_MS);
    expect(h.apply).toHaveBeenCalledTimes(1);
  });
});

describe('createUpdateController — no-op and teardown', () => {
  it('no-ops when service workers are not supported', () => {
    const h = createHarness({ supported: false });
    expect(h.controller.status).toBe('unsupported');
    h.controller.noteLaunch();
    h.controller.noteForeground();
    h.controller.noteOnline();
    h.controller.notifyUpdateReady();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.clock.pendingTimers()).toBe(0);
  });

  it('dispose clears timers and unsubscribes, safely', async () => {
    const h = createHarness();
    h.controller.noteLaunch();
    await settle();
    h.controller.notifyUpdateReady();
    h.controller.dispose();
    h.controller.dispose();
    expect(h.listenerCount()).toBe(0);
    h.clock.advance(CHECK_INTERVAL_MS * 2);
    h.activity();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.clock.pendingTimers()).toBe(0);
  });
});
