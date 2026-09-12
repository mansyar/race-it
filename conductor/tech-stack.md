# Race-It — Technology Stack

## Overview
Vanilla TypeScript + Three.js, no UI framework, no game engine. A lean static PWA bundle optimized for phone/iPad browsers. Managed with pnpm.

## Core Stack (all versions verified latest & mutually compatible as of 2026-09-08)

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Language | **TypeScript** | 7.0.2 | First stable native-compiler release. Vite transpiles independently via esbuild, so ecosystem compatibility is unaffected. ⚠️ If any friction arises, fall back to the mature 5.9.x line. |
| Package manager | **pnpm** | 12.3.4 (local: 11.24.0) | Strict, fast installs; local 11.x is compatible, upgrade to 12 optional. |
| Build tool | **Vite** | 8.2.2 | Dev server + static bundling. Requires Node ^20.19 or ≥22.12 (local Node 24.16.0 ✔). |
| 3D rendering | **Three.js** | 0.185.1 | WebGL renderer, GLTFLoader for Kenney models, raycasting for tile placement. No game engine — custom fixed-timestep game loop. |
| UI | **None (vanilla DOM)** | — | Icon buttons/HUD as DOM overlay over the canvas; keeps bundle tiny. |
| PWA | **vite-plugin-pwa** | 1.3.0 | Service worker (offline-first precache), web manifest. Registration is app-owned: prompt-style updates install silently and activate only at a quiet Build-mode moment (see PWA Update Lifecycle below) — never `autoUpdate`. Supports Vite ^8 ✔ (Workbox 7.4.x underneath). |
| PWA assets | **@vite-pwa/assets-generator** | 1.0.2 | Generates icons/splash assets for manifest. |
| Testing | **Vitest** | 5.0.0 | Unit tests for track validation, race logic, storage. Supports Vite ^8 ✔. |
| E2E testing | **Playwright** | exact pin at install | Chromium-only suite: smoke (boot + demo-loop race), shelf save/load/delete, a landscape picker regression (RACE reachable and starts the race in a 390px-tall viewport), WebGL context-loss recovery (`e2e/context-loss.spec.ts`, driving the `WEBGL_lose_context` extension), a headed Chrome installability gate (CDP) against the production build via `vite preview`, and a two-build deferred-update flow suite (race safety + quiet Build-mode gate, fixtures via `scripts/build-update-fixtures.mjs`); browsers cached in CI. |
| Test typings | **@types/node** | 24.13.3 | Dev-only Node API typings (fs/path/url imports) for tests that read project files, e.g. the splash-screen contract test. Module-scoped imports only — `tsconfig` adds `"node"` to `types`, so Node imports type-check while app code gains no Node globals. |
| Lint/Format | **Biome** | 2.5.12 | Single fast tool for linting + formatting; config MUST be aligned with `conductor/code_styleguides/` (Google TS style): single quotes, explicit semicolons, named exports only (no default exports), `===`, no `any`, no `_`-prefixed identifiers. |

## Storage
- **Track shelf & settings:** `localStorage` (tracks are small JSON grids; mute toggle, last selection).
- **Offline asset cache:** Service Worker precache (via vite-plugin-pwa) — models, audio, icons cached on first load.

