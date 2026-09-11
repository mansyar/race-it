# Adaptive Performance Guardrails — Specification

**Track ID:** `perfguardrails_20260911` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

The product guidelines promise a 60fps target on the device floor (iPhone 11+, iPad 9th gen+, mid-range Android) with *"graceful degradation acceptable below"*, and document a specific fallback: *"batch tile types into InstancedMesh"* if on-device fps < 60 (`conductor/product-guidelines.md`). Today no adaptive path exists: `scene.ts` fixes the pixel ratio at `min(devicePixelRatio, 2)` and always renders per-piece meshes; `?perf` only reports stats. A slow device has no recovery lever — it simply drops frames.

This track adds a runtime quality controller: it samples frame timing from the existing single rAF loop, steps quality down when FPS persistently misses the target, and steps back up when sustained headroom returns. Levers, in order: a DPR cap step-down, a second DPR step-down, and an InstancedMesh render path for road tiles that collapses the worst-case draw-call load (full 12×12 board ≈ 542 draw calls) while preserving identical visuals and toy feedback. The effective tier persists on device and can be forced via URL for deterministic verification.

**Decision note — tier ladder:** the planning discussion mentioned "shadow/AA reduction". Neither knob exists in this scene: lighting uses no shadow maps (the contact shadow is a texture quad) and `antialias` is fixed at `WebGLRenderer` construction (changing it would require recreating the renderer — explicitly out of scope). The implemented ladder is therefore **DPR cap steps + instanced tiles**.

## Functional Requirements

### FR-1 — Quality controller (`src/render/quality-controller.ts`, new)
- Pure, testable controller fed one frame delta per rAF tick (no own timing loop).
- Rolling-window sampling: degrade when the rolling ~2s average falls below ~55fps; recover when a ~10s sustained average exceeds ~58fps (hysteresis prevents flapping).
- Tier ladder (initial values, tunable in plan): `high` → `mid` → `low` down, reverse up; one step per window decision; clamped at both ends.
- Current tier observable for tests/wiring; persisted under new localStorage key `race-it:quality`; corrupt/missing storage falls back to `high` (never throws).
- `?tier=low|mid|high` forces a tier for the session and bypasses sampling; forced tiers are NOT written over the stored value. `?perf` behavior is unchanged and combinable (`?perf&tier=low`) for worst-case deterministic checks.

### FR-2 — Scene DPR lever (`src/render/scene.ts`)
- Expose a scene-level way to apply the pixel-ratio cap: `high = min(dpr, 2)` (today's value), `mid = min(dpr, 1.5)`, `low = min(dpr, 1)` — applied via `setPixelRatio` + `setSize` so the buffer resizes immediately.
- Window/container resizes keep honoring the active cap.
- No other visual change at any tier (lighting, materials, camera unchanged).

### FR-3 — Instanced tile path (`src/render/piece-renderer.ts` + feedback)
- At the `low` tier only, road tiles render through InstancedMesh batching per piece type instead of per-piece object graphs; visuals (bright tint, checker overlay, finish flag, curve orientation) stay identical.
- Toy micro-feedback survives batching: place pop-in and remove-mode wiggle/red tint still animate the affected tiles; full-board and ±piece rebuilds stay correct in both modes.
- Mid-session tier switches rebuild cleanly (no leaked meshes; old buffers disposed).
- The high/mid path renders exactly as today.

### FR-4 — Wiring (`src/main.ts`)
- Controller created at boot with persisted/forced tier; its decisions drive the scene cap and the piece renderer mode.
- Fed from the existing `view.onFrame` hook — one tick per frame (feedback → race presentation → quality tick → render).
- `?perf`, `?race`, `?debug`, shelf load, clear-table, and race flows stay regression-free; race shares the same DPR cap via the shared renderer without altering race behavior.

## Non-Functional Requirements
- **TDD per `conductor/workflow.md`;** TS strict; Biome-clean; >80% coverage on changed modules; public APIs JSDoc'd.
- **No new dependencies;** no settings UI (wordless product).
- **Overhead:** sampling O(1) per frame; instanced mode materially reduces worst-case draw calls at no measurable per-frame CPU cost.
- **Compatibility:** iOS Safari 16+ / Android Chrome 110+; portrait & landscape; lifecycle behavior unchanged.
- **Verification:** unit tests for controller/levers + E2E gates; worst-case perf measured through the existing `?perf` harness. Physical device-floor verification stays manual.

## Acceptance Criteria
1. Controller unit tests: synthetic dip stream steps down without more than one step per window; sustained headroom steps back up; borderline flicker does not flap.
2. Persistence: tier survives reload; `?tier=low` forces low while the stored value is untouched; invalid stored values fall back to high.
3. DPR: effective canvas buffer ratio matches each tier's cap and returns to default; resize after a tier change keeps the cap applied.
4. Low tier uses InstancedMesh with identical visuals; place-pop, remove-mode wiggle/tint and rebuild contract tests pass; high/mid mode unchanged.
5. Draw-call reduction measured via `?perf` (full board): low tier materially below the ~542 baseline, recorded in the track notes.
6. No gameplay/race regressions: smoke + shelf + postrace E2E green; `pnpm build`, `CI=true pnpm test`, `pnpm lint` green.
7. No oscillation between adjacent tiers over a long synthetic session.

## Out of Scope
- Shadow maps / antialias toggling / renderer recreation; new lighting or art changes.
- Instancing karts, scenery, confetti, or the table.
- User-facing quality settings UI; telemetry; backend work.
- Race engine, physics, audio, track-building interaction changes; storage schema changes other than the new `race-it:quality` key.
- CI-based physical-device perf gating (manual only).
