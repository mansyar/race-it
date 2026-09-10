/**
 * Decides whether the install hint should appear. The hint points iOS Safari
 * parents at Add-to-Home-Screen: Chrome on Android gets Chrome's own rich
 * install sheet instead (manifest screenshots), and desktop gets nothing.
 */

/** Environment snapshot the install-hint decision is based on. */
export interface InstallEnv {
  userAgent: string;
  /** Apple touch devices need this to see through desktop-mode iPad UAs. */
  maxTouchPoints: number;
  /** True when the app already runs installed (standalone display mode). */
  standalone: boolean;
  /** True when the parent dismissed the hint on a previous visit. */
  dismissed: boolean;
}

/** localStorage key persisting the parent's dismissal of the install hint. */
export const INSTALL_HINT_STORAGE_KEY = 'race-it:install-hint-dismissed';

function isAppleTouchDevice(env: InstallEnv): boolean {
  const iOSDevice = /iPad|iPhone|iPod/.test(env.userAgent);
  // iPadOS with "Request Desktop Website" on reports a Macintosh UA but keeps
  // touch points, which desktop Macs do not have.
  const iPadOSDesktopMode = /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
  return iOSDevice || iPadOSDesktopMode;
}

/** Only Safari exposes Add-to-Home-Screen; CriOS/FxiOS/EdgiOS cannot install. */
function isSafari(userAgent: string): boolean {
  return /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(userAgent);
}

export function shouldShowInstallHint(env: InstallEnv): boolean {
  if (env.standalone) {
    return false;
  }
  if (env.dismissed) {
    return false;
  }
  return isAppleTouchDevice(env) && isSafari(env.userAgent);
}

/** Reads the real browser environment for the install-hint decision. */
export function readInstallEnv(): InstallEnv {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes its own standalone flag outside the media query.
    Boolean((window.navigator as { standalone?: boolean }).standalone);
  return {
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints,
    standalone,
    dismissed: localStorage.getItem(INSTALL_HINT_STORAGE_KEY) === 'true',
  };
}
