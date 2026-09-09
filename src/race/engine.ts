import type { LoopCell } from './path';
import { mulberry32, sampleUniform } from './rng';

/** World-space length of one track piece segment. */
export const SEGMENT_LENGTH = 2.0;
/** Simulated seconds of the pre-race countdown. */
export const COUNTDOWN_SECONDS = 3.0;
/** Lateral world-unit offset of each start lane from the path centerline. */
export const LANE_OFFSET = 0.35;
/** World-unit distance between start rows (behind the line). */
export const ROW_SPACING = 1.2;
/** Per-race speed multiplier band (±1.5%), tuned for close finishes. */
export const SPEED_BAND: readonly [number, number] = [0.985, 1.015];
/** Winner-to-runner-up gap in seconds that counts as a photo finish. */
export const PHOTO_FINISH_MARGIN = 0.25;
export const MIN_KARTS = 2;
export const MAX_KARTS = 4;

/** Target race duration in seconds used to auto-tune kart speed (mid of the 30-45 s band). */
export const TARGET_RACE_SECONDS = 37.5;

export type RaceState = 'idle' | 'countdown' | 'running' | 'finished';

export interface Kart {
  index: number;
  /** Lateral offset from the path centerline at the start line. */
  lane: number;
  /** Negative when the kart starts behind the start line; 0 sits on the line. */
  startProgress: number;
  /** World units per second along the path. */
  speed: number;
  /** Current distance along the path; reaches lapLength at the finish line. */
  progress: number;
  finished: boolean;
  finishTime: number | null;
}

export interface RaceResult {
  winnerIndex: number;
  /** Finish time per kart index; null while that kart is still racing. */
  finishTimes: Array<number | null>;
  /** True when the winner beat the runner-up by less than PHOTO_FINISH_MARGIN. */
  photoFinish: boolean;
}

export type RaceEvent = 'stateChange' | 'kartFinish' | 'finish';

export interface RaceEngineOptions {
  /** Seed for the deterministic mulberry32 rng (defaults to Math.random). */
  seed?: number;
  /** Injectable rng; overrides seed. */
  rng?: () => number;
  /** Number of karts, 2-4 inclusive (default 4). */
  kartCount?: number;
  countdownSeconds?: number;
  laneOffset?: number;
  rowSpacing?: number;
  speedBand?: readonly [number, number];
  photoFinishMargin?: number;
}

export interface RaceEngine {
  readonly state: RaceState;
  readonly karts: Kart[];
  /** Total lap length in world units: path.length * SEGMENT_LENGTH. */
  readonly lapLength: number;
  /** Live result; non-null once the winner crosses the finish line. */
  readonly result: RaceResult | null;
  on(event: 'stateChange', listener: (state: RaceState) => void): void;
  on(event: 'kartFinish', listener: (payload: { index: number; time: number }) => void): void;
  on(event: 'finish', listener: (result: RaceResult) => void): void;
  /** Advances the simulation by dt seconds (no-op while paused). */
  tick(dt: number): void;
  /** Starts the countdown; no-op unless the race is idle. */
  start(): void;
}

/**
 * Creates the pure-logic race engine for an ordered loop path.
 * The engine owns the full lifecycle (countdown -> running -> finished) so
 * presentation layers stay thin. Kart speeds are rolled per race from the
 * injectable rng, tuned so races stay close and any kart can win.
 */
