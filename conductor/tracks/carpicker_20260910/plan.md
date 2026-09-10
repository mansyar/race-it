# Implementation Plan — Car Picker & Race Setup

**Track ID:** `carpicker_20260910` · **Spec:** [spec.md](./spec.md)

## Phase 1 — Kart Asset & Lineup Logic

- [ ] Task: Source the Kenney Car Kit kart GLB (CC0) into `src/assets/models/` with `LICENSE-kenney-car-kit.txt`
- [ ] Task: Write failing tests for the manifest `CARS` export (`assets.test.ts` — red)
- [ ] Task: Add `CARS` export to `assets/manifest.ts` (green)
- [ ] Task: Write failing tests for lineup logic (red)
  - [ ] `DEFAULT_LINEUP` is all four colors and valid
  - [ ] `toggleKart` adds a removed kart / removes an active kart, never duplicates
  - [ ] `isLineupValid` rejects length <2 and >4
  - [ ] `loadLineup`/`saveLineup` round-trip; corrupt/missing stored data → `DEFAULT_LINEUP`
- [ ] Task: Implement `src/race/lineup.ts` (green) with JSDoc on public functions
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — Kart Preview Rendering

- [ ] Task: Write failing tests for `src/render/kart-preview.ts` (red)
  - [ ] Loads the CARS model via injected loader
  - [ ] Applies per-color `tintBright` to materials
  - [ ] Fits the kart via a `ModelFit` (reuses `applyModelFit`)
  - [ ] Renders four scissored viewports into one canvas (mocked renderer records scissor/viewport calls)
  - [ ] `dispose()` releases renderer/geometry and removes the canvas
- [ ] Task: Implement `kart-preview.ts` (green)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

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