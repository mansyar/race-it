# Race Presentation — Specification

**Track ID:** `racepresentation_20260909` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

Make the race **watchable**: render 4 Kenney karts on the extracted loop path, drive them from the engine's per-kart progress, drift the camera subtly toward the lead battle, run a wordless traffic-light countdown, support mid-race pause/quit, and celebrate the finish (confetti, victory spin, trophy overlay, RACE AGAIN). Pure presentation layer — the merged race engine stays the source of truth for all race state.

## Functional Requirements

### FR-1 — Kart assets & colors
- Download 4 distinct Kenney Car Kit GLBs (CC0, kenney.nl) into `src/assets/models/`, with a license file matching the existing `LICENSE-kenney-racing-kit.txt` pattern.
- Extend `assets/manifest.ts` with a `KARTS` export (4 `?url` imports).
- Fixed kart→color mapping until Car Picker lands: kart 0 red, 1 blue, 2 green, 3 yellow (product-guidelines palette).
- Per-model scale/orientation tuning: karts ~0.6–0.9 world units long, wheels on the road surface, correct forward axis.
- Tint via cloned materials (fallback to material color) per kart.

### FR-2 — Kart placement & motion (`src/render/kart-rig.ts`)
- `kartPose(path, progress, lane)` → world position + heading: engine progress (world units) → cell + intra-cell fraction along `extractLoopPath` order; heading = segment tangent; lane applied perpendicular (±`LANE_OFFSET`); continuous across loop wrap.
- Per-frame smoothing: yaw/position lerp toward target pose (no snapping); karts sit at start poses during countdown (side-by-side pairs behind the line, per engine lineup).

### FR-3 — Camera drift (`src/render/race-camera.ts`)
- Build camera = `computeCameraPlacement` (unchanged in build mode).
- Countdown: stays at build placement.
- Running: subtle drift — target lerps toward a point ahead of the lead kart, camera orbits gently (≤~15°, modest push-in, board stays mostly visible), eases toward the finish as karts near completion.
- All-finish: settles on the finish area for the celebration.
- Pure pose math (unit-testable), applied to the shared `PerspectiveCamera`; resize/aspect changes blend back toward build placement.

### FR-4 — Countdown HUD (`src/ui/traffic-light.ts`)
- Wordless traffic-light overlay: 3 stacked lights; sequential 3-2-1 red (one per second, synced to engine's 3.0 s countdown), then a green GO flash at `running`.
- Small engine extension: `readonly countdownRemaining` getter on `RaceEngine` (tested) so the HUD syncs without wall-clock assumptions.
- Hidden during build; large, centered, high-contrast.

### FR-5 — Race HUD & pause
- During race: build HUD hidden (build bar, GO, shelf/clear); corner mute stays accessible; pause button shown (≥64px, wordless).
- Pause → overlay with **Resume** / **Quit-to-builder** (confirm step, toddler-proof pattern from corner-cluster) wired to `engine.pause()/resume()/abandon()`.
- Quit: abandon + restore build HUD + camera lerps back to build placement.

### FR-6 — Finish celebration
- At winner crossing (`finish` event): 3D confetti burst at the finish area (`src/render/confetti.ts`, ~300 Points, ~2 s life, gravity+fade) + winner victory spin (~2 s yaw).
- At ALL karts finished (final `engine.result`): trophy overlay — giant `🏆 [COLOR] WINS!` (the one allowed text) + one huge RACE AGAIN button.
- RACE AGAIN: `engine.restart()` + `start()` → fresh speed roll, countdown replays, presentation resets (camera, confetti cleared, karts to start poses).

### FR-7 — Integration (`src/main.ts`)
- Unify the render loop: single per-frame pass = `engine.tick(dt)` + presentation update (kart rig, camera, confetti) + `renderer.render` (scene.ts loop refactor; build tap handling unchanged).
- Engine events drive presentation state (`stateChange`, `finish`, `kartFinish`); GO handler hides build HUD and starts the engine; `?race` headless hook unchanged.

## Non-Functional Requirements

- **Boundaries:** presentation in `src/render/*` + `src/ui/*`; `src/race/*` stays pure (no DOM/THREE) — only the `countdownRemaining` getter addition, with tests.
- **Quality:** TS strict, Biome-clean, >80% coverage on new/changed logic (math modules heavily unit-tested; DOM modules per existing UI test patterns), JSDoc on public functions, TDD per workflow.
- **Performance:** +4 karts (few draw calls), confetti = 1 Points call; verify with `?perf`; 60 fps on device floor.
- **Device:** iOS Safari 16+ / Android Chrome 110+; responsive portrait/landscape overlays; aria-labels on all HUD controls.

## Acceptance Criteria

1. 4 Kenney car GLBs + license + `KARTS` manifest entry; karts render colored correctly on the demo loop (browser check).
2. `kartPose` unit-tested: progress 0 → start-cell pose, mid-segment interpolation, perpendicular lane offset, loop-wrap continuity.
3. Camera rig math unit-tested (build placement at countdown, bounded drift, finish settle); manual: subtle visible drift.
4. Countdown: lights appear on `countdown`, 3-2-1 sequential, GO flash at `running`, hidden otherwise (unit + browser).
5. Pause: freeze via engine, Resume/Quit flows correct, build HUD restored on quit (unit + browser).
6. Celebration: confetti+spin at winner crossing; trophy only at all-finish with correct color word; RACE AGAIN restarts with fresh speeds (unit + browser).
7. `src/race/*` pure; `countdownRemaining` getter tested; engine behavior otherwise unchanged.
8. Build mode + `?race` hook regression-free.
9. `pnpm build`, `CI=true pnpm test`, `pnpm lint` green; coverage >80% on new modules.

## Out of Scope

Car Picker (selection/color swatches), Race Audio (beeps/engine/victory/music), kart collision/passing visuals, laps > 1, Track Shelf UI, scenery, camera zoom/pan controls, any text UI beyond the winner color word.