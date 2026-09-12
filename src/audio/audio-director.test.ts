import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC, SFX } from '../assets/manifest';
import {
  COUNTDOWN_RATES,
  createAudioDirector,
  GAINS,
  JINGLE_SECONDS,
  MUSIC_TEMPO_EASE_MS,
  PHOTO_FINISH_HUM_DUCK,
  PHOTO_FINISH_MUSIC_RATE,
  SFX_POOL_SIZE,
  type SfxName,
  VICTORY_DUCK,
  WARM_POLL_INTERVAL_MS,
  WARM_READY_STATE,
  WARM_TIMEOUT_MS,
} from './audio-director';

interface RampCall {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'cancelScheduledValues';
  value: number;
  time: number;
}

interface FakeParam {
  value: number;
  ramps: RampCall[];
  setValueAtTime: (value: number, time: number) => void;
  linearRampToValueAtTime: (value: number, time: number) => void;
  cancelScheduledValues: (time: number) => void;
}

function createFakeParam(value: number): FakeParam {
  const ramps: RampCall[] = [];
  return {
    value,
    ramps,
    setValueAtTime(v, t) {
      ramps.push({ method: 'setValueAtTime', value: v, time: t });
    },
    linearRampToValueAtTime(v, t) {
      ramps.push({ method: 'linearRampToValueAtTime', value: v, time: t });
    },
    cancelScheduledValues(t) {
      ramps.push({ method: 'cancelScheduledValues', value: 0, time: t });
    },
  };
}

interface FakeNodeBase {
  kind: 'gain' | 'oscillator' | 'filter';
  connects: unknown[];
  connect: (destination: unknown) => void;
  starts: number;
  stops: number;
  start: () => void;
  stop: () => void;
}

interface FakeGainNode extends FakeNodeBase {
  kind: 'gain';
  gain: FakeParam;
}

interface FakeOscillatorNode extends FakeNodeBase {
  kind: 'oscillator';
  type: OscillatorType;
  frequency: FakeParam;
}

interface FakeFilterNode extends FakeNodeBase {
  kind: 'filter';
  type: BiquadFilterType;
  frequency: FakeParam;
}

type FakeNode = FakeGainNode | FakeOscillatorNode | FakeFilterNode;

interface FakeContext {
  destination: unknown;
  currentTime: number;
  nodes: FakeNode[];
  suspends: number;
  resumes: number;
  createGain: () => FakeGainNode;
  createOscillator: () => FakeOscillatorNode;
  createBiquadFilter: () => FakeFilterNode;
  suspend: () => void;
  resume: () => void;
}

function createFakeContext(): FakeContext {
  const nodes: FakeNode[] = [];
  return {
    destination: { label: 'destination' },
    currentTime: 0,
    nodes,
    suspends: 0,
    resumes: 0,
    createGain() {
      const node: FakeGainNode = {
        kind: 'gain',
        gain: createFakeParam(1),
        connects: [],
        connect(destination) {
          this.connects.push(destination);
        },
        starts: 0,
        stops: 0,
        start() {
          this.starts += 1;
        },
        stop() {
          this.stops += 1;
        },
      };
      nodes.push(node);
      return node;
    },
    createOscillator() {
      const node: FakeOscillatorNode = {
        kind: 'oscillator',
        type: 'sawtooth',
        frequency: createFakeParam(440),
        connects: [],
        connect(destination) {
          this.connects.push(destination);
        },
        starts: 0,
        stops: 0,
        start() {
          this.starts += 1;
        },
        stop() {
          this.stops += 1;
        },
      };
      nodes.push(node);
      return node;
    },
    createBiquadFilter() {
      const node: FakeFilterNode = {
        kind: 'filter',
        type: 'lowpass',
        frequency: createFakeParam(350),
        connects: [],
        connect(destination) {
          this.connects.push(destination);
        },
        starts: 0,
        stops: 0,
        start() {
          this.starts += 1;
        },
        stop() {
          this.stops += 1;
        },
      };
      nodes.push(node);
      return node;
    },
    suspend() {
      this.suspends += 1;
    },
    resume() {
      this.resumes += 1;
    },
  };
}

