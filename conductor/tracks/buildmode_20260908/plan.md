# Implementation Plan — Core Track Building

**Track ID:** buildmode_20260908 · **Type:** MVP feature · **Spec:** [./spec.md](./spec.md)

> TDD is mandatory (see `conductor/workflow.md`): Red (failing tests first) → Green (minimum code to pass) → optional Refactor. Quality gates apply to every task.

## Development Commands (adapted to project tooling)

```bash
pnpm install                 # setup
pnpm dev                     # start dev server
CI=true pnpm test            # run test suite once (vitest)
CI=true pnpm test -- --coverage   # coverage report (target >80%)
pnpm lint                    # biome check (CI=true where applicable)
pnpm build                   # production build
```

## Phases

### Phase 1 — Project Scaffolding & Foundations [checkpoint: 7105913]

- [x] Task 1.1: Scaffold Vite 8 + TypeScript strict + pnpm project; Biome config aligned to `conductor/code_styleguides/` (single quotes, semicolons, named exports only, no `any`); Vitest wired with coverage. **TDD:** smoke test first (Red → Green). (ff2aa8b)
- [x] Task 1.2: Import Kenney Racing Kit GLBs (straight, curve) + SFX into `src/assets`; verify Vite import pipeline. *(manual verification)* (77fab30)
- [x] Task 1.3: PWA setup — vite-plugin-pwa manifest, generated icons, offline precache of all assets. *(manual verification)* (84de083)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

### Phase 2 — Grid State & Track Logic (pure TDD, no rendering)

- [ ] Task 2.1: Grid model — 12×12 cell state, piece types (straight/curve/start/finish), 4 orientations. **TDD:** Red → Green.
- [ ] Task 2.2: Edit operations — place, rotate 90° steps, delete, undo history. **TDD:** Red → Green.
- [ ] Task 2.3: Loop validation — valid iff exactly one connected closed circuit containing start AND finish; dangling/unused pieces ignored; rejects open paths, two loops, missing start/finish. **TDD:** Red → Green.
- [ ] Task 2.4: Persistence — localStorage auto-save on transition-to-valid, load, first-launch demo loop seed. **TDD:** Red → Green.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

### Phase 3 — 3D Diorama Rendering

- [ ] Task 3.1: Three.js scene — wooden table, faint etched 12×12 grid, fixed tilted camera, responsive portrait/landscape layout. *(camera/layout math unit-tested; rendering verified manually)*
- [ ] Task 3.2: GLB piece meshes rendered from grid state; bright toy tinting; checkered detail on start/finish.
- [ ] Task 3.3: Raycast interaction — cell highlight under finger; tap-place, tap-rotate, remove-mode delete wired to grid store. *(picking math unit-tested; touch verified manually)*
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

### Phase 4 — Build UI & Integration

- [ ] Task 4.1: Bottom bar — 4 piece buttons + undo + remove toggle (≥64px targets, wordless icons); corner cluster — shelf stub, mute, clear-table with confirm.
- [ ] Task 4.2: GO button — disabled by default, pulsing when track valid (state-driven, unit-tested).
- [ ] Task 4.3: Integration — demo loop on first launch, auto-save wiring, UI click sounds, mute toggle.
- [ ] Task 4.4: Performance pass — 60 fps with 150 pieces on device floor; document draw-call and triangle budgets here. *(measured, manual verification)*
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
