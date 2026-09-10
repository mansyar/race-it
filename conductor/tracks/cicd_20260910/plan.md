# Implementation Plan — CI/CD Pipeline & Containerized Deployment

**Track ID:** `cicd_20260910` · **Type:** Chore · **Spec:** [spec.md](./spec.md)

**TDD mandatory:** where testable (E2E smoke), implementation starts with failing tests (Red), confirmed failing, then minimal config (Green). Phase checkpoints per `workflow.md`.

**Dev commands:** `pnpm install` · `$env:CI='true'; pnpm test` · `$env:CI='true'; pnpm test -- --coverage` (target >80%) · `pnpm lint` (Biome) · `pnpm build` · `pnpm exec playwright test`

## Phase 1 — Toolchain Pins & Stack Documentation [checkpoint: 0d46ada]

- [x] Task 1.1: Document CI/CD stack in `conductor/tech-stack.md` — GitHub Actions, Docker multi-stage (node:24-alpine → nginx:alpine), GHCR public registry, Playwright E2E, pins Node 24.16.0 / pnpm 12.3.4 (per workflow: tech-stack changes documented *before* implementation) `(f82228e)`
- [x] Task 1.2: Add `.nvmrc` (24.16.0) + `"packageManager": "pnpm@12.3.4"` in `package.json`; verify `pnpm install` still resolves cleanly `(0d46ada)`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2 — Playwright E2E Smoke Suite (TDD) [checkpoint: d14bbb7]

- [x] Task 2.1: Add `@playwright/test` (exact pin) + `playwright.config.ts` (chromium only, `vite preview` webServer). **Red:** write `e2e/smoke.spec.ts` — app boots, build UI renders, demo loop seeds → GO enabled, GO click → race reaches `running` (pause button visible). Confirm failing locally `(ab238d2)`
- [x] Task 2.2: **Green:** install chromium, run suite locally, confirm passes; commit `test(e2e): add boot-and-race smoke suite` `(d14bbb7)`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3 — CI Workflow (push & PR checks) [checkpoint: 6f42e53]

- [x] Task 3.1: `.github/workflows/ci.yml` — 4 parallel jobs, fail-fast: **check** (Biome lint+format) · **unit** (Vitest + coverage ≥80% gate) · **build** (`tsc --noEmit && vite build`, upload dist artifact) · **e2e** (download artifact, Playwright). pnpm store cache + Playwright browser cache; concurrency cancel-in-progress `(913527b)`
- [x] Task 3.2: Push branch, verify CI green on GitHub (all 4 jobs) `(6f42e53)`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4 — Docker Image & Release Pipeline [checkpoint: 5973368]

- [x] Task 4.1: `Dockerfile` (node:24-alpine build stage → nginx:alpine; nginx.conf: SPA fallback + PWA-friendly cache headers) + `.dockerignore` `(8c587b6)`
- [x] Task 4.2: Local verification — `docker build`, run container, curl smoke (if Docker available locally) `(2baedc9)`
- [x] Task 4.3: `.github/workflows/release.yml` — on `v*` tags: build → build-push-action → `ghcr.io/mansyar/race-it:vX.Y.Z` + `:latest` (public) → POST deploy webhook with `Authorization: Bearer $COOLIFY_API_TOKEN` (`$COOLIFY_DEPLOY_WEBHOOK`); deploy runs serialized `(5973368)`
- [x] Task 4.4: GitHub Release step — generate notes from `git log` between previous tag and new tag (first release: all commits), group by conventional-commit type (`feat`/`fix`/`chore`/`docs`/`test`/`refactor`/`style`) into a notes file; publish via `gh release create` (GITHUB_TOKEN). Notes stay on GitHub — not attached to the Coolify deploy `(5973368)`
- [x] Task 4.5: User adds 2 repo secrets (`COOLIFY_DEPLOY_WEBHOOK`, `COOLIFY_API_TOKEN`); verify via `gh secret list` `(secrets set 2026-09-10)`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5 — End-to-End Pipeline Verification [checkpoint: 9a9558c]

- [x] Task 5.1: Merge branch to `master`; bump `package.json` to 0.2.0; tag `v0.2.0` and push → release workflow runs: GHCR image published (both tags), GitHub Release published with type-grouped notes, Coolify deploy triggered via authenticated webhook `(9a9558c)`
- [x] Task 5.2: Verify deployed PWA at Coolify URL (SW registered, offline boots, race runs); confirm efficiency — second pipeline run hits caches (no full reinstall) `(deploy verified 2026-09-10)`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)