# Implementation Plan — Photo-Finish Drama

**Track ID:** `photofinish_20260911` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test` (E2E)

**Coordination note:** `src/main.ts` and `src/presentation/race-presentation.ts` are also touched by the completed-but-unmerged `feature/perf-guardrails` branch — keep edits additive and localized so the eventual integration merge stays clean.

## Phase 1 — Photo-Finish Detection & Choreography Math (pure) [checkpoint: 50731a6]

- [x] Task 1.1: tech-stack addendum (doc-only) — document in `tech-stack.md`: first non-Kenney CC0 audio asset (crowd cheer, license-file convention) and the additive audio/presentation seams; commit before implementation per workflow. (b245c80)
- [x] Task 1.2: detection & ramp tests first (Red) (e2f3f30) — new `src/presentation/photo-finish.test.ts`: gap estimation from progress/pace (synthetic karts; slot-independent); arming rules (final-approach window + gap ≤ threshold; no arm on runaways); armed-hold through crossing; ramp shape (1.0 → 0.35 ease-in ~0.3–0.4 s, hold, ease-back, clamped); accent flags exactly once on flag confirm; reset clears state. Engine-backed sweep (fixed seeds, coarse dt): every race with `photoFinish === true` armed pre-crossing; false-arm rate measured and bounded.
- [x] Task 1.3: implement `src/presentation/photo-finish.ts` (Green) (50731a6) — pure tracker exposing time scale + accent flags; centralized tunables (`PREDICTION_WINDOW`, `PREDICTION_MARGIN_SECONDS`, `SLOWMO_FLOOR`, ease durations); tune against the sweep; record measured numbers (sweep: 100% of true photo finishes armed pre-crossing; false arms 11% @ margin 0.35).
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — review sweep numbers with the user.

## Phase 2 — Time Dilation & Camera Push (presentation)

- [x] Task 2.1: dilation integration tests first (Red) (b2a7f9a) — `race-presentation.test.ts` (fakes): engine receives scaled dt while armed; karts/confetti/spin/camera dilate coherently; ordinary races unchanged (scale 1.0); pause + `holdForInterruption` freeze/resume the ramp; `resetToBuild`/RACE AGAIN/Build Again/quit restore 1.0; results untouched.
- [x] Task 2.2: implement dilation wiring (Green) (3fc5220) — `race-presentation.ts` owns the scale, feeds `engine.tick(dt · scale)` + scaled dt to race visuals; tracker tick added to the update order.
- [x] Task 2.3: camera push tests first (Red) (877ec4e) — `race-camera.test.ts`: finished framing tightens ~10–15% during the sequence and eases back to the standard hold; bounded (no clipping/zoom-floor violations); build/countdown untouched. Plus presentation-side spec in `race-presentation.test.ts`: the push starts on the tracker's confirm accent, never on a non-photo finish, and eases back to the standard hold.
- [~] Task 2.4: implement camera push (Green) — small bounded addition to `race-camera.ts` pose input (`push` amount + `PHOTO_FINISH_PUSH`), driven by the tracker's confirm accent; presentation envelope (`PHOTO_PUSH_RELEASE_SECONDS`) passes the amount through.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — browser feel check: slow-mo + push read well; normal race unchanged.

## Phase 3 — Crowd Cheer & Audio Choreography

- [ ] Task 3.1: source the cheer (CC0) — Freesound #365132 "Crowd Cheering" (SoundsExciting, verified CC0) preferred; trim ~2–4 s, mono ogg ≤ ~100 KB → `src/assets/sfx/` + `LICENSE-…txt`; wire `SFX.crowdCheer`; precache verified via existing PWA/build checks. Fallback: equivalent verified-CC0 with direct download; if none lands, drop the cheer and record the decision (spec FR-3 optional).
- [ ] Task 3.2: audio tests first (Red) — `audio-director.test.ts`: music tempo ease down/up (~0.85) with restore; hum dip envelope (~40%) and restore; cheer one-shot honors mute + suspend/resume, never double-fires; presentation seam triggers cheer exactly once on flag confirm.
- [ ] Task 3.3: implement audio additions (Green) — additive `AudioDirector` methods + adapter wiring in `main.ts`; missing-asset behavior best-effort (consistent with existing audio).
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — user listening check: cheer + music hold balance (agent cannot hear).

## Phase 4 — Flash Overlay & Lifecycle Integration

- [ ] Task 4.1: flash sink tests first (Red) — new `src/ui/flash-overlay.ts` (+jsdom test): single pulse lifecycle (~0.25 s fade), `pointer-events: none`, hidden in build mode, teardown removes DOM/listeners; presentation triggers exactly once on confirm, never on non-photo finishes.
- [ ] Task 4.2: implement flash + wire `main.ts` (Green) — overlay above canvas, below trophy/HUD; presentation options gain an additive `flash` sink (defaulted/no-op).
- [ ] Task 4.3: reset-matrix tests (Red→Green) — `race-presentation.test.ts`: pause/resume, interruption hold, RACE AGAIN, Build Again, quit leave no stale dilation/flash/cheer/camera state; `?race`/`?perf`/`?debug` intact.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — phone portrait/landscape full flow; flash gentle; no regressions.

## Phase 5 — Verification & Quality Gates

- [ ] Task 5.1: quality gates — `pnpm build`; `$env:CI='true'; pnpm test`; coverage >80% on changed modules; `pnpm lint` clean; docs synchronized (tech-stack/product as needed).
- [ ] Task 5.2: browser + E2E verification — Playwright suites (smoke/shelf/landscape/postrace/lifecycle) green; `?perf` draw calls unchanged; manual close-finish run portrait + landscape; screenshots captured.
- [ ] Task 5.3: fairness & drama report — re-run fairness sweep (slot bands, 30–65% closeness, 30–45 s) + predictor stats (coverage of flag-true races, false-arm rate); record measured numbers in the phase verification note.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