export function createRaceEngine(path: LoopCell[], options: RaceEngineOptions = {}): RaceEngine {
  const kartCount = options.kartCount ?? MAX_KARTS;
  if (kartCount < MIN_KARTS || kartCount > MAX_KARTS) {
    throw new RangeError(`kartCount must be between ${MIN_KARTS} and ${MAX_KARTS}`);
  }
  const countdownSeconds = options.countdownSeconds ?? COUNTDOWN_SECONDS;
  const laneOffset = options.laneOffset ?? LANE_OFFSET;
  const rowSpacing = options.rowSpacing ?? ROW_SPACING;
  const speedBand = options.speedBand ?? SPEED_BAND;
  const photoFinishMargin = options.photoFinishMargin ?? PHOTO_FINISH_MARGIN;
  const rng = options.rng ?? (options.seed !== undefined ? mulberry32(options.seed) : Math.random);

  const lapLength = path.length * SEGMENT_LENGTH;
  const baseSpeed = lapLength / TARGET_RACE_SECONDS;

  let state: RaceState = 'idle';
  const paused = false;
  let countdownRemaining = 0;
  let elapsed = 0;
  let winnerIndex: number | null = null;
  let runnerUpIndex: number | null = null;
  let result: RaceResult | null = null;
  const karts = rollKarts(kartCount, laneOffset, rowSpacing, baseSpeed, speedBand, rng);

  const listeners: Record<RaceEvent, Array<(payload: unknown) => void>> = {
    stateChange: [],
    kartFinish: [],
    finish: [],
  };

  function emit(event: RaceEvent, payload: unknown): void {
    for (const listener of listeners[event]) {
      listener(payload);
    }
  }

  function allFinished(): boolean {
    return karts.every((kart) => kart.finished);
  }

  function tick(dt: number): void {
    if (paused) {
      return;
    }
    let remaining = dt;
    if (state === 'countdown') {
      const consumed = Math.min(countdownRemaining, remaining);
      countdownRemaining -= consumed;
      remaining -= consumed;
      if (countdownRemaining <= 0) {
        state = 'running';
        emit('stateChange', state);
      }
    }
    if (state !== 'running' && !(state === 'finished' && !allFinished())) {
      return;
    }
    elapsed += remaining;
    for (const kart of karts) {
      if (kart.finished) {
        continue;
      }
      kart.progress += kart.speed * remaining;
      if (kart.progress >= lapLength) {
        kart.finished = true;
        kart.finishTime = elapsed;
        emit('kartFinish', { index: kart.index, time: elapsed });
        if (winnerIndex === null) {
          winnerIndex = kart.index;
          result = {
            winnerIndex,
            finishTimes: karts.map((entry) => entry.finishTime),
            photoFinish: false,
          };
          emit('finish', result);
        } else if (result !== null) {
          result.finishTimes[kart.index] = kart.finishTime;
          if (runnerUpIndex === null && kart.index !== winnerIndex) {
            runnerUpIndex = kart.index;
            const runnerUpTime = kart.finishTime;
            const winnerTime = result.finishTimes[winnerIndex];
            if (typeof runnerUpTime === 'number' && typeof winnerTime === 'number') {
              result.photoFinish = runnerUpTime - winnerTime < photoFinishMargin;
            }
          }
        }
        if (state === 'running') {
          state = 'finished';
          emit('stateChange', state);
        }
      }
    }
  }

  function start(): void {
    if (state !== 'idle') {
      return;
    }
    countdownRemaining = countdownSeconds;
    state = 'countdown';
    emit('stateChange', state);
  }

  return {
    get state() {
      return state;
    },
    get karts() {
      return karts;
    },
    get lapLength() {
      return lapLength;
    },
    get result() {
      return result;
    },
    on(event, listener) {
      listeners[event].push(listener as (payload: unknown) => void);
    },
    tick,
    start,
  };
}

function rollKarts(
  kartCount: number,
  laneOffset: number,
  rowSpacing: number,
  baseSpeed: number,
  speedBand: readonly [number, number],
  rng: () => number,
): Kart[] {
  return Array.from({ length: kartCount }, (_, index) => {
    const row = Math.floor(index / 2);
    const isLastOfOddCount = index === kartCount - 1 && kartCount % 2 === 1;
    const lane = isLastOfOddCount ? 0 : index % 2 === 0 ? laneOffset : -laneOffset;
    const factor = sampleUniform(speedBand[0], speedBand[1], rng);
    const startProgress = row === 0 ? 0 : -row * rowSpacing;
    return {
      index,
      lane,
      startProgress,
      speed: baseSpeed * factor,
      progress: startProgress,
      finished: false,
      finishTime: null,
    };
  });
}
