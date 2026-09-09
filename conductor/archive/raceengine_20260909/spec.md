# Track: Race Engine Core

## Overview

The pure-logic heart of the race: extract the ordered circuit from a build grid, drive 2-4 karts around it with per-race randomized speeds (tuned for close, photo-finish races), and produce a complete race result — winner, finish times, and a `photoFinish` flag. The engine owns the full race lifecycle (countdown → running → finished, pause/resume/abandon/restart) so the later presentation and audio tracks stay thin. Per product decision, the finish line is **F1-style**: the start line is the start/finish line, and the separate finish piece becomes optional decoration — the validator is relaxed accordingly.

## Functional Requirements

1. **Validator relaxation (product decision):** a track is valid iff exactly one connected closed circuit exists that **contains the start piece**. The finish piece is no longer required (still placeable; decorative banner). Removed reasons: `missing-finish`. Remaining reasons: `empty`, `no-loop`, `multiple-loops`, `missing-start`. Dangling/unused pieces still ignored.
2. **Loop path extraction** (`src/race/path.ts`): given a valid grid, return the ordered circuit as a list of cells (coords, type, orientation) **starting at the start piece**, traversing deterministically (first step = start piece's side[0] neighbor, then follow connections). Only the single loop is included; dangling pieces ignored. Invalid input (no loop / no start) → throws.
3. **Race timing:** every piece = 1 segment of `SEGMENT_LENGTH` (2.0 world units). Kart progress is continuous distance along the path; total lap length `L` = segments × 2.0. Winner = first kart with progress ≥ `L` (crossing the start line again). Base speed auto-tuned: `baseSpeed = L / 37.5` (target mid-band of product's 30–45 s lap). Each kart's per-race speed = `baseSpeed × factor`, factor sampled from `uniform(0.985, 1.015)` (±1.5 %, tunable constants) so races are always close and any color can win.
4. **Kart model & lineup:** 2–4 karts (validated; default 4). Side-by-side pairs: row = `⌊index/2⌋`, lane alternates `±laneOffset` (0.35 world units, tunable); row spacing 1.2 units behind the line (tunable). Kart start progress = `-row × rowSpacing` (negative = behind the line; 0 = the start line). Odd count → single kart in the last row (center lane). Karts never collide or block — free passing.
5. **Engine-owned state machine:** `idle → countdown (3.0 s) → running → finished`, plus a `paused` flag. `tick(dt)` advances countdown and, while running, moves karts. No movement before GO; movement starts exactly at countdown end. Simulation continues until **all** karts finish (complete finish times); race state flips to `finished` at the winner's crossing.
6. **Results & events:** `RaceResult { winnerIndex, finishTimes: (number|null)[], photoFinish: boolean }` — `photoFinish` = winner margin over runner-up < 0.25 s. Typed event emitter: `finish` (result), `kartFinish` (index, time), `stateChange` (state).
7. **Lifecycle API:** `start()` (idle → countdown), `pause()` / `resume()` (freeze/unfreeze tick), `abandon()` (reset to idle, discard), `restart()` (same karts + track, **fresh speed roll**, back to idle). Seeded injectable RNG (e.g. mulberry32) for deterministic tests; `Math.random` default.
8. **Integration:** `main.ts` `onGo` starts the engine (minimal wiring; no rendering). GO gating continues to use `validateTrack` — now with relaxed rules.

## Non-Functional Requirements

- **Pure logic:** `src/race/*` modules import no DOM/THREE; fully unit-testable headlessly.
- **Quality:** TS strict, Biome-clean, >80 % coverage on all new/changed logic; public functions documented; TDD per `conductor/workflow.md`.
- **Performance:** `tick(dt)` is O(path length); trivial vs. render budget (engine work far under 1 ms/frame).
- **Compatibility:** unchanged (iOS Safari 16+, Android Chrome 110+).

## Acceptance Criteria

1. Path extraction returns the full ordered circuit from the start piece; curves/mixed orientations/dangling pieces handled (unit-tested with fixed grids, including a known 8-cell loop and a 48-cell full-board loop).
2. Validator: loop with start only = valid; finish-only = invalid (`missing-start`); both = valid; two loops / open paths / empty = invalid (tests updated from Track 1's cases).
3. A race on loops of 8–48 cells finishes in ~30–45 s (seeded test: winner time within band; `baseSpeed = L / 37.5`).
4. Lineup: karts start in pairs, alternating lanes, single centered kart for odd counts (unit-tested offsets).
5. Countdown: progress frozen until GO; movement starts exactly at countdown end (tick-based tests).
6. Finish: winner = first past `L`; all finish times recorded; `photoFinish` correctly true/false for seeded close and clear races.
7. Lifecycle: pause freezes progress, resume continues, abandon resets, restart re-rolls speeds (seeded test: different speed factors than previous race).
8. Any color can win: across several fixed seeds, more than one distinct winner (seeded test).
9. `pnpm build`, `CI=true pnpm test`, `pnpm lint` all green.

## Out of Scope (later tracks)

- 3D karts, camera drift, countdown/celebration visuals (Race Presentation)
- Car picker & color swatches (Car Picker track)
- Countdown beeps, engine hum, victory jingle, music (Race Audio)
- Collision/blocking, laps > 1, pit stops, kart personalities
- Shelf UI, scenery