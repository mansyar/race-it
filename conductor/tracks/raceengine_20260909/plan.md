# Implementation Plan — Race Engine Core

**Track ID:** raceengine_20260909 · **Type:** Feature · **Spec:** [./spec.md](./spec.md)

> TDD is mandatory (see `conductor/workflow.md`): Red (failing tests first) → Green (minimum code to pass) → optional Refactor. Quality gates apply to every task.

## Development Commands (adapted to project tooling)

```bash
pnpm install                 # setup
pnpm dev                     # start dev server
CI=true pnpm test            # run test suite once (vitest)
CI=true pnpm test -- --coverage   # coverage report (target >80%)
pnpm lint                    # biome check (CI=true where applicable)
pnpm build                   # production build
```

## Phases

### Phase 1 — Validator Relaxation (product decision) [checkpoint: 511ee23]

- [x] Task 1.1: Rewrite validator tests for relaxed rules — finish-only loop → `missing-start`; loop with start only → valid; start+finish → valid; keep `empty` / `no-loop` / `multiple-loops` / dangling-ignored cases. **TDD:** Red against current validator. `(511ee23)`
- [x] Task 1.2: Relax `validateTrack` — drop the finish requirement and the `missing-finish` reason from `InvalidReason`. **Green.** `(511ee23)`
- [x] Task 1.3: Verify ripple — GO gating (`main.ts` calls `validateTrack`), demo-loop seed, shelf save-on-valid all behave with the relaxed rule. *(manual + existing suite)* `(511ee23)`
- [x] Task: Phase Verification & Checkpoint `(511ee23)`

### Phase 2 — Loop Path Extraction (pure TDD) [checkpoint: a6d201a]

- [x] Task 2.1: Path tests first — known 8-cell rectangular loop starting at the start piece; mixed curves/orientations; dangling pieces excluded; throws on no-loop / missing-start; deterministic direction (first step = start piece's side[0] neighbor). **Red.** `(a6d201a)`
- [x] Task 2.2: Implement `src/race/path.ts` — `extractLoopPath(grid)` returning ordered cells (coords, type, orientation). **Green.** `(a6d201a)`
- [x] Task: Phase Verification & Checkpoint `(a6d201a)`

### Phase 3 — Race Engine Core (pure TDD) [checkpoint: e5a9aa6]

- [x] Task 3.1: Injectable seeded RNG utility (mulberry32) + tests (deterministic sequences, uniform band sampling). `(293affa)`
- [x] Task 3.2: Engine tests first — lineup offsets for 2/3/4 karts (pairs, alternating lanes, odd-count centered); speed roll from seed; `baseSpeed = L / 37.5` auto-tune (8-cell and 48-cell loops → winner within 30–45 s); countdown freeze (no movement before GO, movement exactly at GO); finish detection at progress ≥ L; finish times for all karts; `photoFinish` true/false (seeded close & clear races); >1 distinct winner across seeds. **Red.** `(e5a9aa6)`
- [x] Task 3.3: Implement `src/race/engine.ts` — kart model, state machine (`idle → countdown → running → finished` + paused), `tick(dt)`, results, typed events (`stateChange`, `kartFinish`, `finish`). **Green.** `(e5a9aa6)`
- [x] Task: Phase Verification & Checkpoint `(e5a9aa6)`

### Phase 4 — Race Lifecycle API [checkpoint: e493269] (pure TDD)

- [x] Task 4.1: Lifecycle tests first — pause freezes progress, resume continues, abandon resets to idle, restart re-rolls speeds (seeded: different factors than previous race). **Red.** `(e493269)`
- [x] Task 4.2: Implement `pause()`/`resume()`/`abandon()`/`restart()` on the engine. **Green.** `(e493269)`
- [x] Task: Phase Verification & Checkpoint `(e493269)`

### Phase 5 — Integration & Verification [checkpoint: c7969f4]

- [x] Task 5.1: Wire `onGo` in `main.ts` to start the engine + app-loop `tick`; `?race` debug hook runs a headless seeded race and prints the result (project debug convention: `?perf`, `?debug`). *(manual verification)* `(0c851c4, c7969f4)`
- [x] Task 5.2: Quality gates — `pnpm build`, `CI=true pnpm test` (full suite), coverage >80% on `src/race/*` + validator, `pnpm lint`; tick-cost sanity (engine work ≪ 1 ms/frame). *(measured)* `(c00709f)`
- [x] Task: Phase Verification & Checkpoint `(c7969f4)`