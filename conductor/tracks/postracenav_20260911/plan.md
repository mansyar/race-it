# Implementation Plan — Post-Race Navigation

**Track ID:** `postracenav_20260911` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build`

## Phase 1 — Trophy Build Again Affordance [checkpoint: 14ad574]

- [x] Task 1.1: trophy contract tests first (Red) — extend `src/ui/trophy.test.ts`: `.build-again-button` (`data-action="build-again"`) renders below `.again-button` inside the trophy card; inline SVG icon present; non-empty `aria-label`; no visible `textContent`; button and card share one hidden lifecycle (`show`/`hide`); click fires `onBuildAgain` exactly once with no confirm overlay; existing RACE AGAIN assertions untouched. (3a9cfe2)
- [x] Task 1.2: implement the affordance (Green) — `src/ui/trophy.ts`: add `onBuildAgain` to the `Trophy` interface and a subordinate icon button beneath RACE AGAIN; wordless (icon + aria-label only). (3a9cfe2)
- [x] Task 1.3: styles with contract test first (Red) — style test asserts `.build-again-button` has a ≥64px min touch target, sits below `.again-button`, and hides with `.trophy.hidden`; implement in `src/style.css` (Green) with portrait/landscape + safe-area consistency. (a40c607)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: trophy shows both actions; Build Again visibly subordinate; tap target comfortable.

## Phase 2 — Return-to-Builder Wiring

- [x] Task 2.1: presentation tests first (Red) — `src/presentation/race-presentation.test.ts`: callback rewiring preserves `onBuildAgain`; invoking it → engine `abandon()` (idle), audio `stopAll()`, HUD hidden, confetti cleared, trophy hidden, `onBuildUiChange(true)`, camera target eases back to build placement (smoothed, no snap). (db0a3c5)
- [x] Task 2.2: implement the reset path (Green) — `race-presentation.ts`: route Build Again through the existing `resetToBuild()` / idle reset visuals, preserving the main-provided callback; `src/race/*` untouched. (db0a3c5)
- [x] Task 2.3: main wiring tests first (Red) — cover the handler contract (click SFX + reset invocation + build-UI restoration, no double-fire on repeated taps) to the extent `main.ts` is testable; implement in `src/main.ts` (Green); verify GO → picker → RACE still functions after return. (db0a3c5 — deviation: `main.ts` needed no change; the Phase 1 callback is already the final prior handler and the engine reset is owned by the presentation layer, matching the RACE AGAIN wrapper precedent)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser: finish → Build Again → builder with track intact and GO valid.

## Phase 3 — E2E & Quality Gates

- [ ] Task 3.1: E2E coverage first (Red) — new `e2e/postrace.spec.ts`: the seeded demo race plays to the trophy (Playwright timer virtualization or extended timeout), Build Again returns to the builder with the build bar visible and GO enabled, track intact; confirm the assertion fails without the wiring.
- [ ] Task 3.2: quality gates — `pnpm build`, `$env:CI='true'; pnpm test`, coverage >80% on changed modules, `pnpm lint` clean.
- [ ] Task 3.3: browser full-flow verification — portrait + landscape phone viewports: trophy → Build Again → GO → picker → RACE; RACE AGAIN replays with fresh speeds; pause/quit and shelf flows regression-free; `?perf`, `?race`, `?debug` hooks unchanged; screenshots captured.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
