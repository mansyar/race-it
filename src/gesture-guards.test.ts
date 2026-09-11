import { describe, expect, it, vi } from 'vitest';
import { installGestureGuards } from './gesture-guards';

const GUARDED_EVENTS = ['contextmenu', 'dblclick', 'dragstart', 'gesturestart', 'gesturechange'];

function dispatch(target: EventTarget, type: string): Event {
  const event = new Event(type, { cancelable: true, bubbles: true });
  target.dispatchEvent(event);
  return event;
}

describe('installGestureGuards', () => {
  for (const type of GUARDED_EVENTS) {
    it(`prevents default for ${type}`, () => {
      const target = document.createElement('div');
      installGestureGuards(target);

      expect(dispatch(target, type).defaultPrevented).toBe(true);
    });
  }

  it('leaves pointer events untouched', () => {
    const target = document.createElement('div');
    installGestureGuards(target);

    expect(dispatch(target, 'pointerdown').defaultPrevented).toBe(false);
    expect(dispatch(target, 'pointerup').defaultPrevented).toBe(false);
  });

  it('registers every guard as a non-passive listener', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    installGestureGuards({ addEventListener, removeEventListener });

    expect(addEventListener).toHaveBeenCalledTimes(GUARDED_EVENTS.length);
    for (const type of GUARDED_EVENTS) {
      expect(addEventListener).toHaveBeenCalledWith(type, expect.any(Function), { passive: false });
    }
  });

  it('dispose removes the exact listeners it registered', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const guards = installGestureGuards({ addEventListener, removeEventListener });
    const registered = addEventListener.mock.calls.map(([, listener]) => listener);

    guards.dispose();

    const removed = removeEventListener.mock.calls.map(([, listener]) => listener);
    expect(removeEventListener).toHaveBeenCalledTimes(GUARDED_EVENTS.length);
    expect(removed).toEqual(registered);
  });

  it('dispose is idempotent', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const guards = installGestureGuards({ addEventListener, removeEventListener });

    guards.dispose();
    guards.dispose();

    expect(removeEventListener).toHaveBeenCalledTimes(GUARDED_EVENTS.length);
  });

  it('stops preventing events after dispose', () => {
    const target = document.createElement('div');
    const guards = installGestureGuards(target);

    guards.dispose();

    expect(dispatch(target, 'contextmenu').defaultPrevented).toBe(false);
  });
});
