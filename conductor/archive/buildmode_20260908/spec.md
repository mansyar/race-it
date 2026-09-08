# Track: Core Track Building

## Overview
Implements the complete **build mode** of Race-It: a static-camera 3D toy-table diorama on which a child composes a racing circuit from grid pieces, with toddler-proof placement/rotation/removal, closed-loop validation gating the GO button, first-launch demo loop, and auto-save of valid tracks. Race execution, cars, and audio polish belong to later tracks — this track makes *building* delightful and bulletproof.

## Functional Requirements
1. **Diorama scene**: rounded wooden toy table with a faint etched 12×12 grid; fixed tilted camera (no user camera control, no drift in build mode); layout adapts to portrait and landscape with no scrolling/zooming.
2. **Palette & controls**: one bottom bar — 4 piece types (straight, curve, start line, finish line) + undo + remove-mode toggle; corner cluster: shelf button, mute toggle, clear-table (with confirm). All touch targets ≥ 64px, wordless icons only.
3. **Placement & editing**: tap palette piece → tap grid cell places it (raycast, faint cell highlight under finger); tapping a placed piece cycles its rotation in 90° steps; remove-mode toggle makes pieces wiggle red and tap-to-delete; undo reverses the last action (place/rotate/delete).
4. **Piece visuals**: Kenney Racing Kit GLBs used as-is (straight, curve), bright toy tinting; start = checkered straight with start lights; finish = checkered straight with banner; unlimited supply.
5. **Validation**: track is valid iff exactly one connected closed circuit exists that contains the start piece **and** the finish piece; unused/dangling pieces are allowed and ignored. GO button pulses only when valid.
6. **Persistence & first launch**: auto-save whenever the track transitions to valid (and on app background); first launch shows a pre-built valid demo loop that can be modified or cleared.
7. **Feedback**: immediate visual feedback on every interaction (wiggle on select, highlight on cell); simple UI click sounds from Kenney SFX bundles (full race/celebration audio is a later track).

## Non-Functional Requirements
- **Performance**: 60 fps on device floor (iPhone 11+, iPad 9th gen+, mid-range Android) with up to 150 placed pieces; documented draw-call and triangle budgets in the plan.
- **Offline-first**: all GLB/SFX assets precached by the service worker.
- **Quality**: TypeScript strict, > 80% unit-test coverage on logic modules (grid state, validation, undo, storage); lint-clean per conductor code style guides; public functions documented.
- **Compatibility**: iOS Safari 16+, Android Chrome 110+.

## Acceptance Criteria
1. A 3-year-old can build a valid loop using only taps (verified manually on real device).
2. GO activates only for a single closed circuit containing both start and finish (unit-tested: valid loops, open paths, two loops, missing start/finish, dangling branches).
3. Undo correctly reverts place, rotate, and delete actions (unit-tested).
4. Track auto-saves on becoming valid and persists across reload (unit + integration tested).
5. First launch renders the demo loop; clear-table empties it after confirm.
6. 60 fps maintained with 150 pieces on device floor (measured via dev tools profiling).
7. No text labels in the UI; all targets ≥ 64px; portrait and landscape both usable.

## Out of Scope (v1 / later tracks)
- Race engine, karts, countdown, camera drift, win celebrations (Track 2)
- Full shelf browsing UI with long-press delete (Track 3 — this track only implements the save mechanism + shelf button stub)
- Scenery decoration (trees, grandstands), drag-and-drop, zoom/pan, multi-lap, accounts/cloud, any backend
