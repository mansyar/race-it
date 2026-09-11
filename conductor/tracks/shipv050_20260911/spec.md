# Spec: Ship v0.5.0 — Release & Deploy

## Overview
Four completed tracks — Post-Race Navigation, Session Resilience (Toddler-Proofing & Lifecycle Hardening), Fair Start & Natural Motion, and Adaptive Performance Guardrails — have been merged to `master` but never released (111 commits past the `v0.4.0` tag). This track owns the remaining release engineering: add the missing public `README.md`, bump the app version, land on `master`, tag `v0.5.0`, and verify the release pipeline produces the versioned container image, publishes the GitHub Release, and triggers the Coolify deployment.

## Functional Requirements

### Public README
- **FR1:** Add a root `README.md` covering: what Race-It is (wordless 3D racing PWA for ages 3–5), the core Build → Pick → Race → Celebrate loop, how to play (tap-to-place/rotate, GO), tech stack summary, developer commands (`pnpm install`, `dev`, `test`, `lint`, `build`, Playwright), offline/PWA notes, release/deploy summary (GHCR + Coolify), and Kenney CC0 asset credits referencing the existing in-repo license files.
- **FR2:** README embeds the two committed screenshots (`public/screenshots/scene-wide-1180x820.png`, `public/screenshots/scene-narrow-390x844.png`) via valid relative paths.

### Version & tag
- **FR3:** `package.json` version moves from `0.4.0` to `0.5.0`; no other dependency, lockfile, or source change is part of this track.
- **FR4:** `master` is tagged `v0.5.0` and the tag is pushed, triggering `.github/workflows/release.yml`.

### Release pipeline
- **FR5:** The `v0.5.0` release run builds the app, pushes `ghcr.io/mansyar/race-it:v0.5.0` and `:latest`, publishes a GitHub Release with grouped conventional-commit notes, and triggers the Coolify deploy webhook.
- **FR6:** The release is recorded in the Tracks Registry and this track is archived when complete.

## Non-Functional Requirements
- **NFR1:** Release-only change set — apart from the README, no application behavior, UI, or asset changes.
- **NFR2:** Full quality gates pass on the release commit (Biome, unit tests + ≥80% coverage, `tsc --noEmit` + Vite build, Playwright).
- **NFR3:** "Deploy verified" means: release workflow green, GHCR image tags present, GitHub Release published, Coolify webhook step accepted. No live-site check (no deployment URL is configured).
- **NFR4:** The known `autoUpdate` reload-on-deploy behavior is accepted for this release; remediation is deferred to a separate follow-up track.
- **NFR5:** README images resolve correctly on GitHub (relative paths to committed files).

## Acceptance Criteria
1. Root `README.md` exists with accurate content and both screenshots rendering.
2. `master` at tag `v0.5.0` has `package.json` version `0.5.0`.
3. The `release.yml` run for `v0.5.0` completes successfully end-to-end.
4. GHCR shows `:v0.5.0` and `:latest` images built from the tag commit.
5. GitHub Release `v0.5.0` exists with grouped conventional-commit notes.
6. The Coolify webhook step exits successfully (deploy triggered).
7. This track is archived and the registry reflects it.

## Out of Scope
- Any gameplay, rendering, UI, or audio change; the in-flight Photo-Finish Drama track.
- PWA update-flow fix (deferred follow-up track), live-site smoke verification, on-device checks, rollback automation, staging environment.
- `CHANGELOG.md`, project source LICENSE, branch/worktree cleanup, npm/store publishing.
- Screenshot regeneration (existing committed screenshots are used as-is).
