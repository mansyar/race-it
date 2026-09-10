# Track: PWA Install Experience — Specification

## Overview
Race-It must be a first-class *installable* toy: a parent taps "Add to Home Screen" and the app launches from the icon with the right name, colors, orientation, and no white flash — on iOS Safari and Android Chrome alike. The icon and manifest pipeline already exists; this track closes the remaining gaps: iOS splash screens, manifest polish (`standalone`, `id`, `lang`, `categories`), Android rich-install screenshots, a wordless parent-facing install hint for iOS, and a CI gate that keeps installability from regressing.

## Functional Requirements

### FR1 — Manifest Polish (`vite.config.ts`)
- Change `display: 'fullscreen'` → `display: 'standalone'` (status bar visible; parents keep clock/battery).
- Add `id: '/'` (stable identity so A2HS installs don't fork), `lang: 'en'`, `categories: ['games', 'kids']`.
- Keep existing icons/theme colors (`#e63946` / `#f6f1e7`, palette-derived).
- Update `description` to warm, parent-facing tone per guidelines ("Build a toy race track together, then watch the karts race to the finish!").
- Keep `orientation: 'any'` (portrait & landscape both supported per product).

### FR2 — iOS Splash Screens (`apple-touch-startup-image`)
- Generate splash/link sets for the device floor: iPhone 11 → latest (including Dynamic Island/notch variants) and iPad 9th gen → latest, portrait + landscape.
- Background `#f6f1e7` with the app mark centered; implemented as `apple-touch-startup-image` media-query links in `index.html` (preprocessed at build time so the list stays maintainable).

### FR3 — Android Rich Install UI
- Add `screenshots` (portrait + wide) to the manifest so Chrome shows the rich install sheet with preview images.
- Screenshots generated at build time from existing scenes/assets (real in-app look, not placeholder rectangles); ≥ minimum Chrome requirements (portrait 320–3840px, `form_factor` + `platform: 'web'`).

### FR4 — Install Hint UI (iOS Safari)
- Icon-only pill at the top of the **build screen only** (never during race/countdown/trophy), using the iOS share-glyph; tap expands into a wordless step-by-step guide (Share icon → "Add to Home Screen"), X to dismiss.
- **Dismissal is persisted in `localStorage`** — once dismissed, never shown again (no re-show logic, no nagging).
- Only rendered when: `(display-mode: standalone)` / `navigator.standalone` is false AND the platform is iOS Safari AND not already installed. Zero UI on Android (Chrome handles its own prompt).
- Follows wordless UI principle; only allowed text: none (icon + arrows only). Touch targets ≥64px.

### FR5 — CI Installability Gate (`.github/workflows/ci.yml`)
- New CI job running Lighthouse PWA audit (`lhci`) against the production build via `vite preview`, asserting: installable (manifest + SW + icons ≥144px), no failing PWA category.
- Runs on every push/PR alongside existing jobs; reuses the pnpm cache setup.

## Non-Functional Requirements
- **Offline-first:** splash/manifest/screenshot assets precached by the service worker (extend workbox `globPatterns` if needed).
- **Bundle budget:** splash images are PNGs — keep total added weight ≤ ~1 MB; generate at device-relevant sizes only.
- **Wordless:** no new user-facing text except manifest `description`/name (store-level, not in-app).
- **Toddler-proof:** hint dismiss target large; hint never intercepts gameplay interactions; zero impact on race mode.

## Acceptance Criteria
1. Installed via A2HS on iOS Safari: correct icon, name, launches `standalone` (status bar visible), **no white flash** (splash shows toy-cream + mark).
2. Installed on Android Chrome: rich install sheet shows screenshots; launched app is `standalone`.
3. In a browser tab on iOS, the hint pill appears on the build screen, expands wordlessly, dismisses permanently, and never appears again.
4. No hint UI appears on Android or desktop, nor while racing/paused/celebrating.
5. Lighthouse CI gate passes on `main` and fails on a manifest-breaking change (verified once by a temporary local breakage, then reverted).
6. Manifest passes Chrome's installability validation (`id`, standalone, icons); `pnpm test`, Biome, `tsc --noEmit`, Playwright smoke all green; coverage ≥80% for new modules (hint UI + install-context detection).

## Out of Scope
- Android `beforeinstallprompt` custom install buttons (Chrome's native sheet is sufficient).
- Desktop install UX (Edge/Chrome "install" icon) beyond what the manifest already enables.
- Store listings / app store publishing.
- Service-worker update-toasts or custom update flows (autoUpdate already configured).
- Any new gameplay or visual changes outside the hint pill.
