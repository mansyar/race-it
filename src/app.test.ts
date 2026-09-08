import { describe, expect, it } from 'vitest';
import { appReady } from './app';

describe('app scaffold smoke test', () => {
  it('reports the application is ready', () => {
    expect(appReady()).toBe(true);
  });
});
