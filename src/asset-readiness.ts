/**
 * Boot-time asset readiness. Tracks named asset groups through their initial
 * load and gentle background retries, and reports when the race-critical
 * groups are ready so the boot UI can gate GO.
 */

/** Lifecycle of one asset group. */
export type AssetGroupStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Observable state of one asset group. */
export interface AssetGroupState {
  /** Current lifecycle status. */
  readonly status: AssetGroupStatus;
  /** Consecutive failed attempts; reset to zero on success. */
  readonly attempts: number;
  /** True once the group has been failing long enough to warrant a cue. */
  readonly stalled: boolean;
}

/** Point-in-time view of all groups plus derived flags. */
export interface AssetReadinessSnapshot {
  /** Per-group state keyed by group name. */
  readonly groups: Readonly<Record<string, AssetGroupState>>;
  /** True when every critical group is ready. */
  readonly raceReady: boolean;
  /** True when any critical group is stalled (offer tap-to-retry). */
  readonly cue: boolean;
}

/** One asset group to track. */
export interface AssetGroupDefinition {
  /** Unique group name (e.g. `pieces`, `karts`). */
  readonly name: string;
  /** When true, this group gates race readiness and can raise the cue. */
  readonly critical?: boolean;
  /** Performs one load attempt; resolve means ready, reject schedules a retry. */
  readonly load: () => Promise<unknown>;
}

/** Options for createAssetReadiness. */
export interface AssetReadinessOptions {
  /** Groups to track, started together on `start()`. */
  readonly groups: readonly AssetGroupDefinition[];
  /** Called with a fresh snapshot after every state change. */
  readonly onStateChange?: (snapshot: AssetReadinessSnapshot) => void;
}

/** Live readiness tracker for boot assets. */
export interface AssetReadiness {
  /** Starts every group's first attempt; subsequent calls are no-ops. */
  start(): void;
  /** Retries every failed group immediately; no-op for other groups. */
  retryFailed(): void;
  /** Returns a fresh snapshot of the current state. */
  snapshot(): AssetReadinessSnapshot;
}

/** Delay before the first automatic retry. */
export const RETRY_BASE_DELAY_MS = 500;

/** Upper bound for the exponential retry backoff. */
export const RETRY_MAX_DELAY_MS = 10_000;

/** Consecutive failures before a group is considered stalled. */
export const STALL_ATTEMPTS = 3;

/** Time without success before a group is considered stalled. */
export const STALL_AFTER_MS = 8000;

interface MutableGroup {
  readonly name: string;
  readonly critical: boolean;
  readonly load: () => Promise<unknown>;
  status: AssetGroupStatus;
  attempts: number;
  stalled: boolean;
  firstFailureAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Creates a tracker for boot asset groups. Each group loads independently;
 * failures retry with exponential backoff (500ms doubling to a 10s cap,
 * forever) and never block other groups. The tracker is inert until `start()`
 * is called, and all timing flows through global timers so tests can fake them.
 */
export function createAssetReadiness(options: AssetReadinessOptions): AssetReadiness {
  const { groups: definitions, onStateChange } = options;
  const groups: MutableGroup[] = definitions.map((definition) => ({
    name: definition.name,
    critical: definition.critical ?? false,
    load: definition.load,
    status: 'idle',
    attempts: 0,
    stalled: false,
    firstFailureAt: null,
    timer: null,
  }));

  function snapshot(): AssetReadinessSnapshot {
    const states: Record<string, AssetGroupState> = {};
    for (const group of groups) {
      states[group.name] = {
        status: group.status,
        attempts: group.attempts,
        stalled: group.stalled,
      };
    }
    return {
      groups: states,
      raceReady: groups.every((group) => !group.critical || group.status === 'ready'),
      cue: groups.some((group) => group.critical && group.stalled),
    };
  }

  function notify(): void {
    onStateChange?.(snapshot());
  }

  function clearTimer(group: MutableGroup): void {
    if (group.timer !== null) {
      clearTimeout(group.timer);
      group.timer = null;
    }
  }

  function succeed(group: MutableGroup): void {
    clearTimer(group);
    group.status = 'ready';
    group.attempts = 0;
    group.stalled = false;
    group.firstFailureAt = null;
    notify();
  }

  function fail(group: MutableGroup): void {
    group.status = 'failed';
    group.attempts += 1;
    if (group.firstFailureAt === null) {
      group.firstFailureAt = Date.now();
    }
    group.stalled =
      group.attempts >= STALL_ATTEMPTS || Date.now() - group.firstFailureAt >= STALL_AFTER_MS;
    const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (group.attempts - 1), RETRY_MAX_DELAY_MS);
    group.timer = setTimeout(() => attempt(group), delay);
    notify();
  }

  function attempt(group: MutableGroup): void {
    if (group.status === 'loading' || group.status === 'ready') {
      return;
    }
    clearTimer(group);
    group.status = 'loading';
    notify();
    group.load().then(
      () => succeed(group),
      () => fail(group),
    );
  }

  function start(): void {
    for (const group of groups) {
      if (group.status === 'idle') {
        attempt(group);
      }
    }
  }

  function retryFailed(): void {
    for (const group of groups) {
      if (group.status === 'failed') {
        attempt(group);
      }
    }
  }

  return { start, retryFailed, snapshot };
}