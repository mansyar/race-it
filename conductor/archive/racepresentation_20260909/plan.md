# Implementation Plan — Race Presentation

**Track ID:** `racepresentation_20260909` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build`

## Phase 1 — Kart Assets & Rig [checkpoint: f18e34e]

- [x] Task 1.1: Download 4 distinct Kenney Car Kit GLBs (CC0) into `src/assets/models/` + license file; add `KARTS` export to `assets/manifest.ts`. Red: extend `src/assets.test.ts` — `KARTS` has exactly 4 `?url` strings (fails until manifest updated). Green: manifest + assets land. `(8820109)`
- [x] Task 1.2: `kartPose` tests first (Red) — `src/render/kart-rig.test.ts`: progress 0 → start-cell pose with side[0] heading; mid-segment interpolation; corner tangent; perpendicular lane offset (±`LANE_OFFSET`); loop-wrap continuity past `lapLength`; per-kart pose determinism. `(536b091)`
- [x] Task 1.3: implement `src/render/kart-rig.ts` — `kartPose(path, progress, lane)` → `{ x, z, heading }` using `gridToWorld` + path cell orientation, lane applied perpendicular (Green). `(536b091)`
- [x] Task 1.4: `src/render/kart-meshes.ts` — load 4 GLBs (injectable loader per `piece-renderer` pattern), clone+tint materials (red/blue/green/yellow), per-model scale/orientation tuning, wheels on road (y ≈ 0). Tests with mocked loader asserting tint/scale application. `(f18e34e)`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `(f18e34e)`

## Phase 2 — Race Camera & Confetti [checkpoint: 46028b0]

- [x] Task 2.1: `race-camera` tests first (Red) — `src/render/race-camera.test.ts`: returns build placement at countdown; drift bounded (≤~15° orbit, board mostly visible); lead-follow behavior; finish settle as karts near completion; resize blends back toward build placement. `(a7a64c2)`
- [x] Task 2.2: implement `src/render/race-camera.ts` — pure pose math `raceCameraPose(phase, leadProgress, finishProgress, aspect, buildPlacement)` + smoothing constants (Green). `(a7a64c2)`
- [x] Task 2.3: confetti math tests first (Red) — `src/render/confetti.test.ts`: deterministic seeded burst (count, positions above finish, velocities), gravity+fade update over ~2 s, all particles cleared. `(e1765a9)`
- [x] Task 2.4: implement `src/render/confetti.ts` — pure particle math + thin Three.js Points wrapper (`burstAt`, `update(dt)`, `clear`), ~300 particles, 1 draw call (Green). `(e1765a9)`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `(46028b0)`

## Phase 3 — Race HUD Modules [checkpoint: 2c751fd]

- [x] Task 3.1: engine `countdownRemaining` getter tests first (Red) — `src/race/engine.test.ts`: getter exists, = `COUNTDOWN_SECONDS` at start, decrements with tick, frozen while paused, 0 at running. Green: add readonly getter to `RaceEngine` (only engine change this track). (9fb496d)
- [x] Task 3.2: traffic-light tests first (Red) — `src/ui/traffic-light.test.ts`: hidden initially; `setCountdown(remaining)` → 3 red lights sequential 3-2-1 (one per second); `setGo()` → green flash; hidden on reset; DOM structure/aria-labels. (a5f628f)
- [x] Task 3.3: implement `src/ui/traffic-light.ts` — `createTrafficLight(callbacks?)` → `{ root, setCountdown, setGo, reset }`, 3 stacked ≥64px lights, wordless (Green). (a5f628f)
- [x] Task 3.4: race-hud tests first (Red) — `src/ui/race-hud.test.ts`: pause button ≥64px; tapping shows overlay (Resume/Quit-to-builder); Quit requires confirm step (toddler-proof per corner-cluster pattern); callbacks fire `onResume`/`onQuit` once confirmed; hidden in build mode. (eb16bdf)
- [x] Task 3.5: implement `src/ui/race-hud.ts` — `createRaceHud({ onResume, onQuit })` → `{ root, showPause, showOverlay, hide, reset }` (Green). (eb16bdf)
- [x] Task 3.6: trophy tests first (Red) — `src/ui/trophy.test.ts`: hidden initially; `show(result, colors)` → giant `🏆 [COLOR] WINS!` (color word + icon, only allowed text), correct color per `winnerIndex`; RACE AGAIN button ≥64px fires `onAgain` once. (2c751fd)
- [x] Task 3.7: implement `src/ui/trophy.ts` — `createTrophy({ onAgain })` → `{ root, show, hide }` (Green). (2c751fd)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) (2c751fd)

## Phase 4 — Integration & Celebration

- [x] Task 4.1: `scene.ts` loop refactor tests — expose `onFrame(cb)` registration (or return hook) so one per-frame pass runs `engine.tick` + presentation update + `renderer.render`; build tap handling unchanged; existing scene tests stay green. `(cc913d6)`
- [x] Task 4.2: presentation controller tests first (Red) — `src/presentation/presentation.test.ts` (or `src/race-presentation.ts`): event-driven state mapping — `stateChange('countdown')` → show traffic light + hide build HUD; `'running'` → GO flash + show pause; `'finished'` → celebration sequencing; `finish` event → confetti burst + winner spin (spin pose math); all-karts-finished → trophy with correct color word; RACE AGAIN → `engine.restart()` + `start()` + full presentation reset (camera, lights, confetti, karts to start poses). `(23077a1)`
- [x] Task 4.3: implement controller — wire engine events, kart rig updates per frame, camera pose application, confetti lifecycle, victory spin (~2 s yaw), HUD show/hide (Green). `(23077a1)`
- [x] Task 4.4: `main.ts` wiring — GO handler hides build HUD and starts engine via controller; `?race` headless hook unchanged; corner mute stays accessible during race; quit restores build HUD + camera lerp back. `(43f57f0)`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: 43f57f0]

## Phase 5 — Verification

- [x] Task 5.1: quality gates — `pnpm build`, `$env:CI='true'; pnpm test` (full suite), coverage >80% on new/changed modules, `pnpm lint` clean.
- [x] Task 5.2: `?perf` sanity — draw calls / frame time with 4 karts + confetti during a seeded race; confirm 60 fps budget holds on the full board; tick-cost unchanged.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: 2497c6a]

## Phase: Review Fixes

- [x] Task: Apply review suggestions `(46faccb)`