import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRaceEngine, type Kart, type RaceEngine } from '../race/engine';
import type { LoopCell } from '../race/path';
import {
  BOB_AMPLITUDE,
  MAX_PITCH,
  MAX_ROLL,
  RUNOUT_SECONDS,
  type VisualPose,
} from '../render/kart-motion';
import { kartPose } from '../render/kart-rig';
import { computeCameraPlacement } from '../render/layout';
import { LOOK_AHEAD_DISTANCE, PHOTO_FINISH_PUSH, RACE_ZOOM_FLOOR } from '../render/race-camera';
import { createRaceHud } from '../ui/race-hud';
import { createTrafficLight } from '../ui/traffic-light';
import { createTrophy } from '../ui/trophy';
import type { PhotoFinishTickInput, PhotoFinishTracker } from './photo-finish';
import {
  CAMERA_SMOOTH_RATE,
  createRacePresentation,
  leadBattle,
  type RacePresentation,
  VICTORY_SPIN_SECONDS,
  victorySpinHeading,
  WINNER_COLOR_WORDS,
} from './race-presentation';

/** Closed 8-cell loop on the board; start at (5,5) heading east. */
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

/** Minimal Kart for lead-battle selection tests. */
function kart(index: number, progress: number): Kart {
  return {
    index,
    lane: 0,
    startProgress: 0,
    speed: 1,
    progress,
    finished: false,
    finishTime: null,
  };
}

/** Straight-line distance from the camera to its target for a build placement. */
function buildDistanceOf(aspect: number): number {
  const build = computeCameraPlacement(aspect);
  return Math.hypot(
    build.position.x - build.target.x,
    build.position.y - build.target.y,
    build.position.z - build.target.z,
  );
}

