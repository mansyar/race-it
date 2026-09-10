import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_HINT_STORAGE_KEY, readInstallEnv, shouldShowInstallHint } from './install-context';

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
/** iPadOS with "Request Desktop Website" on masquerades as a Mac. */
const IPADOS_DESKTOP_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('shouldShowInstallHint', () => {
  it('shows for Safari on an iPhone outside standalone mode', () => {
    expect(
      shouldShowInstallHint({
        userAgent: IOS_SAFARI,
        maxTouchPoints: 5,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it('shows for iPadOS Safari even when it reports a desktop user agent', () => {
    expect(
      shouldShowInstallHint({
        userAgent: IPADOS_DESKTOP_SAFARI,
        maxTouchPoints: 5,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it('never shows on Android or desktop browsers', () => {
    expect(
      shouldShowInstallHint({
        userAgent: ANDROID_CHROME,
        maxTouchPoints: 5,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallHint({
        userAgent: DESKTOP_CHROME,
        maxTouchPoints: 0,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it('never shows inside third-party iOS browsers that cannot install PWAs', () => {
    expect(
      shouldShowInstallHint({
        userAgent: IOS_CHROME,
        maxTouchPoints: 5,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it('never shows once the app already runs standalone', () => {
    expect(
      shouldShowInstallHint({
        userAgent: IOS_SAFARI,
        maxTouchPoints: 5,
        standalone: true,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it('stays hidden after the parent dismissed it', () => {
    expect(
      shouldShowInstallHint({
        userAgent: IOS_SAFARI,
        maxTouchPoints: 5,
        standalone: false,
        dismissed: true,
      }),
    ).toBe(false);
  });
});

describe('readInstallEnv', () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia; the app treats no-match as browser.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads the real browser environment and defaults to the hidden state', () => {
    const env = readInstallEnv();
    expect(env.standalone).toBe(false);
    expect(env.dismissed).toBe(false);
    expect(shouldShowInstallHint(env)).toBe(false);
  });

  it('detects installed standalone mode through the display-mode media query', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    expect(readInstallEnv().standalone).toBe(true);
  });

  it('detects installed standalone mode through the iOS Safari flag', () => {
    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: { ...window.navigator, standalone: true },
    });
    expect(readInstallEnv().standalone).toBe(true);
  });

  it('picks up a persisted dismissal from localStorage', () => {
    localStorage.setItem(INSTALL_HINT_STORAGE_KEY, 'true');
    expect(readInstallEnv().dismissed).toBe(true);
  });
});
