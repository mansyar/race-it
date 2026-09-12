# Audio Warmth & Readiness — Specification

**Track ID:** `audiowarmth_20260912` · **Type:** Feature · **Plan:** [plan.md](./plan.md)

## Overview

Today every sound is played cold: each tap constructs a brand-new `Audio` element (`playElement` in `src/audio/audio-director.ts`) and the music loop element is constructed the moment the countdown starts. The first play of each sound therefore pays fetch + decode, and a rejected `play()` (autoplay policy, environment quirks) is silently ignored — so on a real device the very first palette tap, the GO tap, or the countdown music can arrive late or never. When a first load hiccups, the sounds stay cold for the whole session.

This track warms all bundled audio at boot: a small reusable element pool per SFX plus one pre-created music element, driven by the existing asset-readiness tracker as a **non-critical** group that retries silently and can never gate GO. No new assets, no new UI, no new failure states.

## Functional Requirements

### FR-1 — Warmed element pool (`src/audio/audio-director.ts`, extended)
- On the first `warm()` (triggered at boot), the director builds a pool of `PlayableAudio` elements per SFX (`SFX_POOL_SIZE`, default 2) via the existing injectable `makeAudio` factory, plus one music element; before warming, playback keeps the legacy per-play construction fallback. The default factory sets `preload = 'auto'`.
- New `warm(): Promise<void>` starts loading every element (dedicated `load` support on the minimal surface) and resolves only when all elements report ready; it rejects if any element fails so the readiness tracker can retry. It is idempotent: already-warm elements are left alone, failed ones are re-attempted.
- New `warmSnapshot()` returns observable state for tests/debug: per-sound status (`idle | warming | ready | failed`) + attempt counts + pool size, and the music entry.
- `playOneShot` / `playCountdownBeep` route through the pool (round-robin): reset `currentTime` to 0 (guarded), apply volume/playbackRate, `play()`, and swallow rejections. Overlap stays bounded at pool size — no element is created during play once warm.
- Existing contracts preserved: mute suppression, countdown pitch rates, one-shot gain 0.8.

### FR-2 — Music lifecycle stays warm (`src/audio/audio-director.ts`)
- The music element is created once at boot (regardless of mute) and reused for the session.
- `startMusic` resets it to the top and plays, so each race still starts fresh; `stopMusic` pauses it and keeps it warm for the next race (no new element per race).
- Mute/unmute semantics preserved: a started loop resumes from its paused position; a race that began muted starts the loop from the top on first unmute (current behavior). Suspend/resume (`suspendAll`/`resumeAll`) unchanged.

### FR-3 — Readiness wiring & debug (`src/main.ts`)
- The readiness tracker gains a `audio` group with `critical: false` and `load: () => audio.warm()`; it starts with the other groups and can never affect `raceReady` or the retry cue.
- Failed warmth retries through the tracker's existing silent backoff (infinite, like `scenery`); no UI, no text, no error surface anywhere.
- Under `?debug`, `window.__raceItAudio` exposes `warmSnapshot()` (additive, mirroring `__raceItBoot`).
- `?race` / `?perf` keep working; first-pointerdown `unlock()` unchanged; warming happens regardless of mute.

### FR-4 — Silent failure & lifecycle compatibility
- No path may produce an unhandled promise rejection from `play()` (one-shots, countdown, jingle, crowd cheer, music).
- Visual/session behavior untouched: GO gate, staged reveal, session-resilience holds, wake lock, photo-finish audio treatment, victory jingle duck — all unchanged.
- If a sound never warms, taps still attempt to play it (existing cold behavior) and stay silent on failure — children never see or hear a failure.

## Non-Functional Requirements

- **TDD per `conductor/workflow.md`;** TS strict; Biome-clean; ≥80% coverage on changed modules (`audio-director` warm logic; `main.ts` wiring covered by E2E per house precedent); public APIs JSDoc'd.
- **No new assets or dependencies;** SW precache list unchanged; warming reads from the offline cache.
- **Performance:** no per-frame work; warm is a one-shot boot task; bounded memory (~10 SFX × 2 + 1 music small elements); 60fps unchanged.
- **UX:** wordless; zero new UI; nothing gates GO or adds failure states.
- **iOS:** preloading before a gesture is legal (fetch/decode only); playback still requires the existing unlock; verified on device.

## Acceptance Criteria

1. Unit — warm: elements load via the injected factory; `warm()` resolves only when all report ready and rejects when any fails; snapshot transitions `idle → warming → ready | failed`; attempts increment on retry; idempotent re-warm leaves ready sounds alone.
2. Unit — pool playback: one-shots reuse pre-created elements round-robin; `currentTime` reset; volume/rate rules unchanged; `play()` rejection swallowed; muted suppression unchanged; no elements created during play.
3. Unit — music: pre-created once; `startMusic` resets + plays; `stopMusic` pauses and keeps it warm; reuse across races; mute/suspend semantics preserved.
4. E2E (new `e2e/audio.spec.ts`) — slow OGGs: route-delayed responses; `__raceItAudio` shows `warming → ready`; GO still wakes and a race starts while audio is still warming.
5. E2E — failure/retry: aborted OGG routes → attempts increase (silent backoff observed), no crash, GO unaffected; un-abort → recovers to ready.
6. E2E — regression: all existing specs stay green (smoke, boot, lifecycle, postrace, shelf, landscape, perf, installability); no unhandled-rejection noise in the run.
7. Manual: iOS Safari + Android Chrome — first palette tap / GO / countdown music audibly instant after boot; flaky first load warms silently and recovers; mute toggle; backgrounding mid-race; installed PWA.

## Out of Scope

- New sounds/assets; volume/mix changes (`GAINS`); mute-semantics changes.
- WebAudio buffer-based one-shots (chosen mechanism is the element pool).
- Service-worker/precache strategy changes; fetch hints or download scheduling.
- Audio settings UI; per-kart engine sounds; crossfades or new music.
- Changing the autoplay/unlock policy beyond swallowing rejections.
- Build/picker/shelf/race engines, fairness, and the in-flight context-loss track.