# Spec: CI/CD Pipeline & Containerized Deployment

**Track ID:** `cicd_20260910` · **Type:** Chore

## Overview

Stand up an efficient, reproducible CI/CD pipeline for Race-It: GitHub Actions runs full quality gates on every push/PR, and version tags (`v*`) produce a Docker image published to GHCR (public) and deployed to the user's Coolify instance via an authenticated deploy webhook.

## Context

- Repo `mansyar/race-it` (public, default branch `master`) — created; no CI/CD exists yet
- Race-It is a static PWA (Vite build → `dist/`); container = nginx serving the bundle
- Toolchain: Node **24.16.0** (`.nvmrc`), pnpm **12.3.4**, Vite 8, Vitest 5, Biome 2.5, Playwright (new)

## Functional Requirements

### FR1 — CI workflow (push & PR)

- FR1.1 Type-check + production build (`tsc --noEmit && vite build`)
- FR1.2 Biome lint + format check — violations fail the run
- FR1.3 Vitest unit suite with coverage gate ≥ **80%**
- FR1.4 Playwright E2E smoke on the built artifact: app boots, demo loop seeds, pieces render, GO enables, race reaches `running` state

### FR2 — Release workflow (`v*` semver tags)

- FR2.1 Multi-stage Docker build (node:24-alpine build → nginx:alpine serve) → push `ghcr.io/mansyar/race-it:vX.Y.Z` **and** `:latest` (public — no registry credential needed in Coolify)
- FR2.2 Trigger Coolify deployment via deploy webhook: `POST $COOLIFY_DEPLOY_WEBHOOK` with header `Authorization: Bearer $COOLIFY_API_TOKEN`
- FR2.3 Deploy runs serialized (no concurrent releases)
- FR2.4 Publish a GitHub Release with auto-generated notes: commits between the previous tag and the new tag, grouped by conventional-commit type (`feat`/`fix`/`chore`/`docs`/`test`/`refactor`/`style`); first release covers all commits since the beginning. Notes live on GitHub only — not attached to the Coolify deploy

### FR3 — Pipeline efficiency

- FR3.1 pnpm store + Playwright browser caching across runs
- FR3.2 Build artifact uploaded once, reused by E2E and release jobs
- FR3.3 Independent gates (lint / unit / build) run concurrently, `fail-fast`
- FR3.4 Docker layer caching (build-push-action)
- FR3.5 Concurrency: cancel superseded PR/push runs; serialize deploy runs

### FR4 — Pins & secrets

- FR4.1 `.nvmrc` (24.16.0), `packageManager` field (pnpm@12.3.4), exact toolchain pins
- FR4.2 Repo secrets (user provides values): `COOLIFY_DEPLOY_WEBHOOK`, `COOLIFY_API_TOKEN` (Bearer)

## Non-Functional Requirements

- **NFR1 Reproducible:** lockfile committed, exact pins, no floating versions
- **NFR2 Runtime:** nginx config with SPA fallback + PWA-friendly caching headers (hashed assets immutable)
- **NFR3 Fails closed:** coverage/biome/E2E failure blocks the run; deploys only from tags
- **NFR4 Lean image:** nginx:alpine, minimal surface

## Acceptance Criteria

- AC1: Push to any branch runs all 4 gate jobs; green on `master`
- AC2: Coverage <80% fails the run
- AC3: Tagging `vX.Y.Z` publishes image to GHCR with both tags
- AC4: Coolify deploy triggered via authenticated webhook (Bearer token)
- AC5: Deployed PWA loads and registers its service worker under Coolify URL
- AC6: Second pipeline run is measurably faster (cache hits — no full reinstall)
- AC7: Tagging `vX.Y.Z` creates a GitHub Release with auto-generated notes grouped by commit type

## Out of Scope

- Branch protection rules, staging environment, rollback automation, notifications
- Coolify app creation/config (done in Coolify dashboard), mobile device test farm
- Coolify deployment status polling/verification