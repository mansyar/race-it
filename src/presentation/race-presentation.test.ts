import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRaceEngine, type RaceEngine } from '../race/engine';
import type { LoopCell } from '../race/path';
import type { KartPose } from '../render/kart-rig';
import { createRaceHud } from '../ui/race-hud';
import { createTrafficLight } from '../ui/traffic-light';
import { createTrophy } from '../ui/trophy';
import {
  createRacePresentation,
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
  karts: { update: ReturnType<typeof vi.fn>; lastPoses: KartPose[] };
  camera: {
    position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
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
  };
  priorOnPause: ReturnType<typeof vi.fn>;
  priorOnResume: ReturnType<typeof vi.fn>;
  priorOnQuit: ReturnType<typeof vi.fn>;
  priorOnAgain: ReturnType<typeof vi.fn>;
  /** Advances presentation through a full countdown into running. */
  raceToRunning(seconds?: number): void;
  /** Ticks engine + presentation until the race is finished (all karts). */
  raceToAllFinished(): void;
  /** Ticks until the winner crosses the finish line. */
  raceToFirstFinish(): void;
}

function createHarness(options: { countdownSeconds?: number } = {}): Harness {
  const engine = createRaceEngine(path, {
    seed: 42,
    countdownSeconds: options.countdownSeconds ?? 0.05,
  });
  const light = createTrafficLight();
  const priorOnPause = vi.fn();
  const priorOnResume = vi.fn();
  const priorOnQuit = vi.fn();
  const priorOnAgain = vi.fn();
  const hud = createRaceHud({
    onPause: priorOnPause,
    onResume: priorOnResume,
    onQuit: priorOnQuit,
  });
  const trophy = createTrophy({ onAgain: priorOnAgain });
  const confetti = {
    burst: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
  };
  const lastPoses: KartPose[] = [];
  const karts = {
    update: vi.fn((poses: KartPose[]) => {
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
    onBuildUiChange,
    onCountdownBeep,
    onGo,
    audio,
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
    priorOnPause,
    priorOnResume,
    priorOnQuit,
    priorOnAgain,
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

    it('spins the winner kart yaw over the victory window', () => {
      harness.raceToFirstFinish();
      const winner = harness.engine.result?.winnerIndex;
      expect(winner).toBeGreaterThanOrEqual(0);
      const winnerIndex = winner ?? 0;
      // Capture the pose at the start of the spin (one frame after the finish event).
      const before = harness.karts.lastPoses[winnerIndex];
      if (!before) {
        throw new Error('Expected a winner pose at finish');
      }
      const beforeHeading = before.heading;
      harness.presentation.update(VICTORY_SPIN_SECONDS / 2);
      const after = harness.karts.lastPoses[winnerIndex];
      if (!after) {
        throw new Error('Expected a winner pose mid-spin');
      }
      const delta = after.heading - beforeHeading;
      // Half a turn of extra yaw after halfway through the spin.
      expect(Math.abs(delta)).toBeGreaterThan(1);
      expect(Math.abs(delta)).toBeLessThanOrEqual(Math.PI + 0.2);
    });

    it('hides the pause button once the race is finished', () => {
      harness.raceToAllFinished();
      const pause = harness.hud.root.querySelector('[data-action="pause"]');
      expect(pause?.classList.contains('hidden')).toBe(true);
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
    harness.presentation.update(1 / 60);
    expect(harness.audio.startMusic).toHaveBeenCalledTimes(1);
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
});
