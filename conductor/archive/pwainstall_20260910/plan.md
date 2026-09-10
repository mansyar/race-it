# PWA Install Experience — Implementation Plan

## Phase 1: Manifest Polish & Install Identity (FR1) [checkpoint: 095b744]
- [x] Task: Write failing unit test validating the manifest contract (`id: '/'`, `display: 'standalone'`, `lang`, `categories`, icons & theme colors unchanged, parent-warm description) against `vite.config.ts` (1992a34)
- [x] Task: Implement manifest changes in `vite.config.ts`; confirm `vite build` emits the corrected `manifest.webmanifest` (095b744)
- [x] Task: Verify coverage ≥80% on new test, `pnpm test` + Biome + `tsc --noEmit` green; commit (095b744)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: iOS Splash Screens (FR2) [checkpoint: 753315c]
- [x] Task: Add splash generation (build-time script extending `pwa-assets.config.ts` pipeline) + `apple-touch-startup-image` media-query links for device-floor iPhone/iPad, portrait & landscape, toy-cream background (753315c)
- [x] Task: Write failing tests — `index.html` contains startup-image links for required device classes; sizes/background validated (753315c)
- [x] Task: Implement generation + links; keep added PNG weight ≤ ~1 MB; precache via workbox glob (753315c)
- [x] Task: Verify coverage ≥80%, tests + lint + typecheck green; commit (753315c)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Android Rich Install Screenshots (FR3) [checkpoint: 25e667e]
- [x] Task: Write failing test — manifest `screenshots` entries valid (`form_factor`, sizes within Chrome bounds, `platform: 'web'`) [9c82c85]
- [x] Task: Implement build-time screenshot generation from real in-app scenes; wire into manifest config [25e667e]
- [x] Task: Verify coverage ≥80%, tests + lint + typecheck green; commit [25e667e]
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [25e667e]

## Phase 4: Install Hint UI (FR4) [checkpoint: 8560c76]
- [x] Task: Write failing tests — install-context detector (iOS Safari only, not standalone/installed, not dismissed); pill renders on build screen only, hidden in race/countdown/trophy; expand shows wordless step guide; X dismiss persists to `localStorage`; ≥64px targets; zero render on Android/desktop [8560c76]
- [x] Task: Implement `src/ui/install-hint.ts` + `src/ui/install-context.ts`; wire into `main.ts` build screen [8560c76]
- [x] Task: Verify coverage ≥80% on new modules, tests + lint + typecheck green; commit [8560c76]
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: CI Installability Gate (FR5) [checkpoint: 8da4c29]
- [x] Task: Add installability gate to CI: Chrome CDP check (`Page.getInstallabilityErrors`) as `e2e/installability.spec.ts`, run by the existing e2e job (deviation: Lighthouse ≥12 removed the `installable-manifest`/`service-worker` audits; user-approved switch to Chrome's own A2HS criteria) [8da4c29]
- [x] Task: Locally prove gate catches a broken manifest (temporary breakage → red → revert → green) [8da4c29]
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6: Integration & Quality Gates [checkpoint: bceea19]
- [x] Task: Full gates green — `pnpm test` (+coverage ≥80%), Biome, `tsc --noEmit && vite build`, Playwright E2E smoke on production build [bceea19]
- [x] Task: On-device verification executed — iOS Safari A2HS (icon, standalone, no white flash, hint behavior) + Android Chrome (rich sheet, standalone, no hint UI) [bceea19]
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 7: Merge to master (no tag) [checkpoint: c11b3af]
- [x] Task: Merge `feature/pwa-install` to `master` (merge-only per decision - no version tag; deployment to Coolify deferred to the next tagged release) [c11b3af]
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

> **Note on Phase 7:** since we merge without tagging, the Coolify deploy won't trigger — on-device verification in Phase 6 uses `vite preview` production build locally. The live HTTPS verification folds into the next tagged release.
