import { MUSIC, SFX } from '../assets/manifest';

/** Names of the bundled one-shot sound effects. */
export type SfxName = keyof typeof SFX;

/** Minimal audio element surface used for one-shots and the music loop. */
export interface PlayableAudio {
  play: () => void;
  volume: number;
  /** Optional playback-rate shaping (countdown pitch rises per step). */
  playbackRate?: number;
  /** Optional looping for the background music element. */
  loop?: boolean;
  /** Optional pausing (music loop). */
  pause?: () => void;
}

/** Minimal WebAudio param surface used by the director (hum ramps). */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  cancelScheduledValues(time: number): void;
}

/** Minimal WebAudio gain node surface used by the director. */
export interface GainNodeLike {
  gain: AudioParamLike;
  connect(destination: unknown): void;
}

/** Minimal WebAudio oscillator surface used by the procedural engine hum. */
export interface OscillatorNodeLike {
  type: OscillatorType;
  frequency: AudioParamLike;
  connect(destination: unknown): void;
  start(): void;
  stop(when?: number): void;
}

/** Minimal WebAudio filter surface used by the procedural engine hum. */
export interface BiquadFilterNodeLike {
  type: BiquadFilterType;
  frequency: AudioParamLike;
  connect(destination: unknown): void;
}

/** Minimal WebAudio context surface used by the director. */
export interface AudioContextLike {
  destination: unknown;
  currentTime: number;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  suspend(): void;
  resume(): void;
}

/** Mix gain stages: SFX (0.8) > music (0.35) > hum (0.15) under master (0.9). */
export const GAINS = {
  master: 0.9,
  oneShot: 0.8,
  music: 0.35,
  hum: 0.15,
} as const;

/**
 * Playback rates for the countdown beep, indexed by steps remaining (3 →
 * first beep, 1 → last beep). Pitch rises toward the GO light.
 */
export const COUNTDOWN_RATES = [1, 1.25, 1.5] as const;

/** Hum fade in/out duration in seconds (spec: ~300-500 ms). */
export const HUM_FADE_SECONDS = 0.4;

/** Fraction the music is ducked while the victory jingle plays (spec: ~40%). */
export const VICTORY_DUCK = 0.4;

/** How long the victory jingle ducks the music, in seconds. */
export const JINGLE_SECONDS = 3;

/** Procedural engine hum oscillator blend (Hz) under a low-pass filter. */
export const HUM_OSCILLATOR_HZ = [80, 160] as const;
export const HUM_FILTER_HZ = 400;

const MUTE_STORAGE_KEY = 'race-it:muted';

/** Audio layers the race presentation drives: music, hum, jingle, suspend. */
export interface AudioDirector {
  playOneShot: (name: SfxName) => void;
  /** Plays the countdown beep; step 3 = first (lowest), step 1 = last (highest). */
  playCountdownBeep: (step: number) => void;
  /** Starts (or continues) the looping background music at music gain. */
  startMusic: () => void;
  /** Stops the background music for good (return to the builder). */
  stopMusic: () => void;
  /** Fades in the procedural engine hum while the race runs. */
  startHum: () => void;
  /** Fades out the engine hum and stops its oscillators. */
  stopHum: () => void;
  /** Plays the victory jingle once, ducking the music, then swells back. */
  playVictoryJingle: () => void;
  /** Silences everything in place (mid-race pause, page hidden). */
  suspendAll: () => void;
  /** Restores whatever was suspended (resume, page visible again). */
  resumeAll: () => void;
  /** Stops hum + music permanently (quit / back to the builder). */
  stopAll: () => void;
  /** Resumes the WebAudio context inside a user gesture (iOS unlock). */
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
}

export interface AudioDirectorOptions {
  makeAudio?: (url: string) => PlayableAudio;
  makeAudioContext?: () => AudioContextLike;
}

/**
 * Creates the audio director: a shared master gain (0.9) on an injectable
 * WebAudio context, one-shot playback through an injectable audio-element
 * factory at the one-shot stage (0.8), a looping background-music element at
 * the music stage (0.35), a procedural engine hum (oscillator blend + low-pass
 * on the graph at the hum stage, 0.15), and a mute toggle persisted under
 * `race-it:muted`. Muting silences the master gain (graph-routed layers),
 * suppresses new one-shot elements, and pauses the music element.
 * @param options - Injectable audio element + WebAudio context factories.
 * @returns The director facade.
 */
