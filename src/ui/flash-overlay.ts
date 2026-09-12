/** Seconds the single soft flash pulse takes to fade out. */
export const FLASH_FADE_SECONDS = 0.25;

/** Soft warm-white pulse layer for a confirmed photo finish. */
export interface FlashOverlay {
  /** Inert full-screen layer; append above the canvas, below trophy/HUD. */
  readonly root: HTMLDivElement;
  /** Starts (or restarts) the single pulse. */
  flash(): void;
  /** Clears any in-flight pulse. */
  hide(): void;
  /** Detaches the node and its listener. */
  destroy(): void;
}

/**
 * Creates the wordless photo-finish flash: one soft warm-white pulse over the
 * scene, driven by a CSS fade (FLASH_FADE_SECONDS) so it stays out of the
 * render loop. The layer never intercepts pointer events and hides itself
 * when the fade completes.
 */
export function createFlashOverlay(): FlashOverlay {
  const root = document.createElement('div');
  root.className = 'flash-overlay hidden';
  // A full-screen layer must never swallow taps, regardless of CSS load order.
  root.style.pointerEvents = 'none';

  const clear = (): void => {
    root.classList.add('hidden');
    root.classList.remove('flashing');
  };
  root.addEventListener('animationend', clear);

  return {
    root,
    flash() {
      root.classList.remove('hidden');
      // Re-trigger the CSS animation when a pulse is already running.
      root.classList.remove('flashing');
      void root.offsetWidth;
      root.classList.add('flashing');
    },
    hide: clear,
    destroy() {
      root.removeEventListener('animationend', clear);
      root.remove();
    },
  };
}
