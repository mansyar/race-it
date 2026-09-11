# Plan: Ship v0.5.0 — Release & Deploy

## Phase 1: Track Setup & Release Prep [checkpoint: ea5d1c5]
- [x] Task: Create track artifacts (`spec.md`, `plan.md`, `metadata.json`, `index.md`) and register this track in the Tracks Registry (commit: ea5d1c5)
- [x] Task: Verify `master` contains the four completed tracks (Post-Race Navigation, Session Resilience, Fair Start & Natural Motion, Adaptive Performance Guardrails) and that CI is green on current `master` (`1dead56`) (CI run 34598028037: success)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Public README
- [x] Task: Write root `README.md` per spec FR1–FR2 (game description, core loop, how to play, dev commands, offline/PWA notes, release/deploy summary, Kenney CC0 credits, both committed screenshots via relative paths) (commit: e4d9a3d)
- [x] Task: Verify README commands match `package.json` scripts and screenshot paths resolve to committed files (verified: all 9 documented commands match scripts; both screenshots and all 5 license paths exist)
- [x] Task: Commit `docs(readme): Add project README` (commit: e4d9a3d)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Version Bump & Full Gates
- [ ] Task: Bump `package.json` version 0.4.0 → 0.5.0
- [ ] Task: Run full gates — `pnpm lint`, `CI=true pnpm test -- --coverage`, `pnpm build`; Playwright via PR CI
- [ ] Task: Commit `chore(release): Bump version to 0.5.0`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Land on master
- [ ] Task: Push `shipv050_20260911` and open a PR to `master`
- [ ] Task: Merge the PR; confirm `master` reads `0.5.0` and the CI run is green
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Tag & Verify Release
- [ ] Task: Tag `master` as `v0.5.0` and push the tag
- [ ] Task: Verify `release.yml` green; GHCR `:v0.5.0` + `:latest`; GitHub Release `v0.5.0` published with grouped notes; Coolify webhook step success
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6: Closeout
- [ ] Task: Archive this track (`conductor/archive/shipv050_20260911/`) and update the Tracks Registry
- [ ] Task: Commit the closeout
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
