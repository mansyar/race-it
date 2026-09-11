import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoButton } from './go-button';

function buttonOf(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('button[data-action="go"]');
  if (!button) {
    throw new Error('Missing GO button');
  }
  return button;
}

describe('createGoButton', () => {
  const onGo = vi.fn();
  const onBlockedTap = vi.fn();
  const onRetry = vi.fn();
  let go: ReturnType<typeof createGoButton>;

  beforeEach(() => {
    onGo.mockClear();
    onBlockedTap.mockClear();
    onRetry.mockClear();
    go = createGoButton({ onGo, onBlockedTap, onRetry });
  });

  it('renders a single big GO button', () => {
    const buttons = go.root.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0]).toBeTruthy();
  });

  it('starts asleep while assets load: disabled target, sleeping cue, still tappable', () => {
    const button = buttonOf(go.root);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.dataset.boot).toBe('sleeping');
    expect(button.classList.contains('pulsing')).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('sleeping taps give blocked feedback and never open the race', () => {
    buttonOf(go.root).click();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onGo).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('setValid(true) while asleep stays gated', () => {
    go.setValid(true);
    const button = buttonOf(go.root);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.classList.contains('pulsing')).toBe(false);
    button.click();
    expect(onGo).not.toHaveBeenCalled();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
  });

  it('setReady(true) wakes the button and respects validity', () => {
    go.setReady(true);
    const button = buttonOf(go.root);
    expect(button.dataset.boot).toBe('ready');

    // Still invalid: tappable, but blocked.
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(onGo).not.toHaveBeenCalled();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);

    go.setValid(true);
    expect(button.getAttribute('aria-disabled')).toBe('false');
    expect(button.classList.contains('pulsing')).toBe(true);
    button.click();
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
  });

  it('setValid(false) after being ready marks invalid and taps notify onBlockedTap', () => {
    go.setReady(true);
    go.setValid(true);
    go.setValid(false);
    const button = buttonOf(go.root);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(onGo).not.toHaveBeenCalled();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
  });

  it('retry cue taps re-attempt loading and never race', () => {
    go.setRetrying(true);
    const button = buttonOf(go.root);
    expect(button.dataset.boot).toBe('retry');
    button.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onGo).not.toHaveBeenCalled();
    expect(onBlockedTap).not.toHaveBeenCalled();
  });

  it('returning from retry to sleeping restores the sleeping cue', () => {
    go.setRetrying(true);
    go.setRetrying(false);
    expect(buttonOf(go.root).dataset.boot).toBe('sleeping');
  });

  it('once ready, the retry state no longer wins and taps race as usual', () => {
    go.setRetrying(true);
    go.setReady(true);
    const button = buttonOf(go.root);
    expect(button.dataset.boot).toBe('ready');

    go.setValid(true);
    button.click();
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onBlockedTap).not.toHaveBeenCalled();
  });

  it('pulses only while ready and valid', () => {
    const button = buttonOf(go.root);
    expect(button.classList.contains('pulsing')).toBe(false);
    go.setValid(true);
    expect(button.classList.contains('pulsing')).toBe(false);
    go.setReady(true);
    expect(button.classList.contains('pulsing')).toBe(true);
    go.setValid(false);
    expect(button.classList.contains('pulsing')).toBe(false);
  });

  it('retry taps without an onRetry handler stay inert', () => {
    const bare = createGoButton({ onGo });
    bare.setRetrying(true);
    buttonOf(bare.root).click();
    expect(onGo).not.toHaveBeenCalled();
  });
});
