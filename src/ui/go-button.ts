/**
 * Creates the giant GO button shown above the build bar.
 * Starts invalid; pulses once the placed track forms a valid closed circuit.
 * The button stays tappable while invalid so blocked taps can still give
 * feedback (an `onBlockedTap` "nope" sound) instead of dead-silencing.
 */
export interface GoButtonCallbacks {
  /** Called when the child taps GO while the track is valid. */
  onGo: () => void;
  /** Called when the child taps GO while the track is invalid. */
  onBlockedTap?: () => void;
}

export interface GoButton {
  /** Root element to mount in the page. */
  root: HTMLDivElement;
  /** Callbacks for assertions in tests. */
  callbacks: GoButtonCallbacks;
  /** Enables/disables the button and toggles the pulsing state. */
  setValid: (valid: boolean) => void;
}

/**
 * Builds the GO button with wordless icon-free styling (big red pill).
 * @param callbacks - Tap handlers; `onGo` fires only while valid.
 * @returns Handle with the root element and a validity setter.
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
    if (valid) {
      callbacks.onGo();
    } else {
      callbacks.onBlockedTap?.();
    }
  });

  root.appendChild(button);

  let valid = false;

  return {
    root,
    callbacks,
    setValid(next: boolean): void {
      valid = next;
      button.setAttribute('aria-disabled', String(!next));
      button.classList.toggle('pulsing', next);
    },
  };
}
