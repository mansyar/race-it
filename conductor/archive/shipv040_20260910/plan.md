# Plan: Ship v0.4.0 — Release & Deploy

## Phase 1: Track Setup & Release Prep
- [x] Task: Create track artifacts and register this track in the Tracks Registry (commit: b930556)
- [x] Task: Confirm `master` contains Race Watchability Polish + PWA Install Experience and its CI is green (CI run 34524442239: success)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: f26a6ca]

## Phase 2: Version Bump & Full Gates
- [x] Task: Bump `package.json` version 0.3.0 → 0.4.0
- [x] Task: Run full gates — `pnpm lint` (0), `pnpm test -- --coverage` (448 passed, 97.17% stmts), `pnpm build` (0); Playwright via PR CI
- [x] Task: Commit `chore(release): Bump version to 0.4.0` (commit: 70b3cc4)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: 70b3cc4]

## Phase 3: Land on master
- [x] Task: Push `shipv040_20260910` and open a PR to `master` (PR #5)
- [x] Task: Merge the PR; confirm `master` version reads `0.4.0` (merge commit: d80f2c7)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: d80f2c7]

## Phase 4: Tag & Verify Release
- [x] Task: Tag `master` as `v0.4.0` and push the tag
- [x] Task: Verify release.yml green (run 34525054555); GHCR `:v0.4.0` + `:latest` (digest sha256:64e95c69…); GitHub Release v0.4.0 published; Coolify webhook step success
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: d80f2c7]

## Phase 5: Closeout
- [x] Task: Archive this track and update the Tracks Registry
- [ ] Task: Commit the closeout
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
