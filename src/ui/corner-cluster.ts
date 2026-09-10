export interface CornerClusterCallbacks {
  onShelf: () => void;
  onMuteToggle: (muted: boolean) => void;
  onClearConfirmed: () => void;
}

const SHELF_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18M3 15h18M5 9v12M19 9v12M5 3h14v6H5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>';

const SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="sound-waves" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

const CLEAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 20 4M10 20l10-10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 13 5 5L20 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function makeButton(
  className: string,
  html: string,
  action: string,
  label: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = html;
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  return button;
}

/**
 * Corner cluster (top-right): shelf button, mute toggle, and clear-table with a
 * full-screen confirm dialog so wipes never happen by accident.
 */
export function createCornerCluster(callbacks: CornerClusterCallbacks): {
  root: HTMLElement;
  confirm: HTMLElement;
  callbacks: CornerClusterCallbacks;
  setMuted: (muted: boolean) => void;
} {
  const root = document.createElement('div');
  root.className = 'corner-cluster';

  let muted = false;
  const muteButton = makeButton(
    'big-button cluster-button',
    SPEAKER_ICON,
    'mute',
    'sound on or off',
  );
  muteButton.setAttribute('aria-pressed', 'false');
  muteButton.addEventListener('click', () => {
    muted = !muted;
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.classList.toggle('muted', muted);
    muteButton.querySelector('.sound-waves')?.setAttribute('opacity', muted ? '0.15' : '1');
    callbacks.onMuteToggle(muted);
  });

  const shelfButton = makeButton('big-button cluster-button', SHELF_ICON, 'shelf', 'track shelf');
  shelfButton.addEventListener('click', () => callbacks.onShelf());

  const clearButton = makeButton(
    'big-button cluster-button',
    CLEAR_ICON,
    'clear',
    'clear the table',
  );
  clearButton.addEventListener('click', () => {
    confirmDialog.hidden = false;
  });

  root.append(shelfButton, muteButton, clearButton);

  const confirmDialog = document.createElement('div');
  confirmDialog.className = 'confirm-overlay';
  confirmDialog.hidden = true;
  const question = document.createElement('div');
  question.className = 'confirm-question';
  question.textContent = '?';
  const yesButton = makeButton('big-button confirm-yes', CHECK_ICON, 'confirm', 'yes, clear');
  yesButton.dataset.confirm = 'yes';
  yesButton.addEventListener('click', () => {
    confirmDialog.hidden = true;
    callbacks.onClearConfirmed();
  });
  const noButton = makeButton('big-button confirm-no', CLEAR_ICON, 'confirm', 'no, go back');
  noButton.dataset.confirm = 'no';
  noButton.classList.add('confirm-cancel');
  noButton.addEventListener('click', () => {
    confirmDialog.hidden = true;
  });
  confirmDialog.append(question, yesButton, noButton);

  return {
    root,
    confirm: confirmDialog,
    callbacks,
    setMuted: (value) => {
      muted = value;
      muteButton.setAttribute('aria-pressed', String(value));
      muteButton.classList.toggle('muted', value);
    },
  };
}
