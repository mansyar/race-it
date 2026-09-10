# Post-Race Navigation — Specification

**Track ID:** `postracenav_20260911` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

The trophy celebration ends the race, but strands the child: after all karts finish, the only affordance is `RACE AGAIN` (`src/ui/trophy.ts`), while the build UI (palette, GO, corner cluster) and race HUD stay hidden. The product's documented core loop — **Build → Pick cars → Countdown → Race → Celebrate → Race again / Build again** (`conductor/product.md`) — therefore has no "Build again" path: a child must reload the app to build a new track. The reset machinery already exists (`RacePresentation.resetToBuild()` → engine `abandon()` → `idle` state reset) but is never invoked from `main.ts`.

This track adds a wordless **Build Again** action to the trophy that returns the child to the builder with their current track intact, wiring the existing reset path end-to-end.

## Functional Requirements

### FR-1 — Build Again affordance on the trophy (`src/ui/trophy.ts`)
- Extend the `Trophy` interface with an `onBuildAgain` callback.
- Add a new button, `.build-again-button` (`data-action="build-again"`), rendered **below** `RACE AGAIN` on the trophy card. Wordless: an inline SVG curved track-tile icon (the builder's own visual vocabulary) + `aria-label`; no visible text.
- Touch target ≥64px. Visually subordinate to `RACE AGAIN` — `RACE AGAIN` remains the biggest button (guideline 5).
- Same lifecycle as the trophy card: hidden whenever the trophy is hidden; tapping plays the existing `click` SFX and calls `onBuildAgain()` — **no confirm step** (nothing is lost; the race is over and the track is auto-saved).

### FR-2 — Return-to-builder behavior (`src/presentation/race-presentation.ts` + `src/main.ts`)
- Tapping Build Again returns to the builder: trophy dismissed, confetti cleared, race HUD/overlays hidden, engine back to `idle` via the existing `resetToBuild()` path, audio `stopAll()` (music stops — matching Quit-to-builder), build UI restored.
- Camera eases back to the build placement using the existing smoothing — no instant cut.
- **Current track stays loaded and untouched:** same cells/orientations, GO remains enabled for a valid track.
- After returning, the normal flow works again immediately: GO → car picker → RACE (fresh race roll); mid-race pause/quit unchanged.
- `RACE AGAIN` behavior is unchanged (engine restart with fresh speeds, full celebration replays).

### FR-3 — Wiring & regression safety (`src/main.ts`)
- The presentation's existing trophy callback rewiring must preserve the new `onBuildAgain` callback through to `main.ts`.
- Debug hooks (`?perf`, `?race`, `?debug`), shelf auto-save, and build-mode interactions remain regression-free.

## Non-Functional Requirements
- **Wordless UI:** icon + aria-label only; the winner's color word stays the only visible text.
- **Boundaries:** changes confined to `src/ui/trophy.ts`, `src/presentation/race-presentation.ts`, `src/main.ts`, `src/style.css`; `src/race/*` untouched (engine already exposes the needed `abandon`/`idle` states).
- **Quality:** TDD per `conductor/workflow.md`; TS strict; Biome-clean; >80% coverage on changed modules; JSDoc on public APIs.
- **Touch/device:** ≥64px target; portrait & landscape; iOS Safari 16+ / Android Chrome 110+; no new assets (inline SVG), no draw-call/perf impact.

## Acceptance Criteria
1. Trophy shows the track-tile Build Again button below RACE AGAIN; ≥64px; aria-labelled; no visible text; RACE AGAIN remains the most prominent.
2. Browser: tap Build Again → trophy dismisses, build palette/GO/cluster reappear, camera eases back, karts/confetti cleared, music stops, click SFX plays.
3. Track intact after return (same pieces/rotations), GO enabled, and GO → picker → RACE works again; pause/quit flows unchanged.
4. RACE AGAIN still restarts with fresh speeds and replays the celebration.
5. Unit: trophy DOM/callback contract; presentation idle-reset visuals; main wiring — all covered.
6. E2E: Playwright covers finish → Build Again → builder state (timer virtualization or extended timeout acceptable).
7. `CI=true pnpm test`, `pnpm build`, `pnpm lint` green; coverage >80% on changed modules.

## Out of Scope
Change Cars action on the trophy, confirm step for Build Again, clearing/resetting the board, new exit choreography beyond camera easing, `RACE AGAIN` behavior, race engine outcomes, audio content, shelf/save semantics, any text UI.
