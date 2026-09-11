# Photo-Finish Drama — Specification

**Track ID:** `photofinish_20260911` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

Close races are the product's signature: the engine is tuned so **30–65%** of demo-loop races (≈42%) end within `PHOTO_FINISH_MARGIN = 0.25 s`, and `RaceResult.photoFinish` already exists — but nothing upstream reads it. A nail-biter and a blowout end identically (same confetti, same spin, same handoff to the trophy). This track makes the close one *feel* close.

When the lead battle is tight on the final approach, the race eases into a brief **slow-motion finish (~0.35×)**; the confirmed photo finish lands with a **single soft screen flash** and a **crowd cheer**; the camera **pushes in** slightly; music and engine hum hold, then swell back into the existing run-out and trophy. Ordinary finishes stay exactly as snappy as today.

**Key decisions (from planning Q&A):**
- **Prediction drives the slowdown; the flag confirms the celebration.** `photoFinish` resolves only when the runner-up crosses — too late to start dilating — so a live gap estimate arms the sequence on the final approach, while `photoFinish === true` authoritatively triggers flash + cheer.
- **Close finishes only** — preserves the 30–45 s band and keeps normal wins snappy.
- **No new text, no strobe.** Wordless UI unchanged; one soft pulse per race.

## Functional Requirements

### FR-1 — Predictive close-finish detection (pure, tested)
- Each running tick, estimate the leader→closest-rival arrival gap in seconds from live progress/paces; **arm** when the leader is inside the final approach window (**≈ last 10% of the lap**) with estimated gap ≤ threshold (**≈ 0.5 s**, tunable).
- Once armed, stay armed through the crossing (the moment is already being dilated); no retraction.
- Sweep guarantee: every race whose `photoFinish` resolves true must have been armed **before** the winner crossed; false arms bounded and rare.

### FR-2 — Time dilation
- Presentation-level time scale: ease 1.0 → **0.35** over ~0.3–0.4 s when armed; hold through the crossing(s); ease back to 1.0 across the run-out (starting when the flag resolves or after a bounded hold). Never outside [0.35, 1.0].
- The scaled dt drives the simulation and race visuals together (karts, camera, confetti, victory spin) so the moment dilates coherently.
- Fairness untouched: all karts scale equally; finish times/margins and the 30–65% photo-finish rate unchanged; wall-clock extends ~1–3 s on close finishes only.
- `RACE AGAIN`, `Build Again`, quit, and race start reset the scale to 1.0; pause/interruption holds freeze and resume it cleanly.

### FR-3 — Flag-confirmed celebration accents
- When the runner-up crosses and `photoFinish === true`: exactly once per race — (a) soft warm-white full-screen flash (~0.25 s fade, single pulse, DOM/CSS overlay outside the 3D scene), (b) crowd-cheer one-shot, (c) camera push engages.
- Non-photo finishes never fire accents, even if armed (near-miss).
- If a true photo finish wasn't armed (prediction miss), accents still fire at confirmation — the flag is authoritative.

### FR-4 — Camera push
- During the sequence, tighten the finished framing ~10–15% beyond the standard close hold, easing back to it through the run-out; zoom clamps and build/countdown behavior unchanged.

### FR-5 — Audio choreography
- Music: ease playback rate (~0.85) and/or small duck during the held moment; restore smoothly on release; jingle + trophy behavior unchanged.
- Hum: dip (~40% gain) while held, swell back with the race.
- Cheer: new one-shot via the audio director; honors mute; suspends/resumes with interruptions; never double-fires across resets.
- Countdown/GO cues unchanged.

### FR-6 — Crowd-cheer asset
- Source a **verified CC0** cheer (candidate: Freesound #365132 "Crowd Cheering" by SoundsExciting — confirmed CC0); trim to a tight ~2–4 s excerpt, mono ogg like siblings, ≤ ~100 KB.
- Store under `src/assets/sfx/` with a license file following the existing convention; wire into `SFX` so the service worker precaches it. (First non-Kenney audio asset — noted in tech-stack docs.)
- Fallback: equivalent verified-CC0 source with direct download; if none lands, FR-3's cheer is dropped and the rest ships.

### FR-7 — Reset & lifecycle integrity
- No stale state after pause/resume, app-switch hold, RACE AGAIN, Build Again, or quit: dilation at 1.0, flash cleared, cheer stopped, camera settled, armed state cleared.
- Flash overlay hidden in build mode, non-interactive (`pointer-events: none`), layered below trophy/HUD.

### FR-8 — Integration & compatibility
- `?race`, `?perf`, `?debug` hooks keep working; perf-tier work (feature/perf-guardrails) unaffected — no new draw calls.
- Build mode, picker, shelf, track editor untouched; race engine API unchanged.
- Public additions (audio-director tempo/cheer methods, presentation options, flash sink) are additive and typed.

## Non-Functional Requirements
- **Boundaries:** new pure logic module (detection + choreography math), `src/presentation/race-presentation.ts` integration, small DOM flash sink wired in `main.ts`, additive `src/audio/audio-director.ts` methods, camera-constant scope in `src/render/race-camera.ts`.
- **TDD** per `conductor/workflow.md`: failing tests first, ≥80% coverage on changed modules, colocated tests, Biome-clean, JSDoc on public APIs.
- **Performance:** device-floor 60 fps preserved; race-view draw calls unchanged; perf harness + E2E green.
- **Safety:** at most one soft flash per race, fade ≥150 ms — no strobing.
- **Offline:** precache updated; offline smoke passes.

## Acceptance Criteria
1. Seeded close race shows the visible slow-motion finish and a clean ease-back; an ordinary race shows none.
2. A confirmed photo finish produces exactly one flash + one cheer at the crossing moment; non-photo finishes produce none.
3. Predictor sweep: all flag-true races in the seeded corpus were armed pre-crossing; false-arm rate within the documented bound.
4. Reset matrix leaves no stale dilation/flash/cheer/camera state across pause, interruption, RACE AGAIN, Build Again, quit.
5. Fairness suite unchanged (slot bands, 30–65% closeness, 30–45 s first finish); existing engine tests untouched and green.
6. `CI=true pnpm test`, `pnpm lint`, `pnpm build`, Playwright suites green; coverage >80% on changed modules; draw calls unchanged.
7. Manual verification on phone portrait + landscape: the moment reads as special, the flash is gentle, audio balances with music/jingle.

## Out of Scope
- Trophy photo-finish badge or any new text/voice.
- Replays/instant replay, letterboxing, camera cuts, extra angles.
- Engine fairness/speed/margin changes; new kart motion.
- Crowd ambience loops, multiple cheer variants, per-kart reactions.
- Settings UI or accessibility toggles beyond existing mute.
- Asset sourcing beyond the single cheer SFX.
