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
| Lint/Format | **Biome** | 2.5.12 | Single fast tool for linting + formatting; config MUST be aligned with `conductor/code_styleguides/` (Google TS style): single quotes, explicit semicolons, named exports only (no default exports), `===`, no `any`, no `_`-prefixed identifiers. |

## Storage
- **Track shelf & settings:** `localStorage` (tracks are small JSON grids; mute toggle, last selection).
- **Offline asset cache:** Service Worker precache (via vite-plugin-pwa) — models, audio, icons cached on first load.

## Assets
- **Kenney Racing Kit** — track tiles, scenery (glTF/GLB, CC0).
- **Kenney Car Kit** — kart racers (glTF/GLB, CC0).
- **Kenney audio packs** — SFX + one music loop (CC0).
- GLB assets imported at build time; optimized (Draco/meshopt only if device-floor perf demands it).

## Runtime & Hosting
- **Runtime:** modern evergreen mobile browsers — iOS Safari 16+, Android Chrome 110+.
- **Hosting:** customer's own static server over **HTTPS** (required for service worker/PWA install). Plain static file serving of the Vite build output — no backend, no database.

## Explicitly Not Used (v1)
React/Vue/etc., game engines (Phaser/Pixi/Babylon), backend/server runtime, database, CSS framework.
