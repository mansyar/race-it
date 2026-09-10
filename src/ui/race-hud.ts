/** Mid-race HUD: pause button, resume/quit overlay, and a toddler-proof quit confirm. */
export interface RaceHud {
  root: HTMLDivElement;
  /** Resume/quit overlay dialog element (hidden until pause is tapped). */
  overlay: HTMLDivElement;
  /** Quit confirmation dialog element (hidden until quit is tapped). */
  confirm: HTMLDivElement;
  callbacks: { onPause: () => void; onResume: () => void; onQuit: () => void };
  /** Reveals the pause button (race is running). */
  showPause(): void;
  /** Opens the resume/quit overlay (pause tapped). */
  showOverlay(): void;
  /** Hides the whole HUD (back to build mode). */
  hide(): void;
  /** Hides everything and clears overlay/confirm state. */
  reset(): void;
}

function hiddenDiv(className: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;
  div.hidden = true;
  return div;
}

function button(
  action: string,
  label: string,
  className: string,
  html?: string,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.action = action;
  btn.className = className;
  if (html !== undefined) {
    btn.innerHTML = html;
  } else {
    btn.textContent = label;
  }
  btn.setAttribute('aria-label', label);
  return btn;
}

const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>';

/**
 * Creates the race HUD. Hidden in build mode; showPause() reveals the pause
 * button during a race. Pause opens an overlay with Resume and Quit-to-builder;
 * quit requires a confirm tap (toddler-proof, same pattern as the clear-table
 * confirm in the corner cluster).
 */
export function createRaceHud(callbacks: {
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
}): RaceHud {
  const root = document.createElement('div');
  root.className = 'race-hud hidden';

  const pause = button('pause', 'Pause', 'pause-button hidden', PAUSE_ICON);
  root.append(pause);

  const overlay = hiddenDiv('race-overlay');
  const resume = button('resume', 'Resume', 'resume-button');
  const quit = button('quit', 'Quit to builder', 'quit-button');
  overlay.append(resume, quit);
  root.append(overlay);

  const confirm = hiddenDiv('race-confirm');
  const confirmYes = button('yes', 'Quit race', 'confirm-button');
  confirmYes.dataset.confirm = 'yes';
  const confirmNo = button('no', 'Keep racing', 'confirm-button');
  confirmNo.dataset.confirm = 'no';
  confirm.append(confirmYes, confirmNo);
  overlay.append(confirm);

  pause.addEventListener('click', () => {
    pause.classList.add('hidden');
    overlay.hidden = false;
    confirm.hidden = true;
    callbacks.onPause();
  });
  resume.addEventListener('click', () => {
    overlay.hidden = true;
    pause.classList.remove('hidden');
    callbacks.onResume();
  });
  quit.addEventListener('click', () => {
    confirm.hidden = false;
  });
  confirmYes.addEventListener('click', () => {
    overlay.hidden = true;
    confirm.hidden = true;
    callbacks.onQuit();
  });
  confirmNo.addEventListener('click', () => {
    confirm.hidden = true;
  });

  return {
    root,
    overlay,
    confirm,
    callbacks,
    showPause() {
      root.classList.remove('hidden');
      pause.classList.remove('hidden');
    },
    showOverlay() {
      root.classList.remove('hidden');
      pause.classList.add('hidden');
      overlay.hidden = false;
      confirm.hidden = true;
    },
    hide() {
      root.classList.add('hidden');
      pause.classList.add('hidden');
      overlay.hidden = true;
      confirm.hidden = true;
    },
    reset() {
      this.hide();
    },
  };
}
