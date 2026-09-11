# Implementation Plan — Adaptive Performance Guardrails

**Track ID:** `perfguardrails_20260911` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build`

## Phase 1 — Quality Controller Core [checkpoint: fe33bcb]

- [x] Task 1.1: controller tests first (Red) (f724909) — new `src/render/quality-controller.test.ts`: synthetic dt streams drive the rolling windows — persistent dips (<55fps avg over ~2s) step `high→mid→low` with at most one step per decision; sustained headroom (>58fps over ~10s) steps back up; borderline flicker does not oscillate; clamping at both ends; O(1) per tick. Also cover `resolveStartTier(search, storage)`: `?tier=low|mid|high` forces and bypasses sampling; forced tier is never written to storage; stored `race-it:quality` survives reload; corrupt/absent values fall back to `high`; no throw on storage errors (injected fake storage — no real localStorage in unit tests).
- [x] Task 1.2: implement the controller (Green) (4e23994) — `src/render/quality-controller.ts`: exported `QualityTier` (`'high' | 'mid' | 'low'`), tuning constants (window lengths, fps thresholds, `STORAGE_KEY = 'race-it:quality'`), a pure frame-fed `tick(dt)` controller with observable current tier, and `resolveStartTier` for boot. No DOM/Three imports; injectable storage; JSDoc on the public API.
- [x] Task 1.3: verify coverage for the new module (>80%) and refactor for clarity while tests stay green (4e23994) — verified: 100% stmts / 98.07% branch / 100% lines on quality-controller.ts; full suite 475 tests green; no refactor needed.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — Scene DPR Lever & Boot Wiring [checkpoint: 8d618f6]

- [x] Task 2.1: scene tests first (Red) (b02db56) — extend `src/render/scene.test.ts`: a new `setPixelRatioCap` surface applies `min(devicePixelRatio, cap)` via `renderer.setPixelRatio` + `setSize` (immediate buffer resize); `high` preserves today's `min(dpr, 2)`; `mid`/`low` map to their caps; container/window resize after a tier change keeps the active cap; default at boot is `high`.
- [x] Task 2.2: implement the DPR lever (Green) (992fb7b) — `src/render/scene.ts`: track the active cap, apply it in `resize()` and on cap changes; no other visual behavior changes.
- [x] Task 2.3: wire the controller into the app (Green) (e4570a3) — `src/main.ts`: boot via `resolveStartTier(location.search, localStorage)`; tick from the existing `view.onFrame` (feedback → race presentation → quality tick → render); apply tier changes to the scene cap and (Phase 3) the piece-renderer mode; keep `?perf`, `?race`, `?debug`, shelf, clear, and race flows untouched. Wiring stays thin, per the prior track's precedent — deep coverage lives in the seams (controller, scene, renderer) and the Phase 4 E2E.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 — Instanced Tile Render Path [checkpoint: 1087c59]

- [x] Task 3.1: instanced-mode tests first (Red) (579c76b) — `src/render/piece-renderer.test.ts`: `setRenderMode('individual' | 'instanced')`; in instanced mode, road-tile geometry renders through one InstancedMesh per piece type with instance count = placed count per type; instance matrices match the individual path exactly (positions, orientations including the curve's +90° seam fix, unit scale); start/finish checker overlays and finish flags still render per the same rules; rebuild on `update()` reflects the snapshot; `individual` output is byte-identical to today.
- [x] Task 3.2: implement the instanced path (Green) (d266eb1) — `src/render/piece-renderer.ts`: per-type instanced batching derived from the existing templates; per-instance transforms; disposal of stale buffers on rebuild/mode switch; keep the existing holder/feedback metadata available (lightweight per-piece records) so feedback and rebuild semantics survive.
- [x] Task 3.3: feedback & switching tests first (Red) (dfd5ec7) — place pop-in and remove-mode wiggle/tint still animate the affected tiles under instanced mode; individual→instanced→individual mid-session switches leave no stale meshes/geometry and remain stable across repeated toggles; `applyPieceFeedback` contracts unchanged for both modes.
- [x] Task 3.4: implement feedback sync + disposal (Green) (2de6c2e) — bridge the existing feedback transforms into instance matrices; ensure renderer disposal frees instance buffers.
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 — E2E, Perf Measurement & Quality Gates

- [x] Task 4.1: E2E coverage first (Red) (3c7eb30) — new `e2e/perf.spec.ts`: with `?tier=low&perf`, the effective canvas buffer ratio (buffer size ÷ CSS size) matches the low cap and `window.__raceItPerf()` draw calls are materially below the `?tier=high&perf` baseline; forced tier does not overwrite the persisted value; a pre-seeded `race-it:quality` is honored on reload; confirm the spec fails without the wiring (Red against the pre-change revision, like the prior track).
- [x] Task 4.2: measure & record worst-case numbers — measured headless (deviceScaleFactor 2, `?perf&debug` full board, settled): high 652 calls / 21,986 tris (DPR cap 2); mid 652 calls / 21,986 tris (cap 1.5 — mid keeps the individual path, only DPR changes); low 232 calls / 21,986 tris (cap 1 — instanced batching, 64% fewer draw calls vs high). Triangles constant across tiers (same geometry). Note: the current high-tier reading (652) is higher than the historical ~542-draw-call baseline (older measurement context); low is materially below both.
- [ ] Task 4.3: quality gates — `pnpm build`, `$env:CI='true'; pnpm test`, coverage >80% on changed modules, `pnpm lint` clean; then browser verification in portrait + landscape: build → race → shelf flows regression-free, DevTools CPU throttling visibly steps tiers down and recovers, `?perf`/`?race`/`?debug` hooks unchanged; screenshots captured.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
