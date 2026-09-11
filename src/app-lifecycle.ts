/**
 * App lifecycle controller. Owns the document/window listeners that keep a
 * session alive across visibility changes and bfcache-style restores. It
 * deliberately performs no teardown: the scene survives hide/show cycles and
 * only the callbacks decide what to suspend or resume.
 */

/** Subset of the DOM event-target surface needed for listener wiring. */
export interface LifecycleTarget {
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

/** Document-like target also exposing the live visibility state. */
export interface LifecycleVisibilitySource extends LifecycleTarget {
  visibilityState?: string;
}

/** Wake lock surface the controller drives on visibility changes. */
export interface LifecycleWakeLock {
  setVisible(visible: boolean): void;
}

export interface AppLifecycleOptions {
  doc: LifecycleVisibilitySource;
  win: LifecycleTarget;
  wakeLock: LifecycleWakeLock;
  onHidden(): void;
  onVisible(): void;
  onHide(): void;
  onRestore(): void;
}

export interface AppLifecycle {
  dispose(): void;
}

/** Minimal shape of `PageTransitionEvent` used for bfcache detection. */
interface PageTransitionLike {
  persisted?: boolean;
}

export function createAppLifecycle(options: AppLifecycleOptions): AppLifecycle {
  const { doc, win, wakeLock, onHidden, onVisible, onHide, onRestore } = options;

  const handleVisibility = (): void => {
    if (doc.visibilityState === 'hidden') {
      wakeLock.setVisible(false);
      onHidden();
    } else if (doc.visibilityState === 'visible') {
      wakeLock.setVisible(true);
      onVisible();
    }
  };

  const handlePageHide = (): void => {
    onHide();
  };

  const handlePageShow = (event: Event): void => {
    if ((event as PageTransitionLike).persisted === true) {
      onRestore();
    }
  };

  doc.addEventListener('visibilitychange', handleVisibility);
  win.addEventListener('pagehide', handlePageHide);
  win.addEventListener('pageshow', handlePageShow);

  let disposed = false;
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('visibilitychange', handleVisibility);
      win.removeEventListener('pagehide', handlePageHide);
      win.removeEventListener('pageshow', handlePageShow);
    },
  };
}
