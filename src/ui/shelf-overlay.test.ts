import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridModel } from '../grid/grid-model';
import { SHELF_CAPACITY, type ShelfEntry } from '../grid/shelf-store';
import { createShelfOverlay, type ShelfOverlayCallbacks } from './shelf-overlay';

/** Builds a shelf entry with a unique id and an empty snapshot. */
function entry(id: string): ShelfEntry {
  return { id, createdAt: 1_700_000_000_000, snapshot: new GridModel().toSnapshot() };
}

interface Harness {
  overlay: ReturnType<typeof createShelfOverlay>;
  root: HTMLElement;
  entries: ShelfEntry[];
  onLoad: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
}

function makeHarness(initialEntries: ShelfEntry[] = []): Harness {
  const entries = initialEntries;
  const onSave = vi.fn(() => 'saved' as const);
  const onLoad = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const callbacks: ShelfOverlayCallbacks = {
    getEntries: () => entries,
    onSave,
    onLoad,
    onDelete,
    onClose,
  };
  const overlay = createShelfOverlay(callbacks);
  return { overlay, root: overlay.root, entries, onSave, onLoad, onDelete, onClose };
}

function slots(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.shelf-slot'));
}

function occupiedCards(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('.shelf-slot.occupied .slot-card'));
}

function cardAt(cards: HTMLButtonElement[], index: number): HTMLButtonElement {
  const card = cards[index];
  if (!card) {
    throw new Error(`expected an occupied card at index ${index}`);
  }
  return card;
}

function saveButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>('[data-action="save"]') as HTMLButtonElement;
}

