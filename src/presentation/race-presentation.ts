import type { Kart, RaceEngine, RaceState } from '../race/engine';
import type { LoopCell } from '../race/path';
import { type KartPose, kartPose } from '../render/kart-rig';
import { computeCameraPlacement, gridToWorld } from '../render/layout';
import { type RaceCameraPhase, raceCameraPose } from '../render/race-camera';
import type { RaceHud } from '../ui/race-hud';
import type { TrafficLight } from '../ui/traffic-light';
import type { Trophy } from '../ui/trophy';

/** Winner color words for the trophy overlay (product-guidelines palette). */
export const WINNER_COLOR_WORDS = ['Red', 'Blue', 'Green', 'Yellow'] as const;

/** Duration of the winner victory spin, in seconds. */
export const VICTORY_SPIN_SECONDS = 2.0;

/** How long the green GO light stays lit after the race starts. */
export const GO_FLASH_SECONDS = 0.8;

/** Exponential camera smoothing rate (higher = snappier follow). */
const CAMERA_SMOOTH_RATE = 6;

/**
 * Adds a full yaw turn over the victory spin window. Progress is clamped to
 * [0, 1]; callers recompute the base heading each frame from the kart pose.
 */
export function victorySpinHeading(baseHeading: number, spinProgress: number): number {
  const t = Math.min(1, Math.max(0, spinProgress));
  return baseHeading + t * Math.PI * 2;
}

/** Sink that places kart meshes for the current frame (KartRenderer-compatible). */
export interface KartPoseSink {
  update(poses: KartPose[]): unknown;
}

/** Audio sink the presentation drives for the race's music/hum/jingle layers. */
export interface RaceAudioDirector {
  /** Starts (or continues) the looping background music. */
  startMusic: () => void;
  /** Fades in the procedural engine hum. */
  startHum: () => void;
  /** Fades out the engine hum. */
  stopHum: () => void;
  /** Plays the victory jingle once (music ducks underneath). */
  playVictoryJingle: () => void;
  /** Silences everything (mid-race pause). */
  suspendAll: () => void;
  /** Restores everything (mid-race resume). */
  resumeAll: () => void;
  /** Stops hum + music permanently (quit / back to the builder). */
  stopAll: () => void;
}

/** Confetti burst lifecycle (ConfettiBurst-compatible). */
export interface ConfettiLike {
  burst(origin: { x: number; z: number }, seed: number): void;
  update(dt: number): void;
  clear(): void;
}

/** Minimal camera surface the presentation writes to each frame. */
export interface CameraLike {
  position: { set: (x: number, y: number, z: number) => void };
  lookAt: (x: number, y: number, z: number) => void;
  aspect: number;
}

export interface RacePresentationOptions {
  engine: RaceEngine;
  path: LoopCell[];
  trafficLight: TrafficLight;
  raceHud: RaceHud;
  trophy: Trophy;
  confetti: ConfettiLike;
  karts: KartPoseSink;
  camera: CameraLike;
  /** Show/hide the builder HUD (palette, GO, shelf/clear). Mute stays. */
  onBuildUiChange?: (visible: boolean) => void;
  /** Countdown step (3, 2, 1) — beep cue sink, synced to the light steps. */
  onCountdownBeep?: (step: number) => void;
  /** The countdown finished and the race started running — GO cue sink. */
  onGo?: () => void;
  /** Race audio layers (music, hum, jingle) driven by the race lifecycle. */
  audio?: RaceAudioDirector;
}

export interface RacePresentation {
  /** Hides build UI and starts the engine countdown. No-op unless idle. */
  beginRace(): void;
  /** Ticks the engine and advances presentation for one frame. */
  update(dt: number): void;
  /** Abandons any race and restores builder visuals. */
  resetToBuild(): void;
}

function leadKart(karts: Kart[]): Kart {
  const first = karts[0];
  if (!first) {
    throw new RangeError('leadKart: karts must not be empty');
  }
  let lead = first;
  for (const kart of karts) {
    if (kart.progress > lead.progress) {
      lead = kart;
    }
  }
  return lead;
}

function cameraPhase(state: RaceState): RaceCameraPhase {
  if (state === 'idle') {
    return 'build';
  }
  return state;
}

/**
 * Quantizes countdown seconds into the traffic-light step (3, 2, 1) using the
 * same ceil/clamp mapping as the light, so beeps stay synced to the discs.
 */
function countdownStep(remaining: number): number {
  return Math.min(3, Math.max(1, Math.ceil(remaining)));
}

/**
 * Event-driven race presentation layer. The merged race engine remains the
 * source of truth; this controller maps engine events onto the traffic light,
 * pause HUD, trophy, confetti, kart poses, and the drifting race camera.
 */
