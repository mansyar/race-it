import { describe, expect, it } from 'vitest';
import { createRaceEngine, type RaceEngine, type RaceResult } from '../race/engine';
import type { LoopCell } from '../race/path';
import {
  createPhotoFinishTracker,
  estimateGapSeconds,
  type PhotoFinishSample,
  type PhotoFinishTickResult,
  type PhotoFinishTracker,
  PREDICTION_MARGIN_SECONDS,
  PREDICTION_WINDOW,
  SLOWMO_EASE_SECONDS,
  SLOWMO_FLOOR,
  SLOWMO_HOLD_LIMIT_SECONDS,
  SLOWMO_RELEASE_SECONDS,
} from './photo-finish';

/**
 * Photo-finish drama contracts: predictive arming from live gap estimates, the
 * slow-motion ramp, flag-confirmed accents, reset integrity — plus an
 * engine-backed sweep proving every true photo finish arms before the winner
 * crosses while false arms stay bounded. Slots never enter the estimate, so
 * grid position or sample order cannot bias it.
 */

/** Lap length for synthetic unit-level scenarios (world units). */
const LAP = 50;
/** One 60 fps frame; unit scenarios advance the tracker at this rate. */
const FRAME = 1 / 60;

function sample(progress: number, pace = 1, finished = false): PhotoFinishSample {
  return { progress, pace, finished };
}

/**
 * Two synthetic karts: the leader holds `remaining` units to the line and the
 * rival trails by `gapSeconds` in arrival time at the shared pace.
 */
function pairAt(remaining: number, gapSeconds: number, pace = 1): PhotoFinishSample[] {
  const leaderProgress = LAP - remaining;
  return [sample(leaderProgress, pace), sample(leaderProgress - gapSeconds * pace, pace)];
}

/** Leader across the line, rival a fifth of a second behind: the flag moment. */
function crossedPair(): PhotoFinishSample[] {
  return [sample(LAP, 1, true), sample(LAP - 0.2, 1)];
}

function tick(
  tracker: PhotoFinishTracker,
  samples: readonly PhotoFinishSample[],
  photoFinish: boolean | null = null,
  dt = FRAME,
): PhotoFinishTickResult {
  return tracker.tick({ dt, lapLength: LAP, samples, photoFinish });
}

function tickTimes(
  tracker: PhotoFinishTracker,
  samples: readonly PhotoFinishSample[],
  steps: number,
): void {
  for (let i = 0; i < steps; i++) {
    tick(tracker, samples);
  }
}

/** A leader inside the final approach window with a gap well within margin. */
function closeSamples(): PhotoFinishSample[] {
  return pairAt(LAP * PREDICTION_WINDOW * 0.8, PREDICTION_MARGIN_SECONDS * 0.6);
}

