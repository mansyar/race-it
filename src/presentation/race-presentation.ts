import { baseSpeedFor, type Kart, type RaceEngine, type RaceState } from '../race/engine';
import type { LoopCell } from '../race/path';
import { RUNOUT_SECONDS, runoutOffset, visualPose } from '../render/kart-motion';
import { type KartPose, kartPose } from '../render/kart-rig';
import { computeCameraPlacement, gridToWorld } from '../render/layout';
import { type RaceCameraPhase, raceCameraPose } from '../render/race-camera';
import type { RaceHud } from '../ui/race-hud';
import type { TrafficLight } from '../ui/traffic-light';
import type { Trophy } from '../ui/trophy';
import { createPhotoFinishTracker, type PhotoFinishTracker } from './photo-finish';

/** Winner color words for the trophy overlay (product-guidelines palette). */
export const WINNER_COLOR_WORDS = ['Red', 'Blue', 'Green', 'Yellow'] as const;
/** Duration of the winner victory spin, in seconds. */
export const VICTORY_SPIN_SECONDS = 2.0;

/** How long the green GO light stays lit after the race starts. */
export const GO_FLASH_SECONDS = 0.8;

/** How long the photo-finish camera push eases back to the standard hold (seconds). */
export const PHOTO_PUSH_RELEASE_SECONDS = 0.9;

/** Exponential camera smoothing rate (higher = snappier follow). */
export const CAMERA_SMOOTH_RATE = 8;

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
  /** Eases music tempo + dips the hum while the photo-finish slow motion runs. */
  beginPhotoFinish?: () => void;
  /** Restores the standard mix when the photo-finish sequence releases. */
  endPhotoFinish?: () => void;
  /** Plays the crowd cheer on the confirmed photo finish. */
  playCrowdCheer?: () => void;
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

/** DOM flash sink fired once when a photo finish is confirmed. */
export interface FlashSink {
  /** Starts the single soft pulse. */
  flash(): void;
  /** Clears any in-flight pulse when the race resets. */
  hide(): void;
}

export interface RacePresentationOptions {
  engine: RaceEngine;
  path: LoopCell[];
  trafficLight: TrafficLight;
  raceHud: RaceHud;
  trophy: Trophy;
  confetti: ConfettiLike;
  karts: KartPoseSink;
  /**
   * Race kart slot per engine kart index (car picker lineup). Engine kart 0
   * renders/trophies as the color at kartOrder[0]; omitted = 0..n-1 order.
   */
  kartOrder?: number[];
  camera: CameraLike;
  /** Show/hide the builder HUD (palette, GO, shelf/clear). Mute stays. */
  onBuildUiChange?: (visible: boolean) => void;
  /** Countdown step (3, 2, 1) — beep cue sink, synced to the light steps. */
  onCountdownBeep?: (step: number) => void;
  /** The countdown finished and the race started running — GO cue sink. */
  onGo?: () => void;
  /** Race audio layers (music, hum, jingle) driven by the race lifecycle. */
  audio?: RaceAudioDirector;
  /**
   * Photo-finish tracker override (test seam). Defaults to a fresh tracker
   * owned by this presentation.
   */
  photoFinish?: PhotoFinishTracker;
  /** Photo-finish flash layer; omitted = no flash (headless/debug runs). */
  flash?: FlashSink;
}

export interface RacePresentation {
  /** Hides build UI and starts the engine countdown. No-op unless idle. */
  beginRace(): void;
  /** Ticks the engine and advances presentation for one frame. */
  update(dt: number): void;
  /** Abandons any race and restores builder visuals. */
  resetToBuild(): void;
  /**
   * Holds an in-flight race (countdown/running) behind the resume/quit
   * overlay for interruptions (app hidden or switched away). No-op otherwise.
   */
  holdForInterruption(): void;
  /** True while the race is held behind the resume/quit overlay. */
  isHolding(): boolean;
}

/**
 * Indices of the lead battle: the leading kart and its closest rival (the
 * kart with the next-highest progress). The rival is null for a lone kart.
 */
