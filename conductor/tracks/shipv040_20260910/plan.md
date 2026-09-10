# Plan: Ship v0.4.0 — Release & Deploy

## Phase 1: Track Setup & Release Prep
- [ ] Task: Create track artifacts and register this track in the Tracks Registry
- [ ] Task: Confirm `master` contains Race Watchability Polish + PWA Install Experience and its CI is green
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Version Bump & Full Gates
- [ ] Task: Bump `package.json` version 0.3.0 → 0.4.0
- [ ] Task: Run full gates (Biome, unit + coverage, build, Playwright) — announce commands
- [ ] Task: Commit `chore(release): Bump version to 0.4.0`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Land on master
- [ ] Task: Push `shipv040_20260910` and open a PR to `master`
- [ ] Task: Merge the PR; confirm `master` version reads `0.4.0`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Tag & Verify Release
- [ ] Task: Tag `master` as `v0.4.0` and push the tag
- [ ] Task: Verify release.yml green; GHCR `:v0.4.0` + `:latest`; GitHub Release notes; Coolify webhook success
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Closeout
- [ ] Task: Archive this track and update the Tracks Registry
- [ ] Task: Commit the closeout
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
