# Implementation Plan — WebGL Context-Loss Recovery

**Track ID:** `contextrecovery_20260912` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test` (E2E)

**Coordination note:** `src/main.ts` is concurrently touched by the completed-but-unmerged `feature/boot-readiness` branch and the in-progress `feature/pwa-update-flow` branch — keep edits additive and localized so the eventual integration merges stay clean.

## Phase 1 — Tech-Stack Addendum (doc-only) [checkpoint: f9745ac]
- [x] Task 1.1: document the context-loss recovery design in `tech-stack.md` — new `src/render/context-loss.ts` module boundary (state machine + adapters), hold/re-sync wiring in `main.ts`, silent-reload fallback policy with attempt cap, always-autosave board change; commit before implementation per workflow. (f9745ac)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — doc review.

## Phase 2 — Context-Loss Guard Core (pure) [checkpoint: 2da1fe5]
- [x] Task 2.1: guard tests first (Red) — `src/render/context-loss.test.ts` (fake timers, injected event target / clock / storage): loss → lost callback + grace timer; restore within grace → restored callback, timer cleared, no failure; grace expiry while visible → a single failed callback; loss while hidden defers grace/report to first visible; failed fires at most once; reload attempts capped (≤2) with the counter read/written via injected storage and reset on stable; `dispose()` detaches listeners and clears timers; loss handler calls `preventDefault()` defensively. (8501916)
- [x] Task 2.2: implement `src/render/context-loss.ts` (Green) — observable state machine, `GRACE_MS ≈ 3 s` centralized and injectable, JSDoc public API, no globals. (2da1fe5)
- [x] Task: Phase Verification & Checkpoint — table-walk the transition matrix with the user.

## Phase 3 — App Wiring & Context E2E [checkpoint: ]
- [ ] Task 3.1: e2e first (Red) — `e2e/context-loss.spec.ts` (standard preview config; drives the `WEBGL_lose_context` extension via `page.evaluate`):
  1. **Race hold:** start a race, `loseContext()` → resume overlay appears and the race cannot progress; `restoreContext()` + resume tap → race continues to completion.
  2. **Build intact:** `loseContext()` in build mode → board edits ignored while lost; `restoreContext()` → scene renders again (draw-call probe via the `?debug` seam), board intact.
  3. **Silent fallback:** `loseContext()` with no restore → one silent reload within grace; a half-built invalid board survives (always-autosave).
  4. **No loop:** consecutive immediate losses never exceed the reload attempt cap.
- [ ] Task 3.2: wire in `src/main.ts` (Green) — create the guard on `view.renderer.domElement`; on lost: suspend audio + `presentation.holdForInterruption()` when racing, gate `handleCellTap`; on restored: `view.resize()` + re-render picker previews + audio resume gates; on failed: one reload (guard-owned attempt counter); drop the valid-only gate so `rerender()` always autosaves; `?debug` exposes `window.__raceItContext` (state + counters + last-frame draw calls).
- [ ] Task 3.3: stabilize + regression pass — run the new spec repeatedly under the CI single-worker config; confirm `?race` / `?perf` / `?debug` and all existing specs (smoke, lifecycle, postrace, shelf, landscape, perf, installability) stay green.
- [ ] Task: Phase Verification & Checkpoint — manual scenario with the user.

## Phase 4 — Quality Gates, Manual Verification & Docs [checkpoint: ]
- [ ] Task 4.1: quality gates — `pnpm build`; `$env:CI='true'; pnpm test -- --coverage` (>80% on `src/render/context-loss.ts`); `pnpm lint`; full Playwright suite including `context-loss.spec.ts`; record numbers.
- [ ] Task 4.2: manual verification — iOS Safari + installed PWA: background under memory pressure → foreground (hold/resume or fallback reload); airplane-mode boot; repeated loss cycles (no reload loop); picker previews after a loss; portrait + landscape.
- [ ] Task 4.3: final docs — `tech-stack.md` synced against final code; completion checklist per workflow.
- [ ] Task: Phase Verification & Checkpoint.