# Implementation Plan — Car Picker & Race Setup

**Track ID:** `carpicker_20260910` · **Spec:** [spec.md](./spec.md)

## Phase 1 — Kart Asset & Lineup Logic `[checkpoint: a1ea5b6]`

- [x] Task: Source the Kenney Car Kit kart GLB (CC0) into `src/assets/models/` with `LICENSE-kenney-car-kit.txt` `[85961a7]`
- [x] Task: Write failing tests for the manifest `CARS` export (`assets.test.ts` — red) `[85961a7]`
- [x] Task: Add `CARS` export to `assets/manifest.ts` (green) `[85961a7]`
- [x] Task: Write failing tests for lineup logic (red) `[a1ea5b6]`
  - [x] `DEFAULT_LINEUP` is all four colors and valid `[a1ea5b6]`
  - [x] `toggleKart` adds a removed kart / removes an active kart, never duplicates `[a1ea5b6]`
  - [x] `isLineupValid` rejects length <2 and >4 `[a1ea5b6]`
  - [x] `loadLineup`/`saveLineup` round-trip; corrupt/missing stored data → `DEFAULT_LINEUP` `[a1ea5b6]`
- [x] Task: Implement `src/race/lineup.ts` (green) with JSDoc on public functions `[a1ea5b6]`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `[a1ea5b6]`

## Phase 2 — Kart Preview Rendering `[checkpoint: 8c03743]`

- [x] Task: Write failing tests for `src/render/kart-preview.ts` (red) `[8c03743]`
  - [x] Loads the CARS model via injected loader `[8c03743]`
  - [x] Applies per-color `tintBright` to materials `[8c03743]`
  - [x] Fits the kart via a `ModelFit` (reuses `applyModelFit`) `[8c03743]`
  - [x] Renders four scissored viewports into one canvas (mocked renderer records scissor/viewport calls) `[8c03743]`
  - [x] `dispose()` releases renderer/geometry and removes the canvas `[8c03743]`
- [x] Task: Implement `kart-preview.ts` (green) — per-model material cloning (clone(true) shares materials); `KART_FIT` measured via scripts/measure-glb-world.mjs `[8c03743]`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) `[8c03743]`

## Phase 3 — Picker UI

- [ ] Task: Write failing tests for `src/ui/car-picker.ts` (red)
  - [ ] Renders 4 swatch cards (color discs + preview slots), wordless, ≥64px
  - [ ] Tap toggles kart on/off and fires `onLineupChange`
  - [ ] RACE button disabled when lineup invalid; enabled when 2–4 karts
  - [ ] Back button fires `onBack` and returns to build without side effects
  - [ ] Styles/classes match existing UI conventions (big-button, wordless icons)
- [ ] Task: Implement `car-picker.ts` (green)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 — Integration & Quality Gates

- [ ] Task: Wire GO → picker → RACE in `main.ts`
  - [ ] GO opens the picker overlay (build UI hidden/dimmed) instead of starting the race
  - [ ] RACE creates the engine with `kartCount = lineup.karts.length` and starts it; lineup saved
  - [ ] Back restores build mode with track/undo/mute untouched; `?race` debug keeps working
  - [ ] Existing suites (`grid/*`, `race/*`, `render/*`, `ui/*`) stay green
- [ ] Task: Run full quality gates: `pnpm build`, `CI=true pnpm test`, `pnpm lint` (+ coverage >80% on new modules)
- [ ] Task: Phase Verification & Checkpoint with manual verification plan (Refer to workflow.md)