export function createAudioDirector(options: AudioDirectorOptions = {}): AudioDirector {
  const makeAudio: (url: string) => PlayableAudio = options.makeAudio ?? ((url) => new Audio(url));
  const makeAudioContext: () => AudioContextLike =
    options.makeAudioContext ?? (() => new AudioContext());
  const context = makeAudioContext();
  const masterGain = context.createGain();
  masterGain.gain.value = GAINS.master;
  masterGain.connect(context.destination);

  let muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  if (muted) {
    masterGain.gain.value = 0;
  }

  let musicElement: PlayableAudio | undefined;
  let wantMusic = false;
  let suspended = false;
  let jingleDuckTimer: number | undefined;
  let humGain: GainNodeLike | undefined;
  let humOscillators: OscillatorNodeLike[] = [];

  function playElement(url: string, playbackRate?: number): void {
    const element = makeAudio(url);
    element.volume = GAINS.oneShot;
    if (playbackRate !== undefined) {
      element.playbackRate = playbackRate;
    }
    element.play();
  }

  function rampHum(target: number, at: number): void {
    const gain = humGain?.gain;
    if (!gain) {
      return;
    }
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(target, at);
  }

  function startMusicInternal(): void {
    wantMusic = true;
    if (muted || musicElement) {
      return;
    }
    const element = makeAudio(MUSIC.loop);
    element.volume = GAINS.music;
    element.loop = true;
    element.play();
    musicElement = element;
  }

  function stopMusicInternal(): void {
    wantMusic = false;
    if (jingleDuckTimer !== undefined) {
      clearTimeout(jingleDuckTimer);
      jingleDuckTimer = undefined;
    }
    musicElement?.pause?.();
    musicElement = undefined;
  }

  function stopHumInternal(): void {
    const gainNode = humGain;
    if (!gainNode) {
      return;
    }
    humGain = undefined;
    const at = context.currentTime;
    gainNode.gain.cancelScheduledValues(at);
    gainNode.gain.setValueAtTime(gainNode.gain.value, at);
    gainNode.gain.linearRampToValueAtTime(0, at + HUM_FADE_SECONDS);
    for (const oscillator of humOscillators) {
      oscillator.stop(at + HUM_FADE_SECONDS);
    }
    humOscillators = [];
  }

  return {
    playOneShot(name: SfxName): void {
      if (muted) {
        return;
      }
      playElement(SFX[name]);
    },
    playCountdownBeep(step: number): void {
      if (muted) {
        return;
      }
      const index = Math.min(COUNTDOWN_RATES.length - 1, Math.max(0, 3 - step));
      const rate = COUNTDOWN_RATES[index];
      if (rate === undefined) {
        return;
      }
      playElement(SFX.countdown, rate);
    },
    startMusic(): void {
      startMusicInternal();
    },
    stopMusic(): void {
      stopMusicInternal();
    },
    startHum(): void {
      // If a previous hum is still fading out (instant RACE AGAIN), a fresh
      // graph starts on purpose and the old one finishes its fade — the brief
      // overlap is the cost of seamless race restarts.
      if (humGain) {
        return;
      }
      const gainNode = context.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(masterGain);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = HUM_FILTER_HZ;
      filter.connect(gainNode);
      humOscillators = HUM_OSCILLATOR_HZ.map((hz) => {
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = hz;
        oscillator.connect(filter);
        oscillator.start();
        return oscillator;
      });
      humGain = gainNode;
      rampHum(GAINS.hum, context.currentTime);
    },
    stopHum(): void {
      stopHumInternal();
    },
    playVictoryJingle(): void {
      if (muted) {
        return;
      }
      playElement(SFX.jingle);
      const music = musicElement;
      if (!music) {
        return;
      }
      music.volume = GAINS.music * (1 - VICTORY_DUCK);
      jingleDuckTimer = window.setTimeout(() => {
        jingleDuckTimer = undefined;
        music.volume = GAINS.music;
      }, JINGLE_SECONDS * 1000);
    },
    suspendAll(): void {
      suspended = true;
      context.suspend();
      musicElement?.pause?.();
      rampHum(0, context.currentTime);
    },
    resumeAll(): void {
      if (!suspended) {
        return;
      }
      suspended = false;
      // Resuming an already-unlocked context outside a user gesture is
      // permitted by modern iOS Safari (verified on device).
      context.resume();
      if (musicElement && wantMusic && !muted) {
        musicElement.play();
      }
      rampHum(GAINS.hum, context.currentTime);
    },
    stopAll(): void {
      suspended = false;
      stopHumInternal();
      stopMusicInternal();
    },
    unlock(): void {
      context.resume();
    },
    setMuted(value: boolean): void {
      muted = value;
      masterGain.gain.value = value ? 0 : GAINS.master;
      localStorage.setItem(MUTE_STORAGE_KEY, String(value));
      if (value) {
        musicElement?.pause?.();
        return;
      }
      if (wantMusic && musicElement) {
        musicElement.play();
        return;
      }
      if (wantMusic) {
        startMusicInternal();
      }
    },
    isMuted: () => muted,
  };
}
