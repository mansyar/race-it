# Implementation Plan — Race Watchability Polish

**Track ID:** `racepolish_20260910` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build`

## Phase 1 — Pause HUD Fix [checkpoint: f48a9e9]

- [x] Task 1.1: stylesheet contract tests first (Red) (f48a9e9) — new `src/style.test.ts`: `src/style.css` defines `[hidden]` overrides resolving to `display: none` for `.race-overlay` and `.race-confirm` (fails until the rule lands). Guards the exact bug class: author `display` rules defeating the `hidden` attribute — invisible to jsdom DOM tests.
- [x] Task 1.2: add `.race-overlay[hidden], .race-confirm[hidden] { display: none; }` (f48a9e9) to `src/style.css` beside the `.confirm-overlay[hidden]` precedent (Green); full suite stays green; browser check — post-countdown race unobstructed; pause → Resume/Quit flows correct.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — Pack-Fitting Race Camera [checkpoint: a6ae57e]

- [x] Task 2.1: race-camera tests rewritten to the new contract (Red) — `src/render/race-camera.test.ts`: build/countdown unchanged; running pose keeps leader + closest rival inside the frustum margin; tight pair clamps at 0.4× build distance; spread pair clamps at the full-board distance; target ≈ pair midpoint nudged ahead of the leader; `finished` → close hold on the finish point. Old drift/orbit/push-in assertions replaced. (a6ae57e)
- [x] Task 2.2: implement the pure pack-fit solve in `src/render/race-camera.ts` (Green) — generalized frustum-fit distance (binary search in the `maxCornerNdc` style) + clamps; no THREE imports. (a6ae57e)
- [x] Task 2.3: presentation camera tests first (Red) — `src/presentation/race-presentation.test.ts`: lead + closest-rival selection from kart world poses; look-ahead nudge; retuned smoothing for the close follow; existing camera expectations updated; `race-perf.test.ts` stays green. (a6ae57e)
- [x] Task 2.4: wire into `race-presentation.ts` `updateCamera` (Green) — pass pair + finish point, keep the `CameraLike` seam; finished-state close hold through confetti + victory spin. (a6ae57e)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: camera follows the lead battle on a phone viewport.

## Phase 3 — Kart Visibility

- [x] Task 3.1: scale + clearance tests first (Red) — `src/render/kart-meshes.test.ts`: `KART_SCALE === 0.55`; measure kart native bounds via `scripts/measure-glb-world.mjs`; check start-lineup clearance (lane/row gaps vs scaled footprint) and update `src/race/engine.test.ts` first if `LANE_OFFSET`/`ROW_SPACING` need adjusting. (4a2081d)
- [x] Task 3.2: apply `KART_SCALE = 0.55` (+ any spacing adjustment) (Green); keep wheels-on-road offset correct at the new scale. No engine spacing change needed (clearances 0.164 lane / 0.415 rows). (4a2081d)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: lineup shows no mesh overlap; karts read noticeably larger.

## Phase 4 — Verification

- [ ] Task 4.1: quality gates — `pnpm build`, `$env:CI='true'; pnpm test`, coverage >80% on changed modules, `pnpm lint` clean.
- [ ] Task 4.2: browser full-flow verification — portrait + landscape phone viewports: countdown → race visible; camera follows the lead battle; pause/Resume/Quit flows; quit → builder; finish close-up + trophy + RACE AGAIN; `?race`, `?perf`, `?debug` hooks unchanged; screenshots captured.
- [ ] Task 4.3: perf sanity — `?perf` draw calls/frame time with 4 karts + confetti during a seeded race; `race-perf.test.ts` green.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
