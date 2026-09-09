import { beforeEach, describe, expect, it } from 'vitest';
import { createTrafficLight } from './traffic-light';

describe('createTrafficLight', () => {
  let light: ReturnType<typeof createTrafficLight>;

  beforeEach(() => {
    light = createTrafficLight();
  });

  it('renders three red countdown lights and a green GO light', () => {
    const lights = [...light.root.querySelectorAll('[data-light]')];
    expect(lights.map((el) => el.dataset.light)).toEqual(['1', '2', '3', 'go']);
  });

  it('is hidden initially with no lit lights', () => {
    expect(light.root.classList.contains('hidden')).toBe(true);
    expect(light.root.querySelectorAll('.lit').length).toBe(0);
  });

  it('lights all three red lights for the full countdown', () => {
    light.setCountdown(3.0);
    expect(light.root.classList.contains('hidden')).toBe(false);
    expect(light.root.querySelectorAll('[data-light="1"].lit').length).toBe(1);
    expect(light.root.querySelectorAll('[data-light="2"].lit').length).toBe(1);
    expect(light.root.querySelectorAll('[data-light="3"].lit').length).toBe(1);
    expect(light.root.querySelectorAll('[data-light="go"].lit').length).toBe(0);
  });

  it('keeps two red lights lit after one second', () => {
    light.setCountdown(2.0);
    expect(light.root.querySelectorAll('.lit').length).toBe(2);
    expect(light.root.querySelector('[data-light="3"]')?.classList.contains('lit')).toBe(false);
  });

  it('keeps one red light lit after two seconds', () => {
    light.setCountdown(1.0);
    expect(light.root.querySelectorAll('.lit').length).toBe(1);
    expect(light.root.querySelector('[data-light="1"]')?.classList.contains('lit')).toBe(true);
  });

  it('rounds fractional remaining time up to the next light', () => {
    light.setCountdown(0.5);
    expect(light.root.querySelectorAll('.lit').length).toBe(1);
  });

  it('switches to the green GO flash and clears the red lights', () => {
    light.setCountdown(3.0);
    light.setGo();
    expect(light.root.querySelectorAll('[data-light="1"].lit').length).toBe(0);
    expect(light.root.querySelectorAll('[data-light="2"].lit').length).toBe(0);
    expect(light.root.querySelectorAll('[data-light="3"].lit').length).toBe(0);
    expect(light.root.querySelector('[data-light="go"]')?.classList.contains('lit')).toBe(true);
  });

  it('reset hides the light and clears all lit states', () => {
    light.setCountdown(3.0);
    light.setGo();
    light.reset();
    expect(light.root.classList.contains('hidden')).toBe(true);
    expect(light.root.querySelectorAll('.lit').length).toBe(0);
  });
});