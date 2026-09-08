import { SFX } from '../assets/manifest';

/** Names of the bundled interface sounds. */
export type SfxName = keyof typeof SFX;

/** Minimal audio element surface used for playback. */
export interface PlayableAudio {
  play: () => void;
}

/**
 * Creates a tiny sound-effect player honoring the mute toggle.
 * @param makeAudio - Audio element factory (injectable for tests).
 * @returns Player with play/setMuted/isMuted.
 */
export function createSfx(makeAudio: (url: string) => PlayableAudio = (url) => new Audio(url)): {
  play: (name: SfxName) => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
} {
  let muted = false;
  return {
    play(name: SfxName): void {
      if (!muted) {
        makeAudio(SFX[name]).play();
      }
    },
    setMuted(value: boolean): void {
      muted = value;
    },
    isMuted: () => muted,
  };
}
