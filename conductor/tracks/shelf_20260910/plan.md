# Plan: Track Shelf — Save, Load & Long-Press Delete

## Phase 1: Shelf Storage Core (`src/grid/shelf-store.ts`)
- [x] Task: Write failing tests for shelf persistence (TDD Red)
    - Round-trip: `saveToShelf(grid)` → `loadShelf()` returns snapshot equal to original
    - Append semantics: consecutive saves append; newest-first ordering
    - Capacity: 13th save reports `full`, adds nothing, existing 12 intact
    - Defensive load: corrupt/invalid entries silently dropped; corrupt JSON → empty shelf; never throws
    - Delete: `deleteFromShelf(id)` removes exactly that entry; best-effort on storage failure
    - Isolation: `race-it:track` auto-save key untouched
- [x] Task: Implement shelf-store to pass tests (Green)
    - Storage key `race-it:shelf`; entry shape `{ id, createdAt, snapshot }` reusing `GridSnapshot` validation
- [x] Task: Refactor & verify coverage ≥ 80% for new module
- [x] Task: Commit `feat(grid): Add multi-track shelf persistence` + attach git note
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Card Schematic Renderer (`src/render/shelf-schematic.ts`)
- [ ] Task: Write failing tests (TDD Red)
    - Renders piece glyphs (straight/curve/start/finish) at correct grid positions with rotations respected
    - Empty cells blank; snapshot with mixed pieces renders all; no exceptions on odd input
- [ ] Task: Implement canvas-based top-down schematic renderer (Green)
- [ ] Task: Refactor & verify coverage
- [ ] Task: Commit `feat(render): Add shelf card schematic renderer` + attach git note
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Shelf Overlay UI (`src/ui/shelf-overlay.ts`)
- [ ] Task: Write failing tests (TDD Red)
    - 12 fixed slots; occupied slots render schematic cards; empty slots dimmed
    - Empty state: dim slots pulse + save action highlighted
    - Save action: emits save callback; success pops new card (toy bounce) newest-first; full state wiggles red, no append
    - Card tap: emits load callback with entry id and closes overlay
    - Long-press ~600ms: wiggle + wordless ✓/✗ confirm; ✓ emits delete, ✗ cancels restoring card
    - Close (✕) button closes overlay; all touch targets ≥ 64px; no text nodes anywhere
- [ ] Task: Implement overlay to pass tests (Green), styling in `style.css`
- [ ] Task: Refactor & verify coverage
- [ ] Task: Commit `feat(ui): Add wordless shelf overlay with save/load/delete` + attach git note
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Integration & Wiring (`main.ts`, `corner-cluster.ts`)
- [ ] Task: Write failing tests (TDD Red)
    - `onShelf` opens overlay (remove stub behavior + update corner-cluster test note)
    - Load closes overlay and swaps working board; auto-save key still updated by existing flow
    - Save/delete trigger audio-director one-shots (existing assets only)
    - Overlay hidden during countdown/race/trophy (cluster already hidden — verify assertions)
- [ ] Task: Implement wiring (Green); end-to-end manual smoke of full loop
- [ ] Task: Refactor, run full gates: `pnpm check` (Biome), `tsc --noEmit`, Vitest coverage, build
- [ ] Task: Commit `feat(app): Wire track shelf into build mode` + attach git note
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — final checkpoint before review
