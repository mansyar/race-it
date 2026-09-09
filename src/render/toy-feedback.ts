/** Duration of the place pop-in animation in seconds. */
export const POP_IN_SECONDS = 0.18;

/** Starting scale of a newly placed piece before it pops to rest. */
const POP_START_SCALE = 0.55;

/** Peak wiggle yaw in radians (~±4°). */
const WIGGLE_RADIANS = (4 * Math.PI) / 180;

/** Wiggle frequency in radians per second (~2.5 Hz). */
const WIGGLE_HZ = Math.PI * 5;

/**
 * Overshoot ease for place pop-in: starts at POP_START_SCALE, overshoots
 * slightly past 1, settles at 1 at POP_IN_SECONDS. Times outside the window
 * are clamped to the endpoints.
 */
export function popInScale(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) {
    return POP_START_SCALE;
  }
  if (elapsedSeconds >= POP_IN_SECONDS) {
    return 1;
  }
  const t = elapsedSeconds / POP_IN_SECONDS;
  // Classic back-out (s ≈ 1.7): 0 → ~1.1 → 1 for a toy-like bounce.
  const s = 1.7;
  const t1 = t - 1;
  const back = t1 * t1 * ((s + 1) * t1 + s) + 1;
  return POP_START_SCALE + (1 - POP_START_SCALE) * back;
}

/**
 * Remove-mode yaw wiggle in radians. Zero when remove mode is off (callers
 * gate on `PieceFeedback.removeMode`); bounded by ±WIGGLE_RADIANS.
 */
export function removeWiggleRadians(timeSeconds: number): number {
  return Math.sin(timeSeconds * WIGGLE_HZ) * WIGGLE_RADIANS;
}

/**
 * Tracks place pop-ins and remove-mode feedback state for placed pieces.
 * Pure math — the renderer applies scale/yaw/tint from these values each frame.
 */
export class PieceFeedback {
  private pops = new Map<number, number>();
  private clock = 0;
  removeMode = false;

  /** Accumulated animation time in seconds. */
  get time(): number {
    return this.clock;
  }

  /** Marks a cell as newly placed so it pops in. */
  notePlaced(cellIndex: number): void {
    this.pops.set(cellIndex, this.clock);
  }

  /** Advances internal time and drops finished pop animations. */
  tick(dtSeconds: number): void {
    this.clock += dtSeconds;
    for (const [index, start] of this.pops) {
      if (this.clock - start >= POP_IN_SECONDS) {
        this.pops.delete(index);
      }
    }
  }

  /** True while a pop animation is still running for this cell. */
  isActive(cellIndex: number): boolean {
    return this.pops.has(cellIndex);
  }

  /** Current scale for a cell (1 when idle or unknown). */
  scaleFor(cellIndex: number): number {
    const start = this.pops.get(cellIndex);
    if (start === undefined) {
      return 1;
    }
    return popInScale(this.clock - start);
  }

  /** Enables or disables remove-mode wiggle/tint. */
  setRemoveMode(active: boolean): void {
    this.removeMode = active;
  }

  /** Remove-mode yaw offset at the current clock (0 when off). */
  wiggleYaw(timeSeconds: number): number {
    if (!this.removeMode) {
      return 0;
    }
    return removeWiggleRadians(timeSeconds);
  }

  /** Remove-mode red-tint intensity 0..1 (0 when off). */
  tintPulse(timeSeconds: number): number {
    if (!this.removeMode) {
      return 0;
    }
    // Gentle pulse between ~0.35 and ~0.7 so pieces read as “deletable”.
    return 0.5 + 0.2 * Math.sin(timeSeconds * WIGGLE_HZ);
  }
}
