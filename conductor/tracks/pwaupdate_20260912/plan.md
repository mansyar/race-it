# Implementation Plan — Safe PWA Update Flow

**Track ID:** `pwaupdate_20260912` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test` (E2E) · `node scripts/build-update-fixtures.mjs` (new)

**Coordination note:** `src/main.ts` is also touched by the completed-but-unmerged `feature/photo-finish` branch — keep edits additive and localized so the eventual integration merge stays clean.

## Phase 1 — Tech-Stack Addendum (doc-only) [checkpoint: 70145ae]
- [x] Task 1.1: document the update-lifecycle change in `tech-stack.md` — registration strategy `autoUpdate` → `prompt` with app-owned deferred activation (`src/pwa/update-controller.ts` + quiet window), SKIP_WAITING apply via `updateServiceWorker(true)`, discovery cadence, no new dependency; commit before implementation per workflow. (69896f3)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md) — doc review.

## Phase 2 — Update Controller & Quiet Window (pure) [checkpoint: fd24405]
- [x] Task 2.1: controller tests first (Red) — `src/pwa/update-controller.test.ts` (fake timers, injected deps): status model (idle/checking/ready/applying/unsupported); discovery at launch + foreground + online + ~15 min cadence with visible+online guards and silent offline skip; waiting update tracked once, newer replaces older; gate matrix — apply only when screen=build ∧ quiet ≥3 s ∧ visible; any input restarts quiet; leaving Build mode cancels; apply fires exactly once and completes despite later input; no-op when unsupported. (8140ed9)
- [x] Task 2.2: implement `src/pwa/update-controller.ts` (Green) — pure state machine, injected clock/timers, `QUIET_MS = 3_000` and `CHECK_INTERVAL_MS = 15 * 60_000` centralized, observable `status`, JSDoc public API. (8140ed9)
- [x] Task 2.3: quiet-window tests first (Red) — `src/pwa/input-activity.test.ts`: pointerdown counts as activity and marks held; pointerup/pointercancel end the hold; held pointer blocks quiet; quiet only after 3 s without activity; dispose removes listeners. (fd24405)
- [x] Task 2.4: implement `src/pwa/input-activity.ts` (Green) — window listeners (passive), injectable target/clock. (fd24405)
- [ ] Task: Phase Verification & Checkpoint — table-walk the gate matrix with the user; confirm constants.

## Phase 3 — Registration Switch & App Wiring [checkpoint: 1cca5a6]
- [x] Task 3.1: registration switch — `vite.config.ts`: `registerType: 'prompt'`, disable injected registration (`injectRegister: null`), keep workbox globs unchanged; add `vite-plugin-pwa/client` to `tsconfig.json` types; verify the generated `sw.js` honors SKIP_WAITING (adjust workbox config if the plugin does not add it). (bbcbd18)
- [x] Task 3.2: wire in `src/main.ts` — app-owned raw SW registration → controller (virtual register module dropped: workbox-window unresolvable under pnpm without a new runtime dep — tech-stack amendment f99bd2a); screen signal from existing seams (picker visibility + `onBuildUiChange`); quiet input tracker on window; launch/foreground (`onVisible`/`onRestore`) and online triggers; apply → post SKIP_WAITING to the waiting worker + reload on activation; `?debug` exposes controller status + tiny build-label seam for the e2e (harmless when unset). (1cca5a6)
- [x] Task 3.3: regression pass — dev + preview boot clean (SW registered only in preview), offline preview boot intact, race loop untouched, `?race`/`?perf`/`?debug` intact. (verified: dev boot 200 OK + wiring transform; e2e smoke/landscape/postrace/installability/shelf/perf 8/8; offline + `?race` covered by phase checkpoint)
- [ ] Task: Phase Verification & Checkpoint — browser check with user.

## Phase 4 — Two-Build Update E2E [checkpoint: b2d9512]
- [x] Task 4.1: fixture builder — `scripts/build-update-fixtures.mjs` builds variants A/B (env `VITE_BUILD_LABEL=a|b`) into `.e2e/fixtures/a|b` (gitignored). (f9b7af2)
- [x] Task 4.2: update e2e first (Red) — `e2e/update-flow.spec.ts` (`serviceWorkers: 'allow'`, self-hosted static server over a mutable fixture dir): (b2d9512)
  1. **Race safety:** load A, start race, swap served files to B + force `registration.update()`; assert no reload while racing (sentinel + label still A); after Build Again, assert silent reload to B with the board intact.
  2. **Quiet gate:** load A, make B available; repeated input defers the swap; once input stops, the swap lands within a few seconds.
- [x] Task 4.3: implement harness pieces (Green) + stabilize — run repeatedly under the single-worker CI config; record timings. (b2d9512)
- [ ] Task: Phase Verification & Checkpoint — manual two-build scenario once + CI-config green.

## Phase 5 — Quality Gates & Documentation [checkpoint: ]
- [x] Task 5.1: quality gates — verified 2026-09-12: `pnpm build` green (63 precache entries, 2359.04 KiB); 54 files / 615 tests passed; coverage all files 97.24/88.38/97.05/97.47 (src/pwa ≥83.33 on every metric); `pnpm lint` 128 files, 2 pre-existing warnings; full Playwright CI-config suite 13/13 passed (2.3m) incl. update-flow + installability.
- [~] Task 5.2: manual verification — offline boot, full build→race→trophy→again loop, no update UI anywhere, `?race`/`?perf`/`?debug`; real two-serve no-reload check.
- [x] Task 5.3: final docs — `tech-stack.md` synced against final code (af6c7f6; DoD checklist — implemented to spec, 54 files/615 tests incl. 29 new, coverage 97.24/88.38/97.05/97.47, lint clean, notes attached, manual verification tracked in 5.2).
- [ ] Task: Phase Verification & Checkpoint.