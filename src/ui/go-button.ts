/**
 * Creates the giant GO button shown above the build bar.
 * Starts disabled; pulses once the placed track forms a valid closed circuit.
 */
export interface GoButtonCallbacks {
  /** Called when the child taps GO while the track is valid. */
  onGo: () => void;
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
 * @param callbacks - Tap handler invoked only while valid.
 * @returns Handle with the root element and a validity setter.
 */
export function createGoButton(callbacks: GoButtonCallbacks): GoButton {
  const root = document.createElement('div');
  root.className = 'go-button';

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = 'go';
  button.textContent = 'GO!';
  button.disabled = true;
  button.setAttribute('aria-label', 'Start the race');
  button.addEventListener('click', () => {
    if (!button.disabled) {
      callbacks.onGo();
    }
  });

  root.appendChild(button);

  return {
    root,
    callbacks,
    setValid(valid: boolean): void {
      button.disabled = !valid;
      button.classList.toggle('pulsing', valid);
    },
  };
}
