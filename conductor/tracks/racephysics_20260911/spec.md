# Fair Start & Natural Motion — Specification

**Track ID:** `racephysics_20260911` · **Type:** Feature (includes a bug-fix phase) · **Plan:** [plan.md](./plan.md)

## Overview

One track, two sides of the same promise — races must be fair, and they must *feel* like toy cars racing.

1. **Bug — the back row is unwinnable.** The engine starts row-2 karts at `progress = -1.2` but finishes anyone at absolute `progress >= lapLength`, so the back row must travel extra distance. The required pace edge (`1 + 1.2/L`) exceeds the maximum ratio the ±1.5% speed band can produce (`1.015/0.985 ≈ 1.0305`) for any loop up to ~39 units (**~19 cells**) — the 14-cell demo loop included, where the default lineup parks green + yellow. Exhaustive simulation (5,000 seeded races/config, replicating engine math): demo loop — back-row slots win **0**; 24 cells — 11 wins (0.2%); 48 cells — 5.3% / 5.9% back vs 45.7% / 43.1% front. Violates "Fairness is the game" and "any color can win".
2. **Feature — natural motion.** Today karts jump to constant speed the instant the countdown ends, hold a fixed heading per tile, and freeze at the line. The selected natural-motion set: launch from standstill, cornering yaw + lean (with slight curvature pace modulation), finish run-out, subtle seeded speed variation, and micro suspension body motion — all of it must strengthen, never weaken, fairness and closeness.

**Design invariant (governs every motion effect):** a kart's pace is its per-race random factor times a *shared* profile shape (`v(t, s) = pace · g(t) · f(s) · w_i(t)`), so swapping any two karts between grid slots leaves their outcome distributions identical. Distance normalization folds into `pace`. Anything that breaks this invariant is out of scope.

## Functional Requirements

### FR-1 — Distance-normalized start (bug fix)
- Fold the grid offset into pace: `pace_i = base · factor_i · (L - startProgress_i)/L`. Grid geometry, visuals, and the demo track stay unchanged; finish-time distributions become slot-independent.
- Red-to-green proof: a simulation test asserting back-row wins on the 14-cell demo loop (fails today with 0 wins).
- Full sweep: 2-4 karts × representative loops (8 / 14 / 48 cells); every slot's win share inside `[0.5/n, 2/n]` (zero-win slot = automatic failure); fixed seed list keeps CI deterministic.

### FR-2 — Launch from standstill
- After GO, karts accelerate 0 → pace over a short toy launch (~1 s target) instead of starting at full speed.
- Launch profile shared by all karts; per-kart variation comes only from `pace` (+ FR-5 wobble).
- First-finish time stays in the 30-45 s band (retune base speed if needed).

### FR-3 — Cornering: yaw, lean, slight speed modulation
- Visual: heading eases through curves instead of snapping at tile boundaries; body leans into the turn, blending back on straights.
- Physics: slight position-based pace modulation into/out of corners — `f(s)` shared by all karts (multiplicative, position-indexed).
- Lean/heading live in the render layer; curvature modulation lives in the engine (pure, seeded, tested).

### FR-4 — Finish run-out
- Official finish time is recorded at the exact line crossing (results unchanged); after crossing, karts roll forward and decelerate to a natural stop instead of freezing.
- Celebration beats (confetti, jingle) stay on crossing; the winner spin must not fight the roll-out (may begin once settled); trophy still appears once all karts finish.

### FR-5 — Subtle seeded speed variation
- Small low-frequency pace wobble (per-kart phase, mean ≈ 1 over the race), seeded — same seed reproduces the race exactly.
- Amplitude tuned to read "alive", not "erratic"; stays inside FR-1 bands.

### FR-6 — Suspension body motion (visual)
- Micro pitch/roll/bob: squat on launch, weight shift in curves, gentle bob while racing — purely presentational.
- No mesh intersections at the start lineup, no new draw calls, 60 fps floor preserved.

### FR-7 — Fairness & motion harness (regression guard)
- Deterministic simulation suite (pure engine math, fixed seeds) covering FR-1 bands, closeness and durations; runs in CI in well under a second.
- Closeness band: photo-finish rate 30-65% on the demo-loop sweep (today ≈ 42%).
- Same-seed determinism asserted for all new motion.

### FR-8 — Integration & compatibility
- `createRaceEngine` public API unchanged; new motion internal + optional visualization fields.
- `race-presentation` / `KartPoseSink` seam extended compatibly; `?race`, `?perf`, `?debug` keep working.
- Build mode, picker, shelf, audio untouched except finish choreography; the in-flight post-race-nav branch owns trophy navigation — do not touch it.

## Non-Functional Requirements
- Boundaries: `src/race/*` (engine/rng) physics; `src/render/kart-rig.ts` + `kart-meshes.ts` (+ a pure `kart-motion.ts`) visuals; `src/presentation/race-presentation.ts` integration only.
- TDD per `conductor/workflow.md`; TS strict; Biome-clean; >80% coverage on changed modules; JSDoc on public APIs.
- Determinism: same seed → identical race outcome.

## Acceptance Criteria
1. Simulation: back-row wins > 0 on the demo loop (was 0); all slots within `[0.5/n, 2/n]` for 2-4 karts; closeness 30-65%; first finish 30-45 s; same-seed determinism.
2. Browser: visible launch after GO; steer/lean through curves; natural roll-out; organic (not jittery) motion.
3. Regression: `?race` / `?perf` / `?debug` intact; build → picker → race → trophy → again flow unchanged apart from motion.
4. `CI=true pnpm test`, `pnpm lint`, `pnpm build` green; coverage >80% on changed modules.
5. Manual verification on phone portrait + landscape; fairness numbers reviewed.

## Out of Scope
Player control; kart-kart collision/passing; laps > 1; camera changes; audio changes; new art/meshes/animation clips; skid marks/particles; weather; camera shake; per-kart personalities; grid-geometry changes; shelf/sharing; UI/text changes.
