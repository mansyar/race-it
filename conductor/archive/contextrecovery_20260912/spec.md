# Spec: WebGL Context-Loss Recovery

**Track ID:** `contextrecovery_20260912` · **Type:** Feature

## Background

The diorama renders through a long-lived `THREE.WebGLRenderer` (`src/render/scene.ts`) plus a second context for the car-picker previews (`src/render/kart-preview.ts`). On the device floor — iPhone 11+, iPad 9th gen+, mid-range Android — and especially in an installed PWA that stays open for long play sessions, iOS reclaims WebGL contexts under memory pressure: the canvas goes dead until the page is relaunched.

Three.js 0.185 already calls `preventDefault()` on `webglcontextlost` and re-initializes GL state on `webglcontextrestored` (and early-returns `render()` while lost), so the renderer itself survives when the browser does restore. What is missing is everything above it:

- **No app-level signal** — while the context is lost, a race keeps ticking and audio keeps humming invisibly behind a frozen canvas; a photo-finish can be decided while nothing is visible.
- **No fallback** — when iOS never fires `webglcontextrestored` (common), the app is dead until the child relaunches it.
- **No re-sync** — on restore, nothing re-applies viewport/quality, re-renders picker previews, or resumes audio.
- **No test seam** — the condition cannot be simulated in CI.

This track makes context loss a first-class, wordless interruption: the toy holds; recovery is silent and in place when the browser can restore; and a single controlled reload returns the child to exactly their track when it cannot. Silence is the feature.

## Functional Requirements

### FR1 — Context-loss detection (pure core)
New `src/render/context-loss.ts`: an observable state machine (`stable → lost → restoring → stable`, with a `failed` terminal for the reload path), fed by injected listeners/clock/storage. It listens for `webglcontextlost` / `webglcontextrestored` on an injected target; the loss handler calls `preventDefault()` defensively (idempotent with three's own) and must never throw. The grace constant (`GRACE_MS`, ~3 s) and all timing are injectable; no globals; JSDoc public API.

### FR2 — Hold semantics on loss
While the context is lost: any in-flight race (countdown or running) is held via the existing `presentation.holdForInterruption()` — the sim must not silently tick — and audio suspends (`audio.suspendAll()`), matching the hide/show interruption contract. The existing resume/quit overlay (DOM, renders with WebGL dead) is the only visible change. Build/picker/trophy states are static: no overlay, no new UI. Pointer-driven board edits are ignored while lost (the scene is invisible; prevents blind edits).

### FR3 — Restore semantics
On `webglcontextrestored`: re-sync `view.resize()` (size, camera, pixel-ratio cap), re-render picker previews, and resume audio only when visible and not holding (the existing lifecycle gates). A held race stays held until the child taps resume — identical to returning from another app. No flash, toast, sound, or reload announces recovery.

### FR4 — Never-restores fallback (silent reload)
If no restore arrives within `GRACE_MS` while the document is visible — or at the first visibility after a loss that occurred hidden — exactly one silent `location.reload()` occurs. A reload-attempt counter (sessionStorage, injected for tests) caps fallback reloads: at most two per session, reset on stable. Before reloading, the working board is persisted (FR5) so the fallback returns the child to exactly their track.

### FR5 — Always-autosave the working board
The working board is persisted on every edit (place, remove, rotate, shelf-load), **including invalid in-progress builds** — today `saveTrack` runs only when the track validates, so the reload fallback would silently drop a half-built track. Defensive read semantics (corrupt → demo loop) are unchanged; shelf behavior is unchanged.

### FR6 — Coverage & boundaries
Both contexts are covered (main scene + picker previews). `?race` / `?perf` / `?debug` keep working; `?debug` exposes `window.__raceItContext` (state + counters + last-frame draw calls). No new assets, dependencies, DOM, sounds, or text. Steady-state 60fps/perf behavior is unchanged (passive listeners only).

### FR7 — Automated verification
- **Unit:** the state machine — loss → lost callback + grace timer; restore within grace → restored callback, timer cleared, no failure; grace expiry while visible → a single failed callback; loss while hidden defers grace/report to first visible; failed fires at most once; the reload attempt cap; `dispose()` detaches listeners and clears timers — with fake timers and injected targets.
- **E2E:** drive real loss/restore with the `WEBGL_lose_context` extension: loss during a running race holds it (no progress) and resumes to completion; loss in build mode leaves the board intact and re-renders after restore; a suppressed restore produces exactly one silent reload with a half-built invalid board surviving; consecutive losses never exceed the reload cap; all existing specs stay green.

## Non-Functional Requirements
- TDD per `conductor/workflow.md`; TS strict; Biome-clean; >80% coverage on `src/render/context-loss.ts` and other changed reachable modules; JSDoc on public APIs.
- No new runtime dependency. Boundaries: the guard/lifecycle lives in the new pure module; wiring is additive and localized (`src/main.ts`, plus minimal touch points); `race/grid/audio/presentation` internals are untouched except reusing existing hold/suspend APIs.
- All timing injectable; tests never wait on real seconds; the e2e must stay CI-stable.
- No reload loops; no timers while idle; wordless; ≥64px touch targets unchanged.
- **Coordination:** `src/main.ts` is concurrently touched by the completed-but-unmerged `feature/boot-readiness` branch and the in-progress `feature/pwa-update-flow` branch — edits stay additive and localized so merges remain clean.

## Acceptance Criteria
1. Context loss during a race shows the existing resume overlay; the race cannot progress while held; after restore + resume it finishes normally (e2e).
2. Context loss in build mode leaves the board editable and intact; after restore the scene renders again without a reload (e2e).
3. If restore never fires, exactly one silent reload occurs within a bounded grace — no error, dialog, or sound — and an invalid half-built board is still there afterwards (e2e + unit).
4. No reload loop: consecutive losses after a fallback never exceed the attempt cap (unit + e2e).
5. Unit suite covers machine transitions and timers; coverage >80% on the new module; all quality gates green.
6. `?race` / `?perf` / `?debug` and the existing Playwright suite are unchanged and green; `tech-stack.md` documents the design before implementation.

## Out of Scope
- Manual renderer/GL re-creation or own GPU-resource rebuild (three.js owns restore).
- WebGPU / renderer replacement; desktop GPU driver-reset specifics beyond the generic handling.
- Any UI, prompt, toast, sound, or parent-facing hint for recovery.
- Restoring a mid-race timeline through the reload fallback (the race returns to Build with the board intact; races are ~30–45 s and transient).
- Service-worker update interplay (separate track); analytics/telemetry; memory-pressure prevention.

## Recon Notes (evidence)
- `src/render/scene.ts:66` — `new THREE.WebGLRenderer({ antialias: true })`; rAF loop `:212–221`; no context listeners; `dispose()` `:235`.
- `three@0.185.1` `WebGLRenderer`: `onContextLost` preventDefaults + sets `_isContextLost` (~module line 17099); `onContextRestore` → `initGLContext()` (~17117); `render()` early-returns while lost (~17612).
- `src/render/kart-preview.ts:81` — second `WebGLRenderer` for picker quadrants; `render()` on demand.
- `src/main.ts` — `saveTrack(model)` only inside the valid branch; `renderKartPreviews()` seam; `view.onFrame` loop.
- `src/presentation/race-presentation.ts:125–130` — `holdForInterruption()` / `isHolding()`; audio `suspendAll()` used by `app-lifecycle` on hide.