function click(selector: string, root: ParentNode): void {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing button: ${selector}`);
  }
  button.click();
}

interface Harness {
  engine: RaceEngine;
  presentation: RacePresentation;
  light: ReturnType<typeof createTrafficLight>;
  hud: ReturnType<typeof createRaceHud>;
  trophy: ReturnType<typeof createTrophy>;
  confetti: {
    burst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  karts: { update: ReturnType<typeof vi.fn>; lastPoses: VisualPose[] };
  camera: {
    position: { x: number; y: number; z: number; set: ReturnType<typeof vi.fn> };
    lookAt: ReturnType<typeof vi.fn>;
    aspect: number;
  };
  onBuildUiChange: ReturnType<typeof vi.fn>;
  onCountdownBeep: ReturnType<typeof vi.fn>;
  onGo: ReturnType<typeof vi.fn>;
  audio: {
    startMusic: ReturnType<typeof vi.fn>;
    stopMusic: ReturnType<typeof vi.fn>;
    startHum: ReturnType<typeof vi.fn>;
    stopHum: ReturnType<typeof vi.fn>;
    playVictoryJingle: ReturnType<typeof vi.fn>;
    suspendAll: ReturnType<typeof vi.fn>;
    resumeAll: ReturnType<typeof vi.fn>;
    stopAll: ReturnType<typeof vi.fn>;
    beginPhotoFinish: ReturnType<typeof vi.fn>;
    endPhotoFinish: ReturnType<typeof vi.fn>;
    playCrowdCheer: ReturnType<typeof vi.fn>;
  };
  flash: { flash: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
  priorOnPause: ReturnType<typeof vi.fn>;
  priorOnResume: ReturnType<typeof vi.fn>;
  priorOnQuit: ReturnType<typeof vi.fn>;
  priorOnAgain: ReturnType<typeof vi.fn>;
  priorOnBuildAgain: ReturnType<typeof vi.fn>;
  /** Advances presentation through a full countdown into running. */
  raceToRunning(seconds?: number): void;
  /** Ticks engine + presentation until the race is finished (all karts). */
  raceToAllFinished(): void;
  /** Ticks until the winner crosses the finish line. */
  raceToFirstFinish(): void;
}

/** Expected pack target: pair midpoint nudged along the lead visual travel direction. */
function packTarget(harness: Harness): { x: number; z: number } {
  const { engine } = harness;
  const { leadIndex, rivalIndex } = leadBattle(engine.karts);
  const leadPose = harness.karts.lastPoses[leadIndex];
  if (!leadPose) {
    throw new Error('Expected a lead kart pose');
  }
  const rivalPose = rivalIndex === null ? undefined : harness.karts.lastPoses[rivalIndex];
  const midX = rivalPose ? (leadPose.x + rivalPose.x) / 2 : leadPose.x;
  const midZ = rivalPose ? (leadPose.z + rivalPose.z) / 2 : leadPose.z;
  return {
    x: midX + Math.cos(leadPose.heading) * LOOK_AHEAD_DISTANCE,
    z: midZ - Math.sin(leadPose.heading) * LOOK_AHEAD_DISTANCE,
  };
}

function createHarness(
  options: {
    countdownSeconds?: number;
    kartOrder?: number[];
    photoFinish?: PhotoFinishTracker;
  } = {},
): Harness {
  const engine = createRaceEngine(path, {
    seed: 42,
    countdownSeconds: options.countdownSeconds ?? 0.05,
    // The kartOrder mapping is 1:1 with the engine's karts in production.
    kartCount: options.kartOrder?.length ?? 4,
  });
  const light = createTrafficLight();
  const priorOnPause = vi.fn();
  const priorOnResume = vi.fn();
  const priorOnQuit = vi.fn();
  const priorOnAgain = vi.fn();
  const priorOnBuildAgain = vi.fn();
  const hud = createRaceHud({
    onPause: priorOnPause,
    onResume: priorOnResume,
    onQuit: priorOnQuit,
  });
  const trophy = createTrophy({ onAgain: priorOnAgain, onBuildAgain: priorOnBuildAgain });
  const confetti = {
    burst: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
  };
  const lastPoses: VisualPose[] = [];
  const karts = {
    update: vi.fn((poses: VisualPose[]) => {
      lastPoses.splice(0, lastPoses.length, ...poses);
      return null;
    }),
    lastPoses,
  };
  const camera = {
    position: { x: 0, y: 0, z: 0, set: vi.fn() },
    lookAt: vi.fn(),
    aspect: 1.5,
  };
  const onBuildUiChange = vi.fn();
  const onCountdownBeep = vi.fn();
  const onGo = vi.fn();
  const audio = {
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    startHum: vi.fn(),
    stopHum: vi.fn(),
    playVictoryJingle: vi.fn(),
    suspendAll: vi.fn(),
    resumeAll: vi.fn(),
    stopAll: vi.fn(),
    beginPhotoFinish: vi.fn(),
    endPhotoFinish: vi.fn(),
    playCrowdCheer: vi.fn(),
  };
  const flash = {
    flash: vi.fn(),
    hide: vi.fn(),
  };

  const presentation = createRacePresentation({
    engine,
    path,
    trafficLight: light,
    raceHud: hud,
    trophy,
    confetti,
    karts,
    camera,
    kartOrder: options.kartOrder,
    photoFinish: options.photoFinish,
    onBuildUiChange,
    onCountdownBeep,
    onGo,
    audio,
    flash,
  });

  return {
    engine,
    presentation,
    light,
    hud,
    trophy,
    confetti,
    karts,
    camera,
    onBuildUiChange,
    onCountdownBeep,
    onGo,
    audio,
    flash,
    priorOnPause,
    priorOnResume,
    priorOnQuit,
    priorOnAgain,
    priorOnBuildAgain,
    raceToRunning(seconds = 0.06) {
      presentation.beginRace();
      presentation.update(seconds);
    },
    raceToAllFinished() {
      presentation.beginRace();
      // Countdown + long enough for the 37.5 s target race.
      for (let i = 0; i < 60 * 50; i++) {
        presentation.update(1 / 60);
        if (engine.karts.every((kart) => kart.finished)) {
          break;
        }
      }
    },
    raceToFirstFinish() {
      presentation.beginRace();
      for (let i = 0; i < 60 * 60; i++) {
        presentation.update(1 / 60);
        if (engine.state === 'finished') {
          break;
        }
      }
    },
  };
}

describe('victorySpinHeading', () => {
  it('returns the base heading at spin start', () => {
    expect(victorySpinHeading(1.2, 0)).toBeCloseTo(1.2);
  });

  it('adds a full turn at spin complete', () => {
    expect(victorySpinHeading(0, 1)).toBeCloseTo(Math.PI * 2);
  });

  it('clamps progress beyond 1', () => {
    expect(victorySpinHeading(0, 2)).toBeCloseTo(Math.PI * 2);
  });

  it('interpolates halfway through the spin', () => {
    expect(victorySpinHeading(0, 0.5)).toBeCloseTo(Math.PI);
  });

  it('exposes a ~2 second spin duration', () => {
    expect(VICTORY_SPIN_SECONDS).toBeCloseTo(2);
  });
});

describe('leadBattle', () => {
  it('finds the leader and the closest rival by progress', () => {
    const karts = [kart(0, 10), kart(1, 30), kart(2, 20), kart(3, 5)];
    expect(leadBattle(karts)).toEqual({ leadIndex: 1, rivalIndex: 2 });
  });

  it('returns a null rival for a lone kart', () => {
    expect(leadBattle([kart(0, 10)])).toEqual({ leadIndex: 0, rivalIndex: null });
  });
});

describe('createRacePresentation', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  describe('beginRace / countdown', () => {
    it('hides build UI and starts the engine countdown', () => {
      harness.presentation.beginRace();
      expect(harness.onBuildUiChange).toHaveBeenCalledWith(false);
      expect(harness.engine.state).toBe('countdown');
    });

    it('shows the traffic light synced to countdownRemaining', () => {
      harness.presentation.beginRace();
      harness.presentation.update(0.01);
      expect(harness.light.root.classList.contains('hidden')).toBe(false);
      expect(harness.light.root.querySelectorAll('.lit').length).toBeGreaterThan(0);
    });

    it('keeps karts on the start lineup during countdown', () => {
      harness.presentation.beginRace();
      harness.presentation.update(0.01);
      expect(harness.karts.lastPoses).toHaveLength(4);
      // Row 0 karts sit on the start line (progress 0).
      const pose0 = harness.karts.lastPoses[0];
      const pose1 = harness.karts.lastPoses[1];
      if (!pose0 || !pose1) {
        throw new Error('Expected start-line poses');
      }
      expect(pose0.x).toBeCloseTo(-1); // cell (5,5) world x
      expect(pose1.x).toBeCloseTo(-1);
    });

    it('does not show the pause button during countdown', () => {
      harness.presentation.beginRace();
      harness.presentation.update(0.01);
      const pause = harness.hud.root.querySelector('[data-action="pause"]');
      expect(pause?.classList.contains('hidden')).toBe(true);
    });
  });

  describe('running', () => {
    it('flashes GO and reveals the pause button when the race starts', () => {
      harness.raceToRunning();
      expect(harness.engine.state).toBe('running');
      expect(harness.light.root.querySelector('[data-light="go"]')?.classList.contains('lit')).toBe(
        true,
      );
      const pause = harness.hud.root.querySelector('[data-action="pause"]');
      expect(pause?.classList.contains('hidden')).toBe(false);
    });

    it('hides the traffic light shortly after the GO flash', () => {
      harness.presentation.beginRace();
      // Finish countdown, then run past the GO flash window.
      harness.presentation.update(0.06);
      harness.presentation.update(1.0);
      expect(harness.light.root.classList.contains('hidden')).toBe(true);
    });

    it('advances kart poses as the engine progresses', () => {
      harness.raceToRunning();
      const startPose = harness.karts.lastPoses[0];
      if (!startPose) {
        throw new Error('Expected a start pose');
      }
      harness.presentation.update(0.5);
      const laterPose = harness.karts.lastPoses[0];
      if (!laterPose) {
        throw new Error('Expected a later pose');
      }
      const moved = Math.hypot(laterPose.x - startPose.x, laterPose.z - startPose.z);
      expect(moved).toBeGreaterThan(0.01);
    });

    it('applies a camera placement while running', () => {
      harness.raceToRunning();
      harness.presentation.update(0.2);
      expect(harness.camera.position.set).toHaveBeenCalled();
      expect(harness.camera.lookAt).toHaveBeenCalled();
    });

    it('aims the camera at the lead pair nudged along the travel direction', () => {
      harness.raceToRunning();
      const expected = packTarget(harness);
      const look = harness.camera.lookAt.mock.calls.at(-1);
      expect(look?.[0]).toBeCloseTo(expected.x, 5);
      expect(look?.[2]).toBeCloseTo(expected.z, 5);
      // The pack framing is closer than the full-board build placement.
      const call = harness.camera.position.set.mock.calls.at(-1);
      const distance = Math.hypot(
        (call?.[0] ?? 0) - expected.x,
        (call?.[1] ?? 0) - 0,
        (call?.[2] ?? 0) - expected.z,
      );
      expect(distance).toBeLessThan(buildDistanceOf(harness.camera.aspect));
    });

    it('eases between pack poses instead of snapping after the first frame', () => {
      harness.raceToRunning();
      const firstLook = harness.camera.lookAt.mock.calls.at(-1);
      if (!firstLook) {
        throw new Error('Expected an initial camera target');
      }
      harness.presentation.update(1 / 60);
      const nextTarget = packTarget(harness);
      const t = 1 - Math.exp((-CAMERA_SMOOTH_RATE * 1) / 60);
      const expectedX = firstLook[0] + (nextTarget.x - firstLook[0]) * t;
      const expectedZ = firstLook[2] + (nextTarget.z - firstLook[2]) * t;
      const look = harness.camera.lookAt.mock.calls.at(-1);
      expect(look?.[0]).toBeCloseTo(expectedX, 3);
      expect(look?.[2]).toBeCloseTo(expectedZ, 3);
    });
  });

  describe('finish celebration', () => {
    it('bursts confetti at the finish origin when the winner crosses', () => {
      harness.raceToAllFinished();
      expect(harness.confetti.burst).toHaveBeenCalled();
      const call = harness.confetti.burst.mock.calls[0];
      const origin = call?.[0] as { x: number; z: number } | undefined;
      if (!origin) {
        throw new Error('Expected a confetti burst origin');
      }
      // Finish = start cell (5,5) → world (-1, -1)
      expect(origin.x).toBeCloseTo(-1);
      expect(origin.z).toBeCloseTo(-1);
    });

    it('shows the trophy with the winner color word once every kart finishes', () => {
      harness.raceToAllFinished();
      expect(harness.engine.karts.every((kart) => kart.finished)).toBe(true);
      expect(harness.trophy.root.classList.contains('hidden')).toBe(false);
      const winner = harness.engine.result?.winnerIndex ?? 0;
      expect(harness.trophy.root.textContent).toContain(WINNER_COLOR_WORDS[winner]);
      expect(harness.trophy.root.textContent).toContain('WINS!');
    });

    it('shows the trophy word for the picked color order once every kart finishes', () => {
      // Engine kart 0 → yellow (3), kart 1 → blue (1).
      const harness = createHarness({ kartOrder: [3, 1] });
      harness.raceToAllFinished();
      const winner = harness.engine.result?.winnerIndex ?? 0;
      const order = [3, 1];
      const expected = WINNER_COLOR_WORDS[order[winner] ?? 0];
      if (!expected) {
        throw new Error('Expected a winner color word');
      }
      expect(harness.trophy.root.textContent).toContain(expected);
      expect(harness.trophy.root.textContent).not.toContain('Red');
    });

    it('spins the winner kart yaw over the victory window', () => {
      // Roll to the winner's crossing so the spin clock starts at one frame.
      harness.presentation.beginRace();
      for (let i = 0; i < 60 * 60; i++) {
        harness.presentation.update(1 / 60);
        if (harness.engine.result) {
          break;
        }
      }
      const winner = harness.engine.result?.winnerIndex;
      expect(winner).toBeGreaterThanOrEqual(0);
      const winnerIndex = winner ?? 0;
      // Capture the pose at the start of the spin (one frame after the finish event).
      const before = harness.karts.lastPoses[winnerIndex];
      if (!before) {
        throw new Error('Expected a winner pose at finish');
      }
      const beforeHeading = before.heading;
      // Skip the roll-out, then half of the spin window.
      harness.presentation.update(RUNOUT_SECONDS - 1 / 60 + VICTORY_SPIN_SECONDS / 2);
      const after = harness.karts.lastPoses[winnerIndex];
      if (!after) {
        throw new Error('Expected a winner pose mid-spin');
      }
      const delta = after.heading - beforeHeading;
      // Half a turn of extra yaw halfway through the spin.
      expect(Math.abs(delta)).toBeGreaterThan(1);
      expect(Math.abs(delta)).toBeLessThanOrEqual(Math.PI + 0.2);
    });

    it('hides the pause button once the race is finished', () => {
      harness.raceToAllFinished();
      const pause = harness.hud.root.querySelector('[data-action="pause"]');
      expect(pause?.classList.contains('hidden')).toBe(true);
    });

    it('holds close on the finish area through the celebration', () => {
      harness.raceToAllFinished();
      // Let the smoothed camera settle onto the finish hold.
      for (let i = 0; i < 120; i++) {
        harness.presentation.update(1 / 60);
      }
      const look = harness.camera.lookAt.mock.calls.at(-1);
      // Finish = start cell (5,5) -> world (-1, -1).
      expect(look?.[0]).toBeCloseTo(-1, 2);
      expect(look?.[2]).toBeCloseTo(-1, 2);
      const call = harness.camera.position.set.mock.calls.at(-1);
      const distance = Math.hypot((call?.[0] ?? 0) + 1, call?.[1] ?? 0, (call?.[2] ?? 0) + 1);
      expect(distance).toBeCloseTo(buildDistanceOf(harness.camera.aspect) * RACE_ZOOM_FLOOR, 1);
    });
  });

  describe('finish run-out', () => {
    function wrap(a: number): number {
      return Math.atan2(Math.sin(a), Math.cos(a));
    }

    /** Ticks until the winner crosses the line (first finish event). */
    function raceToWinnerCrossing(): void {
      harness.presentation.beginRace();
      for (let i = 0; i < 60 * 60; i++) {
        harness.presentation.update(1 / 60);
        if (harness.engine.result) {
          break;
        }
      }
    }

    it('rolls the winner forward past the line and settles within about a unit', () => {
      raceToWinnerCrossing();
      const winner = harness.engine.result?.winnerIndex ?? 0;
      const start = harness.karts.lastPoses[winner];
      if (!start) {
        throw new Error('Expected a winner pose at the crossing');
      }
      const finishTime = harness.engine.result?.finishTimes[winner];
      for (let i = 0; i < 90; i++) {
        harness.presentation.update(1 / 60);
      }
      const settled = harness.karts.lastPoses[winner];
      if (!settled) {
        throw new Error('Expected a settled winner pose');
      }
      const rolled = Math.hypot(settled.x - start.x, settled.z - start.z);
      expect(rolled).toBeGreaterThan(0.2);
      expect(rolled).toBeLessThanOrEqual(0.75);
      for (let i = 0; i < 30; i++) {
        harness.presentation.update(1 / 60);
      }
      const held = harness.karts.lastPoses[winner];
      if (!held) {
        throw new Error('Expected a held winner pose');
      }
      expect(Math.hypot(held.x - settled.x, held.z - settled.z)).toBeLessThan(0.01);
      // Official finish time stays at the line crossing, not the roll-out.
      expect(harness.engine.result?.finishTimes[winner]).toBe(finishTime);
    });

    it('keeps the winner aligned with the track during the roll-out, then spins', () => {
      raceToWinnerCrossing();
      const winner = harness.engine.result?.winnerIndex ?? 0;
      const start = harness.karts.lastPoses[winner];
      if (!start) {
        throw new Error('Expected a winner pose at the crossing');
      }
      const baseHeading = start.heading;
      harness.presentation.update(RUNOUT_SECONDS * 0.5);
      const rolling = harness.karts.lastPoses[winner];
      if (!rolling) {
        throw new Error('Expected a rolling pose');
      }
      expect(Math.hypot(rolling.x - start.x, rolling.z - start.z)).toBeGreaterThan(0.1);
      expect(Math.abs(wrap(rolling.heading - baseHeading))).toBeLessThan(0.15);
      harness.presentation.update(RUNOUT_SECONDS * 0.5 + VICTORY_SPIN_SECONDS / 2);
      const spinning = harness.karts.lastPoses[winner];
      if (!spinning) {
        throw new Error('Expected a spinning pose');
      }
      const delta = wrap(spinning.heading - baseHeading);
      expect(Math.abs(delta)).toBeGreaterThan(1);
      expect(Math.abs(delta)).toBeLessThanOrEqual(Math.PI + 0.2);
    });

    it('clears the roll-out when RACE AGAIN restarts the race', () => {
      raceToWinnerCrossing();
      const winner = harness.engine.result?.winnerIndex ?? 0;
      for (let i = 0; i < 30; i++) {
        harness.presentation.update(1 / 60);
      }
      click('button[data-action="again"]', harness.trophy.root);
      harness.presentation.update(0.01);
      const kart = harness.engine.karts[winner];
      if (!kart) {
        throw new Error('Expected a restarted kart');
      }
      const base = kartPose(path, kart.progress, kart.lane);
      const pose = harness.karts.lastPoses[winner];
      if (!pose) {
        throw new Error('Expected a lineup pose after RACE AGAIN');
      }
      expect(pose.x).toBeCloseTo(base.x, 10);
      expect(pose.z).toBeCloseTo(base.z, 10);
    });

    it('keeps confetti, trophy, and finish times unchanged through the roll-out', () => {
      harness.raceToAllFinished();
      const finishTimes = harness.engine.result?.finishTimes.map((time) => time) ?? [];
      const bursts = harness.confetti.burst.mock.calls.length;
      const trophyText = harness.trophy.root.textContent;
      for (let i = 0; i < 90; i++) {
        harness.presentation.update(1 / 60);
      }
      expect(harness.confetti.burst.mock.calls.length).toBe(bursts);
      expect(harness.trophy.root.textContent).toBe(trophyText);
      expect(harness.engine.result?.finishTimes).toEqual(finishTimes);
    });
  });

  describe('RACE AGAIN', () => {
    it('restarts the engine with a fresh countdown and resets presentation', () => {
      harness.raceToAllFinished();
      const seedSpeeds = harness.engine.karts.map((kart) => kart.speed);

      click('button[data-action="again"]', harness.trophy.root);

      expect(harness.trophy.root.classList.contains('hidden')).toBe(true);
      expect(harness.light.root.classList.contains('hidden')).toBe(false);
      expect(harness.confetti.clear).toHaveBeenCalled();
      expect(harness.engine.state).toBe('countdown');
      // Progress reset to the start lineup.
      expect(harness.engine.karts.every((kart) => !kart.finished)).toBe(true);
      expect(harness.karts.lastPoses).toHaveLength(4);
      // Speeds re-rolled (same seed stream continues, values should differ).
      const newSpeeds = harness.engine.karts.map((kart) => kart.speed);
      expect(newSpeeds).not.toEqual(seedSpeeds);
      // Build UI stays hidden for the replayed race.
      expect(harness.onBuildUiChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe('Build Again', () => {
    it('composes the prior Build Again callback instead of replacing it', () => {
      harness.raceToAllFinished();
      click('button[data-action="build-again"]', harness.trophy.root);
      expect(harness.priorOnBuildAgain).toHaveBeenCalledTimes(1);
      expect(harness.engine.state).toBe('idle');
    });

    it('returns to the builder with the race visuals cleared and build UI restored', () => {
      harness.raceToAllFinished();
      click('button[data-action="build-again"]', harness.trophy.root);

      expect(harness.engine.state).toBe('idle');
      expect(harness.onBuildUiChange).toHaveBeenLastCalledWith(true);
      expect(harness.trophy.root.classList.contains('hidden')).toBe(true);
      expect(harness.confetti.clear).toHaveBeenCalled();
      expect(harness.light.root.classList.contains('hidden')).toBe(true);
      expect(harness.hud.root.classList.contains('hidden')).toBe(true);
      expect(harness.audio.stopAll).toHaveBeenCalled();
    });

    it('eases the camera back to the build placement instead of snapping', () => {
      harness.raceToAllFinished();
      // Let the celebration camera settle onto the finish hold first.
      for (let i = 0; i < 120; i++) {
        harness.presentation.update(1 / 60);
      }
      const before = harness.camera.lookAt.mock.calls.at(-1);
      if (!before) {
        throw new Error('Expected a settled celebration camera');
      }

      click('button[data-action="build-again"]', harness.trophy.root);
      harness.presentation.update(1 / 60);
      const after = harness.camera.lookAt.mock.calls.at(-1);
      if (!after) {
        throw new Error('Expected a camera target after Build Again');
      }

      const build = computeCameraPlacement(harness.camera.aspect);
      const distanceBefore = Math.hypot(before[0] - build.target.x, before[2] - build.target.z);
      const distanceAfter = Math.hypot(after[0] - build.target.x, after[2] - build.target.z);
      // One frame must move toward the build placement, never cut straight to it.
      expect(distanceAfter).toBeGreaterThan(0.5);
      expect(distanceAfter).toBeLessThan(distanceBefore);

      // Continued updates settle onto the build placement.
      for (let i = 0; i < 300; i++) {
        harness.presentation.update(1 / 60);
      }
      const settled = harness.camera.lookAt.mock.calls.at(-1);
      expect(settled?.[0]).toBeCloseTo(build.target.x, 2);
      expect(settled?.[1]).toBeCloseTo(build.target.y, 2);
      expect(settled?.[2]).toBeCloseTo(build.target.z, 2);
    });
  });

  describe('pause / resume / quit', () => {
    it('composes prior HUD callbacks instead of replacing them', () => {
      harness.raceToRunning();
      click('button[data-action="pause"]', harness.hud.root);
      expect(harness.priorOnPause).toHaveBeenCalledTimes(1);
      click('button[data-action="resume"]', harness.hud.overlay);
      expect(harness.priorOnResume).toHaveBeenCalledTimes(1);
    });

    it('freezes the engine when pause is tapped', () => {
      harness.raceToRunning();
      harness.presentation.update(0.2);
      const kart0 = harness.engine.karts[0];
      if (!kart0) {
        throw new Error('Expected kart 0');
      }
      const progressBefore = kart0.progress;

      click('button[data-action="pause"]', harness.hud.root);
      harness.presentation.update(0.5);

      expect(harness.engine.karts[0]?.progress).toBeCloseTo(progressBefore);
      expect(harness.hud.overlay.hidden).toBe(false);
    });

    it('resumes the race when resume is tapped', () => {
      harness.raceToRunning();
      click('button[data-action="pause"]', harness.hud.root);
      click('button[data-action="resume"]', harness.hud.overlay);
      harness.presentation.update(0.3);
      expect(harness.engine.karts[0]?.progress).toBeGreaterThan(0);
      expect(harness.hud.overlay.hidden).toBe(true);
    });

    it('quits to the builder, restores build UI, and clears race visuals', () => {
      harness.raceToRunning();
      click('button[data-action="pause"]', harness.hud.root);
      click('button[data-action="quit"]', harness.hud.overlay);
      click('button[data-confirm="yes"]', harness.hud.confirm);

      expect(harness.engine.state).toBe('idle');
      expect(harness.onBuildUiChange).toHaveBeenLastCalledWith(true);
      expect(harness.light.root.classList.contains('hidden')).toBe(true);
      expect(harness.hud.root.classList.contains('hidden')).toBe(true);
      expect(harness.confetti.clear).toHaveBeenCalled();
    });
  });

  describe('holdForInterruption', () => {
    it('holds a running race behind the resume/quit overlay and suspends audio', () => {
      harness.raceToRunning();
      const progressBefore = harness.engine.karts[0]?.progress ?? 0;
      harness.presentation.holdForInterruption();
      expect(harness.hud.overlay.hidden).toBe(false);
      expect(harness.hud.root.classList.contains('hidden')).toBe(false);
      expect(
        harness.hud.root.querySelector('[data-action="pause"]')?.classList.contains('hidden'),
      ).toBe(true);
      expect(harness.audio.suspendAll).toHaveBeenCalledTimes(1);
      harness.presentation.update(0.5);
      expect(harness.engine.karts[0]?.progress).toBeCloseTo(progressBefore);
    });

    it('holds a countdown even though the HUD root was never revealed', () => {
      harness.presentation.beginRace();
      harness.presentation.update(0.01);
      expect(harness.engine.state).toBe('countdown');
      harness.presentation.holdForInterruption();
      expect(harness.hud.root.classList.contains('hidden')).toBe(false);
      expect(harness.hud.overlay.hidden).toBe(false);
      expect(harness.audio.suspendAll).toHaveBeenCalledTimes(1);
    });

    it('is a no-op in the builder (idle)', () => {
      harness.presentation.holdForInterruption();
      expect(harness.audio.suspendAll).not.toHaveBeenCalled();
      expect(harness.hud.overlay.hidden).toBe(true);
      expect(harness.hud.root.classList.contains('hidden')).toBe(true);
    });

    it('is a no-op once the trophy is showing', () => {
      harness.raceToAllFinished();
      expect(harness.trophy.root.classList.contains('hidden')).toBe(false);
      harness.presentation.holdForInterruption();
      expect(harness.hud.overlay.hidden).toBe(true);
      expect(harness.audio.suspendAll).not.toHaveBeenCalled();
    });

    it('a second hold changes nothing', () => {
      harness.raceToRunning();
      harness.presentation.holdForInterruption();
      harness.presentation.holdForInterruption();
      expect(harness.audio.suspendAll).toHaveBeenCalledTimes(1);
    });

    it('resumes the race from the hold overlay', () => {
      harness.raceToRunning();
      const progressBefore = harness.engine.karts[0]?.progress ?? 0;
      harness.presentation.holdForInterruption();
      click('button[data-action="resume"]', harness.hud.overlay);
      harness.presentation.update(0.3);
      expect(harness.engine.karts[0]?.progress).toBeGreaterThan(progressBefore);
      expect(harness.audio.resumeAll).toHaveBeenCalledTimes(1);
      expect(harness.hud.overlay.hidden).toBe(true);
    });

    it('can hold again after a resume', () => {
      harness.raceToRunning();
      harness.presentation.holdForInterruption();
      click('button[data-action="resume"]', harness.hud.overlay);
      harness.presentation.holdForInterruption();
      expect(harness.audio.suspendAll).toHaveBeenCalledTimes(2);
    });

    it('reports the hold state through isHolding()', () => {
      expect(harness.presentation.isHolding()).toBe(false);
      harness.raceToRunning();
      expect(harness.presentation.isHolding()).toBe(false);
      harness.presentation.holdForInterruption();
      expect(harness.presentation.isHolding()).toBe(true);
      click('button[data-action="resume"]', harness.hud.overlay);
      expect(harness.presentation.isHolding()).toBe(false);
    });

    it('clears the hold state when the race is quit', () => {
      harness.raceToRunning();
      harness.presentation.holdForInterruption();
      click('button[data-action="quit"]', harness.hud.overlay);
      click('[data-confirm="yes"]', harness.hud.confirm);
      expect(harness.presentation.isHolding()).toBe(false);
    });
  });

  describe('countdown & GO sounds', () => {
    it('beeps once per countdown step, descending 3-2-1, then GO once', () => {
      const stepped = createHarness({ countdownSeconds: 3 });
      stepped.presentation.beginRace();
      for (let i = 0; i < 220; i++) {
        stepped.presentation.update(1 / 60);
      }
      const beeps = stepped.onCountdownBeep.mock.calls.map((call) => call[0]);
      expect(beeps).toEqual([3, 2, 1]);
      expect(stepped.onGo).toHaveBeenCalledTimes(1);
    });

    it('beeps once for a short countdown and plays GO when the race starts', () => {
      harness.raceToRunning();
      expect(harness.onCountdownBeep).toHaveBeenCalledTimes(1);
      // A 0.05 s countdown only reaches step 1 before running.
      expect(harness.onCountdownBeep).toHaveBeenCalledWith(1);
      expect(harness.onGo).toHaveBeenCalledTimes(1);
    });

    it('does not beep or replay GO while running or finished', () => {
      harness.raceToRunning();
      const beepsInCountdown = harness.onCountdownBeep.mock.calls.length;
      const goCalls = harness.onGo.mock.calls.length;
      harness.presentation.update(0.5);
      expect(harness.onCountdownBeep.mock.calls.length).toBe(beepsInCountdown);
      expect(harness.onGo.mock.calls.length).toBe(goCalls);
    });

    it('replays the countdown beep and GO on RACE AGAIN', () => {
      harness.raceToAllFinished();
      const beepsBefore = harness.onCountdownBeep.mock.calls.length;
      click('button[data-action="again"]', harness.trophy.root);
      for (let i = 0; i < 10; i++) {
        harness.presentation.update(1 / 60);
      }
      expect(harness.onCountdownBeep.mock.calls.length).toBeGreaterThan(beepsBefore);
      expect(harness.onGo).toHaveBeenCalledTimes(2);
    });
  });

  describe('race audio lifecycle', () => {
    it('starts the music at the countdown and the hum at GO', () => {
      const harness = createHarness();
      harness.raceToRunning();
      expect(harness.audio.startMusic).toHaveBeenCalledTimes(1);
      expect(harness.audio.startHum).toHaveBeenCalledTimes(1);
    });

    it('keeps the music continuous and replays the hum across RACE AGAIN', () => {
      const harness = createHarness();
      harness.raceToAllFinished();
      click('button[data-action="again"]', harness.trophy.root);
      harness.presentation.update(0.06);
      // Continuity is the director's job (startMusic is idempotent); the hum restarts.
      expect(harness.audio.startMusic).toHaveBeenCalled();
      expect(harness.audio.startHum).toHaveBeenCalledTimes(2);
    });

    it('stops the hum at the finish and plays the jingle with the trophy', () => {
      const harness = createHarness();
      harness.raceToAllFinished();
      expect(harness.audio.stopHum).toHaveBeenCalled();
      expect(harness.audio.playVictoryJingle).toHaveBeenCalledTimes(1);
    });

    it('pauses and resumes all audio with the HUD', () => {
      const harness = createHarness();
      harness.raceToRunning();
      click('button[data-action="pause"]', harness.hud.root);
      expect(harness.audio.suspendAll).toHaveBeenCalledTimes(1);
      click('button[data-action="resume"]', harness.hud.overlay);
      expect(harness.audio.resumeAll).toHaveBeenCalledTimes(1);
    });

    it('stops all audio when quitting to the builder', () => {
      const harness = createHarness();
      harness.raceToRunning();
      click('button[data-action="pause"]', harness.hud.root);
      click('button[data-action="quit"]', harness.hud.overlay);
      click('button[data-confirm="yes"]', harness.hud.confirm);
      harness.presentation.update(1 / 60);
      expect(harness.audio.stopAll).toHaveBeenCalled();
    });
  });

  describe('kart motion visuals', () => {
    it('feeds bounded suspension channels through the sink while racing', () => {
      harness.raceToRunning();
      harness.presentation.update(0.5);
      expect(harness.karts.lastPoses).toHaveLength(4);
      for (const pose of harness.karts.lastPoses) {
        expect(Number.isFinite(pose.roll)).toBe(true);
        expect(Number.isFinite(pose.pitch)).toBe(true);
        expect(Number.isFinite(pose.bob)).toBe(true);
        expect(Math.abs(pose.roll)).toBeLessThanOrEqual(MAX_ROLL + 1e-9);
        expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(MAX_PITCH + 1e-9);
        expect(Math.abs(pose.bob)).toBeLessThanOrEqual(BOB_AMPLITUDE + 1e-12);
      }
    });

    it('picks up launch nose-up pitch shortly after GO', () => {
      harness.presentation.beginRace();
      // Finish the countdown, then ride the launch ramp.
      harness.presentation.update(0.06);
      let maxPitch = 0;
      for (let i = 0; i < 30; i++) {
        harness.presentation.update(1 / 60);
        for (const pose of harness.karts.lastPoses) {
          maxPitch = Math.max(maxPitch, pose.pitch);
        }
      }
      expect(maxPitch).toBeGreaterThan(0.01);
    });

    it('settles suspension while parked on the grid', () => {
      harness.presentation.beginRace();
      harness.presentation.update(0.01);
      for (const pose of harness.karts.lastPoses) {
        expect(pose.bob).toBeCloseTo(0, 12);
        expect(pose.pitch).toBeCloseTo(0, 12);
      }
    });
  });

  describe('update', () => {
    it('ticks the engine each frame', () => {
      harness.presentation.beginRace();
      const stateBefore = harness.engine.state;
      harness.presentation.update(1);
      // Countdown is only 0.05 s, so a 1 s tick must leave running.
      expect(stateBefore).toBe('countdown');
      expect(harness.engine.state).toBe('running');
    });

    it('updates confetti each frame after a burst', () => {
      harness.raceToAllFinished();
      const callsBefore = harness.confetti.update.mock.calls.length;
      harness.presentation.update(0.016);
      expect(harness.confetti.update.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  describe('photo-finish time dilation', () => {
    function stubTracker(timeScale: number): PhotoFinishTracker & {
      tick: ReturnType<typeof vi.fn>;
      reset: ReturnType<typeof vi.fn>;
    } {
      const tick = vi.fn(() => ({ timeScale, accent: false }));
      const reset = vi.fn();
      return {
        tick,
        reset,
        get armed() {
          return timeScale < 1;
        },
      };
    }

    it('feeds live kart samples and the unresolved flag to the tracker', () => {
      const tracker = stubTracker(1);
      const harness = createHarness({ photoFinish: tracker });
      const progressBefore = harness.engine.karts[0]?.progress ?? -1;
      harness.raceToRunning();
      const call = tracker.tick.mock.calls[0]?.[0] as PhotoFinishTickInput | undefined;
      expect(call?.dt).toBeCloseTo(0.06);
      expect(call?.lapLength).toBe(harness.engine.lapLength);
      expect(call?.samples).toHaveLength(4);
      expect(call?.photoFinish).toBeNull();
      const sample0 = call?.samples?.[0];
      expect(sample0?.progress).toBe(progressBefore);
      expect(sample0?.pace).toBe(harness.engine.karts[0]?.speed);
      expect(sample0?.finished).toBe(false);
    });

    it('scales the tick the engine receives while the tracker slows time', () => {
      const scaled = createHarness({ countdownSeconds: 3, photoFinish: stubTracker(0.5) });
      scaled.presentation.beginRace();
      scaled.presentation.update(1 / 60);
      expect(scaled.engine.countdownRemaining).toBeCloseTo(3 - 0.5 / 60, 10);

      const normal = createHarness({ countdownSeconds: 3, photoFinish: stubTracker(1) });
      normal.presentation.beginRace();
      normal.presentation.update(1 / 60);
      expect(normal.engine.countdownRemaining).toBeCloseTo(3 - 1 / 60, 10);
    });

    it('dilates the visual layers with the same scaled step', () => {
      const harness = createHarness({ photoFinish: stubTracker(0.5) });
      harness.presentation.beginRace();
      for (let i = 0; i < 30 && harness.engine.state !== 'running'; i++) {
        harness.presentation.update(1 / 60);
      }
      expect(harness.engine.state).toBe('running');
      harness.presentation.update(1 / 60);
      expect(harness.confetti.update).toHaveBeenLastCalledWith((1 / 60) * 0.5);
    });

    it('eases the camera by the scaled step so motion stays coherent', () => {
      const harness = createHarness({ photoFinish: stubTracker(0.5) });
      harness.presentation.beginRace();
      for (let i = 0; i < 30 && harness.engine.state !== 'running'; i++) {
        harness.presentation.update(1 / 60);
      }
      const firstLook = harness.camera.lookAt.mock.calls.at(-1);
      if (!firstLook) {
        throw new Error('Expected an initial camera target');
      }
      harness.presentation.update(1 / 60);
      const nextTarget = packTarget(harness);
      const t = 1 - Math.exp(-CAMERA_SMOOTH_RATE * ((1 / 60) * 0.5));
      const expectedX = firstLook[0] + (nextTarget.x - firstLook[0]) * t;
      const expectedZ = firstLook[2] + (nextTarget.z - firstLook[2]) * t;
      const look = harness.camera.lookAt.mock.calls.at(-1);
      expect(look?.[0]).toBeCloseTo(expectedX, 3);
      expect(look?.[2]).toBeCloseTo(expectedZ, 3);
    });

    it('keeps full speed with the real tracker away from the finish', () => {
      const harness = createHarness({ countdownSeconds: 3 });
      harness.presentation.beginRace();
      harness.presentation.update(1 / 60);
      expect(harness.engine.countdownRemaining).toBeCloseTo(3 - 1 / 60, 10);
    });

    it('freezes the ramp while paused and resumes it on resume', () => {
      const tracker = stubTracker(1);
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      click('button[data-action="pause"]', harness.hud.root);
      tracker.tick.mockClear();
      harness.presentation.update(0.5);
      expect(tracker.tick).not.toHaveBeenCalled();
      click('button[data-action="resume"]', harness.hud.overlay);
      harness.presentation.update(0.1);
      expect(tracker.tick).toHaveBeenCalledTimes(1);
    });

    it('freezes the ramp while held for interruption and resumes from the overlay', () => {
      const tracker = stubTracker(1);
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      harness.presentation.holdForInterruption();
      tracker.tick.mockClear();
      harness.presentation.update(0.5);
      expect(tracker.tick).not.toHaveBeenCalled();
      click('button[data-action="resume"]', harness.hud.overlay);
      harness.presentation.update(0.1);
      expect(tracker.tick).toHaveBeenCalledTimes(1);
    });

    it('resets the tracker when a new countdown starts (RACE AGAIN)', () => {
      const tracker = stubTracker(1);
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToAllFinished();
      tracker.reset.mockClear();
      click('button[data-action="again"]', harness.trophy.root);
      expect(tracker.reset).toHaveBeenCalledTimes(1);
    });

    it('resets the tracker when leaving the race for the builder', () => {
      const buildAgain = stubTracker(1);
      const buildAgainHarness = createHarness({ photoFinish: buildAgain });
      buildAgainHarness.raceToAllFinished();
      buildAgain.reset.mockClear();
      click('button[data-action="build-again"]', buildAgainHarness.trophy.root);
      expect(buildAgain.reset).toHaveBeenCalledTimes(1);

      const quit = stubTracker(1);
      const quitHarness = createHarness({ photoFinish: quit });
      quitHarness.raceToRunning();
      quit.reset.mockClear();
      click('button[data-action="pause"]', quitHarness.hud.root);
      click('button[data-action="quit"]', quitHarness.hud.overlay);
      click('button[data-confirm="yes"]', quitHarness.hud.confirm);
      expect(quit.reset).toHaveBeenCalledTimes(1);
    });

    it('reports the resolved flag once two karts have crossed', () => {
      const tracker = stubTracker(1);
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToAllFinished();
      const lastCall = tracker.tick.mock.calls.at(-1)?.[0] as PhotoFinishTickInput | undefined;
      expect(typeof lastCall?.photoFinish).toBe('boolean');
      expect(lastCall?.photoFinish).toBe(harness.engine.result?.photoFinish);
    });
  });

  function sequencedTracker(): PhotoFinishTracker & {
    tick: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    setArmed: (value: boolean) => void;
    setScale: (value: number) => void;
  } {
    let armed = false;
    let scale = 1;
    const tick = vi.fn(() => ({ timeScale: scale, accent: false }));
    const reset = vi.fn();
    return {
      tick,
      reset,
      setArmed(value) {
        armed = value;
      },
      setScale(value) {
        scale = value;
      },
      get armed() {
        return armed;
      },
    };
  }

  describe('photo-finish camera push', () => {
    function pushStub(): PhotoFinishTracker & {
      tick: ReturnType<typeof vi.fn>;
      reset: ReturnType<typeof vi.fn>;
    } {
      const tick = vi.fn(() => ({ timeScale: 1, accent: false }));
      const reset = vi.fn();
      return {
        tick,
        reset,
        get armed() {
          return true;
        },
      };
    }

    /** Distance from the last recorded camera pose (position.set -> lookAt). */
    function cameraDistance(target: Harness): number {
      const set = target.camera.position.set.mock.calls.at(-1);
      const look = target.camera.lookAt.mock.calls.at(-1);
      if (!set || !look) {
        throw new Error('Expected a camera pose');
      }
      return Math.hypot(set[0] - look[0], set[1] - look[1], set[2] - look[2]);
    }

    it('pushes the finished hold in on confirmation and eases back to standard', () => {
      const tracker = pushStub();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToAllFinished();
      harness.presentation.update(1 / 60);
      const standard = cameraDistance(harness);
      // The flag confirms: the next tracker tick reports the one-shot accent.
      tracker.tick.mockReturnValueOnce({ timeScale: 1, accent: true });
      harness.presentation.update(1 / 60);
      for (let i = 0; i < 12; i++) {
        harness.presentation.update(1 / 60);
      }
      const pushed = cameraDistance(harness);
      expect(pushed).toBeLessThan(standard);
      expect(pushed).toBeGreaterThanOrEqual(standard * (1 - PHOTO_FINISH_PUSH) - 1e-6);
      for (let i = 0; i < 160; i++) {
        harness.presentation.update(1 / 60);
      }
      expect(cameraDistance(harness)).toBeCloseTo(standard, 1);
    });

    it('never pushes on a finish that is not a photo finish', () => {
      const tracker = pushStub();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToAllFinished();
      harness.presentation.update(1 / 60);
      const standard = cameraDistance(harness);
      for (let i = 0; i < 160; i++) {
        harness.presentation.update(1 / 60);
      }
      expect(cameraDistance(harness)).toBeCloseTo(standard, 1);
    });
  });

  describe('photo-finish audio choreography', () => {
    it('begins the slow-motion treatment once when armed and ends it when the scale restores', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      expect(harness.audio.beginPhotoFinish).not.toHaveBeenCalled();

      tracker.setArmed(true);
      tracker.setScale(0.7);
      harness.presentation.update(1 / 60);
      harness.presentation.update(1 / 60);
      expect(harness.audio.beginPhotoFinish).toHaveBeenCalledTimes(1);
      expect(harness.audio.endPhotoFinish).not.toHaveBeenCalled();

      tracker.setScale(1);
      harness.presentation.update(1 / 60);
      expect(harness.audio.endPhotoFinish).toHaveBeenCalledTimes(1);
      harness.presentation.update(1 / 60);
      expect(harness.audio.beginPhotoFinish).toHaveBeenCalledTimes(1);
      expect(harness.audio.endPhotoFinish).toHaveBeenCalledTimes(1);
    });

    it('fires the crowd cheer exactly once on the confirmed accent', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      tracker.setArmed(true);
      tracker.setScale(0.7);
      tracker.tick.mockReturnValueOnce({ timeScale: 0.7, accent: true });
      harness.presentation.update(1 / 60);
      harness.presentation.update(1 / 60);
      harness.presentation.update(1 / 60);
      expect(harness.audio.playCrowdCheer).toHaveBeenCalledTimes(1);
    });

    it('leaves the audio untouched during an ordinary race', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToAllFinished();
      expect(harness.audio.playCrowdCheer).not.toHaveBeenCalled();
      expect(harness.audio.beginPhotoFinish).not.toHaveBeenCalled();
      expect(harness.audio.endPhotoFinish).not.toHaveBeenCalled();
    });

    it('ends the treatment when restarting mid-sequence (RACE AGAIN)', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      tracker.setArmed(true);
      tracker.setScale(0.7);
      harness.presentation.update(1 / 60);
      expect(harness.audio.beginPhotoFinish).toHaveBeenCalledTimes(1);
      harness.raceToAllFinished();
      expect(harness.audio.endPhotoFinish).not.toHaveBeenCalled();
      click('button[data-action="again"]', harness.trophy.root);
      expect(harness.audio.endPhotoFinish).toHaveBeenCalledTimes(1);
    });

    it('freezes the treatment during an interruption hold and ends after resume', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      tracker.setArmed(true);
      tracker.setScale(0.7);
      harness.presentation.update(1 / 60);
      harness.presentation.holdForInterruption();
      tracker.setScale(1);
      harness.presentation.update(0.5);
      expect(harness.audio.endPhotoFinish).not.toHaveBeenCalled();
      click('button[data-action="resume"]', harness.hud.overlay);
      harness.presentation.update(1 / 60);
      expect(harness.audio.endPhotoFinish).toHaveBeenCalledTimes(1);
    });
  });

  describe('photo-finish flash overlay', () => {
    it('flashes exactly once on the confirmed accent', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      tracker.tick.mockReturnValueOnce({ timeScale: 1, accent: true });
      harness.presentation.update(1 / 60);
      harness.presentation.update(1 / 60);
      harness.presentation.update(1 / 60);
      expect(harness.flash.flash).toHaveBeenCalledTimes(1);
    });

    it('never flashes on a finish that is not a photo finish', () => {
      const harness = createHarness();
      harness.raceToAllFinished();
      for (let i = 0; i < 120; i++) {
        harness.presentation.update(1 / 60);
      }
      expect(harness.flash.flash).not.toHaveBeenCalled();
    });

    it('clears any in-flight pulse when the race resets (RACE AGAIN)', () => {
      const tracker = sequencedTracker();
      const harness = createHarness({ photoFinish: tracker });
      harness.raceToRunning();
      tracker.tick.mockReturnValueOnce({ timeScale: 1, accent: true });
      harness.presentation.update(1 / 60);
      expect(harness.flash.flash).toHaveBeenCalledTimes(1);
      harness.raceToAllFinished();
      click('button[data-action="again"]', harness.trophy.root);
      expect(harness.flash.hide).toHaveBeenCalledTimes(1);
    });
  });
});
