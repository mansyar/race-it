# Car Picker & Race Setup — Specification

**Track ID:** `carpicker_20260910` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

The second beat of the core loop (**Build → Pick cars → Countdown → Race → Celebrate**). After the child builds a valid track and taps GO, a wordless picker lets them choose **2–4 karts** by tapping big color swatches that show **tinted 3D karts** (Kenney Car Kit, CC0). All 4 karts are on by default — one tap on RACE is all that's needed. The chosen lineup (colors + count) is persisted in localStorage and feeds the existing race engine (`kartCount`). No race visuals, countdown, or audio — those are later tracks; the race still runs headless via the existing console integration.

## Functional Requirements

### FR-1 — Kart asset (Kenney Car Kit, CC0)

- Source a kart GLB from the Kenney Car Kit (same CC0 family as the Racing Kit already in use); add `LICENSE-kenney-car-kit.txt` beside the existing license files.
- Extend `assets/manifest.ts` with a `CARS` export (`?url` import); extend `assets.test.ts` accordingly.
- Reuse the existing `tintBright` pattern (from `piece-visuals.ts`) so one kart model serves all four colors.

### FR-2 — Lineup model (pure logic)

New `src/race/lineup.ts` (no DOM/THREE):

- `KartColor = 'red' | 'blue' | 'green' | 'yellow'`, `CarLineup { karts: KartColor[] }` (length 2–4, no duplicates by construction).
- `DEFAULT_LINEUP` = all four colors; `toggleKart(lineup, color)` adds/removes a kart; `isLineupValid(lineup)` = length 2–4.
- Persistence: `loadLineup()` / `saveLineup(lineup)` via `localStorage` key `race-it:lineup`; invalid/missing stored data falls back to `DEFAULT_LINEUP` (toddler-proof — never blocks the race).

### FR-3 — Picker UI

New `src/ui/car-picker.ts` (vanilla DOM, wordless):

- Full-screen overlay opened from GO; 4 large swatch cards (≥64px targets), each = color disc + tinted 3D kart preview + big tap area.
- Tap toggles that kart on/off with immediate visual + `click` sound feedback (off state = dimmed/depressed, toy-like bounce on toggle).
- Big RACE button (the largest element, like the build-mode GO) enabled **iff** `isLineupValid`; disabled with a pulsing hint when <2 karts (mirrors GO-button gating pattern).
- Wordless X/back button returns to build mode without touching the track.

### FR-4 — Kart preview rendering

New `src/render/kart-preview.ts`:

- Loads the CARS model, applies per-color `tintBright`, fits it via a `ModelFit` (extends the existing `model-fit.ts` pattern), renders all four karts into **one shared WebGL canvas** using scissored viewports (one per swatch) — keeps the WebGL context count at +1 on the device floor (no per-swatch canvases).
- Injectable loader/renderer for unit tests; `dispose()` on close; transparent background so cards read as toy chips.

### FR-5 — Integration (`main.ts`)

- GO tap no longer starts the race directly: it opens the picker (build bar/corner cluster hidden or dimmed behind the overlay).
- Picker RACE → `createRaceEngine(path, { kartCount: lineup.karts.length })` + `start()` — same headless behavior as today; lineup stored for the future Race Presentation track.
- Mute state, track model, and undo history are untouched by picker open/close (toddler-proof: nothing destructive).
- `?race` debug path still works (uses loaded/default lineup).

## Non-Functional Requirements

- **Boundaries:** lineup logic pure TS in `src/race/lineup.ts`; UI in `src/ui/car-picker.ts`; rendering in `src/render/kart-preview.ts`. No changes to `src/grid/*`, `src/race/engine.ts`, or `src/render/picking.ts`.
- **Quality:** TS strict, Biome-clean, >80% coverage on new logic (lineup, preview renderer with mocked loader), JSDoc on public functions, TDD per `conductor/workflow.md`.
- **Performance:** exactly +1 WebGL context; ≤4 preview meshes; no per-frame work while closed; overlay is DOM (cheap).
- **UX:** wordless; ≥64px targets; one action per screen state; portrait & landscape; nothing destructive without confirm.
- **Device/offline:** iOS Safari 16+ / Android Chrome 110+; new GLB precached by the service worker.

## Acceptance Criteria

1. `CARS` manifest entry + license file; kart GLB renders tinted in the four colors (browser check on the demo flow).
2. `lineup.ts` unit-tested: default lineup valid; toggle adds/removes; invalid length rejected; persistence round-trip; corrupt stored data → default fallback.
3. `car-picker.ts` unit-tested (DOM): 4 swatches, toggle updates state + RACE enablement, back button fires callback.
4. `kart-preview.ts` unit-tested with mocked loader/renderer: four scissored viewports render tinted karts; `dispose()` releases.
5. Integration: GO → picker → RACE creates the engine with the **chosen** `kartCount` (seeded console race verifies); back returns to an unchanged track.
6. `pnpm build`, `CI=true pnpm test`, `pnpm lint` all green; coverage >80% on new modules.

## Out of Scope

- Countdown lights, karts driving on the track, camera drift, victory/celebration (Race Presentation track).
- Countdown beeps, engine hum, victory jingle, music (Race Audio track).
- More than 4 colors, kart personalities, drag-reordering, player control during the race.