/** Wordless traffic-light countdown HUD. Pure DOM; styles live in CSS. */
export interface TrafficLight {
  root: HTMLDivElement;
  /** Shows the countdown state; remaining seconds map to lit red lights (ceil). */
  setCountdown(remaining: number): void;
  /** Switches to the green GO flash and clears the red lights. */
  setGo(): void;
  /** Hides the light and clears every lit state. */
  reset(): void;
}

const RED_LIGHT_COUNT = 3;

/**
 * Creates the countdown traffic light. Three stacked red lights count down
 * 3-2-1 (one per second), then a green light flashes at GO. Wordless: lights
 * are large color discs with aria-labels for assistive tech.
 */
export function createTrafficLight(): TrafficLight {
  const root = document.createElement('div');
  root.className = 'traffic-light hidden';

  const lights: HTMLDivElement[] = [];
  for (let i = 1; i <= RED_LIGHT_COUNT; i++) {
    const light = document.createElement('div');
    light.className = 'traffic-light-disc red';
    light.dataset.light = String(i);
    light.setAttribute('aria-label', `countdown light ${i}`);
    lights.push(light);
    root.append(light);
  }
  const go = document.createElement('div');
  go.className = 'traffic-light-disc green';
  go.dataset.light = 'go';
  go.setAttribute('aria-label', 'go light');
  root.append(go);

  return {
    root,
    setCountdown(remaining: number) {
      root.classList.remove('hidden');
      const lit = Math.min(RED_LIGHT_COUNT, Math.max(0, Math.ceil(remaining)));
      lights.forEach((light, index) => {
        light.classList.toggle('lit', index < lit);
      });
      go.classList.remove('lit');
    },
    setGo() {
      root.classList.remove('hidden');
      lights.forEach((light) => light.classList.remove('lit'));
      go.classList.add('lit');
    },
    reset() {
      root.classList.add('hidden');
      lights.forEach((light) => light.classList.remove('lit'));
      go.classList.remove('lit');
    },
  };
}