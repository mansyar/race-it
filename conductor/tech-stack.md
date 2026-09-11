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
| PWA | **vite-plugin-pwa** | 1.3.0 | Service worker (offline-first precache), web manifest, auto-update. Supports Vite ^8 ✔ (Workbox 7.4.x underneath). |
| PWA assets | **@vite-pwa/assets-generator** | 1.0.2 | Generates icons/splash assets for manifest. |
| Testing | **Vitest** | 5.0.0 | Unit tests for track validation, race logic, storage. Supports Vite ^8 ✔. |
| E2E testing | **Playwright** | exact pin at install | Chromium-only suite: smoke (boot + demo-loop race), shelf save/load/delete, a landscape picker regression (RACE reachable and starts the race in a 390px-tall viewport), and a headed Chrome installability gate (CDP) against the production build via `vite preview`; browsers cached in CI. |
| Test typings | **@types/node** | 24.13.3 | Dev-only Node API typings (fs/path/url imports) for tests that read project files, e.g. the splash-screen contract test. Module-scoped imports only — `tsconfig` adds `"node"` to `types`, so Node imports type-check while app code gains no Node globals. |
| Lint/Format | **Biome** | 2.5.12 | Single fast tool for linting + formatting; config MUST be aligned with `conductor/code_styleguides/` (Google TS style): single quotes, explicit semicolons, named exports only (no default exports), `===`, no `any`, no `_`-prefixed identifiers. |

## Storage
- **Track shelf & settings:** `localStorage` (tracks are small JSON grids; mute toggle, last selection).
- **Offline asset cache:** Service Worker precache (via vite-plugin-pwa) — models, audio, icons cached on first load.

## Assets
- **Kenney Racing Kit** — track tiles, scenery (glTF/GLB, CC0).
- **Kenney Car Kit** — kart racers (glTF/GLB, CC0).
- **Kenney audio packs (CC0)** — Interface Sounds (UI clicks, confirmations, countdown tick, GO tone, place/remove/nope), Music Jingles (victory jingle), Music Loops ("Polka Train" background loop); OGGs imported at build time, license files kept alongside.
- GLB assets imported at build time; optimized (Draco/meshopt only if device-floor perf demands it).

## Audio
- **`src/audio/audio-director.ts`** — single audio hub on WebAudio: shared master gain (0.9), one-shots (0.8), music loop (0.35), engine hum (0.15); mute persisted at `race-it:muted` and silences the master graph.
- **Procedural engine hum** — oscillator blend (80/160 Hz sawtooth) through a 400 Hz low-pass on the graph; 400 ms linear fades; audible only while the race runs.
- **Lifecycle** — music starts at the countdown and continues through RACE AGAIN; hum at GO; victory jingle ducks music ~40% then swells back; pause suspends, resume restores, quit stops for good; `pagehide` silences and `visibilitychange` restores; iOS unlock via `resume()` on the first pointerdown gesture.

## Rendering & Performance (added 2026-09-11)
- **Adaptive quality tiers** — `src/render/quality-controller.ts`: rolling-FPS sampler (≈2 s window below 55 fps steps a tier down; ≈10 s above 58 fps steps back up) across `high → mid → low`, with hysteresis to avoid oscillation. The tier persists to `race-it:quality`; a `?tier=` URL parameter forces a tier for deterministic tests (and disables sampling).
- **Tier levers** — every tier caps the renderer pixel ratio (2 / 1.5 / 1); the `low` tier additionally batches road tiles per piece type through `InstancedMesh` (`src/render/piece-renderer.ts` — `setRenderMode('individual' | 'instanced')`, visuals and toy feedback identical via `syncInstances`). Applied once per frame from the single `view.onFrame` loop in `src/main.ts`.
- **Measured (headless, full 144-piece board):** high/mid 652 draw calls; low 232 draw calls (64% fewer); 21,986 triangles constant across tiers.

## Runtime & Hosting
- **Runtime:** modern evergreen mobile browsers — iOS Safari 16+, Android Chrome 110+.
- **Hosting:** containerized static PWA served by **nginx:alpine** over **HTTPS** on the customer's **Coolify** instance (required for service worker/PWA install). No backend, no database.

## Toolchain Pins
- **Node** `24.16.0` — pinned via `.nvmrc` (matches local dev version).
- **pnpm** `12.3.4` — pinned via `packageManager` field in `package.json`.
- CI installs the exact pinned toolchain on every run (reproducible builds).

## CI/CD & Deployment
- **CI:** GitHub Actions on `mansyar/race-it` (public, default branch `master`) — `ci.yml` runs on every push/PR: Biome lint+format, Vitest unit + coverage gate ≥80%, `tsc --noEmit && vite build` (dist artifact reused), Playwright E2E (smoke + shelf + installability gate). pnpm store + Playwright browser caches; superseded runs cancelled.
- **Release:** `release.yml` on `v*` semver tags — multi-stage Docker build (node:24-alpine → nginx:alpine) → push **GHCR** `ghcr.io/mansyar/race-it` (`:vX.Y.Z` + `:latest`, public) → publish GitHub Release with auto-generated notes grouped by conventional-commit type → trigger Coolify deploy via authenticated webhook (`Authorization: Bearer` token).
- **Secrets (repo):** `COOLIFY_DEPLOY_WEBHOOK`, `COOLIFY_API_TOKEN` (Bearer).

## Explicitly Not Used (v1)
React/Vue/etc., game engines (Phaser/Pixi/Babylon), backend/server runtime, database, CSS framework.
