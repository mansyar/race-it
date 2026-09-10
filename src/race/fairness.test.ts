import { describe, expect, it } from 'vitest';
import { createRaceEngine, type RaceEngine, type RaceResult } from './engine';
import type { LoopCell } from './path';

/**
 * Fairness regression harness: fixed-seed race sweeps asserting the start grid
 * cannot bias outcomes. Distance normalization (pace folds in the grid offset)
 * must keep every slot's win share in band and races close, with deterministic
 * reproduction for the same seed.
 */
const SEEDS = 400;
const TICK_DT = 0.05;
const MAX_TICK_SECONDS = 120;
const LOOP_SIZES = [8, 14, 48] as const;
const KART_COUNTS = [2, 3, 4] as const;
const DEMO_LOOP_CELLS = 14;

type RaceOutcome = {
  winnerIndex: number;
  finishTimes: number[];
  photoFinish: boolean;
  firstFinish: number;
};

type SweepSummary = {
  cells: number;
  kartCount: number;
  races: number;
  wins: number[];
  photoFinishes: number;
  firstFinishMin: number;
  firstFinishMax: number;
};

function loopOfLength(n: number): LoopCell[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i,
    y: 0,
    type: 'straight' as const,
    orientation: 0 as const,
  }));
}

function tickUntilFinished(engine: RaceEngine): void {
  let t = 0;
  while (!engine.karts.every((kart) => kart.finished) && t < MAX_TICK_SECONDS) {
    engine.tick(TICK_DT);
    t += TICK_DT;
  }
}

function requireResult(engine: RaceEngine): RaceResult {
  if (engine.result === null) {
    throw new Error('race result expected after finish');
  }
  return engine.result;
}

function requireNumber(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined) {
    throw new Error(`expected ${label} to be a number`);
  }
  return value;
}

function runRace(cells: number, kartCount: number, seed: number): RaceOutcome {
  const engine = createRaceEngine(loopOfLength(cells), { kartCount, seed });
  engine.start();
  tickUntilFinished(engine);
  if (!engine.karts.every((kart) => kart.finished)) {
    throw new Error(
      `race did not finish within ${MAX_TICK_SECONDS}s (cells=${cells}, karts=${kartCount}, seed=${seed})`,
    );
  }
  const result = requireResult(engine);
  const sorted = [...result.finishTimes].sort((a, b) => a - b);
  const firstFinish = requireNumber(sorted[0], 'first finish time');
  return {
    winnerIndex: result.winnerIndex,
    finishTimes: [...result.finishTimes],
    photoFinish: result.photoFinish,
    firstFinish,
  };
}

const sweeps = new Map<string, SweepSummary>();

function sweep(cells: number, kartCount: number): SweepSummary {
  const key = `${cells}x${kartCount}`;
  const cached = sweeps.get(key);
  if (cached) {
    return cached;
  }
  const wins = new Array<number>(kartCount).fill(0);
  let photoFinishes = 0;
  let firstFinishMin = Number.POSITIVE_INFINITY;
  let firstFinishMax = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const outcome = runRace(cells, kartCount, seed);
    wins[outcome.winnerIndex] = (wins[outcome.winnerIndex] ?? 0) + 1;
    if (outcome.photoFinish) {
      photoFinishes += 1;
    }
    if (outcome.firstFinish < firstFinishMin) {
      firstFinishMin = outcome.firstFinish;
    }
    if (outcome.firstFinish > firstFinishMax) {
      firstFinishMax = outcome.firstFinish;
    }
  }
  const summary: SweepSummary = {
    cells,
    kartCount,
    races: SEEDS,
    wins,
    photoFinishes,
    firstFinishMin,
    firstFinishMax,
  };
  sweeps.set(key, summary);
  return summary;
}

describe('start-grid fairness (fixed-seed simulation sweep)', () => {
  it('lets back-row karts win the demo loop (14 cells, 4 karts)', () => {
    const demo = sweep(DEMO_LOOP_CELLS, 4);
    const backRowWins =
      requireNumber(demo.wins[2], 'slot 2 wins') + requireNumber(demo.wins[3], 'slot 3 wins');
    expect(
      backRowWins,
      `back-row slots won ${backRowWins}/${demo.races} races on the demo loop (wins=${demo.wins.join('/')})`,
    ).toBeGreaterThan(0);
  });

  it('keeps every grid slot within [0.5/n, 2/n] win share across kart counts and loops', {
    timeout: 30_000,
  }, () => {
    for (const cells of LOOP_SIZES) {
      for (const kartCount of KART_COUNTS) {
        const summary = sweep(cells, kartCount);
        const low = 0.5 / kartCount;
        const high = 2 / kartCount;
        for (let slot = 0; slot < kartCount; slot++) {
          const share = requireNumber(summary.wins[slot], `slot ${slot} wins`) / summary.races;
          expect(
            share,
            `${cells}-cell loop, ${kartCount} karts: slot ${slot} share ${(share * 100).toFixed(1)}% below ${(low * 100).toFixed(1)}% (wins=${summary.wins.join('/')})`,
          ).toBeGreaterThanOrEqual(low);
          expect(
            share,
            `${cells}-cell loop, ${kartCount} karts: slot ${slot} share ${(share * 100).toFixed(1)}% above ${(high * 100).toFixed(1)}% (wins=${summary.wins.join('/')})`,
          ).toBeLessThanOrEqual(high);
        }
      }
    }
  });

  it('keeps photo-finish closeness in the product band across the demo-loop sweep', () => {
    const summaries = KART_COUNTS.map((kartCount) => sweep(DEMO_LOOP_CELLS, kartCount));
    for (const summary of summaries) {
      const rate = summary.photoFinishes / summary.races;
      expect(
        rate,
        `${summary.kartCount} karts: photo-finish rate ${(rate * 100).toFixed(1)}% below the 30% floor`,
      ).toBeGreaterThanOrEqual(0.3);
    }
    const photoFinishes = summaries.reduce((sum, summary) => sum + summary.photoFinishes, 0);
    const races = summaries.reduce((sum, summary) => sum + summary.races, 0);
    const pooled = photoFinishes / races;
    expect(
      pooled,
      `pooled photo-finish rate ${(pooled * 100).toFixed(1)}% below 30%`,
    ).toBeGreaterThanOrEqual(0.3);
    expect(
      pooled,
      `pooled photo-finish rate ${(pooled * 100).toFixed(1)}% above 65%`,
    ).toBeLessThanOrEqual(0.65);
  });

  it('keeps the first finish inside the 30-45 s product band', () => {
    for (const cells of LOOP_SIZES) {
      for (const kartCount of KART_COUNTS) {
        const summary = sweep(cells, kartCount);
        expect(
          summary.firstFinishMin,
          `${cells}-cell loop, ${kartCount} karts: fastest first finish ${summary.firstFinishMin.toFixed(1)}s below 30s`,
        ).toBeGreaterThanOrEqual(30);
        expect(
          summary.firstFinishMax,
          `${cells}-cell loop, ${kartCount} karts: slowest first finish ${summary.firstFinishMax.toFixed(1)}s above 45s`,
        ).toBeLessThanOrEqual(45);
      }
    }
  });

  it('reproduces a race exactly for the same seed', () => {
    for (const seed of [1, 7, 42, 123, 999]) {
      const a = runRace(DEMO_LOOP_CELLS, 4, seed);
      const b = runRace(DEMO_LOOP_CELLS, 4, seed);
      expect(b.winnerIndex).toBe(a.winnerIndex);
      expect(b.finishTimes).toEqual(a.finishTimes);
    }
  });
});