## Assets
- **Kenney Racing Kit** — track tiles, scenery (glTF/GLB, CC0).
- **Kenney Car Kit** — kart racers (glTF/GLB, CC0).
- **Kenney audio packs (CC0)** — Interface Sounds (UI clicks, confirmations, countdown tick, GO tone, place/remove/nope), Music Jingles (victory jingle), Music Loops ("Polka Train" background loop); OGGs imported at build time, license files kept alongside.
- **CC0 crowd cheer (first non-Kenney asset, v0.5.0)** — a trimmed crowd-cheer one-shot for photo finishes; verified-CC0 source (candidate: Freesound #365132 "Crowd Cheering" by SoundsExciting), stored under `src/assets/sfx/` with a `LICENSE-<source>-<pack>.txt` file alongside, imported at build time so the service worker precaches it unchanged.
- GLB assets imported at build time; optimized (Draco/meshopt only if device-floor perf demands it).

## Audio
- **`src/audio/audio-director.ts`** — single audio hub on WebAudio: shared master gain (0.9), one-shots (0.8), music loop (0.35), engine hum (0.15); mute persisted at `race-it:muted` and silences the master graph.
- **Procedural engine hum** — oscillator blend (80/160 Hz sawtooth) through a 400 Hz low-pass on the graph; 400 ms linear fades; audible only while the race runs.
- **Lifecycle** — music starts at the countdown and continues through RACE AGAIN; hum at GO; victory jingle ducks music ~40% then swells back; pause suspends, resume restores, quit stops for good; `pagehide` silences and `visibilitychange` restores; iOS unlock via `resume()` on the first pointerdown gesture.
- **Photo-finish seams (additive, v0.5.0)** — the director exposes additive methods used only during close finishes: music playback-rate ease (~0.85) with smooth restore, engine-hum gain dip (~40%) and swell-back, and a crowd-cheer one-shot that honors mute and suspend/resume like existing SFX.
- **Warm audio pool & readiness (added 2026-09-12)** — every bundled one-shot is pre-created when warming starts at boot as a small reusable element pool per SFX (`SFX_POOL_SIZE = 2`, `preload = 'auto'`) plus one pre-created music element reused across races (reset to the top per race; paused — not discarded — by `stopMusic`). The director exposes `warm()` (single-flight; loads every element, resolves only when all are ready, rejects so the readiness tracker can retry) and `warmSnapshot()` (per-sound `idle → warming → ready | failed` + attempt counts). Playback serves from the pool — round-robin, guarded `currentTime = 0`, `play()` rejections swallowed — so once warmed, no element is constructed during play (pre-warm playback falls back to a cold element). Warming joins `src/asset-readiness.ts` as a non-critical `audio` group: silent infinite retry, never gates GO; `?debug` exposes `__raceItAudio()`.

## Race Presentation
- **Photo-finish drama (additive, v0.5.0)** — a pure tracker (`src/presentation/photo-finish.ts`) estimates the leader→rival arrival gap on the final approach and drives a presentation-level time scale (1.0 → 0.35, eased) plus one-shot accents on the confirmed flag: a DOM flash overlay (`src/ui/flash-overlay.ts`, outside the 3D scene, `pointer-events: none`) and a bounded camera push (`src/render/race-camera.ts`). Scaled dt drives the existing simulation and race visuals together; engine API, fairness, and draw calls unchanged.

## Rendering & Performance (added 2026-09-11)
- **Adaptive quality tiers** — `src/render/quality-controller.ts`: rolling-FPS sampler (≈2 s window below 55 fps steps a tier down; ≈10 s above 58 fps steps back up) across `high → mid → low`, with hysteresis to avoid oscillation. The tier persists to `race-it:quality`; a `?tier=` URL parameter forces a tier for deterministic tests (and disables sampling).
- **Tier levers** — every tier caps the renderer pixel ratio (2 / 1.5 / 1); the `low` tier additionally batches road tiles per piece type through `InstancedMesh` (`src/render/piece-renderer.ts` — `setRenderMode('individual' | 'instanced')`, visuals and toy feedback identical via `syncInstances`). Applied once per frame from the single `view.onFrame` loop in `src/main.ts`.
- **Measured (headless, full 144-piece board):** high/mid 652 draw calls; low 232 draw calls (64% fewer); 21,986 triangles constant across tiers.

## Context-Loss Resilience (added 2026-09-12)
- **Guard module** — `src/render/context-loss.ts`: an observable state machine (`stable → lost → restoring → stable`, with a `failed` terminal for the reload path) fed by injected listeners (`webglcontextlost` / `webglcontextrestored`), clock, and sessionStorage; `GRACE_MS ≈ 3 s` centralized and injectable. Three.js 0.185 already `preventDefault()`s the loss and re-initializes GL on restore — this module adds the app-level signal, hold semantics, and fallback policy above it. No new dependencies; three.js internals untouched.
- **Hold & re-sync wiring (`src/main.ts`)** — on loss: in-flight races held via `presentation.holdForInterruption()`, audio suspended (`audio.suspendAll()`), canvas taps gated while the scene is invisible; on restore: `view.resize()`, picker previews re-rendered, audio resumed under the existing visibility/hold gates. Wordless; no new UI. GO and race-start taps are gated while the context is not stable; `?debug` exposes `window.__raceItContext` (state, draw calls, reload counter).
- **Silent reload fallback** — if no restore arrives within the grace while visible, exactly one silent `location.reload()` with a sessionStorage attempt cap (≤2 per session, reset on stable). The working board always autosaves (including invalid in-progress builds) so any recovery returns exactly what the child built. Covered by unit tests for the state machine plus `e2e/context-loss.spec.ts` (race hold, build-mode wordless hold, silent fallback with invalid board, reload cap).

## PWA Update Lifecycle (added 2026-09-12)
- **Registration strategy** — `vite.config.ts` uses `registerType: 'prompt'` with `injectRegister: null`; the app registers the service worker itself (raw `navigator.serviceWorker.register('/sw.js')` in `src/main.ts`) and owns all update decisions. Never `autoUpdate` — a deploy must not reload a running session.
- **Deferred activation** — `src/pwa/update-controller.ts` (state machine with injectable clock/timers) checks at launch, on foreground, on reconnect, and every ~15 min while visible+online. A discovered update stays waiting and is applied only in Build mode after ≥3 s without pointer input while visible. Amendment 2026-09-12: applying posts SKIP_WAITING directly to the waiting worker (the generated `sw.js` already listens for it) and reloads once the new worker activates — the vite-plugin-pwa virtual register module was dropped because its dynamic `workbox-window` import cannot resolve under pnpm without adding a runtime dependency. Newer waiting versions replace older ones; a never-applied update activates on the next launch via the standard SW lifecycle.
- **Quiet-window input tracking** — `src/pwa/input-activity.ts` (passive pointer listeners) reports whether input has been idle.
- No new runtime dependency; workbox precache globs and hosting are unchanged.

## Boot & Loading (added 2026-09-12)
- **Asset readiness tracker** — `src/asset-readiness.ts`: named asset groups load independently and retry gently in the background (exponential backoff 500 ms → 10 s cap, retried indefinitely; a wordless *retry cue* appears after 3 consecutive failures or 8 s without a success). `pieces` and `karts` are race-critical groups; `scenery` is decorative and never blocks the race.
- **Staged table reveal** — the table appears immediately; track pieces pop in first, then scenery and karts join as they arrive (existing toy-feedback pop-in; no blocking spinner, no dead screen).
- **GO readiness gate** — `src/ui/go-button.ts` starts *sleeping* (dim, breathing) and only wakes once every race-critical group is ready; if loads stall, GO shows a retry pulse and a tap forces an immediate attempt. Blocked-track validity gating is unchanged.
- **Debug** — `?debug` additionally exposes `__raceItBoot()` (readiness snapshot) alongside the existing hooks.

## Runtime & Hosting
- **Runtime:** modern evergreen mobile browsers — iOS Safari 16+, Android Chrome 110+.
- **Hosting:** containerized static PWA served by **nginx:alpine** over **HTTPS** on the customer's **Coolify** instance (required for service worker/PWA install). No backend, no database.

## Toolchain Pins
- **Node** `24.16.0` — pinned via `.nvmrc` (matches local dev version).
- **pnpm** `12.3.4` — pinned via `packageManager` field in `package.json`.
- CI installs the exact pinned toolchain on every run (reproducible builds).

## CI/CD & Deployment
- **CI:** GitHub Actions on `mansyar/race-it` (public, default branch `master`) — `ci.yml` runs on every push/PR: Biome lint+format, Vitest unit + coverage gate ≥80%, `tsc --noEmit && vite build` (dist artifact reused), Playwright E2E (smoke + shelf + boot + context-loss + installability gate + two-build update flow). pnpm store + Playwright browser caches; superseded runs cancelled.
- **Release:** `release.yml` on `v*` semver tags — multi-stage Docker build (node:24-alpine → nginx:alpine) → push **GHCR** `ghcr.io/mansyar/race-it` (`:vX.Y.Z` + `:latest`, public) → publish GitHub Release with auto-generated notes grouped by conventional-commit type → trigger Coolify deploy via authenticated webhook (`Authorization: Bearer` token).
- **Secrets (repo):** `COOLIFY_DEPLOY_WEBHOOK`, `COOLIFY_API_TOKEN` (Bearer).

## Explicitly Not Used (v1)
React/Vue/etc., game engines (Phaser/Pixi/Babylon), backend/server runtime, database, CSS framework.