function pointerDown(element: Element): void {
  element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function pointerUp(element: Element): void {
  element.dispatchEvent(new Event('pointerup', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('slot layout', () => {
  it('renders exactly 12 fixed slots', () => {
    const { overlay, root } = makeHarness();
    overlay.open();
    expect(slots(root)).toHaveLength(SHELF_CAPACITY);
  });

  it('starts fully hidden and opens over the page', () => {
    const { overlay, root } = makeHarness();
    expect(root.hidden).toBe(true);
    overlay.open();
    expect(root.hidden).toBe(false);
  });

  it('shows schematic cards for occupied slots and dims empty ones', () => {
    const { overlay, root } = makeHarness([entry('a'), entry('b')]);
    overlay.open();
    const cards = occupiedCards(root);
    expect(cards).toHaveLength(2);
    expect(cardAt(cards, 0).dataset.entryId).toBe('a');
    expect(cardAt(cards, 0).querySelector('canvas')).not.toBeNull();
    const dimmed = slots(root).filter((slot) => slot.classList.contains('empty'));
    expect(dimmed).toHaveLength(SHELF_CAPACITY - 2);
  });
});

describe('empty-shelf invitation', () => {
  it('pulses the save action and the dim slots when the shelf is empty', () => {
    const { overlay, root } = makeHarness();
    overlay.open();
    expect(saveButton(root).classList.contains('pulsing')).toBe(true);
    for (const slot of slots(root)) {
      expect(slot.classList.contains('inviting')).toBe(true);
    }
  });

  it('stops the invitation once at least one track is saved', () => {
    const { overlay, root } = makeHarness([entry('a')]);
    overlay.open();
    expect(saveButton(root).classList.contains('pulsing')).toBe(false);
    expect(slots(root).filter((slot) => slot.classList.contains('inviting'))).toHaveLength(0);
  });
});

describe('saving', () => {
  it('asks for a save and pops the new card in newest-first', () => {
    const { overlay, root, entries, onSave } = makeHarness([entry('older')]);
    overlay.open();
    onSave.mockImplementation(() => {
      entries.unshift(entry('newer'));
      return 'saved';
    });

    saveButton(root).click();

    expect(onSave).toHaveBeenCalledTimes(1);
    const cards = occupiedCards(root);
    expect(cards).toHaveLength(2);
    expect(cardAt(cards, 0).dataset.entryId).toBe('newer');
    expect(cardAt(cards, 0).classList.contains('pop-in')).toBe(true);
    expect(cardAt(cards, 1).dataset.entryId).toBe('older');
  });

  it('wiggles the save action red and adds nothing when the shelf is full', () => {
    const full = Array.from({ length: SHELF_CAPACITY }, (_, i) => entry(`e${String(i)}`));
    const { overlay, root, onSave } = makeHarness(full);
    overlay.open();
    onSave.mockReturnValue('full');

    saveButton(root).click();

    expect(saveButton(root).classList.contains('denied')).toBe(true);
    expect(occupiedCards(root)).toHaveLength(SHELF_CAPACITY);

    vi.advanceTimersByTime(600);
    expect(saveButton(root).classList.contains('denied')).toBe(false);
  });
});

describe('loading', () => {
  it('loads a card in one tap and closes the overlay', () => {
    const { overlay, root, onLoad, onClose } = makeHarness([entry('a'), entry('b')]);
    overlay.open();

    cardAt(occupiedCards(root), 1).click();

    expect(onLoad).toHaveBeenCalledWith('b');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
  });

  it('does not stack load handlers across refreshes', () => {
    const { overlay, root, onLoad, onClose } = makeHarness([entry('a')]);
    overlay.open();
    overlay.refresh();
    overlay.refresh();

    cardAt(occupiedCards(root), 0).click();

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('long-press delete', () => {
  function armCard(root: HTMLElement, cardIndex = 0): HTMLButtonElement {
    const card = cardAt(occupiedCards(root), cardIndex);
    pointerDown(card);
    vi.advanceTimersByTime(600);
    pointerUp(card);
    return card;
  }

  it('wiggles the card and shows wordless confirm after a ~600ms press', () => {
    const { overlay, root, onDelete } = makeHarness([entry('a')]);
    overlay.open();

    const card = armCard(root);
    expect(card.classList.contains('armed')).toBe(true);
    const slot = card.closest('.shelf-slot') as HTMLElement;
    const yes = slot.querySelector<HTMLButtonElement>('[data-confirm="yes"]');
    const no = slot.querySelector<HTMLButtonElement>('[data-confirm="no"]');
    expect(yes).not.toBeNull();
    expect(no).not.toBeNull();
    expect(slot.querySelector<HTMLElement>('.slot-confirm')?.hidden).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes on the confirm tap', () => {
    const { overlay, root, entries, onDelete } = makeHarness([entry('a'), entry('b')]);
    overlay.open();
    armCard(root);

    const slot = cardAt(occupiedCards(root), 0).closest('.shelf-slot') as HTMLElement;
    slot.querySelector<HTMLButtonElement>('[data-confirm="yes"]')?.click();

    expect(onDelete).toHaveBeenCalledWith('a');
    onDelete.mockImplementation(() => {
      entries.shift();
    });
  });

  it('cancels on the no tap and restores the card', () => {
    const { overlay, root, onDelete } = makeHarness([entry('a')]);
    overlay.open();
    armCard(root);

    const slot = cardAt(occupiedCards(root), 0).closest('.shelf-slot') as HTMLElement;
    slot.querySelector<HTMLButtonElement>('[data-confirm="no"]')?.click();

    expect(onDelete).not.toHaveBeenCalled();
    const card = cardAt(occupiedCards(root), 0);
    expect(card.classList.contains('armed')).toBe(false);
    expect(slot.querySelector<HTMLElement>('.slot-confirm')?.hidden).toBe(true);
  });

  it('taps straight through to load when released before the press threshold', () => {
    const { overlay, root, onLoad, onDelete } = makeHarness([entry('a')]);
    overlay.open();

    const card = cardAt(occupiedCards(root), 0);
    pointerDown(card);
    vi.advanceTimersByTime(100);
    pointerUp(card);
    card.click();

    expect(card.classList.contains('armed')).toBe(false);
    expect(onLoad).toHaveBeenCalledWith('a');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ignores taps on an armed card', () => {
    const { overlay, root, onLoad } = makeHarness([entry('a')]);
    overlay.open();

    const card = armCard(root);
    card.click();

    expect(onLoad).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('closes via the close button', () => {
    const { overlay, root, onClose } = makeHarness();
    overlay.open();
    root.querySelector<HTMLButtonElement>('[data-action="close"]')?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
  });

  it('re-reads entries on every open', () => {
    const { overlay, root, entries } = makeHarness();
    overlay.open();
    expect(occupiedCards(root)).toHaveLength(0);
    entries.push(entry('late'));
    overlay.open();
    expect(occupiedCards(root)).toHaveLength(1);
  });
});

describe('wordless UI', () => {
  it('contains no text in any button', () => {
    const { overlay, root } = makeHarness([entry('a')]);
    overlay.open();
    for (const button of root.querySelectorAll('button')) {
      expect(button.textContent?.trim()).toBe('');
    }
  });
});
