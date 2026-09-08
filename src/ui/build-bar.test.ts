import { beforeEach, describe, expect, it, vi } from 'vitest';

function click(root: ParentNode, selector: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing button: ${selector}`);
  }
  return button;
}

import { createBuildBar } from './build-bar';

describe('createBuildBar', () => {
  let bar: ReturnType<typeof createBuildBar>;

  beforeEach(() => {
    bar = createBuildBar({
      onPieceSelect: vi.fn(),
      onUndo: vi.fn(),
      onRemoveToggle: vi.fn(),
    });
  });

  it('renders 4 piece buttons plus undo and remove (all large touch targets)', () => {
    const buttons = [...bar.root.querySelectorAll('button')];
    expect(buttons.length).toBe(6);
    for (const button of buttons) {
      expect(button.className).toContain('big-button');
    }
  });

  it('exposes one button per piece type', () => {
    const types = [...bar.root.querySelectorAll<HTMLButtonElement>('button[data-piece]')].map(
      (b) => b.dataset.piece,
    );
    expect(types).toEqual(['straight', 'curve', 'start', 'finish']);
  });

  it('reports piece selection', () => {
    const button = click(bar.root, 'button[data-piece="curve"]');
    button.click();
    expect(bar.callbacks.onPieceSelect).toHaveBeenCalledWith('curve');
  });

  it('reports undo taps once enabled', () => {
    bar.setUndoEnabled(true);
    click(bar.root, 'button[data-action="undo"]').click();
    expect(bar.callbacks.onUndo).toHaveBeenCalledTimes(1);
  });

  it('reports remove-toggle taps', () => {
    click(bar.root, 'button[data-action="remove"]').click();
    expect(bar.callbacks.onRemoveToggle).toHaveBeenCalledTimes(1);
  });

  it('highlights the selected piece and clears selection', () => {
    bar.setSelected('start');
    expect(bar.root.querySelector('button[data-piece="start"]')?.className).toContain('selected');
    bar.setSelected(null);
    expect(bar.root.querySelector('button[data-piece="start"]')?.className).not.toContain(
      'selected',
    );
  });

  it('shows the active remove mode', () => {
    bar.setRemoveActive(true);
    expect(
      bar.root.querySelector('button[data-action="remove"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    bar.setRemoveActive(false);
    expect(
      bar.root.querySelector('button[data-action="remove"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('disables undo until there is history', () => {
    const undo = click(bar.root, 'button[data-action="undo"]');
    expect(undo.disabled).toBe(true);
    bar.setUndoEnabled(true);
    expect(undo.disabled).toBe(false);
  });
});
