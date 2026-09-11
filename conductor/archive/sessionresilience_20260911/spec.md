# Spec: Session Resilience — Toddler-Proofing & Lifecycle Hardening

## Overview
A preschooler hands the tablet around, swipes, long-presses, and switches apps mid-race; v0.4.0 survives some of this and mishandles the rest. `main.ts` disposes the renderer and kart preview unconditionally on `pagehide` and never re-initializes — a bfcache restore can return to a dead canvas. Hiding the app pauses rendering but the race isn't explicitly held; long-press opens an iOS callout/context menu on the toy table; Safari ignores `user-scalable=no`, leaving double-tap/pinch zoom live; nothing keeps the screen awake during a race. This track makes a play session survive interruptions intact — no dead states, no accidental gestures, no screen sleep — while keeping every existing behavior (audio lifecycle, debug hooks, shelf, race flows) exactly as shipped.

## Functional Requirements

### FR1 — bfcache-safe lifecycle (`src/main.ts` + new lifecycle module)
- Remove the destructive `pagehide` teardown (`view.dispose()`, `kartPreview.dispose()`, resize-listener removal); canvas, scene, karts, and UI survive whenever the browser keeps the page.
- `pagehide` (persisted or not): suspend audio; if a race is active, hold it (FR2).
- `pageshow`, including `persisted: true` bfcache restores: re-sync the renderer to the current viewport, restore audio per visibility, re-acquire wake lock (FR3), and leave the game immediately interactive.
- True unload needs no cleanup (the browser reclaims resources).
- The new module owns document lifecycle subscriptions and is unit-testable via injected `document`/`navigator`.

### FR2 — Auto-hold on hide; one-tap return
- Hidden during countdown or running: race simulation makes zero progress (engine held), audio suspends.
- On return, the existing race HUD pause state is shown (Resume + Quit confirm); Resume continues exactly at the hold point; Quit keeps its existing confirm → abandon → builder flow.
- Hidden during build, picker, shelf, trophy, or an already-paused race: no UI change (audio still suspends/restores).
- No new UI elements; the pause overlay is the existing one.

### FR3 — Wake Lock (whole visible session)
- When `navigator.wakeLock` is available: acquire `screen` while visible; release on hide; re-acquire on return; if the OS releases the lock while the page is still visible, re-acquire once.
- Unsupported or rejected (Low Power Mode, etc.): silent no-op, no UI, game unaffected.
- Applies across build and race alike.

### FR4 — Gesture guards on the game surface
- Long-press never opens a context menu or iOS callout on the game surface (`contextmenu` prevention + `-webkit-touch-callout: none`).
- Double-tap and pinch never zoom the page (root `touch-action: manipulation`; Safari `gesturestart`/`gesturechange` suppressed; `user-scalable=no` stays as defense in depth).
- No drag ghost, no rubber-band/overscroll bounce (`overscroll-behavior: none`, drag-start suppression).
- Existing tap/rotate/remove interactions, button taps, and first-touch audio unlock are unchanged.

### FR5 — Wiring & regression safety
- Audio suspension semantics stay as today (suspend on `pagehide`/hidden, restore on visible).
- `race-presentation.ts` may gain an explicit hold/release API for the lifecycle wiring; `src/race/*` untouched (pause/resume already exist).
- `?perf`, `?race`, `?debug` hooks and all existing e2e suites keep working.
- No new dependencies; no new assets; wordless (no new visible text anywhere).

## Non-Functional Requirements
- **NFR1 — Testability & coverage:** lifecycle logic lives outside `main.ts` in injectable modules; >80% coverage on new code (Vitest/jsdom, mocked `navigator.wakeLock`).
- **NFR2 — Zero perf impact:** guards are passive-safe listeners; no per-frame work added.
- **NFR3 — Compatibility:** iOS Safari 16+, Android Chrome 110+; every capability feature-detected with silent fallback.
- **NFR4 — Wordless & toddler-proof:** failures invisible; no new controls; ≥64px target rule untouched.
- **NFR5 — Offline-first & PWA behavior unchanged** (no SW/manifest changes).

## Acceptance Criteria
1. Build a loop, trigger a bfcache navigation away and back: table/pieces/karts intact, buttons functional, no blank canvas, no console errors.
2. Start a race, hide the app, wait, return: race exactly at the hold point with the pause overlay; Resume continues seamlessly; Quit → existing confirm → builder works.
3. Hide during countdown, return: countdown held and resumes cleanly (no skipped/multiple beeps).
4. Long-press the table for 2 s: no context menu, no selection callout; release returns to normal.
5. Double-tap and two-finger pinch on the game surface: page never zooms; gameplay taps unaffected.
6. On a wake-lock-capable device: display stays awake through a full build + race; hide → released; return → re-acquired.
7. On a device/browser without wake-lock support (or blocked): no errors, no UI change, fully playable.
8. `pnpm test -- --coverage` (≥80% new code), `pnpm lint`, `pnpm build`, and the full Playwright suite incl. a new lifecycle spec all green.
9. All existing flows unchanged: placement/rotation/removal, GO → picker → race → trophy, shelf save/load/delete, mute, install hint.
10. Real-device manual checklist (iOS standalone + Android Chrome) passes.

## Out of Scope
- Android back-gesture/app-exit prevention, history manipulation, `beforeunload` dialogs.
- `freeze`/`resume` Page Lifecycle events beyond visibility/`pagehide`/`pageshow`.
- Fullscreen API, orientation lock, safe-area/layout changes.
- New pause UI or menu redesign (existing HUD only); gameplay/race/audio changes; new assets.
- Post-race navigation (separate in-flight track), SW/caching/update-flow changes.
- Battery/energy preferences UI.
