import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaceResult } from '../race/engine';
import { createTrophy } from './trophy';

const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];

function resultFor(winnerIndex: number): RaceResult {
  return { winnerIndex, finishTimes: [1, 2, 3, 4], photoFinish: false };
}

describe('createTrophy', () => {
  let trophy: ReturnType<typeof createTrophy>;

  beforeEach(() => {
    trophy = createTrophy({ onAgain: vi.fn(), onBuildAgain: vi.fn() });
  });

  it('starts hidden', () => {
    expect(trophy.root.classList.contains('hidden')).toBe(true);
  });

  it('shows the trophy with the winner color word', () => {
    trophy.show(resultFor(1), COLORS);
    expect(trophy.root.classList.contains('hidden')).toBe(false);
    const text = trophy.root.textContent ?? '';
    expect(text).toContain('Blue');
    expect(text).toContain('WINS!');
  });

  it('shows the winner color for any winner index', () => {
    trophy.show(resultFor(3), COLORS);
    expect(trophy.root.textContent).toContain('Yellow');
  });

  it('renders RACE AGAIN followed by the Build Again action', () => {
    const actions = [...trophy.root.querySelectorAll('button')].map(
      (button) => button.dataset.action,
    );
    expect(actions).toEqual(['again', 'build-again']);
  });

  it('gives Build Again a wordless track-tile icon and aria-label', () => {
    const button = trophy.root.querySelector<HTMLButtonElement>(
      'button[data-action="build-again"]',
    );
    if (!button) {
      throw new Error('Missing Build Again button');
    }
    expect(button.classList.contains('build-again-button')).toBe(true);
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBeTruthy();
    expect((button.textContent ?? '').trim()).toBe('');
  });

  it('Build Again fires onBuildAgain once per tap without a confirm dialog', () => {
    trophy.show(resultFor(0), COLORS);
    const button = trophy.root.querySelector<HTMLButtonElement>(
      'button[data-action="build-again"]',
    );
    if (!button) {
      throw new Error('Missing Build Again button');
    }
    button.click();
    button.click();
    expect(trophy.callbacks.onBuildAgain).toHaveBeenCalledTimes(2);
    expect(trophy.root.querySelector('[data-confirm]')).toBeNull();
    expect(trophy.root.classList.contains('hidden')).toBe(false);
  });

  it('RACE AGAIN fires onAgain once per tap', () => {
    const again = trophy.root.querySelector<HTMLButtonElement>('button[data-action="again"]');
    if (!again) {
      throw new Error('Missing RACE AGAIN button');
    }
    again.click();
    again.click();
    expect(trophy.callbacks.onAgain).toHaveBeenCalledTimes(2);
  });

  it('hide hides the trophy', () => {
    trophy.show(resultFor(0), COLORS);
    trophy.hide();
    expect(trophy.root.classList.contains('hidden')).toBe(true);
  });

  it('can be shown again after hiding', () => {
    trophy.show(resultFor(2), COLORS);
    trophy.hide();
    trophy.show(resultFor(0), COLORS);
    expect(trophy.root.textContent).toContain('Red');
  });
});
