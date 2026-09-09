# Implementation Plan — Diorama Scenery & Toy Polish

**Track ID:** `scenery_20260910` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build`

## Phase 1 — Scenery Assets & Placement Plan

- [x] Task 1.1: Download 3 Kenney Racing Kit scenery GLBs (tree, grandstand, barrier — CC0) into `src/assets/models/`; add `SCENERY` export to `assets/manifest.ts`. Red: extend `src/assets.test.ts` — `SCENERY` has exactly 3 `?url` strings matching expected filenames (fails until manifest updated). Green: assets + manifest land. `(728b4c0)`
- [x] Task 1.2: `planScenery` tests first (Red) — `src/render/scenery-plan.test.ts`: empty board plan; never on occupied; never adjacent to pieces (N/E/S/W + diagonals); grandstands border-only; max 14; determinism with seed; demo-loop snapshot produces valid non-overlapping plan. `(44a6a28)`
- [x] Task 1.3: implement `src/render/scenery-plan.ts` — pure `planScenery(snapshot, seed?)` using `mulberry32` from `src/race/rng.ts` (Green). `(44a6a28)`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `(44a6a28)`

## Phase 2 — Scenery Renderer

- [x] Task 2.1: `SceneryRenderer` tests first (Red) — `src/render/scenery-render.test.ts` with mocked GLTF loader: `load()` stores 3 templates; `update(snapshot)` builds one Object3D per plan item with yaw/scale; rebuild clears previous children; bright tint applied. `(8e05ae8)`
- [x] Task 2.2: implement `src/render/scenery-render.ts` — injectable loader, template map, `update(snapshot)` → `THREE.Group` (Green). `(8e05ae8)`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `(8e05ae8)`

## Phase 3 — Micro-Feedback & Table Polish

- [ ] Task 3.1: feedback math tests first (Red) — `src/render/toy-feedback.test.ts`: pop-in scale curve over ~180 ms with overshoot ends at 1.0; remove-mode wiggle amplitude ~±4°; tint pulse flag; state clear when remove mode off.
- [ ] Task 3.2: implement `src/render/toy-feedback.ts` — pure easing + small `PieceFeedback` tracker (pending pops, remove-mode flag) (Green).
- [ ] Task 3.3: table polish — contact-shadow plane + rim accent in `scene.ts` (visual; keep scene tests green; dispose paths updated). Manual browser check portrait/landscape.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 — Integration

- [ ] Task 4.1: wire `main.ts` — load `SceneryRenderer` alongside pieces; `rerender()` → `scenery.update`; place/remove tools drive feedback tracker; scene loop calls `feedback.tick(dt)` before render.
- [ ] Task 4.2: remove-mode 3D feedback — tint/wiggle pieces while tool is remove; clear on toggle off (unit + browser).
- [ ] Task 4.3: regression — `?race`, `?perf`, `?debug` hooks still work; build tests unchanged; document new `?perf` numbers with full board + scenery.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 — Verification

- [ ] Task 5.1: quality gates — `pnpm build`, `$env:CI='true'; pnpm test` (full suite), coverage >80% on new/changed modules, `pnpm lint` clean.
- [ ] Task 5.2: `?perf` sanity — draw calls / triangles with 144 pieces + max scenery; confirm budget vs buildmode baseline; 60 fps headroom.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
