import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRaceHud } from './race-hud';

function click(root: ParentNode, selector: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing button: ${selector}`);
  }
  return button;
}

describe('createRaceHud', () => {
  let hud: ReturnType<typeof createRaceHud>;

  beforeEach(() => {
    hud = createRaceHud({ onResume: vi.fn(), onQuit: vi.fn() });
  });

  it('renders pause, resume, quit, and confirm buttons', () => {
    const buttons = [...hud.root.querySelectorAll('button')];
    const actions = buttons.map((b) => b.dataset.action ?? b.dataset.confirm);
    expect(actions).toEqual(['pause', 'resume', 'quit', 'yes', 'no']);
  });

  it('starts hidden in build mode', () => {
    expect(hud.root.classList.contains('hidden')).toBe(true);
    expect(hud.root.querySelector('[data-action="pause"]')?.classList.contains('hidden')).toBe(
      true,
    );
    expect(hud.overlay.hidden).toBe(true);
    expect(hud.confirm.hidden).toBe(true);
  });

  it('showPause reveals the pause button only', () => {
    hud.showPause();
    expect(hud.root.classList.contains('hidden')).toBe(false);
    expect(hud.root.querySelector('[data-action="pause"]')?.classList.contains('hidden')).toBe(
      false,
    );
    expect(hud.overlay.hidden).toBe(true);
  });

  it('tapping pause opens the resume/quit overlay', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    expect(hud.overlay.hidden).toBe(false);
  });

  it('resume fires onResume once and closes the overlay', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    click(hud.overlay, 'button[data-action="resume"]').click();
    expect(hud.callbacks.onResume).toHaveBeenCalledTimes(1);
    expect(hud.overlay.hidden).toBe(true);
  });

  it('hides the confirm dialog until quit is tapped', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    expect(hud.confirm.hidden).toBe(true);
    click(hud.overlay, 'button[data-action="quit"]').click();
    expect(hud.confirm.hidden).toBe(false);
  });

  it('confirming quit fires onQuit once and closes the overlay', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    click(hud.overlay, 'button[data-action="quit"]').click();
    click(hud.confirm, 'button[data-confirm="yes"]').click();
    expect(hud.callbacks.onQuit).toHaveBeenCalledTimes(1);
    expect(hud.overlay.hidden).toBe(true);
  });

  it('cancelling quit does not fire onQuit', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    click(hud.overlay, 'button[data-action="quit"]').click();
    click(hud.confirm, 'button[data-confirm="no"]').click();
    expect(hud.callbacks.onQuit).not.toHaveBeenCalled();
    expect(hud.confirm.hidden).toBe(true);
  });

  it('hide hides the pause button and overlay', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    hud.hide();
    expect(hud.root.classList.contains('hidden')).toBe(true);
    expect(hud.root.querySelector('[data-action="pause"]')?.classList.contains('hidden')).toBe(
      true,
    );
    expect(hud.overlay.hidden).toBe(true);
  });

  it('reset hides everything and clears the overlay state', () => {
    hud.showPause();
    click(hud.root, 'button[data-action="pause"]').click();
    hud.reset();
    expect(hud.root.classList.contains('hidden')).toBe(true);
    expect(hud.root.querySelector('[data-action="pause"]')?.classList.contains('hidden')).toBe(
      true,
    );
    expect(hud.overlay.hidden).toBe(true);
    expect(hud.confirm.hidden).toBe(true);
  });
});