describe('estimateGapSeconds', () => {
  it('estimates the arrival gap from remaining distance and pace', () => {
    expect(estimateGapSeconds([sample(45, 2), sample(44, 2)], LAP)).toBeCloseTo(0.5, 10);
  });

  it('counts a finished kart as arrived at zero remaining time', () => {
    expect(estimateGapSeconds([sample(LAP, 2, true), sample(48, 2)], LAP)).toBeCloseTo(1, 10);
  });

  it('is zero once every kart has finished', () => {
    expect(estimateGapSeconds([sample(LAP, 2, true), sample(LAP, 2, true)], LAP)).toBe(0);
  });

  it('is invariant to sample order, so list order cannot bias it', () => {
    const forward = estimateGapSeconds([sample(45.6, 1.1), sample(45.2, 1.1)], LAP);
    const reversed = estimateGapSeconds([sample(45.2, 1.1), sample(45.6, 1.1)], LAP);
    expect(forward).toBe(reversed);
    expect(forward).toBeGreaterThan(0);
  });

  it('reports an unbounded gap when a racing kart has no pace', () => {
    expect(estimateGapSeconds([sample(45, 0), sample(44, 1)], LAP)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('createPhotoFinishTracker arming', () => {
  it('arms when the leader is inside the final approach window with the gap within margin', () => {
    const tracker = createPhotoFinishTracker();
    const out = tick(tracker, closeSamples());
    expect(tracker.armed).toBe(true);
    expect(out.timeScale).toBeLessThan(1);
    expect(out.timeScale).toBeGreaterThanOrEqual(SLOWMO_FLOOR);
  });

  it('arms at the window and margin boundaries, just inside', () => {
    const tracker = createPhotoFinishTracker();
    tick(
      tracker,
      pairAt(LAP * PREDICTION_WINDOW * 0.999, PREDICTION_MARGIN_SECONDS * 0.999),
    );
    expect(tracker.armed).toBe(true);
  });

  it('does not arm just outside the window or the margin', () => {
    const outsideWindow = createPhotoFinishTracker();
    tick(outsideWindow, pairAt(LAP * PREDICTION_WINDOW * 1.001, PREDICTION_MARGIN_SECONDS * 0.5));
    expect(outsideWindow.armed).toBe(false);
    const outsideGap = createPhotoFinishTracker();
    tick(outsideGap, pairAt(LAP * PREDICTION_WINDOW * 0.5, PREDICTION_MARGIN_SECONDS * 1.001));
    expect(outsideGap.armed).toBe(false);
  });

  it('does not arm on a runaway and full speed stays untouched', () => {
    const tracker = createPhotoFinishTracker();
    const runaway = pairAt(LAP * PREDICTION_WINDOW * 0.8, PREDICTION_MARGIN_SECONDS * 4);
    for (let i = 0; i < 20; i++) {
      expect(tick(tracker, runaway).timeScale).toBe(1);
    }
    expect(tracker.armed).toBe(false);
  });

  it('stays armed once armed, even when the gap estimate widens (no retraction)', () => {
    const tracker = createPhotoFinishTracker();
    tick(tracker, closeSamples());
    tick(tracker, pairAt(LAP * PREDICTION_WINDOW * 0.8, PREDICTION_MARGIN_SECONDS * 3));
    expect(tracker.armed).toBe(true);
  });

  it('measures the gap against the closest rival, not the furthest', () => {
    const close = createPhotoFinishTracker();
    tick(close, [sample(47, 1), sample(46.8, 1), sample(45.1, 1)]);
    expect(close.armed).toBe(true);
    const spread = createPhotoFinishTracker();
    tick(spread, [sample(47, 1), sample(45.8, 1), sample(45.1, 1)]);
    expect(spread.armed).toBe(false);
  });
});

describe('createPhotoFinishTracker slow-motion ramp', () => {
  it('eases from full speed to the floor and clamps', () => {
    const tracker = createPhotoFinishTracker();
    const scales: number[] = [];
    const ramp: number[] = [];
    tick(tracker, closeSamples());
    expect(tracker.armed).toBe(true);
    const steps = Math.ceil(SLOWMO_EASE_SECONDS / FRAME) + 2;
    for (let i = 0; i < steps; i++) {
      const { timeScale } = tick(tracker, closeSamples());
      scales.push(timeScale);
      if (timeScale > SLOWMO_FLOOR) {
        ramp.push(timeScale);
      }
    }
    expect(ramp.length).toBeGreaterThan(1);
    expect(ramp[0] ?? 1).toBeLessThan(1);
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i] ?? SLOWMO_FLOOR).toBeLessThanOrEqual((ramp[i - 1] ?? 1) + 1e-9);
    }
    expect(ramp.length).toBeLessThan(scales.length);
    for (const scale of scales) {
      expect(scale).toBeGreaterThanOrEqual(SLOWMO_FLOOR);
      expect(scale).toBeLessThanOrEqual(1);
    }
    expect(scales[scales.length - 1] ?? 1).toBeCloseTo(SLOWMO_FLOOR, 2);
  });

  it('holds the floor through the crossing until the flag resolves', () => {
    const tracker = createPhotoFinishTracker();
    tick(tracker, closeSamples());
    tickTimes(tracker, closeSamples(), Math.ceil(SLOWMO_EASE_SECONDS / FRAME) + 2);
    const crossed = crossedPair();
    for (let i = 0; i < 30; i++) {
      expect(tick(tracker, crossed).timeScale).toBeCloseTo(SLOWMO_FLOOR, 2);
    }
    expect(tracker.armed).toBe(true);
  });

  it('releases to full speed once the flag resolves and never overshoots', () => {
    const tracker = createPhotoFinishTracker();
    tick(tracker, closeSamples());
    tickTimes(tracker, closeSamples(), Math.ceil(SLOWMO_EASE_SECONDS / FRAME) + 2);
    const crossed = crossedPair();
    const confirmed = tick(tracker, crossed, true);
    expect(confirmed.accent).toBe(true);
    const steps = Math.ceil(SLOWMO_RELEASE_SECONDS / FRAME) + 2;
    for (let i = 0; i < steps; i++) {
      const { timeScale, accent } = tick(tracker, crossed, true);
      expect(accent).toBe(false);
      expect(timeScale).toBeGreaterThanOrEqual(SLOWMO_FLOOR);
      expect(timeScale).toBeLessThanOrEqual(1);
    }
    expect(tick(tracker, crossed, true).timeScale).toBe(1);
  });

  it('auto-releases after the bounded hold when the flag never resolves', () => {
    const tracker = createPhotoFinishTracker();
    const dt = 0.1;
    let accents = 0;
    const armTick = tick(tracker, closeSamples(), null, dt);
    accents += armTick.accent ? 1 : 0;
    expect(tracker.armed).toBe(true);
    const steps = Math.ceil((SLOWMO_HOLD_LIMIT_SECONDS + SLOWMO_RELEASE_SECONDS) / dt) + 2;
    let last = armTick;
    for (let i = 0; i < steps; i++) {
      last = tick(tracker, closeSamples(), null, dt);
      accents += last.accent ? 1 : 0;
    }
    expect(accents).toBe(0);
    expect(last.timeScale).toBeCloseTo(1, 5);
  });
});

describe('createPhotoFinishTracker flag-confirmed accents', () => {
  it('fires exactly one accent, on the first tick the flag confirms', () => {
    const tracker = createPhotoFinishTracker();
    const crossed = crossedPair();
    for (let i = 0; i < 5; i++) {
      expect(tick(tracker, crossed).accent).toBe(false);
    }
    expect(tick(tracker, crossed, true).accent).toBe(true);
    for (let i = 0; i < 10; i++) {
      expect(tick(tracker, crossed, true).accent).toBe(false);
    }
  });

  it('never fires for a confirmed non-photo finish', () => {
    const tracker = createPhotoFinishTracker();
    for (let i = 0; i < 30; i++) {
      expect(tick(tracker, closeSamples(), false).accent).toBe(false);
    }
  });

  it('fires the accent even when the predictor never armed (flag is authoritative)', () => {
    const tracker = createPhotoFinishTracker();
    const runaway = pairAt(LAP * PREDICTION_WINDOW * 0.8, PREDICTION_MARGIN_SECONDS * 4);
    for (let i = 0; i < 10; i++) {
      expect(tick(tracker, runaway).accent).toBe(false);
    }
    expect(tracker.armed).toBe(false);
    expect(tick(tracker, runaway, true).accent).toBe(true);
    expect(tick(tracker, runaway, true).accent).toBe(false);
  });
});

describe('createPhotoFinishTracker reset', () => {
  it('clears armed state and restores full speed', () => {
    const tracker = createPhotoFinishTracker();
    tick(tracker, closeSamples());
    expect(tracker.armed).toBe(true);
    tracker.reset();
    expect(tracker.armed).toBe(false);
    const idle = tick(tracker, pairAt(LAP * 0.5, PREDICTION_MARGIN_SECONDS * 4));
    expect(idle.timeScale).toBe(1);
    expect(tracker.armed).toBe(false);
  });

  it('lets the next race fire its own single accent', () => {
    const tracker = createPhotoFinishTracker();
    const crossed = crossedPair();
    expect(tick(tracker, crossed, true).accent).toBe(true);
    tracker.reset();
    expect(tick(tracker, crossed, true).accent).toBe(true);
    expect(tick(tracker, crossed, true).accent).toBe(false);
  });
});

describe('engine-backed prediction sweep', () => {
  const SEEDS = 300;
  const TICK_DT = 0.05;
  const DEMO_CELLS = 14;
  const KART_COUNTS = [2, 3, 4] as const;
  /** Share of sweep races allowed to arm without a confirmed photo finish. */
  const FALSE_ARM_BOUND = 0.3;

  function loopOfLength(n: number): LoopCell[] {
    return Array.from({ length: n }, (_, i) => ({
      x: i,
      y: 0,
      type: 'straight' as const,
      orientation: 0 as const,
    }));
  }

  function raceResult(engine: RaceEngine): RaceResult {
    const result = engine.result;
    if (result === null) {
      throw new Error('race result expected after the winner crosses');
    }
    return result;
  }

  interface PredictionOutcome {
    photoFinish: boolean;
    armedBeforeCrossing: boolean;
    armedAtAll: boolean;
    accents: number;
  }

  function runRace(seed: number, kartCount: number): PredictionOutcome {
    const engine = createRaceEngine(loopOfLength(DEMO_CELLS), { kartCount, seed });
    const tracker = createPhotoFinishTracker();
    let winnerCrossed = false;
    let armedBeforeCrossing = false;
    let armedAtAll = false;
    let accents = 0;
    const feed = (): void => {
      const finishedCount = engine.karts.filter((kart) => kart.finished).length;
      const resolved = finishedCount >= 2 ? raceResult(engine).photoFinish : null;
      const out = tracker.tick({
        dt: TICK_DT,
        lapLength: engine.lapLength,
        samples: engine.karts.map((kart) => ({
          progress: kart.progress,
          pace: kart.speed,
          finished: kart.finished,
        })),
        photoFinish: resolved,
      });
      if (out.accent) {
        accents += 1;
      }
      if (tracker.armed) {
        armedAtAll = true;
        if (!winnerCrossed) {
          armedBeforeCrossing = true;
        }
      }
    };
    engine.start();
    let t = 0;
    while (!engine.karts.every((kart) => kart.finished) && t < 120) {
      feed();
      engine.tick(TICK_DT);
      if (engine.result !== null) {
        winnerCrossed = true;
      }
      t += TICK_DT;
    }
    // Observe the resolved flag even when the race just ended this tick.
    feed();
    return {
      photoFinish: raceResult(engine).photoFinish,
      armedBeforeCrossing,
      armedAtAll,
      accents,
    };
  }

  it(
    'arms every true photo finish before the winner crosses and bounds false arms',
    { timeout: 30_000 },
    () => {
      let races = 0;
      let trueRaces = 0;
      let trueArmed = 0;
      let falseArms = 0;
      let missingAccents = 0;
      let leakedAccents = 0;
      for (const kartCount of KART_COUNTS) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const outcome = runRace(seed, kartCount);
          races += 1;
          if (outcome.photoFinish) {
            trueRaces += 1;
            if (outcome.armedBeforeCrossing) {
              trueArmed += 1;
            }
            if (outcome.accents !== 1) {
              missingAccents += 1;
            }
          } else {
            if (outcome.armedAtAll) {
              falseArms += 1;
            }
            if (outcome.accents !== 0) {
              leakedAccents += 1;
            }
          }
        }
      }
      expect(trueRaces).toBeGreaterThan(0);
      expect(
        trueArmed,
        `armed ${trueArmed}/${trueRaces} true photo finishes before the crossing`,
      ).toBe(trueRaces);
      expect(missingAccents, `${missingAccents} true photo finishes missed their accent`).toBe(0);
      expect(leakedAccents, `${leakedAccents} non-photo finishes leaked an accent`).toBe(0);
      const falseArmRate = falseArms / races;
      expect(
        falseArmRate,
        `false-arm rate ${(falseArmRate * 100).toFixed(1)}% (${falseArms}/${races}) above the bound`,
      ).toBeLessThanOrEqual(FALSE_ARM_BOUND);
    },
  );
});
