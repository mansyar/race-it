import { type SaveShelfResult, SHELF_CAPACITY, type ShelfEntry } from '../grid/shelf-store';
import { drawSchematic } from '../render/shelf-schematic';

/** Duration in ms a card must be held before delete is armed. */
const LONG_PRESS_MS = 600;

/** How long the full-shelf wiggle stays visible. */
const DENIED_MS = 500;

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

const SAVE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 13 5 5L20 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CROSS_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

export interface ShelfOverlayCallbacks {
  /** Current shelf entries, newest first, re-read on every render. */
  getEntries: () => ShelfEntry[];
  /** Attempts to save the current working board; reports the outcome. */
  onSave: () => SaveShelfResult;
  /** Loads the saved track with this id onto the table. */
  onLoad: (id: string) => void;
  /** Deletes the saved track with this id. */
  onDelete: (id: string) => void;
  /** Called whenever the overlay closes (✕, save-load, or card load). */
  onClose: () => void;
}

export interface ShelfOverlay {
  /** Root element to mount in the page. */
  root: HTMLElement;
  callbacks: ShelfOverlayCallbacks;
  /** Shows the overlay over the build scene and re-reads the shelf. */
  open: () => void;
  /** Hides the overlay (fires onClose). */
  close: () => void;
  /** Re-reads entries and re-renders the slots. */
  refresh: () => void;
}

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

/** Draws the track schematic onto a card canvas (best-effort in jsdom). */
function paintCard(canvas: HTMLCanvasElement, snapshot: GridSnapshot): void {
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    drawSchematic(ctx, snapshot, 96);
  }
}

/**
 * Builds the wordless full-screen shelf overlay: a save action, 12 fixed
 * slots (schematic cards for saved tracks, dim placeholders for empty
 * slots), one-tap load, ~600ms long-press + ✓/✗ delete confirm, and a big
 * ✕ close. No text anywhere — icons, color, and motion only.
 */
export function createShelfOverlay(callbacks: ShelfOverlayCallbacks): ShelfOverlay {
  const root = document.createElement('div');
  root.className = 'shelf-overlay';
  root.hidden = true;

  const closeButton = makeButton('big-button shelf-close', CLOSE_ICON, 'close', 'close the shelf');
  root.appendChild(closeButton);

  const saveButton = makeButton('big-button shelf-save', SAVE_ICON, 'save', 'save this track');
  root.appendChild(saveButton);

  const grid = document.createElement('div');
  grid.className = 'shelf-grid';
  root.appendChild(grid);

  const slotWrappers: Array<{
    slot: HTMLElement;
    card: HTMLButtonElement;
    confirm: HTMLElement;
  }> = [];

  for (let i = 0; i < SHELF_CAPACITY; i++) {
    const slot = document.createElement('div');
    slot.className = 'shelf-slot empty';

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'slot-card';
    card.setAttribute('aria-label', 'saved track');
    card.hidden = true;

    const confirm = document.createElement('div');
    confirm.className = 'slot-confirm';
    confirm.hidden = true;

    const yes = makeButton('big-button confirm-yes', CHECK_ICON, 'confirm', 'delete this track');
    yes.dataset.confirm = 'yes';
    const no = makeButton('big-button confirm-no', CROSS_ICON, 'confirm', 'no, go back');
    no.dataset.confirm = 'no';
    confirm.append(yes, no);

    slot.append(card, confirm);
    grid.appendChild(slot);
    slotWrappers.push({ slot, card, confirm });
  }

  let justSaved = false;

  /** Renders one occupied slot: schematic card + long-press delete wiring. */
  function renderOccupied(wrapper: (typeof slotWrappers)[number], entry: ShelfEntry): void {
    const { slot, card, confirm } = wrapper;
    slot.classList.remove('empty', 'inviting');
    slot.classList.add('occupied');
    card.dataset.entryId = entry.id;
    if (justSaved && wrapper === slotWrappers[0]) {
      card.classList.add('pop-in');
    }
    const canvas = document.createElement('canvas');
    paintCard(canvas, entry.snapshot);
    card.replaceChildren(canvas);
    card.hidden = false;
    confirm.hidden = true;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let armed = false;
    const clearTimer = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    card.addEventListener('pointerdown', () => {
      timer = setTimeout(() => {
        timer = undefined;
        armed = true;
        card.classList.add('armed');
        confirm.hidden = false;
      }, LONG_PRESS_MS);
    });
    const stopPress = (): void => {
      clearTimer();
    };
    card.addEventListener('pointerup', stopPress);
    card.addEventListener('pointerleave', stopPress);
    card.addEventListener('click', () => {
      if (armed) {
        return;
      }
      callbacks.onLoad(entry.id);
      close();
    });

    confirm.querySelector('[data-confirm="yes"]')?.addEventListener('click', () => {
      armed = false;
      card.classList.remove('armed');
      callbacks.onDelete(entry.id);
      refresh();
    });
    confirm.querySelector('[data-confirm="no"]')?.addEventListener('click', () => {
      armed = false;
      card.classList.remove('armed');
      confirm.hidden = true;
    });
  }

  function render(): void {
    const entries = callbacks.getEntries();
    const isEmpty = entries.length === 0;
    saveButton.classList.toggle('pulsing', isEmpty);

    for (const wrapper of slotWrappers) {
      const { slot, card, confirm } = wrapper;
      slot.className = 'shelf-slot';
      if (isEmpty) {
        slot.classList.add('empty', 'inviting');
      } else {
        slot.classList.add('empty');
      }
      card.classList.remove('armed', 'pop-in');
      card.hidden = true;
      card.replaceChildren();
      confirm.hidden = true;
    }

    for (let i = 0; i < entries.length && i < SHELF_CAPACITY; i++) {
      renderOccupied(slotWrappers[i], entries[i]);
    }
    justSaved = false;
  }

  function open(): void {
    refresh();
    root.hidden = false;
  }

  function close(): void {
    root.hidden = true;
    callbacks.onClose();
  }

  function refresh(): void {
    render();
  }

  saveButton.addEventListener('click', () => {
    const result = callbacks.onSave();
    if (result === 'saved') {
      justSaved = true;
      refresh();
      return;
    }
    saveButton.classList.add('denied');
    setTimeout(() => {
      saveButton.classList.remove('denied');
    }, DENIED_MS);
  });
  closeButton.addEventListener('click', close);

  return { root, callbacks, open, close, refresh };
}
