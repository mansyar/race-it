/**
 * Creates the giant GO button shown above the build bar.
 * Starts asleep until the boot readiness gate opens; pulses once the placed
 * track forms a valid closed circuit. The button stays tappable while asleep
 * or invalid so taps can still give feedback (or ask to retry a stalled load)
 * instead of dead-silencing.
 */
export interface GoButtonCallbacks {
  /** Called when the child taps GO while ready and the track is valid. */
  onGo: () => void;
  /** Called when the child taps GO while blocked (not ready yet, or invalid track). */
  onBlockedTap?: () => void;
  /** Called when the child taps GO while a stalled boot is offering a retry. */
  onRetry?: () => void;
}

export interface GoButton {
  /** Root element to mount in the page. */
  root: HTMLDivElement;
  /** Callbacks for assertions in tests. */
  callbacks: GoButtonCallbacks;
  /** Marks the boot gate: GO only wakes for valid tracks once ready. */
  setReady: (ready: boolean) => void;
  /** Enables/disables the button and toggles the pulsing state. */
  setValid: (valid: boolean) => void;
  /** Shows the retry cue; taps re-attempt loading while not ready. */
  setRetrying: (retrying: boolean) => void;
}

/**
 * Builds the GO button with wordless icon-free styling (big red pill).
 * @param callbacks - Tap handlers; `onGo` fires only while ready and valid.
 * @returns Handle with the root element and state setters.
 */
export function createGoButton(callbacks: GoButtonCallbacks): GoButton {
  const root = document.createElement('div');
  root.className = 'go-button';

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = 'go';
  button.textContent = 'GO!';
  button.setAttribute('aria-label', 'Start the race');
  button.setAttribute('aria-disabled', 'true');
  button.addEventListener('click', () => {
    if (!ready) {
      if (retrying) {
        callbacks.onRetry?.();
      } else {
        callbacks.onBlockedTap?.();
      }
    } else if (valid) {
      callbacks.onGo();
    } else {
      callbacks.onBlockedTap?.();
    }
  });

  root.appendChild(button);

  let valid = false;
  let ready = false;
  let retrying = false;

  function render(): void {
    const armed = ready && valid;
    button.setAttribute('aria-disabled', String(!armed));
    button.classList.toggle('pulsing', armed);
    if (ready) {
      button.dataset.boot = 'ready';
    } else {
      button.dataset.boot = retrying ? 'retry' : 'sleeping';
    }
  }

  render();

  return {
    root,
    callbacks,
    setReady(next: boolean): void {
      ready = next;
      render();
    },
    setValid(next: boolean): void {
      valid = next;
      render();
    },
    setRetrying(next: boolean): void {
      retrying = next;
      render();
    },
  };
}
