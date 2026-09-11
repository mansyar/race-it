# Spec: Safe PWA Update Flow

**Track ID:** `pwaupdate_20260912` · **Type:** Feature

## Background
Ship v0.5.0 accepted the known `autoUpdate` behavior — a deploy can activate a new service worker at any moment and silently reload the page, including mid-race — and explicitly deferred remediation to a follow-up track (NFR4). For a preschool app with 30–45 s races and a celebration moment, that is the one remaining way the product interrupts a child mid-session. This track replaces the automatic reload with a controlled lifecycle: detect updates in the background, keep the new version waiting, and swap only at a calm Build-mode moment. Silence is the feature.

## Functional Requirements

### FR1 — Background update discovery
The app checks for a new version: at launch; when returning to the foreground; when connectivity returns; and approximately every 15 minutes while visible and online. Checks are background-only — they must not block input, the render loop, or the race — and are skipped silently while offline.

### FR2 — Deferred activation
A discovered update installs but stays waiting: the running version is never replaced, and the page is never automatically reloaded, outside the safe-moment gate (FR3). Only one waiting version is tracked; a newer discovery replaces it.

### FR3 — Safe-moment gate (the only place a swap may happen)
The update may only apply when all of these hold: the current screen is Build mode (never car picker, countdown, race, pause, or trophy); there has been no touch/gesture/pointer input for at least 3 seconds; the document is visible. Input during the wait restarts the 3-second timer; leaving Build mode cancels it. Once the quiet window closes, application proceeds to completion even if new input arrives.

### FR4 — Silent application & state restoration
The swap shows no prompt, toast, icon, sound, or new UI of any kind. After the reload, persistent state returns exactly as before: auto-saved board, shelf, chosen cars/lineup, mute state, quality tier, install-hint dismissal. Transient UI state (selected piece, rotation, open overlay) may reset.

### FR5 — Never stranded on an old version
If the safe moment never occurs before the app is closed, the waiting version activates on the next full launch through the standard service-worker lifecycle. The app never runs an outdated version indefinitely.

### FR6 — Offline integrity
Everything above works offline: a waiting update simply waits; offline launches are unaffected; failed checks are silent. Offline-first behavior (precache serving, no network requirement) is unchanged.

### FR7 — No-op safety
Where service workers are unavailable or not registered (dev server, unsupported contexts), the update system degrades to a no-op — the app behaves exactly as today with no errors. The controller exposes an observable status for tests (idle / checking / ready / applying) with injectable timing seams.

### FR8 — Automated verification
- **Unit:** the update lifecycle state machine — discovery sources and cadence guards, waiting state, gate rules (mode, quiet timer, visibility), cancellation, resets, offline skip, no-op fallbacks — using fake timers and mocked registration.
- **E2E:** a two-build harness proves end-to-end: (a) with an update ready, a full race runs and finishes with no page reload; (b) the reload happens at the next quiet Build-mode moment; (c) the new build is live after the swap.

### FR9 — Compatibility & docs
The Build → Pick → Race → Celebrate loop, race engine, audio, visuals, and the `?race` / `?perf` / `?debug` flags are untouched. `tech-stack.md` is updated **before implementation** (registration-strategy change + new module boundary).

## Non-Functional Requirements
- **Boundaries:** new `src/pwa/update-controller.ts` (state machine + adapter) and wiring in `src/main.ts`; reuse `src/app-lifecycle.ts` visibility events; change `vite.config.ts` registration strategy. No edits to race/grid/render/audio modules.
- TDD per `conductor/workflow.md`; TS strict; Biome-clean; >80% coverage on changed modules; JSDoc on public APIs.
- No new runtime dependency (uses the already-installed vite-plugin-pwa register API); no new DOM/UI/sounds.
- Update checks stay cheap and off the critical path; no timers or fetches while hidden/offline.
- Tests never wait real seconds/minutes: all timing constants injectable; e2e uses a test cadence.
- The e2e update harness must be CI-stable within the existing Playwright configuration.

## Acceptance Criteria
1. With a ready update, no reload can occur during picker/countdown/race/pause/trophy — unit tests plus an e2e race that completes untouched.
2. In Build mode with 3 s of no input, the ready update applies (e2e; injected constants).
3. Input before the window closes resets the timer; leaving Build mode cancels (unit).
4. After the silent swap, board, shelf, lineup, mute, and quality all restore; no update-related UI appears during detection or swap (DOM assertion).
5. Discovery runs at launch/foreground/online and on the ~15-minute visible+online cadence; offline checks are skipped silently (unit).
6. A never-applied update activates on the next full launch (documented two-deploy manual check at the track's checkpoint).
7. `pnpm build`, `CI=true pnpm test` (≥80% coverage), `pnpm lint`, and the Playwright suite are green.
8. `tech-stack.md` updated; track archived; registry reflects it.

## Out of Scope
- Any update UI (prompts, badges, toasts, parent "check for updates") and any visible change whatsoever.
- Rollback automation, staging, live-site smoke, on-device checks (future Ship track).
- Workbox precache glob changes or hosting (nginx already sends `no-cache` for `sw.js`).
- Multi-window coordination beyond standard SW behavior; `periodicSync`/background sync/push.
- Applying updates anywhere other than Build mode, or while hidden.