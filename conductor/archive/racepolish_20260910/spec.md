# Race Watchability Polish — Specification

**Track ID:** `racepolish_20260910` · **Type:** Feature (includes a bug-fix phase) · **Plan:** [plan.md](./plan.md)

## Overview

Two related problems, one track:

1. **Bug:** Immediately after the countdown, the pause overlay ("Resume" / "Quit to builder") and the quit confirm ("Quit race" / "Keep racing") render unprompted, covering the race and swallowing every tap. Root cause: `race-hud.ts` hides those dialogs via the `hidden` attribute, but `style.css` sets `display: flex` on `.race-overlay` / `.race-confirm` — author styles defeat the UA `[hidden]` rule, so they appear the moment the HUD root becomes visible at `running`.
2. **Polish:** The race is framed too wide to watch. The camera frames the whole 24×24-unit board with ≤3 units of target drift, ≤15° orbit, ≤8% push-in, while karts are ~0.8 units long (~3% of the board width) — technically correct, barely readable on a phone.

This track makes the race properly watchable: a pack-fitting adaptive camera, modestly larger karts, and a pause HUD that only appears when asked.

## Functional Requirements

### FR-1 — Pause/quit dialogs stay hidden until opened (bug fix)
- `.race-overlay` and `.race-confirm` must be visually hidden whenever their `hidden` attribute is set, and must re-hide on hide/reset/quit.
- Fix: author rule in `src/style.css`, next to the existing `.confirm-overlay[hidden]` precedent:
  ```css
  .race-overlay[hidden],
  .race-confirm[hidden] { display: none; }
  ```
- Keep the `hidden` attribute mechanism in `race-hud.ts` (no API change); existing DOM tests stay valid.
- Add a regression guard: a stylesheet contract test asserting the hidden-override rules exist (this bug class is invisible to jsdom DOM tests).
- Browser acceptance: after countdown the race is fully visible/interactive; pause opens only on pause tap; Resume closes; Quit → confirm → Quit race abandons to builder; Keep racing closes the confirm.

### FR-2 — Pack-fitting race camera
- During `running`, frame the **lead battle**: leader + closest rival (next-highest progress), works for 2–4 karts.
- Distance solved per frame so both karts + margin fit at the fixed 50° diorama elevation; pure function of kart world positions + aspect + build placement.
- **Zoom clamp:** between **0.4× the full-board distance** (floor; ~5 cells visible on a phone) and **1×** (ceiling = full board).
- Target = midpoint of the framed pair, nudged slightly ahead of the leader along the direction of travel; motion stays smoothed (no snapping), smoothing retuned for the closer follow.
- Countdown/build: unchanged full-board placement.
- Finish: **hold close on the finish area** through confetti + victory spin; trophy covers the screen; quit / RACE AGAIN restore countdown framing.
- Supersedes the archived Race Presentation spec's *"modest push-in, board stays mostly visible"* constraint for the running phase only.

### FR-3 — Kart visibility (scale)
- `KART_SCALE` 0.4 → **0.55** (~1.1 world units long; supersedes the archived "0.6–0.9 units" range).
- Verify the start lineup (2×2 grid, `LANE_OFFSET = 0.35`, `ROW_SPACING = 1.2`) has no mesh intersection; adjust lane/row spacing only if needed (engine tests updated accordingly).
- Applies wherever karts are shown (lineup + race).

### FR-4 — Integration & tuning
- `race-camera.ts` stays pure (no THREE imports), unit-tested; `race-presentation.ts` remains the integration point.
- Existing hooks (`?perf`, `?race`, `?debug`) and build mode regression-free.

## Non-Functional Requirements
- Boundaries: presentation in `src/render/*` + `src/ui/*`; `src/race/*` engine touched only if start-grid spacing must change.
- TDD per `conductor/workflow.md`; TS strict; Biome-clean; >80% coverage on changed modules; JSDoc on public APIs.
- 60 fps on device floor; closer framing adds no draw-call pressure; verify with `?perf`.
- iOS Safari 16+ / Android Chrome 110+; portrait & landscape.

## Acceptance Criteria
1. Browser: no dialogs post-countdown; pause/Resume/Quit flows correct; quit returns to builder; `?race` hook unchanged.
2. Unit: camera math covers lead+rival selection, floor/ceiling clamps, countdown/finished placements.
3. Browser: phone-sized portrait & landscape — karts clearly readable; camera follows the lead battle; finish celebration holds close.
4. No kart intersections at the start lineup; karts noticeably larger.
5. `CI=true pnpm test`, `pnpm build`, `pnpm lint` green; coverage >80% on changed modules.

## Out of Scope
Player control, laps > 1, camera interactions/zoom/pan, car picker, race audio, track shelf, scenery, engine race-outcome changes beyond start-grid spacing if required.
