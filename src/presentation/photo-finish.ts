/**
 * Photo-finish drama tracker: watches live kart samples for a closing gap on
 * the final approach and choreographs a brief slow-motion sequence, releasing
 * when the result's photo-finish flag resolves. Flag-confirmed accents (flash,
 * cheer, camera push) fire exactly once via the one-shot `accent` result.
 *
 * Pure logic — no DOM, no rendering, no audio. The presentation layer scales
 * each frame delta by `timeScale` and reacts to the `accent` flag.
 */

/** Fraction of the lap before the line that counts as the final approach. */
export const PREDICTION_WINDOW = 0.1;

/** Estimated leader-to-rival arrival gap (seconds) that arms the sequence. */
export const PREDICTION_MARGIN_SECONDS = 0.35;

/** Slowest time scale the sequence may apply (0.35 ≈ three times slower). */
export const SLOWMO_FLOOR = 0.35;

/** Seconds for the ease from full speed down to the floor once armed. */
export const SLOWMO_EASE_SECONDS = 0.35;

/** Seconds for the ease from the floor back to full speed on release. */
export const SLOWMO_RELEASE_SECONDS = 0.5;

/** Safety bound: auto-release when the flag has not resolved within this time. */
export const SLOWMO_HOLD_LIMIT_SECONDS = 6;

/** One kart's live state, as sampled from the race engine each frame. */
export interface PhotoFinishSample {
  /** Distance along the lap in world units; may exceed lapLength just after the line. */
  progress: number;
  /** Current pace in world units per second. */
  pace: number;
  /** True once the kart has crossed the line; any finished sample disables projection. */
  finished: boolean;
}

/** Per-frame input for {@link PhotoFinishTracker.tick}. */
export interface PhotoFinishTickInput {
  /** Frame delta in seconds, before any scaling. */
  dt: number;
  /** Total lap length in world units. */
  lapLength: number;
  /** Live kart samples; list order is irrelevant. */
  samples: readonly PhotoFinishSample[];
  /** null until the result's photoFinish flag is authoritative (runner-up crossed). */
  photoFinish: boolean | null;
}

/** Per-frame output of {@link PhotoFinishTracker.tick}. */
export interface PhotoFinishTickResult {
  /** Time scale for this frame, clamped to [SLOWMO_FLOOR, 1]. */
  timeScale: number;
  /** True only on the single frame the confirmed photo finish's accents fire. */
  accent: boolean;
}

/** Predictive slow-motion plus flag-confirmed accents for one race. */
export interface PhotoFinishTracker {
  tick(input: PhotoFinishTickInput): PhotoFinishTickResult;
  /** True from the moment the sequence arms until {@link reset}. */
  readonly armed: boolean;
  /** Clears all state for the next race (RACE AGAIN, Build Again, quit). */
  reset(): void;
}

function remainingDistance(sample: PhotoFinishSample, lapLength: number): number {
  return Math.max(0, lapLength - sample.progress);
}

function arrivalSeconds(sample: PhotoFinishSample, lapLength: number): number {
  if (sample.pace <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return remainingDistance(sample, lapLength) / sample.pace;
}

/**
 * Estimates the leader-to-closest-rival arrival gap in seconds from live
 * progress and pace — a projection of the finish margin. Returns Infinity when
 * no projection is possible: fewer than two karts, a kart without pace, or any
 * kart already finished (after the first crossing the result's flag rules).
 */
export function estimateGapSeconds(
  samples: readonly PhotoFinishSample[],
  lapLength: number,
): number {
  if (samples.length < 2 || samples.some((sample) => sample.finished)) {
    return Number.POSITIVE_INFINITY;
  }
  if (samples.every((sample) => sample.pace <= 0)) {
    return Number.POSITIVE_INFINITY;
  }
  let leader = Number.POSITIVE_INFINITY;
  let rival = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const arrival = arrivalSeconds(sample, lapLength);
    if (arrival < leader) {
      rival = leader;
      leader = arrival;
    } else if (arrival < rival) {
      rival = arrival;
    }
  }
  return rival - leader;
}

/** Remaining lap distance of the kart closest to the line (Infinity when empty). */
function leaderRemainingDistance(samples: readonly PhotoFinishSample[], lapLength: number): number {
  let bestArrival = Number.POSITIVE_INFINITY;
  let remaining = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const arrival = arrivalSeconds(sample, lapLength);
    if (arrival < bestArrival) {
      bestArrival = arrival;
      remaining = remainingDistance(sample, lapLength);
    }
  }
  return remaining;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

type SequencePhase = 'idle' | 'easing' | 'holding' | 'releasing';

/**
 * Creates the per-race photo-finish tracker. Deterministic and allocation-free
 * per frame; the caller feeds live samples plus the resolved flag and applies
 * the returned time scale to both the simulation and the race visuals.
 */
export function createPhotoFinishTracker(): PhotoFinishTracker {
  let armed = false;
  let phase: SequencePhase = 'idle';
  let timeScale = 1;
  let sequenceElapsed = 0;
  let releaseElapsed = 0;
  let releaseFrom = SLOWMO_FLOOR;
  let accentFired = false;

  function tick(input: PhotoFinishTickInput): PhotoFinishTickResult {
    const { dt, lapLength, samples, photoFinish } = input;
    let accent = false;
    if (photoFinish === true && !accentFired) {
      accentFired = true;
      accent = true;
    }

    if (!armed && photoFinish === null) {
      const gap = estimateGapSeconds(samples, lapLength);
      const leaderRemaining = leaderRemainingDistance(samples, lapLength);
      if (gap <= PREDICTION_MARGIN_SECONDS && leaderRemaining <= PREDICTION_WINDOW * lapLength) {
        armed = true;
        phase = 'easing';
        sequenceElapsed = 0;
        releaseElapsed = 0;
      }
    }

    if (armed) {
      sequenceElapsed += dt;
      if (phase === 'easing') {
        if (photoFinish !== null) {
          phase = 'releasing';
          releaseElapsed = 0;
          releaseFrom = timeScale;
        } else if (sequenceElapsed >= SLOWMO_EASE_SECONDS) {
          timeScale = SLOWMO_FLOOR;
          phase = 'holding';
        } else {
          timeScale = 1 - (1 - SLOWMO_FLOOR) * smoothstep(sequenceElapsed / SLOWMO_EASE_SECONDS);
        }
      } else if (phase === 'holding') {
        timeScale = SLOWMO_FLOOR;
        if (photoFinish !== null || sequenceElapsed >= SLOWMO_HOLD_LIMIT_SECONDS) {
          phase = 'releasing';
          releaseElapsed = 0;
          releaseFrom = timeScale;
        }
      }
      if (phase === 'releasing') {
        releaseElapsed += dt;
        if (releaseElapsed >= SLOWMO_RELEASE_SECONDS) {
          timeScale = 1;
          phase = 'idle';
        } else {
          const eased = smoothstep(releaseElapsed / SLOWMO_RELEASE_SECONDS);
          timeScale = releaseFrom + (1 - releaseFrom) * eased;
        }
      }
    }

    return { timeScale, accent };
  }

  return {
    tick,
    get armed() {
      return armed;
    },
    reset() {
      armed = false;
      phase = 'idle';
      timeScale = 1;
      sequenceElapsed = 0;
      releaseElapsed = 0;
      releaseFrom = SLOWMO_FLOOR;
      accentFired = false;
    },
  };
}
