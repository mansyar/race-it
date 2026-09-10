import type { CarLineup, KartColor } from '../race/lineup';
import { DEFAULT_LINEUP, isLineupValid, KART_COLORS, toggleKart } from '../race/lineup';

/**
 * Wordless full-screen picker for choosing which karts race.
 * Four big color swatches toggle karts in/out; RACE starts the race
 * once the lineup is valid; a symbol button returns to building.
 */
export interface CarPickerCallbacks {
  /** Called when the child confirms the lineup with RACE. */
  onRace: (lineup: CarLineup) => void;
  /** Called when the child taps back to return to building. */
  onBack: () => void;
  /** Called after each swatch toggle so main can play feedback sounds. */
  onToggle: (color: KartColor, selected: boolean) => void;
}

export interface CarPicker {
  /** Root element to mount in the page. */
  root: HTMLDivElement;
  /** Callbacks for assertions in tests. */
  callbacks: CarPickerCallbacks;
  /** Shows the overlay. */
  show: () => void;
  /** Hides the overlay. */
  hide: () => void;
  /** The currently selected lineup. */
  getLineup: () => CarLineup;
  /** Replaces the selection (used to restore the persisted lineup on open). */
  setLineup: (lineup: CarLineup) => void;
  /** Mount point for the shared kart preview canvas. */
  getPreviewSlot: () => HTMLDivElement;
}

/** Rebuilds swatch pressed states and RACE enablement from the lineup. */
function refresh(root: HTMLDivElement, lineup: CarLineup): void {
  const valid = isLineupValid(lineup);
  for (const color of KART_COLORS) {
    const swatch = root.querySelector<HTMLButtonElement>(`button[data-color="${color}"]`);
    if (swatch) {
      const selected = lineup.karts.includes(color);
      swatch.setAttribute('aria-pressed', String(selected));
      swatch.classList.toggle('selected', selected);
    }
  }
  const race = root.querySelector<HTMLButtonElement>('button[data-action="race"]');
  if (race) {
    race.disabled = !valid;
    race.classList.toggle('hint', !valid);
  }
}

/**
 * Builds the car picker overlay (hidden until show()).
 * @param callbacks - Race/back/toggle handlers wired by main.
 * @returns Handle with the root element, lineup accessors, and preview slot.
 */
export function createCarPicker(callbacks: CarPickerCallbacks): CarPicker {
  const root = document.createElement('div');
  root.className = 'car-picker hidden';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'car-picker__back';
  back.dataset.action = 'back';
  back.textContent = '✕';
  back.setAttribute('aria-label', 'Back to building');
  back.addEventListener('click', () => {
    callbacks.onBack();
  });
  root.appendChild(back);

  const stage = document.createElement('div');
  stage.className = 'car-picker__stage';
  root.appendChild(stage);

  const previewSlot = document.createElement('div');
  previewSlot.className = 'car-picker__previews';
  stage.appendChild(previewSlot);

  const grid = document.createElement('div');
  grid.className = 'car-picker__grid';
  stage.appendChild(grid);

  for (const color of KART_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.dataset.action = 'kart';
    swatch.dataset.color = color;
    swatch.setAttribute('aria-label', `${color} kart`);
    const disc = document.createElement('span');
    disc.className = 'swatch__disc';
    swatch.appendChild(disc);
    swatch.addEventListener('click', () => {
      const next = toggleKart(lineup, color);
      const selected = next.karts.includes(color);
      lineup = next;
      refresh(root, lineup);
      callbacks.onToggle(color, selected);
    });
    grid.appendChild(swatch);
  }

  const race = document.createElement('button');
  race.type = 'button';
  race.className = 'car-picker__race';
  race.dataset.action = 'race';
  race.textContent = 'RACE!';
  race.setAttribute('aria-label', 'Start the race');
  race.addEventListener('click', () => {
    if (!race.disabled) {
      callbacks.onRace(lineup);
    }
  });
  root.appendChild(race);

  let lineup: CarLineup = { karts: [...DEFAULT_LINEUP.karts] };
  refresh(root, lineup);

  return {
    root,
    callbacks,
    show(): void {
      root.classList.remove('hidden');
    },
    hide(): void {
      root.classList.add('hidden');
    },
    getLineup(): CarLineup {
      return lineup;
    },
    setLineup(next: CarLineup): void {
      lineup = { karts: [...next.karts] };
      refresh(root, lineup);
    },
    getPreviewSlot(): HTMLDivElement {
      return previewSlot;
    },
  };
}
