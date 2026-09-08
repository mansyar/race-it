import type { PieceType } from '../grid/grid-model';

export interface BuildBarCallbacks {
  onPieceSelect: (type: PieceType) => void;
  onUndo: () => void;
  onRemoveToggle: () => void;
}

/** Wordless inline-SVG icons for the palette. */
const PIECE_ICONS: Record<PieceType, string> = {
  straight:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 1v22M15 1v22" stroke="currentColor" stroke-width="2" fill="none"/><rect x="1" y="1" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  curve:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 1v6a8 8 0 0 0 8 8h6M15 1v1a7 7 0 0 0 7 7v6" stroke="currentColor" stroke-width="2" fill="none"/><rect x="1" y="1" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  start:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><rect x="1" y="1" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  finish:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2.5 3.5L17 11H6" stroke="currentColor" stroke-width="2" fill="none"/><rect x="1" y="1" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};

const UNDO_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h9a7 7 0 0 1 0 14h-3" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';

const TRASH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const PIECE_ORDER: readonly PieceType[] = ['straight', 'curve', 'start', 'finish'];

function makeButton(
  className: string,
  html: string,
  dataset: Record<string, string>,
  label: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = html;
  button.setAttribute('aria-label', label);
  for (const [key, value] of Object.entries(dataset)) {
    button.dataset[key] = value;
  }
  return button;
}

/** Bottom palette bar: 4 piece buttons + undo + remove toggle (wordless). */
export function createBuildBar(callbacks: BuildBarCallbacks): {
  root: HTMLElement;
  callbacks: BuildBarCallbacks;
  setSelected: (type: PieceType | null) => void;
  setRemoveActive: (active: boolean) => void;
  setUndoEnabled: (enabled: boolean) => void;
} {
  const root = document.createElement('div');
  root.className = 'build-bar';

  for (const type of PIECE_ORDER) {
    const button = makeButton(
      'big-button piece-button',
      PIECE_ICONS[type],
      { piece: type },
      `add ${type} piece`,
    );
    button.addEventListener('click', () => callbacks.onPieceSelect(type));
    root.append(button);
  }

  const undoButton = makeButton('big-button', UNDO_ICON, { action: 'undo' }, 'undo');
  undoButton.disabled = true;
  undoButton.addEventListener('click', () => callbacks.onUndo());

  const removeButton = makeButton('big-button', TRASH_ICON, { action: 'remove' }, 'remove pieces');
  removeButton.setAttribute('aria-pressed', 'false');
  removeButton.addEventListener('click', () => callbacks.onRemoveToggle());

  root.append(undoButton, removeButton);

  return {
    root,
    callbacks,
    setSelected: (type) => {
      for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-piece]')) {
        button.classList.toggle('selected', button.dataset.piece === type);
      }
    },
    setRemoveActive: (active) => {
      removeButton.setAttribute('aria-pressed', String(active));
      removeButton.classList.toggle('selected', active);
    },
    setUndoEnabled: (enabled) => {
      undoButton.disabled = !enabled;
    },
  };
}
