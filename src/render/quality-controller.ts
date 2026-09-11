/**
 * Adaptive quality controller. Samples frame deltas from the render loop and
 * steps a quality tier down when frame rate persistently drops below target,
 * or back up once sustained headroom returns.
 */

/** Quality tiers ordered from best visuals (high) to most forgiving (low). */
export type QualityTier = 'high' | 'mid' | 'low';

/** Minimal storage surface; localStorage satisfies it in the browser. */
export interface QualityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage key for the persisted quality tier. */
export const QUALITY_STORAGE_KEY = 'race-it:quality';

/** All tiers in descending quality order. */
export const QUALITY_TIERS: readonly QualityTier[] = ['high', 'mid', 'low'];

/** Rolling window (seconds) used to detect a frame-rate drop. */
export const DEGRADE_WINDOW_SECONDS = 2;

/** Average fps below this within the degrade window steps quality down. */
export const DEGRADE_FPS = 55;

/** Sustained window (seconds) required before stepping quality back up. */
export const RECOVER_WINDOW_SECONDS = 10;

/** Average fps above this across the recover window steps quality up. */
export const RECOVER_FPS = 58;

/** Live quality controller fed one frame delta per render tick. */
export interface QualityController {
  /** Current tier. */
  readonly tier: QualityTier;
  /** Feeds one frame delta in seconds; invalid deltas are ignored. */
  tick(dt: number): void;
}

/** Options for createQualityController. */
export interface QualityControllerOptions {
  /** Query string (e.g. location.search); `tier=low|mid|high` forces a tier. */
  search?: string;
  /** Storage for the persisted tier; failures never throw. */
  storage?: QualityStorage | null;
  /** Called with the new tier whenever sampling changes it. */
  onChange?: (tier: QualityTier) => void;
}

function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && QUALITY_TIERS.includes(value as QualityTier);
}

/** Parses a `tier=` override from a search string, or null when absent/invalid. */
export function parseForcedTier(search: string): QualityTier | null {
  const value = new URLSearchParams(search).get('tier')?.toLowerCase();
  return value !== undefined && isQualityTier(value) ? value : null;
}

/** Reads the persisted tier, falling back to `high` on missing/corrupt storage. */
export function readStoredTier(storage?: QualityStorage | null): QualityTier {
  if (storage === undefined || storage === null) {
    return 'high';
  }
  try {
    const value = storage.getItem(QUALITY_STORAGE_KEY);
    return value !== null && isQualityTier(value) ? value : 'high';
  } catch {
    return 'high';
  }
}

/** Resolves the boot tier: forced URL override first, then storage, then high. */
export function resolveStartTier(search: string, storage?: QualityStorage | null): QualityTier {
  return parseForcedTier(search) ?? readStoredTier(storage);
}

interface FpsWindow {
  push(dt: number): void;
  clear(): void;
  readonly coveredSeconds: number;
  readonly fps: number;
}

/** Sliding window of recent frame deltas covering about `maxSeconds`. */
function createFpsWindow(maxSeconds: number): FpsWindow {
  const frames: number[] = [];
  let head = 0;
  let sum = 0;
  return {
    push(dt: number): void {
      frames.push(dt);
      sum += dt;
      while (frames.length - head > 1) {
        const oldest = frames[head];
        if (oldest === undefined || sum - oldest < maxSeconds) {
          break;
        }
        sum -= oldest;
        head += 1;
      }
      if (head > 512 && head * 2 > frames.length) {
        frames.splice(0, head);
        head = 0;
      }
    },
    clear(): void {
      frames.length = 0;
      head = 0;
      sum = 0;
    },
    get coveredSeconds(): number {
      return sum;
    },
    get fps(): number {
      const count = frames.length - head;
      return count > 0 ? count / sum : 0;
    },
  };
}

/**
 * Creates a quality controller. The starting tier is forced by the URL override
 * when present, otherwise restored from storage. While forced, sampling is
 * disabled and nothing is persisted.
 */
export function createQualityController(options: QualityControllerOptions = {}): QualityController {
  const { search = '', storage = null, onChange } = options;
  const forced = parseForcedTier(search);
  let tier = forced ?? readStoredTier(storage);
  const degradeWindow = createFpsWindow(DEGRADE_WINDOW_SECONDS);
  const recoverWindow = createFpsWindow(RECOVER_WINDOW_SECONDS);

  function change(next: QualityTier): void {
    tier = next;
    try {
      storage?.setItem(QUALITY_STORAGE_KEY, next);
    } catch {
      // Quality still adapts in memory when persistence is unavailable.
    }
    onChange?.(next);
  }

  function tick(dt: number): void {
    if (forced !== null || !Number.isFinite(dt) || dt <= 0) {
      return;
    }
    degradeWindow.push(dt);
    recoverWindow.push(dt);

    const index = QUALITY_TIERS.indexOf(tier);
    if (degradeWindow.coveredSeconds >= DEGRADE_WINDOW_SECONDS && degradeWindow.fps < DEGRADE_FPS) {
      const next = QUALITY_TIERS[Math.min(index + 1, QUALITY_TIERS.length - 1)];
      if (next !== undefined && next !== tier) {
        change(next);
        degradeWindow.clear();
        recoverWindow.clear();
      }
      return;
    }
    if (recoverWindow.coveredSeconds >= RECOVER_WINDOW_SECONDS && recoverWindow.fps > RECOVER_FPS) {
      const next = QUALITY_TIERS[Math.max(index - 1, 0)];
      if (next !== undefined && next !== tier) {
        change(next);
        degradeWindow.clear();
        recoverWindow.clear();
      }
    }
  }

  return {
    get tier(): QualityTier {
      return tier;
    },
    tick,
  };
}
