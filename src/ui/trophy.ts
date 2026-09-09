import type { RaceResult } from '../race/engine';

/** Full-race-end celebration overlay: trophy, winner color word, RACE AGAIN. */
export interface Trophy {
  root: HTMLDivElement;
  callbacks: { onAgain: () => void };
  /** Reveals the trophy for the winner of the finished race. */
  show(result: RaceResult, colors: string[]): void;
  hide(): void;
}

/**
 * Creates the trophy overlay shown once ALL karts finish. Displays the winner
 * color word (the one text allowed by the product guidelines) beside a trophy
 * and a single huge RACE AGAIN button that re-races with fresh speeds.
 */
export function createTrophy(callbacks: { onAgain: () => void }): Trophy {
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