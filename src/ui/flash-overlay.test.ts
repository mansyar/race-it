import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlashOverlay, FLASH_FADE_SECONDS, type FlashOverlay } from './flash-overlay';

describe('createFlashOverlay', () => {
  let overlay: FlashOverlay;

  beforeEach(() => {
    overlay = createFlashOverlay();
  });

  it('starts hidden so build mode never shows a pulse', () => {
    expect(overlay.root.classList.contains('hidden')).toBe(true);
    expect(overlay.root.classList.contains('flashing')).toBe(false);
  });

  it('flashes as a single visible pulse', () => {
    overlay.flash();
    expect(overlay.root.classList.contains('hidden')).toBe(false);
    expect(overlay.root.classList.contains('flashing')).toBe(true);
  });

  it('ends the pulse when the fade animation completes', () => {
    overlay.flash();
    overlay.root.dispatchEvent(new Event('animationend'));
    expect(overlay.root.classList.contains('hidden')).toBe(true);
    expect(overlay.root.classList.contains('flashing')).toBe(false);
  });

  it('clears an in-flight pulse on hide', () => {
    overlay.flash();
    overlay.hide();
    expect(overlay.root.classList.contains('hidden')).toBe(true);
    expect(overlay.root.classList.contains('flashing')).toBe(false);
  });

  it('restarts the pulse when flashed while a pulse is still running', () => {
    overlay.flash();
    overlay.flash();
    expect(overlay.root.classList.contains('hidden')).toBe(false);
    expect(overlay.root.classList.contains('flashing')).toBe(true);
  });

  it('never intercepts taps', () => {
    expect(overlay.root.style.pointerEvents).toBe('none');
  });

  it('fades over the exported duration', () => {
    expect(FLASH_FADE_SECONDS).toBe(0.25);
  });

  it('destroy removes the node and its animationend listener', () => {
    const container = document.createElement('div');
    container.append(overlay.root);
    const removeListener = vi.spyOn(overlay.root, 'removeEventListener');
    overlay.destroy();
    expect(overlay.root.parentNode).toBeNull();
    expect(removeListener).toHaveBeenCalledWith('animationend', expect.any(Function));
  });
});
