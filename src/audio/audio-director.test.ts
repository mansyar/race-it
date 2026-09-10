import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC, SFX } from '../assets/manifest';
import { COUNTDOWN_RATES, createAudioDirector, GAINS, type SfxName } from './audio-director';

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
  if (!node || node.kind !== 'gain') {
    throw new Error('expected the master gain node to exist');
  }
  return node;
}

function humGainOf(context: FakeContext): FakeGainNode {
  const master = masterNodeOf(context);
  const node = context.nodes.find((candidate) => candidate.kind === 'gain' && candidate !== master);
  if (!node || node.kind !== 'gain') {
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

  it('pauses and forgets the music on stopMusic', () => {
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
});
