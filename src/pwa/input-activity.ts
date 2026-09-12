/**
 * Pointer activity tracking for the deferred update quiet window.
 *
 * Records the time of the last pointer activity and how many pointers are
 * currently held, using passive capture-phase listeners so tracking never
 * interferes with the UI. The update controller combines `idleMs` with its own
 * QUIET_MS threshold and `isHolding` to decide when applying an update is
 * safe. Target and clock are injectable for deterministic tests.
 */

/** Minimal event-target surface; the window satisfies it in the app. */
export interface ActivityTarget {
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void;
}

/** Options for createInputActivity. */
export interface InputActivityOptions {
  /** Event target to listen on; defaults to the window. */
  target?: ActivityTarget;
  /** Time source used to stamp activity; defaults to Date.now. */
  now?: () => number;
}

/** Pointer activity surface consumed by the update controller. */
export interface InputActivity {
  /** Milliseconds without activity at time `at`. */
  idleMs(at: number): number;
  /** True while at least one pointer is held down. */
  isHolding(): boolean;
  /** Subscribes to activity events; returns an unsubscribe function. */
  onActivity(listener: () => void): () => void;
  /** Removes window listeners and subscriptions; safe to call twice. */
  dispose(): void;
}

/**
 * Creates the pointer activity tracker: passive capture-phase window
 * listeners (pointerdown, pointerup, pointercancel) count held pointers and
 * notify subscribers on every activity event.
 */
export function createInputActivity(options: InputActivityOptions = {}): InputActivity {
  const { target = window, now = () => Date.now() } = options;

  let active = true;
  let lastActivityAt = now();
  let heldPointers = 0;
  const activityListeners = new Set<() => void>();

  function markActivity(): void {
    lastActivityAt = now();
    for (const listener of activityListeners) {
      listener();
    }
  }

  function handlePointerDown(): void {
    heldPointers += 1;
    markActivity();
  }

  function handlePointerRelease(): void {
    if (heldPointers > 0) {
      heldPointers -= 1;
    }
    markActivity();
  }

  function handleBlur(): void {
    if (heldPointers === 0) {
      return;
    }
    // A release outside the window (or a lost pointerup) would otherwise
    // strand the quiet gate with a phantom hold for the rest of the session.
    heldPointers = 0;
    markActivity();
  }

  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };

  target.addEventListener('pointerdown', handlePointerDown, listenerOptions);
  target.addEventListener('pointerup', handlePointerRelease, listenerOptions);
  target.addEventListener('pointercancel', handlePointerRelease, listenerOptions);
  target.addEventListener('blur', handleBlur, listenerOptions);

  return {
    idleMs(at: number): number {
      return at - lastActivityAt;
    },
    isHolding(): boolean {
      return heldPointers > 0;
    },
    onActivity(listener: () => void): () => void {
      activityListeners.add(listener);
      return () => {
        activityListeners.delete(listener);
      };
    },
    dispose(): void {
      if (!active) {
        return;
      }
      active = false;
      target.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      target.removeEventListener('pointerup', handlePointerRelease, { capture: true });
      target.removeEventListener('pointercancel', handlePointerRelease, { capture: true });
      target.removeEventListener('blur', handleBlur, { capture: true });
      activityListeners.clear();
    },
  };
}