export function createRacePresentation(options: RacePresentationOptions): RacePresentation {
  const { engine, path, trafficLight, raceHud, trophy, confetti, karts, camera } = options;
  const startCell = path[0];
  const finishOrigin = startCell ? gridToWorld(startCell.x, startCell.y) : { x: 0, z: 0 };

  let goFlashRemaining = 0;
  let spinning = false;
  let spinElapsed = 0;
  let winnerIndex: number | null = null;
  let trophyShown = false;
  let confettiSeed = 1;
  let hasSmoothedCamera = false;
  let smoothedPos = { x: 0, y: 0, z: 0 };
  let smoothedTarget = { x: 0, y: 0, z: 0 };
  let lastCountdown = -1;

  function resetCelebration(): void {
    spinning = false;
    spinElapsed = 0;
    winnerIndex = null;
    trophyShown = false;
    trophy.hide();
    confetti.clear();
  }

  function resetToBuildVisuals(): void {
    resetCelebration();
    goFlashRemaining = 0;
    trafficLight.reset();
    raceHud.reset();
    hasSmoothedCamera = false;
    options.onBuildUiChange?.(true);
  }

  const priorPause = raceHud.callbacks.onPause;
  const priorResume = raceHud.callbacks.onResume;
  const priorQuit = raceHud.callbacks.onQuit;
  const priorAgain = trophy.callbacks.onAgain;
  raceHud.callbacks.onPause = () => {
    priorPause();
    options.audio?.suspendAll();
    engine.pause();
  };
  raceHud.callbacks.onResume = () => {
    priorResume();
    engine.resume();
    options.audio?.resumeAll();
  };
  raceHud.callbacks.onQuit = () => {
    priorQuit();
    options.audio?.stopAll();
    engine.abandon();
  };
  trophy.callbacks.onAgain = () => {
    priorAgain();
    resetCelebration();
    goFlashRemaining = 0;
    trafficLight.reset();
    raceHud.reset();
    hasSmoothedCamera = false;
    engine.restart();
    engine.start();
  };

  engine.on('stateChange', (state) => {
    if (state === 'countdown') {
      options.onBuildUiChange?.(false);
      options.audio?.startMusic();
      resetCelebration();
      goFlashRemaining = 0;
      raceHud.hide();
      trafficLight.setCountdown(engine.countdownRemaining);
      lastCountdown = countdownStep(engine.countdownRemaining);
      options.onCountdownBeep?.(lastCountdown);
      hasSmoothedCamera = false;
      return;
    }
    if (state === 'running') {
      options.onGo?.();
      options.audio?.startHum();
      trafficLight.setGo();
      goFlashRemaining = GO_FLASH_SECONDS;
      raceHud.showPause();
      return;
    }
    if (state === 'finished') {
      options.audio?.stopHum();
      raceHud.hide();
      return;
    }
    if (state === 'idle') {
      options.audio?.stopAll();
      resetToBuildVisuals();
    }
  });

  engine.on('finish', (result) => {
    winnerIndex = result.winnerIndex;
    spinning = true;
    spinElapsed = 0;
    confettiSeed += 1;
    confetti.burst(finishOrigin, confettiSeed);
  });

  function currentPoses(): KartPose[] {
    const poses = engine.karts.map((kart) => kartPose(path, kart.progress, kart.lane));
    if (spinning && winnerIndex !== null) {
      const base = poses[winnerIndex];
      if (base) {
        poses[winnerIndex] = {
          x: base.x,
          z: base.z,
          heading: victorySpinHeading(base.heading, spinElapsed / VICTORY_SPIN_SECONDS),
        };
      }
    }
    return poses;
  }

  function updateTrafficLight(): void {
    if (engine.state === 'countdown') {
      const remaining = engine.countdownRemaining;
      trafficLight.setCountdown(remaining);
      const step = countdownStep(remaining);
      if (step !== lastCountdown) {
        lastCountdown = step;
        options.onCountdownBeep?.(step);
      }
    } else {
      lastCountdown = -1;
    }
  }

  function updateGoFlash(dt: number): void {
    if (goFlashRemaining <= 0) {
      return;
    }
    goFlashRemaining -= dt;
    if (goFlashRemaining <= 0) {
      goFlashRemaining = 0;
      trafficLight.reset();
    }
  }

  function updateTrophy(): void {
    if (trophyShown || engine.result === null) {
      return;
    }
    if (engine.state !== 'finished' || !engine.karts.every((kart) => kart.finished)) {
      return;
    }
    trophy.show(engine.result, [...WINNER_COLOR_WORDS]);
    trophyShown = true;
    options.audio?.playVictoryJingle();
    raceHud.hide();
  }

  function updateVictorySpin(dt: number): void {
    if (!spinning) {
      return;
    }
    spinElapsed += dt;
    if (spinElapsed >= VICTORY_SPIN_SECONDS) {
      spinning = false;
    }
  }

  function updateCamera(dt: number): void {
    if (path.length === 0 || engine.karts.length === 0) {
      return;
    }
    const build = computeCameraPlacement(camera.aspect);
    const phase = cameraPhase(engine.state);
    const lead = leadKart(engine.karts);
    const leadWorld = kartPose(path, lead.progress, 0);
    const finishRatio = Math.max(0, lead.progress / engine.lapLength);
    const targetPose = raceCameraPose(phase, leadWorld, finishRatio, build);

    if (!hasSmoothedCamera) {
      smoothedPos = { ...targetPose.position };
      smoothedTarget = { ...targetPose.target };
      hasSmoothedCamera = true;
    } else {
      const t = 1 - Math.exp(-CAMERA_SMOOTH_RATE * dt);
      smoothedPos.x += (targetPose.position.x - smoothedPos.x) * t;
      smoothedPos.y += (targetPose.position.y - smoothedPos.y) * t;
      smoothedPos.z += (targetPose.position.z - smoothedPos.z) * t;
      smoothedTarget.x += (targetPose.target.x - smoothedTarget.x) * t;
      smoothedTarget.y += (targetPose.target.y - smoothedTarget.y) * t;
      smoothedTarget.z += (targetPose.target.z - smoothedTarget.z) * t;
    }

    camera.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
    camera.lookAt(smoothedTarget.x, smoothedTarget.y, smoothedTarget.z);
  }

  return {
    beginRace() {
      if (engine.state !== 'idle') {
        return;
      }
      options.onBuildUiChange?.(false);
      engine.start();
    },
    update(dt: number) {
      engine.tick(dt);
      updateGoFlash(dt);
      updateTrafficLight();
      updateVictorySpin(dt);
      updateTrophy();
      karts.update(currentPoses());
      confetti.update(dt);
      updateCamera(dt);
    },
    resetToBuild() {
      engine.abandon();
    },
  };
}
