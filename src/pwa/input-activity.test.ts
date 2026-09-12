import { describe, expect, it, vi } from 'vitest';
import { type ActivityTarget, createInputActivity } from './input-activity';
import { QUIET_MS } from './update-controller';

interface FakeTarget {
  target: ActivityTarget;
  now: () => number;
  setNow: (value: number) => void;
  dispatch: (type: string) => void;
  listenerCount: () => number;
}

function createFakeTarget(): FakeTarget {
  let time = 0;
  const listeners = new Map<string, EventListener[]>();
  const target: ActivityTarget = {
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      const list = listeners.get(type);
      if (!list) {
        return;
      }
      const index = list.indexOf(listener);
      if (index >= 0) {
        list.splice(index, 1);
      }
    },
  };
  return {
    target,
    now: () => time,
    setNow: (value: number) => {
      time = value;
    },
    dispatch: (type: string) => {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(new Event(type));
      }
    },
    listenerCount: () => {
      let count = 0;
      for (const list of listeners.values()) {
        count += list.length;
      }
      return count;
    },
  };
}

describe('input activity tracking', () => {
  it('starts idle and marks pointerdown as activity and a hold', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    expect(input.idleMs(0)).toBe(0);
    expect(input.isHolding()).toBe(false);

    h.setNow(1_000);
    h.dispatch('pointerdown');
    expect(input.isHolding()).toBe(true);
    expect(input.idleMs(1_000)).toBe(0);
    expect(input.idleMs(5_000)).toBe(4_000);
  });

  it('counts multiple pointers until every one is released', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    h.dispatch('pointerdown');
    h.dispatch('pointerdown');
    expect(input.isHolding()).toBe(true);
    h.dispatch('pointerup');
    expect(input.isHolding()).toBe(true);
    h.dispatch('pointerup');
    expect(input.isHolding()).toBe(false);
  });

  it('ends holds on pointerup and pointercancel without going negative', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    h.dispatch('pointercancel');
    expect(input.isHolding()).toBe(false);
    h.dispatch('pointerdown');
    h.dispatch('pointercancel');
    expect(input.isHolding()).toBe(false);
    h.dispatch('pointerdown');
    h.dispatch('pointerup');
    expect(input.isHolding()).toBe(false);
  });

  it('clears a stuck hold when the window loses focus', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    h.setNow(1_000);
    h.dispatch('pointerdown');
    expect(input.isHolding()).toBe(true);
    h.setNow(5_000);
    // A mouse release outside the window never delivers pointerup; blur resets.
    h.dispatch('blur');
    expect(input.isHolding()).toBe(false);
    expect(input.idleMs(5_000)).toBe(0);
  });

  it('keeps a pointer held over time and resets idle on release', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    h.setNow(1_000);
    h.dispatch('pointerdown');
    h.setNow(11_000);
    expect(input.isHolding()).toBe(true);
    expect(input.idleMs(11_000)).toBe(10_000);
    h.dispatch('pointerup');
    expect(input.isHolding()).toBe(false);
    expect(input.idleMs(11_000)).toBe(0);
  });

  it('reports quiet only once the quiet window passed without activity', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    h.dispatch('pointerdown');
    h.dispatch('pointerup');
    h.setNow(QUIET_MS - 1);
    expect(input.idleMs(QUIET_MS - 1)).toBeLessThan(QUIET_MS);
    h.setNow(QUIET_MS);
    expect(input.idleMs(QUIET_MS)).toBe(QUIET_MS);
  });

  it('notifies subscribers on each activity event', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    const listener = vi.fn();
    const unsubscribe = input.onActivity(listener);
    h.dispatch('pointerdown');
    h.dispatch('pointerup');
    h.dispatch('pointercancel');
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    h.dispatch('pointerdown');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('removes window listeners and stops tracking on dispose', () => {
    const h = createFakeTarget();
    const input = createInputActivity({ target: h.target, now: h.now });
    const listener = vi.fn();
    input.onActivity(listener);
    expect(h.listenerCount()).toBe(4);
    input.dispose();
    input.dispose();
    expect(h.listenerCount()).toBe(0);
    h.dispatch('pointerdown');
    expect(input.isHolding()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
