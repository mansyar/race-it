# Race Audio & Music — Specification

## Overview
Implements product.md's **Audio** section: countdown beeps, engine hum, victory jingle, one upbeat music loop — plus build-mode placement pops. Replaces the minimal `createSfx` with a single injectable **AudioDirector** owning all layers (one-shots, hum, music, mute, mix, lifecycle). New one-shots + music are **Kenney CC0 files**; the engine hum is **procedurally synthesized** (WebAudio) for a seamless loop and tiny footprint.

## Current State (why this track)
- Only 3 UI sounds exist (`click`, `confirmA`, `confirmB` — Kenney Interface Sounds); the race presentation wires **zero** audio.
- `createSfx(makeAudio?)` → `{ play, setMuted, isMuted }`; `SfxName = keyof typeof SFX`; mute persisted at `race-it:muted`.
- Hook points exist: race-presentation is event-driven (`stateChange`, `countdownRemaining`, `finish` events); `ASSET_URLS` auto-precaches new assets.

## Functional Requirements

### FR-1 — AudioDirector facade
One module replacing `createSfx`. Owns one-shots, hum, music, mute, and mix. All layers honor the mute toggle. Injectable factories (Audio element + WebAudio context) for unit tests, consistent with the existing dependency-injection pattern. The 3 existing sounds keep their files/timbre, routed through the director.

### FR-2 — Countdown & GO
Three rising-pitch beeps (3…2…1) synced to traffic-light ticks; distinct brighter GO tone at race start. Wordless UI — no voice.

### FR-3 — Engine hum
Procedural WebAudio (oscillator blend + low-pass filter). Audible **only while racing**: fades in at GO, fades out on pause/quit/finish (~300–500ms). Single shared hum layer — quietest in the mix.

### FR-4 — Music loop
One upbeat playful loop (Kenney **Background Music** pack, CC0, OGG). Starts at race begin (GO tap → countdown), continues through race **and** trophy celebration, continues seamlessly through **RACE AGAIN**, stops on return to builder. Fades ~300–500ms (no clicks); stops on background, restores on return if a race is active.

### FR-5 — Victory jingle
Plays once at trophy; music **ducks ~40%** under it, then swells back.

### FR-6 — Build feedback
Soft "pop" on piece placement; distinct sound on removal; gentle "nope" wobble for blocked taps (disabled GO attempts).

### FR-7 — Pause & backgrounding
Mid-race pause silences **everything**; Resume fades back; Quit stops. `pagehide` stops all audio; returning restores race audio state.

### FR-8 — Mix defaults (reviewable constants)
master ~0.9, one-shots ~0.8, music ~0.35, hum ~0.15 — centralized constants, all below max volume.

## Non-Functional Requirements
- New Kenney audio ≤ **~1.5 MB** total added to PWA precache (OGG, sensible bitrate).
- No render-path impact; 60fps unaffected.
- Offline-first: new assets precached via `ASSET_URLS` (manifest ripple is automatic).
- iOS Safari 16+: WebAudio unlock within first user gesture; no audio before first tap; `resume()` on visibility return.
- TDD: unit tests with injected factories (jsdom); coverage ≥80% on new/changed modules; existing tests updated (`audio/sfx.test.ts`, `assets.test.ts`).
- **Wordless:** no voice/speech anywhere.

## Acceptance Criteria
1. Three rising beeps + distinct GO, synced to countdown ticks.
2. Hum only while racing; fades on start/pause/quit/finish; muted by toggle.
3. Music from race begin → trophy → RACE AGAIN; stops on return to builder.
4. Jingle once at trophy; music ducks ~40%, swells back.
5. Placement pops; removal sound; blocked-GO "nope".
6. Pause silences all; Resume restores; Quit stops.
7. `pagehide` stops audio; return restores if racing.
8. Mute silences all layers; persisted at `race-it:muted`.
9. Existing 3 sounds unchanged; all prior interactions still audible.
10. New assets ≤ ~1.5 MB, CC0 licenses noted in `assets/`.
11. `pnpm test`, lint, `tsc --noEmit` all green; coverage ≥80%.

## Out of Scope
- Per-kart hum pitch variation.
- Redesign/replacement of existing 3 interface sounds.
- Voice/speech of any kind.
- True background audio (app not visible).
- Ambient build-mode music.
- Audio visualization/equalizer UI.
- Track shelf UI or other features (separate tracks).