import { describe, expect, it, vi } from 'vitest';
import { createAppLifecycle, type LifecycleTarget } from './app-lifecycle';

/**
 * Minimal in-memory target used to drive lifecycle events synchronously.
 * Tracks listeners per type so tests can assert registration and disposal.
 */
interface FakeTarget extends LifecycleTarget {
  visibilityState: string;
  dispatch(type: string, event?: Event): void;
  listenerCount(type: string): number;
}

function createFakeTarget(): FakeTarget {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    visibilityState: 'visible',
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = new Event(type)) {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function pageShowEvent(persisted: boolean): Event {
  return Object.assign(new Event('pageshow'), { persisted });
}

function createHarness() {
  const doc = createFakeTarget();
  const win = createFakeTarget();
  const wakeLock = { setVisible: vi.fn() };
  const onHidden = vi.fn();
  const onVisible = vi.fn();
  const onHide = vi.fn();
  const onRestore = vi.fn();
  const lifecycle = createAppLifecycle({
    doc,
    win,
    wakeLock,
    onHidden,
    onVisible,
    onHide,
    onRestore,
  });
  return { doc, win, wakeLock, onHidden, onVisible, onHide, onRestore, lifecycle };
}

describe('createAppLifecycle', () => {
  it('subscribes to visibilitychange on the document and pagehide/pageshow on the window', () => {
    const { doc, win } = createHarness();
    expect(doc.listenerCount('visibilitychange')).toBe(1);
    expect(win.listenerCount('pagehide')).toBe(1);
    expect(win.listenerCount('pageshow')).toBe(1);
  });

  it('suspends on hidden: onHidden fires and the wake lock releases', () => {
    const { doc, wakeLock, onHidden } = createHarness();
    doc.visibilityState = 'hidden';
    doc.dispatch('visibilitychange');
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(wakeLock.setVisible).toHaveBeenCalledWith(false);
  });

  it('resumes on visible: onVisible fires and the wake lock re-acquires', () => {
    const { doc, wakeLock, onVisible } = createHarness();
    doc.dispatch('visibilitychange');
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(wakeLock.setVisible).toHaveBeenCalledTimes(1);
    expect(wakeLock.setVisible).toHaveBeenCalledWith(true);
  });

  it('fires onHide when the page is navigated away without tearing anything down', () => {
    const { win, onHide, onRestore } = createHarness();
    win.dispatch('pagehide');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('restores only when pageshow reports a persisted bfcache entry', () => {
    const { win, onRestore } = createHarness();
    win.dispatch('pageshow', pageShowEvent(false));
    win.dispatch('pageshow');
    expect(onRestore).not.toHaveBeenCalled();
    win.dispatch('pageshow', pageShowEvent(true));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('dispose detaches every listener and is idempotent', () => {
    const { doc, win, onHidden, onVisible, onHide, onRestore, lifecycle } = createHarness();
    lifecycle.dispose();
    lifecycle.dispose();
    expect(doc.listenerCount('visibilitychange')).toBe(0);
    expect(win.listenerCount('pagehide')).toBe(0);
    expect(win.listenerCount('pageshow')).toBe(0);
    doc.visibilityState = 'hidden';
    doc.dispatch('visibilitychange');
    win.dispatch('pagehide');
    win.dispatch('pageshow', pageShowEvent(true));
    expect(onHidden).not.toHaveBeenCalled();
    expect(onVisible).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });
});
