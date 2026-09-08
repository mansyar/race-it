import { beforeEach, describe, expect, it } from 'vitest';
import { createSfx } from './sfx';

describe('createSfx', () => {
  let played: string[];
  let sfx: ReturnType<typeof createSfx>;

  beforeEach(() => {
    played = [];
    sfx = createSfx((url) => ({ play: () => played.push(url) }));
  });

  it('plays a named sound through the audio factory', () => {
    sfx.play('click');
    expect(played.length).toBe(1);
  });

  it('does not play while muted', () => {
    sfx.setMuted(true);
    sfx.play('click');
    expect(played.length).toBe(0);
  });

  it('plays again after unmute', () => {
    sfx.setMuted(true);
    sfx.setMuted(false);
    sfx.play('confirmA');
    expect(played.length).toBe(1);
  });

  it('reports its mute state', () => {
    expect(sfx.isMuted()).toBe(false);
    sfx.setMuted(true);
    expect(sfx.isMuted()).toBe(true);
  });
});
