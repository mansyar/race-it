# Implementation Plan — Session Resilience

**Track ID:** `sessionresilience_20260911` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test`

**Implementation notes (pre-plan recon):**
- `engine.pause()` already freezes both `countdown` and `running` (`src/race/engine.ts` `tick` early-returns when paused) — FR2 needs no `src/race/*` changes.
- `createBuildScene` (`src/render/scene.ts`) has an internal `resize()` used by its `ResizeObserver` but does not expose it; FR1's `pageshow` re-sync requires a one-line API addition (`resize`) on the returned object. This is the only file touched outside the spec's listed set.
- `RaceHud.showOverlay()` currently only reveals the overlay; auto-hold from countdown needs it to also reveal the root and hide the pause button (matching the post-pause-tap state).

## Phase 1 — Screen Wake Lock Controller (FR3) [checkpoint: 42f0b75]
- [x] Task 1.1: contract tests first (Red) — new `src/wake-lock.test.ts` with an injected fake navigator: requests `'screen'` when visible & supported; silently no-ops when the API is absent; `setVisible(false)` releases; `setVisible(true)` re-acquires; a system `release` while still visible re-acquires once; `request()` rejection is swallowed (no throw; next visible flip retries); `dispose()` releases and blocks future requests; `active` reflects held state. (d8b25bf)
- [x] Task 1.2: implement `src/wake-lock.ts` (Green) — feature detection (`navigator.wakeLock?.request`), sentinel + `release` listener, injectable navigator, dispose-safe. (42f0b75)
- [x] Task 1.3: refactor + coverage ≥80% on the new module; JSDoc; `$env:CI='true'; pnpm test` + `pnpm lint` green; commit. (42f0b75)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — Gesture & Zoom Guards (FR4) [checkpoint: e3bc153]
- [x] Task 2.1: guard-contract tests first (Red) — new `src/gesture-guards.test.ts` (jsdom): `contextmenu`, `dblclick`, `dragstart`, `gesturestart`, `gesturechange` on the guarded target are `defaultPrevented`; non-passive listener registration where `preventDefault` requires it; plain `pointerdown`/`pointerup` are untouched; disposer removes listeners and is idempotent. (2299248)
- [x] Task 2.2: implement `src/gesture-guards.ts` (Green); wire into `main.ts` scoped to the app root (`#app`) so nothing outside the game surface changes. (6f1e9ce)
- [x] Task 2.3: stylesheet/document contract tests first (Red) — extend `src/style.test.ts`: `html, body` declare `overscroll-behavior: none` and `-webkit-touch-callout: none`; root keeps its `touch-action` guard; `index.html` viewport retains `user-scalable=no` as defense in depth. (fb1d9f2)
- [x] Task 2.4: apply CSS hardening in `src/style.css` (Green). (e3bc153)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: 2 s long-press → no callout/menu; double-tap/pinch → no zoom; drag → no bounce; place/rotate/remove taps still work.

## Phase 3 — App Lifecycle Recovery (FR1) & Auto-Hold (FR2) [checkpoint: 68ad811]
- [x] Task 3.1: lifecycle-controller tests first (Red) — new `src/app-lifecycle.test.ts` with injected document/window + fake wake lock: `hidden` → `onHidden` + wake lock off; `visible` → `onVisible` + wake lock on; `pagehide` → `onHide` (no teardown exists); `pageshow` with `persisted: true` → `onRestore`; `pageshow` non-persisted → no `onRestore`; `dispose()` detaches everything. (76f6774)
- [x] Task 3.2: implement `src/app-lifecycle.ts` (Green). (9cf452d)
- [x] Task 3.3: scene viewport re-sync tests first (Red) — `src/render/scene.test.ts`: the returned API exposes `resize()` which re-measures the container and updates renderer size + camera aspect (mocked THREE); then expose `resize` (Green). (07c1776)
- [x] Task 3.4: presentation hold tests first (Red) — `src/presentation/race-presentation.test.ts` + `src/ui/race-hud.test.ts`: `holdForInterruption()` while countdown/running pauses the engine, suspends audio, and shows the resume/quit overlay (also from countdown, when the HUD root starts hidden); from `idle` or trophy state it is a no-op; a second call changes nothing; Resume flow from the hold continues the race. `RaceHud.showOverlay()` reveals the root, hides the pause button, and shows the overlay. (b034bad)
- [x] Task 3.5: implement `holdForInterruption()` in `race-presentation.ts`; harden `showOverlay()` in `race-hud.ts` (Green). (98b07f2)
- [x] Task 3.6: wire `main.ts` (Green) — replace the inline `pagehide` + `visibilitychange` handlers with `createAppLifecycle(...)`: hidden/hide → `audio.suspendAll()` + `presentation?.holdForInterruption()`; visible → `audio.resumeAll()`; restore → `view.resize()` + audio restore when visible; wake lock wired in; remove the unconditional `view.dispose()`/`kartPreview.dispose()`/listener removal; keep the `pointerdown` audio unlock and the `resize` preview listener intact. (68ad811)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: race → hide tab → return → overlay + Resume; countdown hold; build/picker unaffected.

## Phase 4 — Integration & Quality Gates (FR5 / AC8–AC10) [checkpoint: 0e1b640]
- [x] Task 4.1: new `e2e/lifecycle.spec.ts` — synthetic `visibilitychange` during a running race → pause overlay visible and stays until Resume; synthetic `pagehide`(persisted:false) + `pageshow`(persisted:true) → canvas remains attached, build palette still places a piece, console error-free; dispatched `contextmenu`/`dblclick` on the canvas are `defaultPrevented`. (0e1b640)
- [x] Task 4.2: full gates green — `$env:CI='true'; pnpm test -- --coverage`, `pnpm lint`, `pnpm build`, `pnpm exec playwright test` (smoke + shelf + installability + lifecycle); coverage ≥80% on new modules. (gates green: 491/491 unit tests, 97.32% global coverage, 6/6 e2e specs passed)
- [ ] Task 4.3: manual device checklist executed (iOS standalone + Android Chrome): app-switch mid-race → hold + Resume/Quit; bfcache back-navigation restore intact; long-press/double-tap/pinch guarded; wake lock holds through a race; unsupported/Low-Power-Mode fallback silent. (deferred by user: requires an HTTPS deploy — live verification moves to the future Ship track)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 — Merge to master (no tag)
- [~] Task 5.1: merge `feature/session-resilience` to `master` (merge-only; version tag + Coolify deploy deferred to a future "Ship" track). PR [#8](https://github.com/mansyar/race-it/pull/8) open — merges once CI is green.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

> **Note on Phase 5:** releasing remains with a future "Ship" track; this merge only lands the work on master.

## Phase: Review Fixes
- [x] Task: Apply review suggestions (65c9382) — gate audio resume on `RacePresentation.isHolding()` so a held race stays silent behind the overlay until Resume.