interface PlayedEntry {
  url: string;
  volume: number;
  playbackRate: number;
  loop: boolean;
}

interface FakeElement {
  url: string;
  volume: number;
  playbackRate: number;
  loop: boolean;
  plays: number;
  pauses: number;
  play: () => void;
  pause: () => void;
}

function masterNodeOf(context: FakeContext): FakeGainNode {
  const node = context.nodes.find((candidate) => candidate.kind === 'gain');
  if (node?.kind !== 'gain') {
    throw new Error('expected the master gain node to exist');
  }
  return node;
}

function humGainOf(context: FakeContext): FakeGainNode {
  const master = masterNodeOf(context);
  const node = context.nodes.find((candidate) => candidate.kind === 'gain' && candidate !== master);
  if (node?.kind !== 'gain') {
    throw new Error('expected the hum gain node to exist');
  }
  return node;
}

function rampValuesOf(node: FakeGainNode, method: RampCall['method']): number[] {
  return node.gain.ramps.filter((call) => call.method === method).map((call) => call.value);
}

function oscillatorsOf(context: FakeContext): FakeOscillatorNode[] {
  return context.nodes.filter((node): node is FakeOscillatorNode => node.kind === 'oscillator');
}

describe('createAudioDirector', () => {
  let played: PlayedEntry[];
  let elements: FakeElement[];
  let context: FakeContext;

  beforeEach(() => {
    localStorage.clear();
    played = [];
    elements = [];
    context = createFakeContext();
  });

  function createDirector() {
    return createAudioDirector({
      makeAudio: (url) => {
        const element: FakeElement = {
          url,
          volume: 1,
          playbackRate: 1,
          loop: false,
          plays: 0,
          pauses: 0,
          play() {
            this.plays += 1;
            played.push({
              url: this.url,
              volume: this.volume,
              playbackRate: this.playbackRate,
              loop: this.loop,
            });
          },
          pause() {
            this.pauses += 1;
          },
        };
        elements.push(element);
        return element;
      },
      makeAudioContext: () => context,
    });
  }

  it('exposes the mix gain stages', () => {
    expect(GAINS.master).toBe(0.9);
    expect(GAINS.oneShot).toBe(0.8);
    expect(GAINS.music).toBe(0.35);
    expect(GAINS.hum).toBe(0.15);
  });

  it('creates a master gain at 0.9 routed to the destination', () => {
    createDirector();
    expect(context.nodes).toHaveLength(1);
    const masterNode = masterNodeOf(context);
    expect(masterNode.gain?.value).toBe(GAINS.master);
    expect(masterNode.connects).toContain(context.destination);
  });

  it.each(Object.keys(SFX) as SfxName[])(
    'routes one-shot %s through the audio factory at one-shot gain',
    (name) => {
      const director = createDirector();
      director.playOneShot(name);
      expect(played).toHaveLength(1);
      const entry = played[0];
      expect(entry?.url).toBe(SFX[name]);
      expect(entry?.volume).toBe(GAINS.oneShot);
    },
  );

  it('does not play one-shots while muted', () => {
    const director = createDirector();
    director.setMuted(true);
    director.playOneShot('click');
    expect(played).toHaveLength(0);
  });

  it('silences the master gain while muted', () => {
    const director = createDirector();
    director.setMuted(true);
    expect(masterNodeOf(context).gain?.value).toBe(0);
  });

  it('restores master gain and playback after unmute', () => {
    const director = createDirector();
    director.setMuted(true);
    director.setMuted(false);
    expect(masterNodeOf(context).gain?.value).toBe(GAINS.master);
    director.playOneShot('confirmA');
    expect(played).toHaveLength(1);
  });

  it('persists mute state to localStorage', () => {
    const director = createDirector();
    director.setMuted(true);
    expect(localStorage.getItem('race-it:muted')).toBe('true');
  });

  it('restores a stored mute state on creation', () => {
    localStorage.setItem('race-it:muted', 'true');
    const director = createDirector();
    expect(director.isMuted()).toBe(true);
    expect(masterNodeOf(context).gain?.value).toBe(0);
  });

  it('reports its mute state', () => {
    const director = createDirector();
    expect(director.isMuted()).toBe(false);
    director.setMuted(true);
    expect(director.isMuted()).toBe(true);
  });

  it('plays countdown beeps with a rising playback rate per remaining step', () => {
    const director = createDirector();
    director.playCountdownBeep(3);
    director.playCountdownBeep(2);
    director.playCountdownBeep(1);
    expect(played).toHaveLength(3);
    expect(played.map((entry) => entry.playbackRate)).toEqual([...COUNTDOWN_RATES]);
    for (const entry of played) {
      expect(entry.url).toBe(SFX.countdown);
      expect(entry.volume).toBe(GAINS.oneShot);
    }
  });

  it('clamps out-of-range countdown steps', () => {
    const director = createDirector();
    director.playCountdownBeep(99);
    director.playCountdownBeep(0);
    const first = played[0];
    const last = played[played.length - 1];
    expect(first?.playbackRate).toBe(COUNTDOWN_RATES[0]);
    expect(last?.playbackRate).toBe(COUNTDOWN_RATES[COUNTDOWN_RATES.length - 1]);
  });

  it('does not play countdown beeps while muted', () => {
    const director = createDirector();
    director.setMuted(true);
    director.playCountdownBeep(3);
    expect(played).toHaveLength(0);
  });

  it('starts the music loop at music gain', () => {
    const director = createDirector();
    director.startMusic();
    expect(played).toHaveLength(1);
    const entry = played[0];
    expect(entry?.url).toBe(MUSIC.loop);
    expect(entry?.volume).toBe(GAINS.music);
    expect(entry?.loop).toBe(true);
  });

  it('does not restart the music while it is already playing', () => {
    const director = createDirector();
    director.startMusic();
    director.startMusic();
    expect(played).toHaveLength(1);
  });

  it('pauses and keeps the music element warm on stopMusic', () => {
    const director = createDirector();
    director.startMusic();
    const musicElement = elements[0];
    if (!musicElement) {
      throw new Error('expected the music element to exist');
    }
    director.stopMusic();
    expect(musicElement.pauses).toBe(1);
    director.startMusic();
    expect(played).toHaveLength(2);
    // The warm element is reused for the next race — no fresh construction.
    expect(elements).toHaveLength(1);
  });

  it('ramps the hum gain up to the hum stage on startHum', () => {
    const director = createDirector();
    director.startHum();
    expect(oscillatorsOf(context).length).toBeGreaterThan(0);
    const humGain = humGainOf(context);
    expect(rampValuesOf(humGain, 'linearRampToValueAtTime')).toContain(GAINS.hum);
    expect(humGain.connects).toContain(masterNodeOf(context));
  });

  it('does not start the hum twice', () => {
    const director = createDirector();
    director.startHum();
    director.startHum();
    expect(oscillatorsOf(context)).toHaveLength(2);
  });

  it('ramps the hum gain down and stops the oscillators on stopHum', () => {
    const director = createDirector();
    director.startHum();
    director.stopHum();
    const humGain = humGainOf(context);
    expect(rampValuesOf(humGain, 'linearRampToValueAtTime')).toContain(0);
    for (const oscillator of oscillatorsOf(context)) {
      expect(oscillator.stops).toBeGreaterThan(0);
    }
  });

  it('ducks the music for the victory jingle and swells back', () => {
    vi.useFakeTimers();
    try {
      const director = createDirector();
      director.startMusic();
      const musicElement = elements[0];
      if (!musicElement) {
        throw new Error('expected the music element to exist');
      }
      director.playVictoryJingle();
      expect(played.some((entry) => entry.url === SFX.jingle)).toBe(true);
      expect(musicElement.volume).toBeCloseTo(GAINS.music * (1 - 0.4));
      vi.advanceTimersByTime(3000);
      expect(musicElement.volume).toBeCloseTo(GAINS.music);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the victory jingle without ducking when no music is playing', () => {
    const director = createDirector();
    director.playVictoryJingle();
    expect(played.map((entry) => entry.url)).toEqual([SFX.jingle]);
  });

  it('suspends everything on suspendAll and restores on resumeAll', () => {
    const director = createDirector();
    director.startMusic();
    director.startHum();
    const musicElement = elements[0];
    if (!musicElement) {
      throw new Error('expected the music element to exist');
    }
    director.suspendAll();
    expect(context.suspends).toBe(1);
    expect(musicElement.pauses).toBe(1);
    expect(rampValuesOf(humGainOf(context), 'linearRampToValueAtTime')).toContain(0);
    director.resumeAll();
    expect(context.resumes).toBe(1);
    expect(musicElement.plays).toBe(2);
    expect(rampValuesOf(humGainOf(context), 'linearRampToValueAtTime')).toContain(GAINS.hum);
  });

  it('stopAll stops the hum and the music for good', () => {
    const director = createDirector();
    director.startMusic();
    director.startHum();
    const musicElement = elements[0];
    if (!musicElement) {
      throw new Error('expected the music element to exist');
    }
    const musicPlaysBefore = musicElement.plays;
    director.stopAll();
    expect(musicElement.pauses).toBe(1);
    expect(rampValuesOf(humGainOf(context), 'linearRampToValueAtTime')).toContain(0);
    director.resumeAll();
    expect(musicElement.plays).toBe(musicPlaysBefore);
  });

  it('silences the music while muted and starts it after unmute', () => {
    const director = createDirector();
    director.setMuted(true);
    director.startMusic();
    expect(played).toHaveLength(0);
    director.setMuted(false);
    expect(played).toHaveLength(1);
  });

  it('pauses a running music loop while muting and resumes it after unmuting', () => {
    const director = createDirector();
    director.startMusic();
    const musicElement = elements[0];
    if (!musicElement) {
      throw new Error('expected the music element to exist');
    }
    director.setMuted(true);
    expect(musicElement.pauses).toBe(1);
    director.setMuted(false);
    expect(musicElement.plays).toBe(2);
  });

  it('unlocks the audio context on demand', () => {
    const director = createDirector();
    director.unlock();
    expect(context.resumes).toBe(1);
  });

  it('cancels the pending jingle duck when the music stops', () => {
    vi.useFakeTimers();
    try {
      const director = createDirector();
      director.startMusic();
      const musicElement = elements[0];
      if (!musicElement) {
        throw new Error('expected the music element to exist');
      }
      director.playVictoryJingle();
      expect(musicElement.volume).toBeCloseTo(GAINS.music * (1 - VICTORY_DUCK));
      director.stopMusic();
      vi.advanceTimersByTime(JINGLE_SECONDS * 1000);
      // The discarded element must not get its volume restored by a stale timer.
      expect(musicElement.volume).toBeCloseTo(GAINS.music * (1 - VICTORY_DUCK));
    } finally {
      vi.useRealTimers();
    }
  });

  it('eases the music tempo down for the photo finish and restores it', () => {
    vi.useFakeTimers();
    try {
      const director = createDirector();
      director.startMusic();
      const musicElement = elements[0];
      if (!musicElement) {
        throw new Error('expected the music element to exist');
      }
      director.beginPhotoFinish();
      vi.advanceTimersByTime(MUSIC_TEMPO_EASE_MS);
      expect(musicElement.playbackRate).toBeCloseTo(PHOTO_FINISH_MUSIC_RATE, 4);
      vi.advanceTimersByTime(MUSIC_TEMPO_EASE_MS);
      expect(musicElement.playbackRate).toBeCloseTo(PHOTO_FINISH_MUSIC_RATE, 4);
      director.endPhotoFinish();
      vi.advanceTimersByTime(MUSIC_TEMPO_EASE_MS);
      expect(musicElement.playbackRate).toBeCloseTo(1, 4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dips the engine hum and swells it back for the photo finish', () => {
    const director = createDirector();
    director.startHum();
    const humGain = humGainOf(context);
    director.beginPhotoFinish();
    const dipped = rampValuesOf(humGain, 'linearRampToValueAtTime');
    expect(dipped[dipped.length - 1]).toBeCloseTo(GAINS.hum * (1 - PHOTO_FINISH_HUM_DUCK), 6);
    director.endPhotoFinish();
    const restored = rampValuesOf(humGain, 'linearRampToValueAtTime');
    expect(restored[restored.length - 1]).toBeCloseTo(GAINS.hum, 6);
  });

  it('applies the photo-finish treatment only once while active', () => {
    vi.useFakeTimers();
    try {
      const director = createDirector();
      director.startMusic();
      director.startHum();
      const musicElement = elements[0];
      if (!musicElement) {
        throw new Error('expected the music element to exist');
      }
      const humGain = humGainOf(context);
      director.beginPhotoFinish();
      director.beginPhotoFinish();
      vi.advanceTimersByTime(MUSIC_TEMPO_EASE_MS);
      expect(musicElement.playbackRate).toBeCloseTo(PHOTO_FINISH_MUSIC_RATE, 4);
      const dipRamps = rampValuesOf(humGain, 'linearRampToValueAtTime').filter(
        (value) => Math.abs(value - GAINS.hum * (1 - PHOTO_FINISH_HUM_DUCK)) < 1e-9,
      );
      expect(dipRamps).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the crowd cheer at one-shot gain and stays silent while muted', () => {
    const director = createDirector();
    director.playOneShot('crowdCheer');
    expect(played).toHaveLength(1);
    expect(played[0]?.url).toBe(SFX.crowdCheer);
    expect(played[0]?.volume).toBe(GAINS.oneShot);
    director.setMuted(true);
    director.playOneShot('crowdCheer');
    expect(played).toHaveLength(1);
  });

  it('plays the crowd cheer after a suspend and resume cycle', () => {
    const director = createDirector();
    director.suspendAll();
    director.resumeAll();
    director.playOneShot('crowdCheer');
    expect(played.map((entry) => entry.url)).toEqual([SFX.crowdCheer]);
  });

  it('resets a half-eased tempo when the music stops and starts again', () => {
    vi.useFakeTimers();
    try {
      const director = createDirector();
      director.startMusic();
      const musicElement = elements[0];
      if (!musicElement) {
        throw new Error('expected the music element to exist');
      }
      director.beginPhotoFinish();
      vi.advanceTimersByTime(MUSIC_TEMPO_EASE_MS / 2);
      director.stopMusic();
      director.startMusic();
      // The warm element is reused and reset to top-of-track tempo.
      expect(elements).toHaveLength(1);
      expect(musicElement.playbackRate).toBe(1);
      vi.advanceTimersByTime(MUSIC_TEMPO_EASE_MS * 2);
      expect(musicElement.playbackRate).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores the hum at the dipped level when resuming during a photo finish', () => {
    const director = createDirector();
    director.startHum();
    director.beginPhotoFinish();
    const humGain = humGainOf(context);
    director.suspendAll();
    director.resumeAll();
    const ramps = rampValuesOf(humGain, 'linearRampToValueAtTime');
    expect(ramps[ramps.length - 1]).toBeCloseTo(GAINS.hum * (1 - PHOTO_FINISH_HUM_DUCK), 6);
  });
});

describe('boot warm-up (warm pool & music reuse)', () => {
  interface WarmElement {
    url: string;
    volume: number;
    playbackRate: number;
    loop: boolean;
    currentTime: number;
    readyState: number;
    loads: number;
    plays: number;
    pauses: number;
    play: () => void | Promise<void>;
    pause: () => void;
    load: () => void;
  }

  interface WarmPlayedEntry {
    url: string;
    volume: number;
    playbackRate: number;
    currentTime: number;
  }

  let made: WarmElement[];
  let warmPlayed: WarmPlayedEntry[];
  let context: FakeContext;
  let failUrls: Set<string>;
  let blockLoads: boolean;
  let playRejects: boolean;

  beforeEach(() => {
    localStorage.clear();
    made = [];
    warmPlayed = [];
    context = createFakeContext();
    failUrls = new Set();
    blockLoads = false;
    playRejects = false;
  });

  function createWarmDirector() {
    return createAudioDirector({
      makeAudio: (url) => {
        const element: WarmElement = {
          url,
          volume: 1,
          playbackRate: 1,
          loop: false,
          currentTime: 0,
          readyState: 0,
          loads: 0,
          plays: 0,
          pauses: 0,
          play() {
            this.plays += 1;
            warmPlayed.push({
              url: this.url,
              volume: this.volume,
              playbackRate: this.playbackRate,
              currentTime: this.currentTime,
            });
            if (playRejects) {
              return Promise.reject(new Error('play blocked'));
            }
            return undefined;
          },
          pause() {
            this.pauses += 1;
          },
          load() {
            this.loads += 1;
            if (blockLoads || failUrls.has(this.url)) {
              return;
            }
            this.readyState = 4;
          },
        };
        made.push(element);
        return element;
      },
      makeAudioContext: () => context,
    });
  }

  function musicOf(): WarmElement {
    const element = made.find((candidate) => candidate.url === MUSIC.loop);
    if (!element) {
      throw new Error('expected the music element to exist');
    }
    return element;
  }

  function clickPoolOf(): WarmElement[] {
    return made.filter((candidate) => candidate.url === SFX.click);
  }

  it('reports idle entries and pool size before any warm-up', () => {
    const director = createWarmDirector();
    const snapshot = director.warmSnapshot();
    expect(snapshot.poolSize).toBe(SFX_POOL_SIZE);
    for (const name of Object.keys(SFX) as SfxName[]) {
      expect(snapshot.sounds[name]).toEqual({ status: 'idle', attempts: 0 });
    }
    expect(snapshot.music).toEqual({ status: 'idle', attempts: 0 });
  });

  it('pre-creates and loads every pooled element, then reports ready', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      const warm = director.warm();
      await vi.advanceTimersByTimeAsync(WARM_POLL_INTERVAL_MS);
      await expect(warm).resolves.toBeUndefined();
      expect(made).toHaveLength(Object.keys(SFX).length * SFX_POOL_SIZE + 1);
      for (const element of made) {
        expect(element.loads).toBe(1);
      }
      const snapshot = director.warmSnapshot();
      for (const name of Object.keys(SFX) as SfxName[]) {
        expect(snapshot.sounds[name]).toEqual({ status: 'ready', attempts: 1 });
      }
      expect(snapshot.music).toEqual({ status: 'ready', attempts: 1 });
      expect(musicOf().loop).toBe(true);
      expect(musicOf().volume).toBe(GAINS.music);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when any element fails to warm and marks only that sound failed', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      failUrls.add(SFX.click);
      const warm = director.warm();
      warm.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(WARM_TIMEOUT_MS + WARM_POLL_INTERVAL_MS);
      await expect(warm).rejects.toThrow();
      const snapshot = director.warmSnapshot();
      expect(snapshot.sounds.click).toEqual({ status: 'failed', attempts: 1 });
      expect(snapshot.sounds.place).toEqual({ status: 'ready', attempts: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves ready sounds alone and re-attempts only failed ones on re-warm', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      failUrls.add(SFX.click);
      const first = director.warm();
      first.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(WARM_TIMEOUT_MS + WARM_POLL_INTERVAL_MS);
      await expect(first).rejects.toThrow();
      const clickPool = clickPoolOf();
      expect(clickPool).toHaveLength(SFX_POOL_SIZE);
      for (const element of clickPool) {
        expect(element.loads).toBe(1);
      }
      const placeElement = made.find((candidate) => candidate.url === SFX.place);
      if (!placeElement) {
        throw new Error('expected a place element to exist');
      }
      failUrls.delete(SFX.click);
      await expect(director.warm()).resolves.toBeUndefined();
      for (const element of clickPool) {
        expect(element.loads).toBe(2);
      }
      expect(placeElement.loads).toBe(1);
      const snapshot = director.warmSnapshot();
      expect(snapshot.sounds.click).toEqual({ status: 'ready', attempts: 2 });
      expect(snapshot.sounds.place).toEqual({ status: 'ready', attempts: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one in-flight attempt between concurrent warm() calls', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      blockLoads = true;
      const first = director.warm();
      const second = director.warm();
      expect(second).toBe(first);
      blockLoads = false;
      for (const element of made) {
        element.readyState = WARM_READY_STATE;
      }
      await vi.advanceTimersByTimeAsync(WARM_POLL_INTERVAL_MS);
      await expect(first).resolves.toBeUndefined();
      const snapshot = director.warmSnapshot();
      expect(snapshot.sounds.click).toEqual({ status: 'ready', attempts: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports warming while loads are pending and ready once they settle', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      blockLoads = true;
      const warm = director.warm();
      const mid = director.warmSnapshot();
      expect(mid.sounds.click).toEqual({ status: 'warming', attempts: 1 });
      expect(mid.music).toEqual({ status: 'warming', attempts: 1 });
      for (const element of made) {
        element.readyState = WARM_READY_STATE;
      }
      await vi.advanceTimersByTimeAsync(WARM_POLL_INTERVAL_MS);
      await expect(warm).resolves.toBeUndefined();
      expect(director.warmSnapshot().sounds.click).toEqual({ status: 'ready', attempts: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays one-shots from the warmed pool without constructing new elements', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      await director.warm();
      const created = made.length;
      const clickPool = clickPoolOf();
      const first = clickPool[0];
      if (!first) {
        throw new Error('expected the first click element to exist');
      }
      first.currentTime = 5;
      director.playOneShot('click');
      director.playOneShot('click');
      director.playOneShot('click');
      expect(made).toHaveLength(created);
      expect(clickPool[0]?.plays).toBe(2);
      expect(clickPool[1]?.plays).toBe(1);
      expect(first.currentTime).toBe(0);
      expect(warmPlayed).toHaveLength(3);
      for (const entry of warmPlayed) {
        expect(entry.volume).toBe(GAINS.oneShot);
        expect(entry.playbackRate).toBe(1);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses the countdown pool with a fresh playback rate per beep', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      await director.warm();
      director.playCountdownBeep(3);
      director.playCountdownBeep(2);
      director.playCountdownBeep(1);
      director.playCountdownBeep(3);
      expect(warmPlayed.map((entry) => entry.playbackRate)).toEqual([
        ...COUNTDOWN_RATES,
        COUNTDOWN_RATES[0],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('swallows play() rejections without an unhandled promise', async () => {
    vi.useFakeTimers();
    try {
      const director = createWarmDirector();
      await director.warm();
      playRejects = true;
      expect(() => {
        director.playOneShot('click');
      }).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      expect(clickPoolOf()[0]?.plays).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates the music element once during warm() and reuses it across races', async () => {
    const director = createWarmDirector();
    await director.warm();
    const musicElement = musicOf();
    const created = made.length;
    director.startMusic();
    expect(musicElement.plays).toBe(1);
    director.stopMusic();
    expect(musicElement.pauses).toBe(1);
    director.startMusic();
    expect(musicElement.plays).toBe(2);
    expect(made).toHaveLength(created);
  });

  it('resets the music to the top with fresh mix state for a new race', async () => {
    const director = createWarmDirector();
    await director.warm();
    const musicElement = musicOf();
    musicElement.currentTime = 7;
    musicElement.playbackRate = 0.9;
    musicElement.volume = 0.2;
    director.startMusic();
    expect(musicElement.currentTime).toBe(0);
    expect(musicElement.playbackRate).toBe(1);
    expect(musicElement.volume).toBe(GAINS.music);
  });

  it('starts a muted race from the top on unmute, then resumes in place', async () => {
    const director = createWarmDirector();
    await director.warm();
    const musicElement = musicOf();
    director.setMuted(true);
    director.startMusic();
    expect(musicElement.plays).toBe(0);
    director.setMuted(false);
    expect(musicElement.plays).toBe(1);
    expect(musicElement.currentTime).toBe(0);
    musicElement.currentTime = 7;
    director.setMuted(true);
    expect(musicElement.pauses).toBe(1);
    director.setMuted(false);
    expect(musicElement.plays).toBe(2);
    expect(musicElement.currentTime).toBe(7);
  });
});