export function leadBattle(karts: readonly Kart[]): {
  leadIndex: number;
  rivalIndex: number | null;
} {
  let leadIndex = -1;
  let rivalIndex = -1;
  for (let i = 0; i < karts.length; i++) {
    const kart = karts[i];
    if (!kart) {
      continue;
    }
    const lead = leadIndex < 0 ? undefined : karts[leadIndex];
    if (!lead || kart.progress > lead.progress) {
      rivalIndex = leadIndex;
      leadIndex = i;
    } else if (rivalIndex < 0 || kart.progress > (karts[rivalIndex]?.progress ?? -1)) {
      rivalIndex = i;
    }
  }
  return { leadIndex, rivalIndex: rivalIndex < 0 ? null : rivalIndex };
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
  const tracker = options.photoFinish ?? createPhotoFinishTracker();

  let goFlashRemaining = 0;
  let spinning = false;
  let spinElapsed = 0;
  let winnerIndex: number | null = null;
  let trophyShown = false;
  let confettiSeed = 1;
  let runoutPace: number | null = null;
  let hasSmoothedCamera = false;
  // One-shot: Build Again keeps camera smoothing through the idle reset so the
  // view eases back to the build placement instead of cutting to it.
  let sustainCameraSmoothing = false;
  let smoothedPos = { x: 0, y: 0, z: 0 };
  let smoothedTarget = { x: 0, y: 0, z: 0 };
  let lastCountdown = -1;
  let prevProgress: number[] = engine.karts.map((kart) => kart.progress);
  let prevPace: number[] = engine.karts.map(() => 0);
  const baseSpeed = baseSpeedFor(engine.lapLength);
  let held = false;
  // Pause overlay state: freezes the photo-finish ramp clock while paused.
  let pausedHold = false;
  // Current photo-finish time scale applied to the frame delta.
  let timeScale = 1;
  // Photo-finish push envelope clock; starts expired, re-armed to 0 by the
  // tracker's one-shot confirm accent.
  let pushElapsed = PHOTO_PUSH_RELEASE_SECONDS;
  // Photo-finish audio treatment: active from the arming edge to scale restore.
  let slowMotionAudio = false;
  // Previous arm state, so the treatment starts on the arming edge only.
  let armedPrev = false;

  function resetCelebration(): void {
    spinning = false;
    spinElapsed = 0;
    runoutPace = null;
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
    hasSmoothedCamera = sustainCameraSmoothing;
    sustainCameraSmoothing = false;
    options.onBuildUiChange?.(true);
  }

  const priorPause = raceHud.callbacks.onPause;
  const priorResume = raceHud.callbacks.onResume;
  const priorQuit = raceHud.callbacks.onQuit;
  const priorAgain = trophy.callbacks.onAgain;
  raceHud.callbacks.onPause = () => {
    priorPause();
    pausedHold = true;
    options.audio?.suspendAll();
    engine.pause();
  };
  raceHud.callbacks.onResume = () => {
    priorResume();
    held = false;
    pausedHold = false;
    engine.resume();
    options.audio?.resumeAll();
  };
  raceHud.callbacks.onQuit = () => {
    priorQuit();
    held = false;
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

  // Build Again: like RACE AGAIN, the engine reset lives here — the main
  // callback only supplies the click SFX. Abandoning drives the idle branch
  // (audio stopAll, trophy/confetti/HUD/light reset, build UI restored) and the
  // sustained smoothing lets the camera ease back to the build placement.
  const priorBuildAgain = trophy.callbacks.onBuildAgain;
  trophy.callbacks.onBuildAgain = () => {
    priorBuildAgain();
    // Only the finished trophy can reach this; guard so a repeated tap after
    // the reset cannot leave the one-shot smoothing flag set without an emit.
    if (engine.state !== 'idle') {
      sustainCameraSmoothing = true;
      engine.abandon();
    }
  };

  engine.on('stateChange', (state) => {
    held = false;
    pausedHold = false;
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
      prevProgress = engine.karts.map((kart) => kart.progress);
      prevPace = engine.karts.map(() => 0);
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
      if (slowMotionAudio) {
        slowMotionAudio = false;
        options.audio?.endPhotoFinish?.();
      }
      armedPrev = false;
      options.flash?.hide();
      tracker.reset();
      timeScale = 1;
      pushElapsed = PHOTO_PUSH_RELEASE_SECONDS;
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

  /** Measures each kart's pace (relative to base) and pace change from movement. */
  function measurePaces(dt: number): { paces: number[]; accels: number[] } {
    const paces = engine.karts.map((kart, index) => {
      const previous = prevProgress[index] ?? kart.progress;
      const pace = dt > 1e-6 ? (kart.progress - previous) / dt / baseSpeed : 1;
      return Math.min(2, Math.max(0, pace));
    });
    const accels = paces.map((pace, index) => {
      const previous = prevPace[index] ?? 0;
      const accel = dt > 1e-6 ? (pace - previous) / dt : 0;
      return Math.min(8, Math.max(-8, accel));
    });
    prevProgress = engine.karts.map((kart) => kart.progress);
    prevPace = paces;
    return { paces, accels };
  }

  function currentPoses(paces: number[], accels: number[]): KartPose[] {
    const poses = engine.karts.map((kart, index) =>
      visualPose(path, {
        progress: kart.progress,
        lane: kart.lane,
        pace: paces[index] ?? 1,
        accel: accels[index] ?? 0,
        kartIndex: index,
      }),
    );
    if (winnerIndex !== null) {
      const base = poses[winnerIndex];
      const winner = engine.karts[winnerIndex];
      if (base && winner) {
        if (runoutPace === null) {
          runoutPace = Math.min(1, Math.max(0, paces[winnerIndex] ?? 1));
        }
        // The engine freezes finished karts; the roll-out is a visual offset
        // past the line, capped at half a unit at racing pace.
        const rolled = kartPose(
          path,
          winner.progress + runoutOffset(spinElapsed, runoutPace),
          winner.lane,
        );
        poses[winnerIndex] = {
          ...base,
          x: rolled.x,
          z: rolled.z,
          heading: victorySpinHeading(
            rolled.heading,
            spinning ? (spinElapsed - RUNOUT_SECONDS) / VICTORY_SPIN_SECONDS : 1,
          ),
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
    const words = options.kartOrder
      ? options.kartOrder.map((kart) => WINNER_COLOR_WORDS[kart] ?? 'Winner')
      : [...WINNER_COLOR_WORDS];
    trophy.show(engine.result, words);
    trophyShown = true;
    options.audio?.playVictoryJingle();
    raceHud.hide();
  }

  function updateVictorySpin(dt: number): void {
    if (!spinning) {
      return;
    }
    spinElapsed += dt;
    if (spinElapsed >= RUNOUT_SECONDS + VICTORY_SPIN_SECONDS) {
      spinning = false;
    }
  }

  function updateCamera(dt: number, poses: KartPose[], push: number): void {
    if (path.length === 0 || engine.karts.length === 0) {
      return;
    }
    const build = computeCameraPlacement(camera.aspect);
    const phase = cameraPhase(engine.state);
    const { leadIndex, rivalIndex } = leadBattle(engine.karts);
    const leadPose = poses[leadIndex];
    if (!leadPose) {
      return;
    }
    const rivalPose = rivalIndex === null ? undefined : poses[rivalIndex];
    const heading = { x: Math.cos(leadPose.heading), z: -Math.sin(leadPose.heading) };
    const targetPose = raceCameraPose({
      phase,
      lead: { x: leadPose.x, z: leadPose.z },
      rival: rivalPose ? { x: rivalPose.x, z: rivalPose.z } : null,
      heading,
      finishPoint: finishOrigin,
      buildPlacement: build,
      aspect: camera.aspect,
      push,
    });

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

  /**
   * Advances the photo-finish tracker for one frame and returns the time scale
   * to apply to it. Frozen while paused or held for an interruption so the
   * ramp's wall-clock windows do not run behind an overlay; the idle branch
   * resets the tracker (and the scale) when the race is abandoned. Starts the
   * slow-motion audio treatment on the arming edge and ends it when the scale
   * restores (or on reset).
   */
  function tickPhotoFinish(dt: number): number {
    if (held || pausedHold || engine.state === 'idle') {
      return timeScale;
    }
    const finishedCount = engine.karts.filter((kart) => kart.finished).length;
    const resolved = finishedCount >= 2 ? (engine.result?.photoFinish ?? null) : null;
    const { timeScale: next, accent } = tracker.tick({
      dt,
      lapLength: engine.lapLength,
      samples: engine.karts.map((kart) => ({
        progress: kart.progress,
        pace: kart.speed,
        finished: kart.finished,
      })),
      photoFinish: resolved,
    });
    timeScale = next;
    if (accent) {
      pushElapsed = 0;
      options.audio?.playCrowdCheer?.();
      options.flash?.flash();
    }
    const armedNow = tracker.armed;
    if (armedNow && !armedPrev && !slowMotionAudio) {
      slowMotionAudio = true;
      options.audio?.beginPhotoFinish?.();
    } else if (slowMotionAudio && next >= 1) {
      slowMotionAudio = false;
      options.audio?.endPhotoFinish?.();
    }
    armedPrev = armedNow;
    return timeScale;
  }

  /** Current photo-finish push amount (1 = fully pushed in, 0 = standard hold). */
  function photoPushAmount(): number {
    if (pushElapsed >= PHOTO_PUSH_RELEASE_SECONDS) {
      return 0;
    }
    const t = pushElapsed / PHOTO_PUSH_RELEASE_SECONDS;
    return 1 - t * t * (3 - 2 * t);
  }

  /**
   * Advances the push envelope by the scaled step. Frozen while paused or held
   * for an interruption, mirroring the ramp freeze; the idle branch resets it.
   */
  function advancePhotoPush(dt: number): number {
    if (!held && !pausedHold) {
      pushElapsed += dt;
    }
    return photoPushAmount();
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
      const scaledDt = dt * tickPhotoFinish(dt);
      const push = advancePhotoPush(scaledDt);
      engine.tick(scaledDt);
      updateGoFlash(scaledDt);
      updateTrafficLight();
      updateVictorySpin(scaledDt);
      updateTrophy();
      const { paces, accels } = measurePaces(scaledDt);
      const poses = currentPoses(paces, accels);
      karts.update(poses);
      confetti.update(scaledDt);
      updateCamera(scaledDt, poses, push);
    },
    holdForInterruption() {
      if (held || (engine.state !== 'countdown' && engine.state !== 'running')) {
        return;
      }
      held = true;
      engine.pause();
      options.audio?.suspendAll();
      raceHud.showOverlay();
    },
    isHolding() {
      return held;
    },
    resetToBuild() {
      engine.abandon();
    },
  };
}
