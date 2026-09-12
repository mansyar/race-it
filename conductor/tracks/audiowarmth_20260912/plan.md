# Implementation Plan — Audio Warmth & Readiness

**Track ID:** `audiowarmth_20260912` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test` (E2E)

**Coordination note:** `src/main.ts` and `conductor/tech-stack.md` are concurrently touched by the in-progress `feature/context-recovery` branch — keep edits additive and localized so the eventual integration merges stay clean.

**Implementation notes (pre-plan recon):**
- `playElement` (`audio-director.ts` line 172) constructs `new Audio(url)` per play; the music element is created in `startMusicInternal` (244) and discarded in `stopMusicInternal` (256) — both change under FR-1/FR-2.
- `PlayableAudio` is a minimal injected surface (`play`/`volume`/`playbackRate`/`loop`/`pause`); warm support lands as additive optional members (`load?`, `readyState?`, `preload?`) so the existing fake factories in `audio-director.test.ts` keep working with intentional updates.
- Tests inject `makeAudio`/`makeAudioContext` via options — the same seam covers warm; fake timers exercise timeouts/retries.
- Asset-readiness non-critical groups never affect `raceReady` or the cue; a rejected `load()` schedules a silent backoff retry (0.5s → ×2 → 10s cap, infinite) — exactly the policy FR-3 wants.
- Debug hooks today: `__raceItBoot` (`?debug`), `__raceItDebug`, `__raceItPerf` (`?perf`) — add `__raceItAudio` under `?debug`, additive.
- E2E precedent: `e2e/boot.spec.ts` routes delayed/aborted GLBs and asserts via debug hooks; `e2e/audio.spec.ts` mirrors this with `.ogg` routes. GO's observable enabled signal stays `aria-disabled`.
- Coverage excludes `main.ts` (wiring covered by E2E per house precedent); `?race` headless mode never touches the audio director.
- iOS: `load()` before a gesture is legal (fetch/decode only) — playback stays gated by the existing first-pointerdown `unlock()`.

## Phase 1 — Tech-Stack Addendum (doc-only) [checkpoint: 09c5811]
- [x] Task 1.1: document the audio warmth design in `tech-stack.md` — warmed `PlayableAudio` pool (`SFX_POOL_SIZE`), `warm()`/`warmSnapshot()` surface, pre-created music element reuse across races, non-critical `audio` readiness group in `main.ts`, `__raceItAudio` debug hook, no new dependencies; commit before implementation per workflow. (09c5811)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — doc review.

## Phase 2 — Warm Pool Core (FR-1, FR-2, FR-4) [checkpoint: 200d479]
- [x] Task 2.1: warm tests first (Red) — extend `src/audio/audio-director.test.ts` (injected fake factory + fake timers): `warm()` loads every pooled element and resolves only when all report ready; rejects when any fails; snapshot `idle → warming → ready | failed` + attempt counts; re-warm is idempotent (ready untouched, failed re-attempted); one-shots reuse pre-created elements round-robin with guarded `currentTime` reset (no factory calls during play); volume/countdown-rate rules unchanged; `play()` rejections swallowed with no unhandled promise; music element created once, `startMusic` resets to top + plays, `stopMusic` pauses and keeps it warm, next race reuses it; mute/unmute and suspend/resume semantics preserved. (7821445)
- [x] Task 2.2: implement in `src/audio/audio-director.ts` (Green) — additive `load?`/`readyState?`/`preload?` on `PlayableAudio`, default factory `preload='auto'`, single-flight `warm()` + `warmSnapshot()`, bounded pool, music reuse; existing behavior tests stay green (intentional updates only). (200d479)
- [x] Task 2.3: coverage ≥80% on the module + refactor under green; `$env:CI='true'; pnpm test` + `pnpm lint` clean; commit. (200d479)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — table-walk the warm/play/music state matrix with the user.

## Phase 3 — Boot Wiring, Debug Hook & E2E (FR-3) [checkpoint: 0a25da1]
- [x] Task 3.1: audio E2E first (Red) — new `e2e/audio.spec.ts` (`?debug`; `page.route` on `.ogg`):
  1. **Slow OGGs:** route-delayed responses → `__raceItAudio` shows `warming` → `ready`; GO still wakes and a race starts while audio is still warming.
  2. **Failure/retry:** aborted `.ogg` routes → attempts increase over time (silent backoff), no crash and no unhandled rejection noise, GO unaffected; un-abort → recovers to `ready`.
  3. Confirm the spec fails against the pre-change revision. (ecab186)
- [x] Task 3.2: wire `src/main.ts` (Green) — add the `audio` readiness group (`critical: false`, `load: () => audio.warm()`), expose `window.__raceItAudio` under `?debug`; `?race`/`?perf`/unlock/lifecycle flows untouched. (0a25da1)
- [x] Task 3.3: stabilize + regression pass — run the new spec repeatedly under the CI single-worker config; all existing specs (smoke, boot, lifecycle, postrace, shelf, landscape, perf, installability) stay green. (0a25da1)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — manual scenario with the user.

## Phase 4 — Quality Gates, Manual Verification & Docs [checkpoint: ff3c02a]
- [x] Task 4.1: quality gates — `pnpm build`; `$env:CI='true'; pnpm test -- --coverage` (>80% on `src/audio/audio-director.ts`); `pnpm lint`; full Playwright suite; record numbers. (0a25da1)
- [x] Task 4.2: manual verification — iOS Safari + Android Chrome: first palette tap / GO / countdown music audibly instant after boot; flaky first load warms silently and recovers; mute toggle; backgrounding mid-race; installed PWA; portrait + landscape. — deferred to the next Ship track per user (needs HTTPS deploy + real devices); automated coverage stands.
- [x] Task 4.3: final docs — `tech-stack.md` synced against final code; completion checklist per workflow. (ff3c02a)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md).

## Phase: Review Fixes
- [x] Task: Apply review suggestions 14862b5