import { describe, expect, it } from 'vitest';
import { createRaceEngine } from '../race/engine';
import type { LoopCell } from '../race/path';

/** Closed 8-cell loop; long enough for a realistic race, short enough to tick fast. */
const path: LoopCell[] = [
  { x: 5, y: 5, type: 'start', orientation: 90 },
  { x: 6, y: 5, type: 'straight', orientation: 90 },
  { x: 7, y: 5, type: 'curve', orientation: 180 },
  { x: 7, y: 6, type: 'straight', orientation: 0 },
  { x: 7, y: 7, type: 'curve', orientation: 270 },
  { x: 6, y: 7, type: 'straight', orientation: 90 },
  { x: 5, y: 7, type: 'curve', orientation: 0 },
  { x: 5, y: 6, type: 'straight', orientation: 0 },
];

/**
 * Performance sanity for the race presentation track: engine tick cost with
 * 4 karts must stay far under a 60 fps frame budget (16.7 ms). Draw-call
 * budget is structural (4 kart meshes + 1 confetti Points + track pieces).
 */
describe('race tick performance', () => {
  it('ticks a full 4-kart race well under a 60 fps frame budget', () => {
    const engine = createRaceEngine(path, { seed: 42, countdownSeconds: 0.01 });
    engine.start();
    // Burn the countdown plus a full ~37 s race at 60 Hz.
    const frames = 60 * 45;
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      engine.tick(1 / 60);
    }
    const elapsedMs = performance.now() - start;
    const avgTickMs = elapsedMs / frames;
    expect(engine.state).toBe('finished');
    expect(avgTickMs).toBeLessThan(1);
  });
});
