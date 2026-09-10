/** Available kart colors for the pre-race lineup. */
export type KartColor = 'red' | 'blue' | 'green' | 'yellow';

/** Ordered selection of karts that will race. */
export interface CarLineup {
  karts: KartColor[];
}

/** All kart colors in swatch order. */
export const KART_COLORS: readonly KartColor[] = ['red', 'blue', 'green', 'yellow'];

/** Every kart on by default, so a race is one tap away. */
export const DEFAULT_LINEUP: CarLineup = { karts: [...KART_COLORS] };

const MIN_KARTS = 2;
const MAX_KARTS = 4;

const STORAGE_KEY = 'race-it:lineup';

function isKartColor(value: unknown): value is KartColor {
  return typeof value === 'string' && KART_COLORS.includes(value as KartColor);
}

/**
 * Toggles a kart in or out of the lineup, returning a new lineup and never
 * mutating the input. The lineup can shrink below the valid range while the
 * child is choosing; validity is gated by {@link isLineupValid}.
 */
export function toggleKart(lineup: CarLineup, color: KartColor): CarLineup {
  if (lineup.karts.includes(color)) {
    return { karts: lineup.karts.filter((kart) => kart !== color) };
  }
  return { karts: [...lineup.karts, color] };
}

/** True when the lineup has between 2 and 4 distinct karts. */
export function isLineupValid(lineup: CarLineup): boolean {
  return (
    lineup.karts.length >= MIN_KARTS &&
    lineup.karts.length <= MAX_KARTS &&
    new Set(lineup.karts).size === lineup.karts.length
  );
}

/** Race kart slot per color (matches KARTS/KART_COLORS index order). */
export const kartColorIndex: Record<KartColor, number> = {
  red: 0,
  blue: 1,
  green: 2,
  yellow: 3,
};

/** Persists the lineup so the child's last choice is the next race's default. */
export function saveLineup(lineup: CarLineup): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lineup));
}

/**
 * Loads the persisted lineup, falling back to {@link DEFAULT_LINEUP} for
 * missing, corrupt, or out-of-range stored data so a race is never blocked.
 */
export function loadLineup(): CarLineup {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return DEFAULT_LINEUP;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_LINEUP;
    }
    const karts = (parsed as { karts?: unknown }).karts;
    if (!Array.isArray(karts) || karts.length < MIN_KARTS || karts.length > MAX_KARTS) {
      return DEFAULT_LINEUP;
    }
    if (!karts.every(isKartColor)) {
      return DEFAULT_LINEUP;
    }
    if (new Set(karts).size !== karts.length) {
      return DEFAULT_LINEUP;
    }
    return { karts: [...karts] };
  } catch {
    return DEFAULT_LINEUP;
  }
}
