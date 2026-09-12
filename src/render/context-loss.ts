/**
 * WebGL context-loss guard. Sits above three.js (which already preventDefaults
 * `webglcontextlost` and re-initializes GL on `webglcontextrestored`) and adds
 * the app-level signal: hold callbacks on loss, restore callbacks on recovery,
 * and a single silent reload fallback when the browser never restores — with a
 * per-session attempt cap so a failing device can never fall into a reload loop.
 */

/** Observable guard state: stable → lost → restoring → stable, or failed. */
export type ContextLossState = 'stable' | 'lost' | 'restoring' | 'failed';

/** Minimal storage surface; sessionStorage satisfies it in the browser. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Minimal event-target surface; a canvas or `document` satisfies it. */
export interface EventTargetLike {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/** Grace window (ms) before the silent reload fallback fires. */
export const GRACE_MS = 3_000;

/** Maximum silent reload attempts per session (reset once a loss restores). */
export const MAX_RELOAD_ATTEMPTS = 2;

/** sessionStorage key for the reload-attempt counter. */
export const CONTEXT_RELOAD_KEY = 'race-it:context-reloads';

/** Options for createContextLossGuard. */
export interface ContextLossOptions {
  /** Element that fires `webglcontextlost` / `webglcontextrestored` (the renderer canvas). */
  target: EventTargetLike;
  /** Element that fires `visibilitychange` (normally `document`). Omit to ignore visibility. */
  visibilityTarget?: EventTargetLike | null;
  /** Reports whether the document is visible. Defaults to always visible. */
  isVisible?: () => boolean;
  /** Storage for the reload-attempt counter. Defaults to none (memory only). */
  storage?: StorageLike | null;
  /** Grace window before the reload fallback. Defaults to GRACE_MS. */
  graceMs?: number;
  /** Performs the silent reload fallback. Defaults to `location.reload()`. */
  reload?: () => void;
  /** Called once when the context is lost. */
  onLost?: () => void;
  /** Called when the context is restored (within the grace or later). */
  onRestored?: () => void;
  /** Called once when the grace expires without a restore. */
  onFailed?: () => void;
}

/** Live context-loss guard. */
export interface ContextLossGuard {
  /** Current state. */
  readonly state: ContextLossState;
  /** Detaches listeners and cancels any pending grace timer. Idempotent. */
  dispose(): void;
}

/**
 * Creates the context-loss guard. All timing is injectable; the guard never
 * throws, and a loss that happens while the document is hidden defers both the
 * grace window and any failure until the document is visible again.
 */
export function createContextLossGuard(options: ContextLossOptions): ContextLossGuard {
  const {
    target,
    visibilityTarget = null,
    isVisible = () => true,
    storage = null,
    graceMs = GRACE_MS,
    reload = () => {
      window.location.reload();
    },
    onLost,
    onRestored,
    onFailed,
  } = options;

  let state: ContextLossState = 'stable';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let memoryAttempts = 0;
  let disposed = false;

  function readAttempts(): number {
    if (storage === null) {
      return memoryAttempts;
    }
    try {
      const raw = storage.getItem(CONTEXT_RELOAD_KEY);
      const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
      memoryAttempts = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      // Keep the in-memory counter when storage is unavailable.
    }
    return memoryAttempts;
  }

  function writeAttempts(value: number): void {
    memoryAttempts = value;
    try {
      storage?.setItem(CONTEXT_RELOAD_KEY, String(value));
    } catch {
      // The cap still holds in memory when persistence is unavailable.
    }
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function maybeReload(): void {
    const attempts = readAttempts();
    if (attempts >= MAX_RELOAD_ATTEMPTS) {
      return;
    }
    writeAttempts(attempts + 1);
    reload();
  }

  function onGraceExpired(): void {
    timer = null;
    if (state !== 'lost') {
      return;
    }
    state = 'failed';
    onFailed?.();
    maybeReload();
  }

  function startGraceIfPossible(): void {
    if (state !== 'lost' || timer !== null || !isVisible()) {
      return;
    }
    timer = setTimeout(onGraceExpired, graceMs);
  }

  function handleLost(event: Event): void {
    try {
      event.preventDefault();
    } catch {
      // Defensive only; three.js already preventDefaults its own loss event.
    }
    if (state !== 'stable') {
      return;
    }
    state = 'lost';
    onLost?.();
    startGraceIfPossible();
  }

  function handleRestored(): void {
    if (state !== 'lost' && state !== 'failed') {
      return;
    }
    clearTimer();
    state = 'restoring';
    onRestored?.();
    state = 'stable';
    if (readAttempts() !== 0) {
      writeAttempts(0);
    }
  }

  function handleVisibilityChange(): void {
    if (isVisible()) {
      startGraceIfPossible();
    } else {
      clearTimer();
    }
  }

  target.addEventListener('webglcontextlost', handleLost);
  target.addEventListener('webglcontextrestored', handleRestored);
  visibilityTarget?.addEventListener('visibilitychange', handleVisibilityChange);

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    clearTimer();
    target.removeEventListener('webglcontextlost', handleLost);
    target.removeEventListener('webglcontextrestored', handleRestored);
    visibilityTarget?.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  return {
    get state(): ContextLossState {
      return state;
    },
    dispose,
  };
}
