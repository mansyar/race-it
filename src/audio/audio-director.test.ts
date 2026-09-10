import { beforeEach, describe, expect, it } from 'vitest';
import { SFX } from '../assets/manifest';
import { createAudioDirector, GAINS, type SfxName } from './audio-director';

interface FakeGainNode {
  gain: { value: number };
  connects: unknown[];
  connect: (destination: unknown) => void;
}

interface FakeContext {
  destination: unknown;
  nodes: FakeGainNode[];
  createGain: () => FakeGainNode;
}

function createFakeContext(): FakeContext {
  const nodes: FakeGainNode[] = [];
  return {
    destination: { label: 'destination' },
    nodes,
    createGain() {
      const node: FakeGainNode = { gain: { value: 1 }, connects: [], connect(destination) { this.connects.push(destination); } };
      nodes.push(node);
      return node;
    },
  };
}

interface PlayedEntry {
  url: string;
  volume: number;
}

describe('createAudioDirector', () => {
  let played: PlayedEntry[];
  let context: FakeContext;

  beforeEach(() => {
    localStorage.clear();
    played = [];
    context = createFakeContext();
  });

  function createDirector() {
    return createAudioDirector({
      makeAudio: (url) => {
        const element = {
          url,
          volume: 1,
          play() {
            played.push({ url: this.url, volume: this.volume });
          },
        };
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
    expect(context.nodes[0].gain.value).toBe(GAINS.master);
    expect(context.nodes[0].connects).toContain(context.destination);
  });

  it.each(Object.keys(SFX) as SfxName[])('routes one-shot %s through the audio factory at one-shot gain', (name) => {
    const director = createDirector();
    director.playOneShot(name);
    expect(played).toHaveLength(1);
    expect(played[0].url).toBe(SFX[name]);
    expect(played[0].volume).toBe(GAINS.oneShot);
  });

  it('does not play one-shots while muted', () => {
    const director = createDirector();
    director.setMuted(true);
    director.playOneShot('click');
    expect(played).toHaveLength(0);
  });

  it('silences the master gain while muted', () => {
    const director = createDirector();
    director.setMuted(true);
    expect(context.nodes[0].gain.value).toBe(0);
  });

  it('restores master gain and playback after unmute', () => {
    const director = createDirector();
    director.setMuted(true);
    director.setMuted(false);
    expect(context.nodes[0].gain.value).toBe(GAINS.master);
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
    expect(context.nodes[0].gain.value).toBe(0);
  });

  it('reports its mute state', () => {
    const director = createDirector();
    expect(director.isMuted()).toBe(false);
    director.setMuted(true);
    expect(director.isMuted()).toBe(true);
  });
});