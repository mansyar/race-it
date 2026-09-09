# Diorama Scenery & Toy Polish — Specification

**Track ID:** `scenery_20260910` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

Make the board feel like a **physical toy race set**, not a bare grid: auto-place Kenney scenery (trees, grandstands, barriers) on empty margin cells so they never block building, add placement/remove micro-feedback, and warm the table presentation. Pure visual polish — no new child-facing controls, no change to grid logic, validation, or the race engine.

## Functional Requirements

### FR-1 — Scenery assets
- Source 3 Kenney Racing Kit GLBs (CC0, same pack as `roadStraight` / `roadCornerSmall`): **tree**, **grandstand**, **barrier** (or cone if grandstand is unavailable — prefer grandstand). License file already present (`LICENSE-kenney-racing-kit.txt`).
- Extend `assets/manifest.ts` with a `SCENERY` export (3 `?url` imports).
- Bright toy tint matching `piece-renderer.ts` (`tintBright` pattern).
- Per-kind scale/orientation fit so props sit on the tabletop (`y ≈ 0`) and read clearly from the fixed diorama camera.

### FR-2 — Placement rules (pure logic)
New module `src/render/scenery-plan.ts` (no THREE scene objects required for the math):

```
planScenery(snapshot: GridSnapshot, seed?: number): SceneryItem[]
```

- `SceneryItem = { kind: 'tree' | 'grandstand' | 'barrier'; x: number; y: number; rotationDeg: 0 | 90 | 180 | 270; scaleJitter: number }`
- **Hard rules (must hold in tests):**
  1. Never place on an occupied grid cell.
  2. Never place on a cell orthogonally or diagonally adjacent to a track piece (keeps roads unobstructed and taps unambiguous).
  3. Only empty cells inside the 12×12 board.
  4. Max **14** scenery items total (draw-call budget).
  5. Grandstands only on the outer ring of the board (border cells), facing inward.
  6. Deterministic given the same snapshot + seed (mulberry32 from `src/race/rng.ts`).
- Placement prioritizes border cells first, then other empty non-adjacent cells; trees dominate, grandstands 0–2, barriers 0–4.
- Regenerates whenever the grid snapshot changes (add/remove/rotate/clear).
- Dangling/unused track pieces still count as occupied for adjacency (conservative, simpler).

### FR-3 — Scenery renderer
New module `src/render/scenery-render.ts`:
- `SceneryRenderer` class mirroring `PieceRenderer`: injectable GLTF loader, `load()` templates, `update(snapshot)` rebuilds a `THREE.Group`.
- Clones templates per item; applies scale jitter and yaw; bright tints.
- Group is added to the build scene; scenery meshes are **not** pickable via cell raycast (picking is already onto the table plane — no change to `picking.ts`).
- Dispose-friendly (shared geometry/materials where safe; clear() on rebuild like pieces).

### FR-4 — Placement & remove micro-feedback
- **Place pop-in:** newly placed piece holders scale from ~0.55 → 1.0 over ~180 ms with an overshoot ease (toy-like). Implemented as a small per-frame animation list owned by the renderer/scene loop; pure easing function unit-tested.
- **Remove-mode wiggle:** while remove tool is active, every placed piece gets a red tint pulse + gentle yaw wiggle (~±4°). Cleared when remove mode turns off.
- Existing under-finger cell highlight unchanged.
- No new DOM UI; feedback is entirely in-scene / existing bar state.

### FR-5 — Table presentation polish
- Soft contact-shadow plane under the table (cheap radial gradient texture or dark transparent disc) so the diorama sits on the cream background instead of floating.
- Slightly thicker table edge / rim color accent (read as chunky wood toy edge from the fixed camera).
- Keep 60 fps budget; no shadow-map requirement for v1 of this track (optional later).
- Background cream tone (`0xf6f1e7`) and lighting direction stay as-is unless a tiny ambient tweak is needed for prop readability.

### FR-6 — Integration
- `main.ts`: after piece load, also load scenery; `rerender()` calls `scenery.update(model.toSnapshot())` and drives place/remove feedback.
- `scene.ts`: optional `onFrame` hook or return-value extension only if needed for pop-in/wiggle animation (prefer a tiny `tickFeedback(dt)` called from the existing `requestAnimationFrame` loop — keep scene API minimal; no full presentation-controller refactor).
- `?perf` and `?debug` hooks keep working; `?perf` must still report a budget-safe draw-call count with full board + scenery.
- Build mode only — no race-mode scenery animation.

## Non-Functional Requirements

- **Boundaries:** planning math in pure TS (unit-tested); rendering stays in `src/render/*`; `src/grid/*` and `src/race/*` unchanged.
- **Quality:** TS strict, Biome-clean, >80% coverage on new logic (`scenery-plan`, easing, renderer with mocked loader), JSDoc on public functions, TDD per `conductor/workflow.md`.
- **Performance:** +≤14 scenery meshes; full board + scenery stays well under the measured ~542 draw-call / ~21.7k triangle baseline (target: no more than ~+40 draw calls).
- **UX:** zero new controls; scenery never interferes with place/rotate/remove; wordless; portrait & landscape unchanged.
- **Device:** iOS Safari 16+ / Android Chrome 110+.

## Acceptance Criteria

1. 3 scenery GLBs + `SCENERY` manifest entries; props render on the demo loop (browser check).
2. `planScenery` unit-tested: no occupied cells; no track-adjacent cells; max count; grandstands on border only; same seed → same plan; different snapshot → different occupancy respect.
3. `SceneryRenderer` unit-tested with mocked loader: templates loaded, instances placed with yaw/scale, group cleared on update.
4. Place pop-in and remove-mode wiggle/tint unit-tested (easing + state flags); visible in browser.
5. Contact shadow + table rim present; diorama still framed correctly portrait/landscape.
6. `?perf` with full board + scenery: draw calls / triangles within documented budget.
7. `src/grid/*` and `src/race/*` suites green and unchanged in behavior.
8. `pnpm build`, `CI=true pnpm test`, `pnpm lint` all green; coverage >80% on new modules.

## Out of Scope

- Scenery as palette-placeable pieces (child never places props by hand).
- Race-mode scenery effects, animated crowds, weather.
- Shadow-mapped real-time shadows, AO, post-processing.
- Car Picker, Race Audio, Track Shelf, Race Presentation integration (other tracks).
- Any text UI, settings toggles for scenery on/off.
