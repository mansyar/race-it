import type { RaceResult } from '../race/engine';

/** Callbacks for the celebration overlay actions. */
export interface TrophyCallbacks {
  /** RACE AGAIN: re-race with fresh speeds. */
  onAgain: () => void;
  /** Build Again: return to the builder with the current track intact. */
  onBuildAgain: () => void;
}

/** Wordless Build Again icon: the builder's own curved track-tile glyph. */
const BUILD_AGAIN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 1v6a8 8 0 0 0 8 8h6M15 1v1a7 7 0 0 0 7 7v6" stroke="currentColor" stroke-width="2" fill="none"/><rect x="1" y="1" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

/** Full-race-end celebration overlay: trophy, winner color word, RACE AGAIN. */
export interface Trophy {
  root: HTMLDivElement;
  callbacks: TrophyCallbacks;
  /** Reveals the trophy for the winner of the finished race. */
  show(result: RaceResult, colors: string[]): void;
  hide(): void;
}

/**
 * Creates the trophy overlay shown once ALL karts finish. Displays the winner
 * color word (the one text allowed by the product guidelines) beside a trophy,
 * a huge RACE AGAIN button that re-races with fresh speeds, and a subordinate
 * wordless Build Again button that returns to the track builder.
 */
export function createTrophy(callbacks: TrophyCallbacks): Trophy {
  const root = document.createElement('div');
  root.className = 'trophy hidden';

  const message = document.createElement('div');
  message.className = 'trophy-message';
  message.textContent = '🏆';
  root.append(message);

  const again = document.createElement('button');
  again.type = 'button';
  again.dataset.action = 'again';
  again.className = 'again-button';
  again.textContent = 'RACE AGAIN';
  again.setAttribute('aria-label', 'Race again');
  again.addEventListener('click', () => callbacks.onAgain());
  root.append(again);

  const buildAgain = document.createElement('button');
  buildAgain.type = 'button';
  buildAgain.dataset.action = 'build-again';
  buildAgain.className = 'build-again-button';
  buildAgain.innerHTML = BUILD_AGAIN_ICON;
  buildAgain.setAttribute('aria-label', 'Build again');
  buildAgain.addEventListener('click', () => callbacks.onBuildAgain());
  root.append(buildAgain);

  return {
    root,
    callbacks,
    show(result: RaceResult, colors: string[]) {
      const winnerColor = colors[result.winnerIndex] ?? 'Winner';
      message.textContent = `🏆 ${winnerColor} WINS!`;
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
  };
}
