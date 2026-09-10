# Spec: Ship v0.4.0 — Release & Deploy

## Overview
Race-It's next feature set — Race Watchability Polish and the PWA Install Experience — has already been integrated into `master` (PRs #3 and #4 merged; the `pwainstall` track archived). This track owns the remaining release engineering: bump the app version, tag `v0.4.0`, and verify that the release pipeline produces the versioned container image, publishes the GitHub Release, and triggers the Coolify deployment.

## Functional Requirements

### Version & tag
- **FR1:** `package.json` version moves from `0.3.0` to `0.4.0`; no other dependency, lockfile, or source change is part of this track.
- **FR2:** `master` is tagged `v0.4.0` and the tag is pushed, triggering `.github/workflows/release.yml`.

### Release pipeline
- **FR3:** The `v0.4.0` release run builds the app, pushes `ghcr.io/mansyar/race-it:v0.4.0` and `:latest`, publishes a GitHub Release with conventional-commit notes, and triggers the Coolify deploy webhook.
- **FR4:** The release is recorded in the Tracks Registry and this track is archived when complete.

## Non-Functional Requirements
- **NFR1:** Release-only change set — no application behavior, UI, or asset changes.
- **NFR2:** Full quality gates pass on the release commit (Biome, unit tests + ≥80% coverage, `tsc --noEmit` + Vite build, Playwright).
- **NFR3:** "Deploy verified" means: release workflow green, GHCR image tags present, GitHub Release published, Coolify webhook step accepted. No live-site check (no deployment URL is configured).
- **NFR4:** On-device install checks are out of scope (already recorded as executed in the PWA track).

## Acceptance Criteria
1. `master` at tag `v0.4.0` has `package.json` version `0.4.0`.
2. The `release.yml` run for `v0.4.0` completes successfully end-to-end.
3. GHCR shows `:v0.4.0` and `:latest` images built from the tag commit.
4. GitHub Release `v0.4.0` exists with grouped conventional-commit notes.
5. The Coolify webhook step exits successfully (deploy triggered).
6. This track is archived and the registry reflects it.

## Out of Scope
- Any gameplay, rendering, UI, or audio change.
- Post-race navigation / Build-Again work (separate active track).
- Live-site smoke verification, rollback automation, staging environment.
- Branch/worktree cleanup and npm/store publishing.
