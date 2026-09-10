import {
  INSTALL_HINT_STORAGE_KEY,
  type InstallEnv,
  shouldShowInstallHint,
} from './install-context';

/** Collapsed pill + expandable wordless guide for Add-to-Home-Screen. */
export interface InstallHint {
  root: HTMLDivElement;
  /** False when the environment never shows the hint (zero render). */
  active: boolean;
  show(): void;
  hide(): void;
}

const SHARE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32"><path d="M12 3v11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8 6.5 12 2.8l4 3.7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10H5v10h14V10h-1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ADD_HOME_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="32" height="32"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="28" height="28"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';

/**
 * Creates the install hint. On non-installable environments the root stays
 * empty and inert (zero render, no listeners) so main.ts can mount it
 * unconditionally.
 */
export function createInstallHint(env: InstallEnv): InstallHint {
  const root = document.createElement('div');
  root.className = 'install-hint';
  root.hidden = true;

  const active = shouldShowInstallHint(env);
  if (!active) {
    return { root, active, show: () => undefined, hide: () => undefined };
  }

  // Once dismissed, the hint never comes back this session (and the
  // localStorage write keeps it away on every future visit).
  let dismissed = false;

  // Collapsed pill: the share glyph hints at the first gesture.
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.dataset.action = 'expand';
  pill.className = 'install-pill install-big';
  pill.setAttribute('aria-label', 'Add Race-It to your home screen');
  pill.innerHTML = SHARE_ICON;
  root.append(pill);

  // Expanded wordless guide: step 1 tap share, step 2 choose add-to-home.
  const guide = document.createElement('div');
  guide.className = 'install-guide';

  const stepShare = document.createElement('span');
  stepShare.className = 'install-step';
  stepShare.setAttribute('role', 'img');
  stepShare.setAttribute('aria-label', 'Tap the share button');
  stepShare.innerHTML = SHARE_ICON;

  const stepAdd = document.createElement('span');
  stepAdd.className = 'install-step';
  stepAdd.setAttribute('role', 'img');
  stepAdd.setAttribute('aria-label', 'Choose Add to Home Screen');
  stepAdd.innerHTML = ADD_HOME_ICON;

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.dataset.action = 'dismiss';
  dismiss.className = 'install-dismiss install-big';
  dismiss.setAttribute('aria-label', 'Dismiss install hint');
  dismiss.innerHTML = CLOSE_ICON;

  guide.append(stepShare, stepAdd, dismiss);
  root.append(guide);

  const collapse = (): void => {
    root.classList.remove('expanded');
  };

  pill.addEventListener('click', () => {
    root.classList.add('expanded');
  });

  dismiss.addEventListener('click', () => {
    dismissed = true;
    try {
      localStorage.setItem(INSTALL_HINT_STORAGE_KEY, 'true');
    } catch {
      // Storage failures must never block play.
    }
    root.hidden = true;
    collapse();
  });

  return {
    root,
    active,
    show() {
      if (dismissed) {
        return;
      }
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      collapse();
    },
  };
}
