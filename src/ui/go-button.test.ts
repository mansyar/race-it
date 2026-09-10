import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoButton } from './go-button';

function click(root: ParentNode, selector: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing button: ${selector}`);
  }
  return button;
}

describe('createGoButton', () => {
  let go: ReturnType<typeof createGoButton>;
  let onGo: ReturnType<typeof vi.fn>;
  let onBlockedTap: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onGo = vi.fn();
    onBlockedTap = vi.fn();
    go = createGoButton({ onGo, onBlockedTap });
  });

  it('renders a single big GO button', () => {
    const buttons = go.root.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]).toBeTruthy();
  });

  it('starts invalid while the track is not race-ready', () => {
    expect(click(go.root, 'button[data-action="go"]').getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the button tappable so invalid taps can give feedback', () => {
    expect(click(go.root, 'button[data-action="go"]').disabled).toBe(false);
  });

  it('notifies onBlockedTap when tapped while invalid', () => {
    click(go.root, 'button[data-action="go"]').click();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onGo).not.toHaveBeenCalled();
  });

  it('setValid(true) marks valid and taps fire onGo', () => {
    go.setValid(true);
    const button = click(go.root, 'button[data-action="go"]');
    expect(button.getAttribute('aria-disabled')).toBe('false');
    button.click();
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).not.toHaveBeenCalled();
  });

  it('setValid(false) marks invalid again and taps notify onBlockedTap', () => {
    go.setValid(true);
    go.setValid(false);
    const button = click(go.root, 'button[data-action="go"]');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
  });

  it('marks validity with a pulsing class when valid', () => {
    const button = click(go.root, 'button[data-action="go"]');
    expect(button.classList.contains('pulsing')).toBe(false);
    go.setValid(true);
    expect(button.classList.contains('pulsing')).toBe(true);
    go.setValid(false);
    expect(button.classList.contains('pulsing')).toBe(false);
  });
});
