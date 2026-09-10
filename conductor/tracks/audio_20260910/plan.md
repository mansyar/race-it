# Race Audio & Music — Implementation Plan

## Phase 1: AudioDirector Foundation [checkpoint: 0443faa]
- [x] Task: Write failing unit tests for the AudioDirector facade (replaces `createSfx`): one-shot routing for all names, mute honored across layers, gain-staging constants, injectable Audio/WebAudio factories — 9dada5f
- [x] Task: Implement `src/audio/audio-director.ts` — one-shot player, mute state, master/one-shot/music/hum gain stages (defaults: master 0.9, one-shots 0.8, music 0.35, hum 0.15) — a8e5551
- [x] Task: Migrate `main.ts` call sites from `createSfx` to AudioDirector — `click`/`confirmA`/`confirmB` files and timbre unchanged, all prior interactions still audible — 0443faa
- [x] Task: Verify coverage ≥80% on new module, `pnpm test` + Biome lint + `tsc --noEmit` green — 0443faa
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — 0443faa

## Phase 2: Countdown, GO & Build Feedback Sounds
- [x] Task: Source Kenney CC0 one-shot assets (countdown beep, GO tone, place pop, remove sound, "nope" wobble) — add to `src/assets/sfx/` with license notes; extend `assets/manifest.ts` `SFX` map — c9a2c8c
- [x] Task: Write failing tests — countdown scheduler (3 rising beeps synced to `countdownRemaining` events + distinct GO), placement pop / removal sound / blocked-GO "nope" triggers — 7d0bdec
- [x] Task: Implement — wire countdown + GO into `race-presentation.ts` (countdown state events); wire pop/remove/nope into `main.ts` (placement result, remove-mode tap, disabled GO attempt) — ba6fca5
- [x] Task: Verify coverage ≥80%, tests + lint + typecheck green — ba6fca5
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Engine Hum, Music Loop & Victory Jingle
- [ ] Task: Add Kenney Background Music loop asset (OGG, within ~1.5 MB total budget) + license notes; extend manifest (`MUSIC` / `SFX` maps)
- [ ] Task: Write failing tests — hum lifecycle (starts at GO, fades in/out ~300–500ms, only while racing, silent on pause/quit/finish), music lifecycle (starts at race begin, continues through trophy + RACE AGAIN, stops on return to builder), jingle ducking (~40% reduction, swell back), backgrounding (pagehide stop, restore on return)
- [ ] Task: Implement — procedural engine hum (WebAudio oscillator blend + low-pass, single shared layer), music loop controller (fades, duck, visibility restore), victory jingle trigger with ducking
- [ ] Task: Wire into `race-presentation.ts` state machine (countdown→racing→finished, pause/resume/quit, race-again continuity) and `main.ts` `pagehide`/visibility handling
- [ ] Task: Verify coverage ≥80%, tests + lint + typecheck green
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Integration & Quality Gates
- [ ] Task: Verify new-audio size budget (≤ ~1.5 MB) and service-worker precache inclusion via `ASSET_URLS`; Playwright E2E smoke passes on production build
- [ ] Task: iOS audio-unlock check — first audio starts within user gesture; no audio before first tap; `resume()` on visibility return
- [ ] Task: Manual verification plan executed (dev server + on-device sound check: countdown, hum, music, jingle, mute, pause/backgrounding)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Release v0.3.0
- [ ] Task: Merge `feature/race-audio` to `master`
- [ ] Task: Bump version to 0.3.0, tag `v0.3.0`, push (release pipeline builds, publishes GHCR, deploys via Coolify webhook)
- [ ] Task: Verify deployed PWA serves new audio assets over HTTPS
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)