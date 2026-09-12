# Boot Readiness & Loading Experience — Specification

**Track ID:** `bootready_20260912` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

On a first visit (or cleared cache), the app boots into the build screen while eleven GLB models plus ten audio files load in fire-and-forget chains (`main.ts` chains `pieces.load() → scenery.load()`, with `karts.load()` and the picker-preview load running separately); GO enables from track validity alone and every load failure ends as a `console.error`. A child can therefore tap GO into a picker with invisible karts, or face a silent empty table when the network is flaky.

This track adds a wordless, staged boot: the table appears immediately, pieces and scenery pop in as their models land, GO "sleeps" until the race-critical models (pieces + karts) are ready, and failed loads retry gently — with a wordless tap-to-retry cue if a group stalls. No failure states, no text, no new assets.

## Functional Requirements

### FR-1 — Asset-group readiness model (`src/asset-readiness.ts`, new)
- Named groups: `pieces` (piece models + finish flag), `scenery` (decorative), `karts` (four kart models, consumed by both the race kart renderer and the picker preview — both must succeed). SFX/music stay lazy and ungated (existing `new Audio(url)` per play).
- Per-group state: `idle → loading → ready | failed`; a retry returns `failed → loading`.
- Loaders and timers are injected (fake loaders/clocks in tests); no module-level network coupling.
- Groups load independently at boot — the current pieces→scenery chain is broken so a pieces failure cannot block scenery.
- `raceReady = pieces.ready && karts.ready`; scenery never gates.
- Observable hooks: GO button exposes `data-boot="sleeping|ready|retry"`; under `?debug`, `window.__raceItBoot` exposes per-group state + attempt counts.

### FR-2 — Staged table reveal (`src/main.ts` wiring)
- Table/scene remains immediate (unchanged).
- Pieces stage: when models land, the board renders with a gentle pop-in (reuse the existing toy-feedback scale channel; works in `individual` and `instanced` modes).
- Scenery stage: pops/fades in when its models land; absence is harmless, never blocks.
- Karts stage: no build-screen visual; its payoff is GO waking and picker previews never rendering empty.
- Before the pieces stage lands, taps keep their existing sound feedback; placements appear with the stage. No error, no text, no empty-state message.

### FR-3 — GO sleeping & race gate (`src/ui/go-button.ts`)
- `createGoButton` gains additive states: `setReady(ready)` + `setRetrying(retrying)` + an `onRetry` callback; the button exposes `data-boot`.
- Tap routing: retry-tap (stalled) → blocked nope → `onGo` only when ready && valid.
- Asleep: dimmed pill + soft pulsing dots (wordless); `aria-disabled="true"`; never opens the picker; taps give the existing gentle blocked feedback.
- Awake: existing pulsing GO for valid tracks; invalid tracks unchanged.
- All `go.setValid(...)` call sites keep working — readiness is applied in one wiring place.

### FR-4 — Gentle infinite retry (readiness module + GO cue)
- Failed group: automatic retry with bounded exponential backoff (defaults: 0.5s base, ×2, cap 10s), indefinitely for `pieces`/`karts`; scenery retries silently too.
- Stall → cue: after ~3 consecutive failures or ~8s without success on a race-critical group, GO switches to a wordless pulsing tap-to-retry affordance (existing ≥64px pill); tap forces an immediate retry of failed groups (gentle click sound), never a page reload.
- Recovery is seamless: stages continue where they left off; no flash, overlay, or error surface ever appears.
- Retries never stack: one in-flight attempt per group; forced taps coalesce into the next attempt.

### FR-5 — Wiring, debug modes & lifecycle (`src/main.ts`)
- `?race`, `?perf`, `?debug` keep working (headless race, perf board fill, debug exposes unaffected).
- Loads/retries continue while hidden (browser throttling acceptable); on return the shown state matches reality.
- No interference with session-resilience hold logic; audio behavior unchanged.

## Non-Functional Requirements

- **TDD per `conductor/workflow.md`;** TS strict; Biome-clean; ≥80% coverage on new/changed modules (`asset-readiness` module + `go-button` changes; `main.ts` wiring covered by E2E per house precedent); public APIs JSDoc'd.
- **No new assets or dependencies;** service-worker precache list unchanged; offline-first unaffected.
- **Performance:** 60fps unchanged; no new per-frame work (timers/state machine only); no layout shift of existing UI.
- **UX:** wordless; targets ≥64px; one action per state; no failure UI; toy-first motion.
- **Verification:** unit tests for the readiness/GO seams + new `e2e/boot.spec.ts` (route-delayed/aborted GLBs); all existing Playwright specs stay green.

## Acceptance Criteria

1. Unit — readiness: state transitions, backoff schedule with fake timers, `raceReady` truth table across pieces/scenery/karts combos, forced-retry coalescing, single in-flight attempt, recovery to ready.
2. Unit — GO: sleeping before ready; no `onGo` while asleep; wake on ready; retry-tap routing when stalled; existing valid/invalid semantics preserved (tests updated intentionally).
3. E2E (new `e2e/boot.spec.ts`) — slow load: route-delayed `.glb` responses; assert `data-boot="sleeping"` + `aria-disabled="true"`; GO tap does not open the picker; stages land; `data-boot="ready"` and GO wakes; race can start.
4. E2E — failure/retry: aborted kart GLBs → retry attempts observed (>1), no crash; tap-to-retry forces an attempt; un-abort → recovers → GO wakes.
5. E2E — regression: existing specs (smoke, lifecycle, postrace, landscape, shelf, perf, installability) stay green; GO gate observed via `aria-disabled` (the suite's enabled signal).
6. Manual: throttled-network first load shows the staged reveal with no dead states; airplane-mode first visit shows the retry cue (no crash) and recovers when network returns; `?race`/`?perf` intact; portrait + landscape.

## Out of Scope

- Audio readiness/gating; warming SFX.
- Service-worker update flow and offline CI proof (separate track candidate).
- New art/loading-skeleton design beyond the simple pop-in + GO cue; no new animation framework.
- Reload-based recovery, error pages, telemetry.
- Preload strategy beyond the existing SW precache (no new fetch hints).
- Changes to build/picker/shelf/race content, engines, or fairness.