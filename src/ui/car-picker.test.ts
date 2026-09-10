import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarLineup, KartColor } from '../race/lineup';
import { DEFAULT_LINEUP, KART_COLORS } from '../race/lineup';
import { createCarPicker } from './car-picker';

function swatch(root: ParentNode, color: KartColor): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`button[data-color="${color}"]`);
  if (!button) {
    throw new Error(`Missing swatch: ${color}`);
  }
  return button;
}

function raceButton(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('button[data-action="race"]');
  if (!button) {
    throw new Error('Missing race button');
  }
  return button;
}

describe('createCarPicker', () => {
  let picker: ReturnType<typeof createCarPicker>;

  beforeEach(() => {
    picker = createCarPicker({
      onRace: vi.fn(),
      onBack: vi.fn(),
      onToggle: vi.fn(),
    });
  });

  it('renders four wordless swatch cards, one per kart color', () => {
    const swatches = picker.root.querySelectorAll<HTMLButtonElement>('button[data-action="kart"]');
    expect([...swatches].map((s) => s.dataset.color)).toEqual([...KART_COLORS]);
    for (const s of swatches) {
      expect(s.textContent).toBe('');
      expect(s.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('starts hidden', () => {
    expect(picker.root.classList.contains('hidden')).toBe(true);
    picker.show();
    expect(picker.root.classList.contains('hidden')).toBe(false);
    picker.hide();
    expect(picker.root.classList.contains('hidden')).toBe(true);
  });

  it('starts with all four karts selected and RACE enabled', () => {
    picker.show();
    for (const color of KART_COLORS) {
      expect(swatch(picker.root, color).getAttribute('aria-pressed')).toBe('true');
    }
    expect(raceButton(picker.root).disabled).toBe(false);
  });

  it('tapping a selected swatch deselects it and fires onToggle', () => {
    picker.show();
    swatch(picker.root, 'red').click();
    expect(swatch(picker.root, 'red').getAttribute('aria-pressed')).toBe('false');
    expect(picker.callbacks.onToggle).toHaveBeenCalledWith('red', false);
    expect(picker.getLineup()).toEqual({ karts: ['blue', 'green', 'yellow'] });
  });

  it('tapping a deselected swatch re-selects it', () => {
    picker.show();
    swatch(picker.root, 'red').click();
    swatch(picker.root, 'red').click();
    expect(swatch(picker.root, 'red').getAttribute('aria-pressed')).toBe('true');
    expect(picker.callbacks.onToggle).toHaveBeenCalledWith('red', true);
  });

  it('disables RACE and shows a hint when fewer than two karts are selected', () => {
    picker.show();
    for (const color of ['red', 'blue', 'green'] as KartColor[]) {
      swatch(picker.root, color).click();
    }
    const race = raceButton(picker.root);
    expect(race.disabled).toBe(true);
    expect(race.classList.contains('hint')).toBe(true);
    race.click();
    expect(picker.callbacks.onRace).not.toHaveBeenCalled();
  });

  it('fires onRace with the current lineup when RACE is tapped while valid', () => {
    picker.show();
    swatch(picker.root, 'red').click();
    raceButton(picker.root).click();
    expect(picker.callbacks.onRace).toHaveBeenCalledWith({ karts: ['blue', 'green', 'yellow'] });
  });

  it('fires onBack when the back button is tapped', () => {
    picker.show();
    const back = picker.root.querySelector<HTMLButtonElement>('button[data-action="back"]');
    if (!back) {
      throw new Error('Missing back button');
    }
    back.click();
    expect(picker.callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('setLineup restores a persisted selection', () => {
    picker.show();
    const lineup: CarLineup = { karts: ['yellow', 'green'] };
    picker.setLineup(lineup);
    expect(swatch(picker.root, 'red').getAttribute('aria-pressed')).toBe('false');
    expect(swatch(picker.root, 'yellow').getAttribute('aria-pressed')).toBe('true');
    expect(picker.getLineup()).toEqual(lineup);
    expect(raceButton(picker.root).disabled).toBe(false);
  });

  it('setLineup tolerates a tampered DOM without crashing', () => {
    picker.show();
    picker.root
      .querySelectorAll('button[data-action="kart"], button[data-action="race"]')
      .forEach((button) => button.remove());
    expect(() => picker.setLineup(DEFAULT_LINEUP)).not.toThrow();
  });

  it('provides a preview slot for the shared kart canvas', () => {
    const slot = picker.getPreviewSlot();
    expect(slot).toBeInstanceOf(HTMLDivElement);
    expect(picker.root.contains(slot));
  });

  it('defaults to the full lineup', () => {
    expect(picker.getLineup()).toEqual(DEFAULT_LINEUP);
  });
});
