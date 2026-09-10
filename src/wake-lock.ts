/**
 * Screen Wake Lock controller.
 *
 * Keeps the display awake while the game is visible, releases the lock when
 * the page is hidden, and re-acquires it when the page returns. Every failure
 * is silent: browsers reject wake lock requests in Low Power Mode, under
 * battery-saving policies, or where the API is unavailable.
 */

/** Minimal structural view of a wake lock sentinel, for test doubles. */
export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

/** Minimal structural view of the wake lock host, for test doubles. */
export interface WakeLockHostLike {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

/** Visible-session wake lock handle. */
export interface ScreenWakeLock {
  /** Whether a sentinel is currently held. */
  readonly active: boolean;
  /** Tracks page visibility: acquires while visible, releases while hidden. */
  setVisible(visible: boolean): void;
  /** Releases any held lock and permanently stops future requests. */
  dispose(): void;
}

interface HeldLock {
  sentinel: WakeLockSentinelLike;
  onRelease: () => void;
}

/**
 * Creates a wake lock controller for the given host (defaults to the global
 * `navigator`). The controller starts hidden; call `setVisible(true)` once the
 * game has booted.
 */
export function createScreenWakeLock(host?: WakeLockHostLike): ScreenWakeLock {
  const source: WakeLockHostLike = host ?? (typeof navigator === 'undefined' ? {} : navigator);
  const api = source.wakeLock;

  let visible = false;
  let disposed = false;
  let requestInFlight = false;
  let reacquiredThisVisibility = false;
  let held: HeldLock | null = null;

  function releaseCurrent(): void {
    const current = held;
    held = null;
    if (!current) {
      return;
    }
    current.sentinel.removeEventListener('release', current.onRelease);
    current.sentinel.release().catch(() => undefined);
  }

  function attach(next: WakeLockSentinelLike): void {
    const handleRelease = (): void => {
      if (held?.sentinel !== next) {
        return;
      }
      next.removeEventListener('release', handleRelease);
      held = null;
      if (!disposed && visible && !reacquiredThisVisibility) {
        reacquiredThisVisibility = true;
        acquire();
      }
    };
    held = { sentinel: next, onRelease: handleRelease };
    next.addEventListener('release', handleRelease);
  }

  async function acquire(): Promise<void> {
    if (disposed || !visible || requestInFlight || held || !api) {
      return;
    }
    requestInFlight = true;
    try {
      const next = await api.request('screen');
      if (disposed || !visible) {
        next.release().catch(() => undefined);
        return;
      }
      attach(next);
    } catch {
      // Silent: unsupported in this context (e.g. Low Power Mode). Retried on
      // the next visibility flip.
    } finally {
      requestInFlight = false;
    }
  }

  return {
    get active(): boolean {
      return held !== null;
    },
    setVisible(nextVisible: boolean): void {
      if (disposed) {
        return;
      }
      visible = nextVisible;
      if (!nextVisible) {
        releaseCurrent();
        return;
      }
      reacquiredThisVisibility = false;
      acquire();
    },
    dispose(): void {
      disposed = true;
      releaseCurrent();
    },
  };
}
