import { beforeEach, describe, expect, it, vi } from 'vitest';

function click(root: ParentNode, selector: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing button: ${selector}`);
  }
  return button;
}

import { createCornerCluster } from './corner-cluster';

describe('createCornerCluster', () => {
  let cluster: ReturnType<typeof createCornerCluster>;

  beforeEach(() => {
    cluster = createCornerCluster({
      onShelf: vi.fn(),
      onMuteToggle: vi.fn(),
      onClearConfirmed: vi.fn(),
    });
  });

  it('renders shelf, mute, and clear buttons', () => {
    const buttons = [...cluster.root.querySelectorAll('button')];
    const actions = buttons.map((b) => b.dataset.action);
    expect(actions).toEqual(['shelf', 'mute', 'clear']);
  });

  it('reports mute toggles with the new state', () => {
    const mute = click(cluster.root, 'button[data-action="mute"]');
    mute.click();
    expect(cluster.callbacks.onMuteToggle).toHaveBeenCalledWith(true);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    mute.click();
    expect(cluster.callbacks.onMuteToggle).toHaveBeenCalledWith(false);
  });

  it('reports shelf taps', () => {
    click(cluster.root, 'button[data-action="shelf"]').click();
    expect(cluster.callbacks.onShelf).toHaveBeenCalledTimes(1);
  });

  it('hides the confirm dialog until clear is tapped', () => {
    expect(cluster.confirm.hidden).toBe(true);
    click(cluster.root, 'button[data-action="clear"]').click();
    expect(cluster.confirm.hidden).toBe(false);
  });

  it('confirms clear and hides the dialog', () => {
    click(cluster.root, 'button[data-action="clear"]').click();
    click(cluster.confirm, 'button[data-confirm="yes"]').click();
    expect(cluster.callbacks.onClearConfirmed).toHaveBeenCalledTimes(1);
    expect(cluster.confirm.hidden).toBe(true);
  });

  it('cancels clear without confirming', () => {
    click(cluster.root, 'button[data-action="clear"]').click();
    click(cluster.confirm, 'button[data-confirm="no"]').click();
    expect(cluster.callbacks.onClearConfirmed).not.toHaveBeenCalled();
    expect(cluster.confirm.hidden).toBe(true);
  });
});
