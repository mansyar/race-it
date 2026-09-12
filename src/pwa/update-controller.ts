/**
 * Deferred PWA update controller.
 *
 * A discovered service-worker update installs but stays waiting. This
 * controller is the only code allowed to apply it (the adapter sends
 * SKIP_WAITING), and only at a calm Build-mode moment: the document is
 * visible, the current screen is Build mode, and no pointer input occurred for
 * at least QUIET_MS. Discovery runs at launch, on foreground, on reconnect,
 * and periodically while visible and online. Timing is fully injectable so
 * tests never wait on real clocks.
 */

/** Update lifecycle status, observable for debug hooks and tests. */
export type UpdateStatus = 'idle' | 'checking' | 'ready' | 'applying' | 'unsupported';

/** Quiet window (ms) without pointer input required before an update may apply. */
export const QUIET_MS = 3_000;

/** Delay (ms) between background update checks while visible and online. */
export const CHECK_INTERVAL_MS = 15 * 60_000;

/** Timer/clock surface; injectable so tests control time. */
export interface UpdateClock {
  now(): number;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

/** Pointer activity surface the quiet-window gate depends on. */
export interface UpdateInput {
  /** Milliseconds since the last pointer activity at time `now`. */
  idleMs(now: number): number;
  /** True while a pointer is currently held down. */
  isHolding(): boolean;
  /** Subscribes to pointer activity; returns an unsubscribe function. */
  onActivity(listener: () => void): () => void;
}

/** Options for createUpdateController. */
export interface UpdateControllerOptions {
  /** Asks the service worker registration to check for a newer version. */
  update: () => Promise<void>;
  /** Applies the waiting update exactly once (adapter sends SKIP_WAITING). */
  apply: () => void;
  /** True while the browser reports connectivity. */
  isOnline: () => boolean;
  /** True while the document is visible. */
  isVisible: () => boolean;
  /** True while the current screen is Build mode. */
  isBuildScreen: () => boolean;
  /** Pointer activity source used to enforce the quiet window. */
  input: UpdateInput;
  /** Clock/timers; defaults to the real ones (tests inject a double). */
  clock?: UpdateClock;
  /** False when service workers are unavailable; the controller then no-ops. */
  supported?: boolean;
}

/** Deferred update lifecycle controller. */
export interface UpdateController {
  /** Current lifecycle status. */
  readonly status: UpdateStatus;
  /** Starts the lifecycle: an immediate check (when allowed) plus the cadence. */
  noteLaunch(): void;
  /** Re-checks on foreground and resumes the cadence. */
  noteForeground(): void;
  /** Re-checks when connectivity returns and resumes the cadence. */
  noteOnline(): void;
  /** Re-evaluates the apply gate after a screen change. */
  noteScreenChange(): void;
  /** Marks a waiting update; later calls replace earlier waiting ones. */
  notifyUpdateReady(): void;
  /** Stops timers and input subscriptions; safe to call more than once. */
  dispose(): void;
}

const defaultClock: UpdateClock = {
  now: () => Date.now(),
  setTimeout: (handler: () => void, ms: number) => window.setTimeout(handler, ms),
  clearTimeout: (handle: number) => window.clearTimeout(handle),
};

/**
 * Creates the deferred update controller: silent discovery, waiting updates,
 * and application only at a quiet Build-mode moment (FR1-FR7 of the track
 * spec). Every check is guarded by visibility and connectivity; failures are
 * silent.
 */
export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const {
    update,
    apply,
    isOnline,
    isVisible,
    isBuildScreen,
    input,
    clock = defaultClock,
    supported = true,
  } = options;

  let active = true;
  let status: UpdateStatus = supported ? 'idle' : 'unsupported';
  let ready = false;
  let applied = false;
  let checkTimer: number | null = null;
  let applyTimer: number | null = null;

  function clearCheckTimer(): void {
    if (checkTimer !== null) {
      clock.clearTimeout(checkTimer);
      checkTimer = null;
    }
  }

  function clearApplyTimer(): void {
    if (applyTimer !== null) {
      clock.clearTimeout(applyTimer);
      applyTimer = null;
    }
  }

  function runCheck(): void {
    if (!active || !supported || ready || applied || status === 'checking') {
      return;
    }
    if (!isOnline() || !isVisible()) {
      return;
    }
    status = 'checking';
    update()
      .catch(() => {
        // Failed checks stay silent: cadence and launch flow are unaffected.
      })
      .finally(() => {
        if (active && status === 'checking') {
          status = 'idle';
        }
      });
  }

  function scheduleNextCheck(): void {
    clearCheckTimer();
    if (!active || !supported || ready || applied) {
      return;
    }
    if (!isOnline() || !isVisible()) {
      return;
    }
    checkTimer = clock.setTimeout(() => {
      checkTimer = null;
      runCheck();
      scheduleNextCheck();
    }, CHECK_INTERVAL_MS);
  }

  function applyOnce(): void {
    if (!active || !supported || applied) {
      return;
    }
    applied = true;
    ready = true;
    clearCheckTimer();
    clearApplyTimer();
    status = 'applying';
    apply();
  }

  function evaluateApply(): void {
    if (!active || !supported) {
      return;
    }
    if (!ready || applied) {
      clearApplyTimer();
      return;
    }
    if (!isVisible() || !isBuildScreen() || input.isHolding()) {
      clearApplyTimer();
      return;
    }
    const idle = input.idleMs(clock.now());
    if (idle < QUIET_MS) {
      clearApplyTimer();
      applyTimer = clock.setTimeout(() => {
        applyTimer = null;
        evaluateApply();
      }, QUIET_MS - idle);
      return;
    }
    applyOnce();
  }

  function resume(): void {
    runCheck();
    scheduleNextCheck();
    evaluateApply();
  }

  const unsubscribeActivity = supported
    ? input.onActivity(() => {
        evaluateApply();
      })
    : () => {};

  return {
    get status(): UpdateStatus {
      return status;
    },
    noteLaunch(): void {
      if (!active || !supported) {
        return;
      }
      runCheck();
      scheduleNextCheck();
    },
    noteForeground(): void {
      if (!active || !supported) {
        return;
      }
      resume();
    },
    noteOnline(): void {
      if (!active || !supported) {
        return;
      }
      resume();
    },
    noteScreenChange(): void {
      if (!active || !supported) {
        return;
      }
      evaluateApply();
    },
    notifyUpdateReady(): void {
      if (!active || !supported || applied) {
        return;
      }
      ready = true;
      status = 'ready';
      clearCheckTimer();
      evaluateApply();
    },
    dispose(): void {
      if (!active) {
        return;
      }
      active = false;
      clearCheckTimer();
      clearApplyTimer();
      unsubscribeActivity();
    },
  };
}
