/**
 * Gesture guards for the game surface.
 *
 * Suppresses browser gestures that toddlers trigger by accident — long-press
 * context menus, double-tap zoom, native drag ghosts, and Safari pinch
 * gestures — without touching normal pointer interaction.
 */

/** Events suppressed on the guarded surface. */
const GUARDED_EVENTS = [
  'contextmenu',
  'dblclick',
  'dragstart',
  'gesturestart',
  'gesturechange',
] as const;

/** Minimal structural view of an event target, for test doubles. */
export interface GuardTarget {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

/** Installed gesture guards. */
export interface GestureGuards {
  /** Removes every guard; safe to call more than once. */
  dispose(): void;
}

/**
 * Installs gesture guards on the given target (the app root in production)
 * and returns a handle that removes them.
 */
export function installGestureGuards(target: GuardTarget): GestureGuards {
  const prevent = (event: Event): void => {
    event.preventDefault();
  };
  const options: AddEventListenerOptions = { passive: false };
  for (const type of GUARDED_EVENTS) {
    target.addEventListener(type, prevent, options);
  }

  let disposed = false;
  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const type of GUARDED_EVENTS) {
        target.removeEventListener(type, prevent, options);
      }
    },
  };
}
