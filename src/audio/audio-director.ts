import { SFX } from '../assets/manifest';

/** Names of the bundled one-shot sound effects. */
export type SfxName = keyof typeof SFX;

/** Minimal audio element surface used for one-shots and the music loop. */
export interface PlayableAudio {
  play: () => void;
  volume: number;
  /** Optional playback-rate shaping (countdown pitch rises per step). */
  playbackRate?: number;
}

/** Minimal WebAudio gain node surface used by the director. */
export interface GainNodeLike {
  gain: { value: number };
  connect(destination: unknown): void;
}

/** Minimal WebAudio context surface used by the director. */
export interface AudioContextLike {
  destination: unknown;
  createGain(): GainNodeLike;
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

const MUTE_STORAGE_KEY = 'race-it:muted';

/** Central audio hub for the toy: one-shots, gain staging, mute persistence. */
export interface AudioDirector {
  playOneShot: (name: SfxName) => void;
  /** Plays the countdown beep; step 3 = first (lowest), step 1 = last (highest). */
  playCountdownBeep: (step: number) => void;
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
 * factory at the one-shot stage (0.8), and a mute toggle persisted under
 * `race-it:muted`. Muting silences the master gain (graph-routed layers) and
 * suppresses new one-shot elements; unmuting restores the master gain.
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

  function playElement(url: string, playbackRate?: number): void {
    const element = makeAudio(url);
    element.volume = GAINS.oneShot;
    if (playbackRate !== undefined) {
      element.playbackRate = playbackRate;
    }
    element.play();
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
    setMuted(value: boolean): void {
      muted = value;
      masterGain.gain.value = value ? 0 : GAINS.master;
      localStorage.setItem(MUTE_STORAGE_KEY, String(value));
    },
    isMuted: () => muted,
  };
}
