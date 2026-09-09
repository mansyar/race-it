import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  createRaceEngine,
  type Kart,
  LANE_OFFSET,
  type RaceEngine,
  type RaceResult,
  type RaceState,
  ROW_SPACING,
} from './engine';
import type { LoopCell } from './path';

function loopOfLength(n: number): LoopCell[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i,
    y: 0,
    type: 'straight' as const,
    orientation: 0 as const,
  }));
}

function tickUntilFinished(engine: RaceEngine, dt = 0.1, maxSeconds = 120): void {
  let t = 0;
  while (!engine.karts.every((kart) => kart.finished) && t < maxSeconds) {
    engine.tick(dt);
    t += dt;
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

function kartAt(engine: RaceEngine, index: number): Kart {
  const kart = engine.karts[index];
  if (kart === undefined) {
    throw new Error(`expected kart at index ${index}`);
  }
  return kart;
}

describe('createRaceEngine', () => {
  it('validates the kart count is between 2 and 4 inclusive, defaulting to 4', () => {
    expect(createRaceEngine(loopOfLength(8)).karts).toHaveLength(4);
    expect(() => createRaceEngine(loopOfLength(8), { kartCount: 1 })).toThrow(RangeError);
    expect(() => createRaceEngine(loopOfLength(8), { kartCount: 5 })).toThrow(RangeError);
  });

  it('computes the lap length from the path (SEGMENT_LENGTH per cell)', () => {
    expect(createRaceEngine(loopOfLength(8)).lapLength).toBe(16);
    expect(createRaceEngine(loopOfLength(48)).lapLength).toBe(96);
  });

  describe('start lineup', () => {
    it('places 2 karts side by side on the start line', () => {
      const engine = createRaceEngine(loopOfLength(8), { kartCount: 2, seed: 1 });
      expect(kartAt(engine, 0).lane).toBe(LANE_OFFSET);
      expect(kartAt(engine, 0).startProgress).toBe(0);
      expect(kartAt(engine, 1).lane).toBe(-LANE_OFFSET);
      expect(kartAt(engine, 1).startProgress).toBe(0);
    });

    it('centers the single kart in an odd last row (3 karts)', () => {
      const engine = createRaceEngine(loopOfLength(8), { kartCount: 3, seed: 1 });
      expect(kartAt(engine, 2).lane).toBe(0);
      expect(kartAt(engine, 2).startProgress).toBe(-ROW_SPACING);
      expect(kartAt(engine, 0).lane).toBe(LANE_OFFSET);
      expect(kartAt(engine, 1).lane).toBe(-LANE_OFFSET);
    });

    it('alternates lanes and rows for 4 karts', () => {
      const engine = createRaceEngine(loopOfLength(8), { kartCount: 4, seed: 1 });
      expect(engine.karts.map((kart) => kart.lane)).toEqual([
        LANE_OFFSET,
        -LANE_OFFSET,
        LANE_OFFSET,
        -LANE_OFFSET,
      ]);
      expect(engine.karts.map((kart) => kart.startProgress)).toEqual([
        0,
        0,
        -ROW_SPACING,
        -ROW_SPACING,
      ]);
    });
  });

  describe('speed rolls', () => {
    it('is deterministic for the same seed', () => {
      const a = createRaceEngine(loopOfLength(48), { seed: 42 });
      const b = createRaceEngine(loopOfLength(48), { seed: 42 });
      expect(a.karts.map((kart) => kart.speed)).toEqual(b.karts.map((kart) => kart.speed));
    });

    it('rolls different speeds for different seeds', () => {
      const a = createRaceEngine(loopOfLength(48), { seed: 42 });
      const b = createRaceEngine(loopOfLength(48), { seed: 43 });
      expect(a.karts.map((kart) => kart.speed)).not.toEqual(b.karts.map((kart) => kart.speed));
    });

    it('uses the injected rng when provided', () => {
      const engine = createRaceEngine(loopOfLength(48), { rng: () => 0.5 });
      const base = 96 / 37.5;
      for (const kart of engine.karts) {
        expect(kart.speed).toBeCloseTo(base * 1.0, 10);
      }
    });
  });

  describe('countdown', () => {
    it('freezes all karts until the countdown ends', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 1 });
      engine.start();
      engine.tick(1.0);
      expect(engine.state).toBe('countdown');
      for (const kart of engine.karts) {
        expect(kart.progress).toBe(kart.startProgress);
      }
      engine.tick(2.5); // 1.0s + 2.5s: countdown ends at 3.0s, then 0.5s of movement
      expect(engine.state).toBe('running');
      for (const kart of engine.karts) {
        expect(kart.progress).toBeGreaterThan(kart.startProgress);
      }
    });

    it('starts a single countdown even if start() is called twice', () => {
      const engine = createRaceEngine(loopOfLength(8), { seed: 1 });
      engine.start();
      engine.start();
      engine.tick(COUNTDOWN_SECONDS);
      expect(engine.state).toBe('running');
    });
  });

  describe('finish detection', () => {
    it('records the winner and every finish time in order', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 3 });
      engine.start();
      tickUntilFinished(engine);
      const result = requireResult(engine);
      expect(result.finishTimes).toHaveLength(4);
      for (const time of result.finishTimes) {
        expect(time).not.toBeNull();
      }
      const winnerIndex = result.winnerIndex;
      const winnerTime = result.finishTimes[winnerIndex];
      for (let i = 0; i < engine.karts.length; i++) {
        if (i !== winnerIndex) {
          expect(result.finishTimes[i]).toBeGreaterThanOrEqual(
            requireNumber(winnerTime, 'winner time'),
          );
        }
      }
      expect(engine.karts[winnerIndex]?.finished).toBe(true);
      expect(engine.karts[winnerIndex]?.finishTime).toBe(winnerTime);
    });

    it('finishes an 8-cell lap inside the 30-45 s product band', () => {
      const engine = createRaceEngine(loopOfLength(8), { seed: 5 });
      engine.start();
      tickUntilFinished(engine);
      const result = requireResult(engine);
      expect(result.finishTimes[result.winnerIndex]).toBeGreaterThanOrEqual(30);
      expect(result.finishTimes[result.winnerIndex]).toBeLessThanOrEqual(45);
    });

    it('finishes a 48-cell lap inside the 30-45 s product band', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 5 });
      engine.start();
      tickUntilFinished(engine);
      const result = requireResult(engine);
      expect(result.finishTimes[result.winnerIndex]).toBeGreaterThanOrEqual(30);
      expect(result.finishTimes[result.winnerIndex]).toBeLessThanOrEqual(45);
    });
  });

  describe('photo finish', () => {
    it('is true when the winner beats the runner-up by less than the margin', () => {
      // Kart 0: factor 1.015 (fast), kart 1: factor 1.014, karts 2-3: 1.0.
      // Row-0 gap is ~0.036 s — inside the 0.25 s photo-finish margin.
      const draws = [1, 0.9666666667, 0.5, 0.5];
      const engine = createRaceEngine(loopOfLength(48), {
        rng: () => draws.shift() ?? 0.5,
      });
      engine.start();
      tickUntilFinished(engine);
      const result = requireResult(engine);
      expect(result.winnerIndex).toBe(0);
      expect(result.photoFinish).toBe(true);
    });

    it('is false when the winner clears the runner-up by more than the margin', () => {
      const draws = [0, 1, 1, 1]; // kart 0 slow, karts 1-3 fast
      const engine = createRaceEngine(loopOfLength(48), {
        rng: () => draws.shift() ?? 0.5,
      });
      engine.start();
      tickUntilFinished(engine);
      const result = requireResult(engine);
      expect(result.winnerIndex).toBe(1);
      expect(result.photoFinish).toBe(false);
      expect(result.finishTimes[1]).toBeLessThan(
        requireNumber(result.finishTimes[0], 'kart 0 time'),
      );
    });
  });

  describe('fairness across seeds', () => {
    it('produces more than one distinct winner across several fixed seeds', () => {
      const winners = new Set<number>();
      for (let seed = 1; seed <= 8; seed++) {
        const engine = createRaceEngine(loopOfLength(48), { seed });
        engine.start();
        tickUntilFinished(engine);
        winners.add(requireResult(engine).winnerIndex);
      }
      expect(winners.size).toBeGreaterThan(1);
    });
  });

  describe('lifecycle API', () => {
    it('pause freezes the countdown and kart progress; resume continues', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 1 });
      engine.start();
      engine.tick(1.0);
      engine.pause();
      engine.tick(5.0);
      expect(engine.state).toBe('countdown');
      for (const kart of engine.karts) {
        expect(kart.progress).toBe(kart.startProgress);
      }
      engine.resume();
      engine.tick(2.5);
      expect(engine.state).toBe('running');
      expect(kartAt(engine, 0).progress).toBeGreaterThan(0);
    });

    it('pause freezes karts mid-race and resume continues from the same progress', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 2 });
      engine.start();
      tickUntilFinished(engine, 0.1, 10); // run 10 s (through countdown into the race)
      const before = engine.karts.map((kart) => kart.progress);
      engine.pause();
      engine.tick(3.0);
      expect(engine.karts.map((kart) => kart.progress)).toEqual(before);
      engine.resume();
      engine.tick(1.0);
      expect(kartAt(engine, 0).progress).toBeGreaterThan(
        requireNumber(before[0], 'progress before'),
      );
    });

    it('resume without pause is a no-op', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 3 });
      engine.start();
      engine.resume();
      engine.tick(3.0);
      expect(engine.state).toBe('running');
    });

    it('abandon resets an in-progress race to idle and discards the result', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 4 });
      engine.start();
      tickUntilFinished(engine, 0.1, 10);
      engine.abandon();
      expect(engine.state).toBe('idle');
      expect(engine.result).toBeNull();
      for (const kart of engine.karts) {
        expect(kart.progress).toBe(kart.startProgress);
        expect(kart.finished).toBe(false);
        expect(kart.finishTime).toBeNull();
      }
      engine.tick(5.0);
      expect(engine.state).toBe('idle');
      expect(kartAt(engine, 0).progress).toBe(0);
    });

    it('abandon emits a stateChange back to idle', () => {
      const engine = createRaceEngine(loopOfLength(8), { seed: 5 });
      const states: RaceState[] = [];
      engine.on('stateChange', (state) => states.push(state));
      engine.start();
      engine.abandon();
      expect(states).toEqual(['countdown', 'idle']);
    });

    it('abandon while idle is a silent no-op', () => {
      const engine = createRaceEngine(loopOfLength(8), { seed: 6 });
      const states: RaceState[] = [];
      engine.on('stateChange', (state) => states.push(state));
      engine.abandon();
      expect(engine.state).toBe('idle');
      expect(states).toEqual([]);
    });

    it('restart re-rolls speeds and returns to idle for a fresh race', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 42 });
      const firstRoll = engine.karts.map((kart) => kart.speed);
      engine.start();
      tickUntilFinished(engine);
      engine.restart();
      expect(engine.state).toBe('idle');
      expect(engine.result).toBeNull();
      const secondRoll = engine.karts.map((kart) => kart.speed);
      expect(secondRoll).not.toEqual(firstRoll);
      for (const kart of engine.karts) {
        expect(kart.progress).toBe(kart.startProgress);
        expect(kart.finished).toBe(false);
      }
    });

    it('restart followed by start runs a complete new race', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 7 });
      engine.start();
      tickUntilFinished(engine);
      engine.restart();
      engine.start();
      tickUntilFinished(engine);
      expect(requireResult(engine).winnerIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('typed events', () => {
    it('emits stateChange idle -> countdown -> running -> finished', () => {
      const engine = createRaceEngine(loopOfLength(8), { seed: 2 });
      const states: RaceState[] = [];
      engine.on('stateChange', (state) => states.push(state));
      engine.start();
      tickUntilFinished(engine);
      expect(states).toEqual(['countdown', 'running', 'finished']);
    });

    it('emits kartFinish once per kart with ascending times and finish once with the result', () => {
      const engine = createRaceEngine(loopOfLength(48), { seed: 2 });
      const finished: Array<{ index: number; time: number }> = [];
      let finishCount = 0;
      engine.on('kartFinish', (payload) => finished.push(payload));
      engine.on('finish', (result) => {
        finishCount++;
        expect(result.winnerIndex).toBe(requireResult(engine).winnerIndex);
      });
      engine.start();
      tickUntilFinished(engine);
      expect(finished).toHaveLength(4);
      const times = finished.map((entry) => entry.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(finishCount).toBe(1);
    });
  });
});
