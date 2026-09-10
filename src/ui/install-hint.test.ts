import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_HINT_STORAGE_KEY } from './install-context';
import { createInstallHint } from './install-hint';

const IOS_SAFARI_ENV = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
  standalone: false,
  dismissed: false,
};
const ANDROID_ENV = {
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5,
  standalone: false,
  dismissed: false,
};

describe('createInstallHint', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing on browsers that cannot install the PWA', () => {
    const hint = createInstallHint(ANDROID_ENV);
    expect(hint.active).toBe(false);
    expect(hint.root.childElementCount).toBe(0);
    hint.show();
    hint.hide();
    expect(hint.root.hidden).toBe(true);
  });

  it('renders nothing when the parent already dismissed the hint', () => {
    const hint = createInstallHint({ ...IOS_SAFARI_ENV, dismissed: true });
    expect(hint.active).toBe(false);
    expect(hint.root.childElementCount).toBe(0);
  });

  it('renders the collapsed pill for installable iOS Safari', () => {
    const hint = createInstallHint(IOS_SAFARI_ENV);
    expect(hint.active).toBe(true);
    hint.show();
    expect(hint.root.hidden).toBe(false);
    const pill = hint.root.querySelector<HTMLButtonElement>('button[data-action="expand"]');
    expect(pill).toBeTruthy();
  });

  it('expands into a wordless step guide on tap', () => {
    const hint = createInstallHint(IOS_SAFARI_ENV);
    hint.show();
    const pill = hint.root.querySelector<HTMLButtonElement>('button[data-action="expand"]');
    pill?.click();
    expect(hint.root.classList.contains('expanded')).toBe(true);
    // Two icon-only steps: the share action and the add-to-home-screen action.
    const steps = hint.root.querySelectorAll('.install-step');
    expect(steps.length).toBe(2);
    for (const step of steps) {
      expect(step.querySelector('svg')).toBeTruthy();
      expect(step.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('keeps every control a big touch target', () => {
    const hint = createInstallHint(IOS_SAFARI_ENV);
    hint.show();
    const buttons = hint.root.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(button.classList.contains('install-big')).toBe(true);
    }
  });

  it('show and hide round-trip while not dismissed', () => {
    const hint = createInstallHint(IOS_SAFARI_ENV);
    hint.show();
    hint.hide();
    expect(hint.root.hidden).toBe(true);
    hint.show();
    expect(hint.root.hidden).toBe(false);
  });

  it('persists dismissal and hides for good when the parent taps X', () => {
    const hint = createInstallHint(IOS_SAFARI_ENV);
    hint.show();
    const dismiss = hint.root.querySelector<HTMLButtonElement>('button[data-action="dismiss"]');
    dismiss?.click();
    expect(localStorage.getItem(INSTALL_HINT_STORAGE_KEY)).toBe('true');
    expect(hint.root.hidden).toBe(true);
    hint.show();
    expect(hint.root.hidden).toBe(true);
  });

  it('still dismisses when localStorage refuses the write', () => {
    const hint = createInstallHint(IOS_SAFARI_ENV);
    hint.show();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const dismiss = hint.root.querySelector<HTMLButtonElement>('button[data-action="dismiss"]');
    expect(dismiss?.click()).toBe(undefined);
    expect(hint.root.hidden).toBe(true);
  });
});
