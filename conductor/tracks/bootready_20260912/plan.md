# Implementation Plan — Boot Readiness & Loading Experience

**Track ID:** `bootready_20260912` · **Type:** Feature · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** every implementation task starts with failing tests (Red), confirmed failing, then minimal code (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `pnpm dev` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test`

**Implementation notes (pre-plan recon):**
- Boot loads today: `main.ts` chains `pieces.load() → scene add → scenery.load() → add` (lines 471–482) and separately `karts.load()` (adds `karts.group` + confetti, 483–491); `kartPreview.load()` is a third, independent consumer of the same kart GLBs (443–448). The pieces→scenery chain means a pieces failure blocks scenery — FR-1 breaks this coupling.
- GO currently gates on track validity alone (`go.setValid` at 77/469); every e2e spec waits on its `aria-disabled`/pulsing signal before clicking (`toBeEnabled` + animation-freeze trick) — the new readiness gate must preserve that observable contract.
- `createGoButton` is a small factory; `setValid` owns `aria-disabled` + `.pulsing`. Additive states only; existing unit tests are updated intentionally (default becomes sleeping).
- `PieceRenderer.load()` awaits 5 template fetches sequentially; re-invoking it is a full, safe retry (fresh GLTFs overwrite templates; `prepared` cache cleared). `KartPreview` has its own loader — the `karts` readiness group must wrap both consumers.
- Audio is lazy (`new Audio(url)` per play, `audio-director.ts`) — no audio gating. `appReady()` stays the scaffold probe (main.ts boots synchronously inside it).
- Vitest coverage excludes `main.ts` (wiring covered by E2E, per house precedent); `src/style.test.ts` exists for CSS contracts.

## Phase 1 — Asset Readiness Core (FR-1)
- [ ] Task 1.1: readiness contract tests first (Red) — new `src/asset-readiness.test.ts` with injected loaders + fake timers: group lifecycle `idle→loading→ready` vs `failed`; groups load independently (a pieces failure never blocks scenery); `raceReady` truth table (pieces × karts, scenery ignored); backoff schedule (0.5s base, ×2, cap 10s, indefinite); one in-flight attempt per group (forced taps coalesce); stall detection (~3 consecutive failures or ~8s) flips to the retry-cue state; recovery clears attempts; snapshot/subscribe API; no real network or real timers.
- [ ] Task 1.2: implement `src/asset-readiness.ts` (Green) — `createAssetReadiness({ groups, onStateChange? })` factory (house factory style), injectable scheduling; JSDoc on the public surface.
- [ ] Task 1.3: coverage ≥80% on the module + refactor under green; `$env:CI='true'; pnpm test` and `pnpm lint` clean; commit.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — GO Readiness States (FR-3, FR-4 cue)
- [ ] Task 2.1: go-button tests first (Red) — extend `src/ui/go-button.test.ts`: starts sleeping (`data-boot="sleeping"`, `aria-disabled="true"`, sleeping visual class); `setReady(true)` → `data-boot="ready"`, enabled for valid tracks only; taps while sleeping never fire `onGo` (blocked feedback only); `setRetrying(true)` → `data-boot="retry"` + retry pulse; retry tap fires `onRetry`, never `onGo`; awake/valid/invalid semantics unchanged once ready; existing tests updated to the new contract (intentional).
- [ ] Task 2.2: implement the additive states in `src/ui/go-button.ts` (Green) — `setReady`, `setRetrying`, `onRetry` callback, `data-boot` output; tap routing order (retry → blocked → go).
- [ ] Task 2.3: CSS contract tests first (Red) — extend `src/style.test.ts`: sleeping dots element/state present; retry cue uses the existing ≥64px pill; sleeping dims but never hides; `data-boot` selectors exist for all three states.
- [ ] Task 2.4: style the states in `src/style.css` (Green) — wordless dots (sleeping) and pulsing retry cue; no layout shift; existing valid/pulsing rules untouched.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 — Boot Wiring & E2E (FR-2, FR-3, FR-4, FR-5)
- [ ] Task 3.1: boot E2E first (Red) — new `e2e/boot.spec.ts`: (a) slow-load — `page.route` delays piece/kart GLBs; assert GO sleeps (`data-boot`, `aria-disabled`) and a GO tap never opens the picker; release → stages land, GO wakes, race starts; (b) failure — abort kart GLBs, observe >1 retry attempts and the retry cue after stall; tap forces an attempt; un-abort → recovery → ready; no unhandled errors. Confirm the spec fails against the pre-change revision.
- [ ] Task 3.2: wire `main.ts` (Green) — readiness groups (`pieces`, `scenery`, `karts` = kart renderer + preview), decouple scenery from pieces, staged reveals with the existing toy-feedback pop-in (both render modes), GO gate + retry wiring, `__raceItBoot` under `?debug`; `?race`/`?perf`/`?debug`, lifecycle, audio and quality flows untouched.
- [ ] Task 3.3: regression pass — full e2e suite (smoke, lifecycle, postrace, landscape, shelf, perf, installability) green against the new gate; touch a spec only if its enable-wait is genuinely stale.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 — Quality Gates, Performance & Manual Verification (AC 3–6)
- [ ] Task 4.1: gates — `$env:CI='true'; pnpm test -- --coverage` (≥80% on changed modules), `pnpm lint`, `pnpm build`, `pnpm exec playwright test`; perf sanity via the existing perf spec (`?perf` draw calls unchanged; no new per-frame work; no new asset requests).
- [ ] Task 4.2: manual device/network checklist — throttled first load (staged reveal, no dead states), airplane-mode first visit (retry cue + recovery when network returns), portrait + landscape, `?race`/`?perf`/`?debug` intact. (User-assisted per `workflow.md`; recorded in the checkpoint note.)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)