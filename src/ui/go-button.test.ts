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

  beforeEach(() => {
    go = createGoButton({ onGo: vi.fn() });
  });

  it('renders a single big GO button', () => {
    const buttons = go.root.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]).toBeTruthy();
  });

  it('starts disabled (track not valid yet)', () => {
    expect(click(go.root, 'button[data-action="go"]').disabled).toBe(true);
  });

  it('ignores taps while disabled', () => {
    click(go.root, 'button[data-action="go"]').click();
    expect(go.callbacks.onGo).not.toHaveBeenCalled();
  });

  it('setValid(true) enables the button and taps fire onGo', () => {
    go.setValid(true);
    const button = click(go.root, 'button[data-action="go"]');
    expect(button.disabled).toBe(false);
    button.click();
    expect(go.callbacks.onGo).toHaveBeenCalledTimes(1);
  });

  it('setValid(false) disables again after being valid', () => {
    go.setValid(true);
    go.setValid(false);
    expect(click(go.root, 'button[data-action="go"]').disabled).toBe(true);
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
