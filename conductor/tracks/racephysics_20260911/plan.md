# Implementation Plan — Fair Start & Natural Motion

**Track ID:** `racephysics_20260911` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build`

**Coordination note:** `src/presentation/race-presentation.ts` is also edited by the in-flight `feature/post-race-navigation` branch — keep changes additive and localized to the motion/pose paths.

## Phase 1 — Distance-Normalized Fairness (bug fix) [checkpoint: 3d7590f]

- [x] Task 1.1: fairness simulation harness first (Red) (3d7590f) — new `src/race/fairness.test.ts`: fixed-seed sweep (2-4 karts × 8/14/48-cell loops, coarse fixed dt for CI speed) asserting (a) back-row slots win on the demo loop at all — currently 0, the bug; (b) every slot's win share within `[0.5/n, 2/n]`; (c) photo-finish rate 30-65% on the 14-cell loop; (d) first finish 30-45 s; (e) same-seed determinism. Current measured shares documented in the failure output.
- [x] Task 1.2: implement distance normalization in `src/race/engine.ts` (Green) (3d7590f) — fold the grid offset into pace (`pace = base · factor · (L - startProgress)/L`) in `rollKarts`; update `engine.test.ts` expectations (injected-rng coverage now includes per-row compensation; start lineup unchanged; duration band re-checked). Full suite + harness green.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — review the before/after fairness table with the user.

## Phase 2 — Natural Pace Dynamics (engine)

- [x] Task 2.1: pace-dynamics tests first (Red) (e2517f9) — new `src/race/motion.test.ts` + updated `engine.test.ts`: shared launch curve (0 → pace over ~1 s; below constant-speed distance in the first quarter-second; ≥95% pace by ~1 s); curvature modulation factor from cell geometry (curves slower than straights; shared by all karts); seeded wobble (same seed → identical outcome; bounded amplitude; near-zero mean). Harness + determinism + 30-45 s band must hold with motion ON.
- [x] Task 2.2: implement `src/race/motion.ts` (launch/curvature/wobble pure profiles) and wire into the `engine.ts` tick (Green) (e2517f9) — pace-multiplicative only; retune `TARGET_RACE_SECONDS`/base speed if the launch shifts the duration band; Phase-1 harness stays green.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — `?race` headless output reviewed; duration/closeness numbers compared.

## Phase 3 — Kart Motion Visuals (yaw, lean, suspension)

- [ ] Task 3.1: visual-motion tests first (Red) — new `src/render/kart-motion.test.ts`: analytic smoothing window yields continuous heading across tile boundaries (no snap; bounded turn rate); roll leans with curvature (sign/bounds; zero on straights); pitch/bob responds to launch/speed state and settles; all pure and deterministic.
- [ ] Task 3.2: implement `src/render/kart-motion.ts` (Green) — `visualPose(...)` built on `kartPose`, returning the extended pose (heading, roll, pitch, bob); `kartPose` contract untouched.
- [ ] Task 3.3: pose-sink integration tests first (Red) — `kart-meshes.test.ts` / `race-presentation.test.ts`: extended poses flow through the sink; optional fields default safely for old shape; no lineup mesh intersections; `?perf` budget unchanged.
- [ ] Task 3.4: wire into `race-presentation.ts` + `kart-meshes.ts` (Green) — presentation computes visual poses from engine progress + speed; renderer applies roll/pitch/bob transforms.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: no corner snapping; lean reads toy-like; 60 fps.

## Phase 4 — Finish Run-Out & Celebration Choreography

- [ ] Task 4.1: run-out tests first (Red) — `kart-motion.test.ts` + `race-presentation.test.ts`: bounded decelerating roll-out (`runoutOffset(elapsed, pace)` ≤ ~2 world units, settles < ~1.2 s); official finish time unchanged at crossing; winner spin begins once settled; trophy/confetti/jingle timing unchanged; `resetToBuild` / RACE AGAIN clear run-out state.
- [ ] Task 4.2: implement run-out + choreography (Green) — kart-motion curve + presentation sequencing.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: finish reads as a natural roll-out; celebration beats intact.

## Phase 5 — Verification & Quality Gates

- [ ] Task 5.1: quality gates — `pnpm build`; `$env:CI='true'; pnpm test`; coverage >80% on changed modules; `pnpm lint` clean.
- [ ] Task 5.2: browser full-flow verification — portrait + landscape phone viewports: launch → race motion → pause/Resume/Quit → run-out → trophy → RACE AGAIN; `?race` / `?perf` / `?debug` intact; build/picker/shelf regression-free; screenshots captured.
- [ ] Task 5.3: fairness & perf validation report — record win shares per slot, photo-finish rate, durations (harness) and `?perf` draw calls/tris; compare against the Phase-1 baseline.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
