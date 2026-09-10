# Spec: Track Shelf — Save, Load & Long-Press Delete

## Overview
The shelf button in the build-mode corner cluster (currently a stub) opens a wordless, full-screen shelf overlay where kids save the current board as one of up to 12 saved tracks, load a saved track back onto the table with one tap, and (via long-press + confirm) delete saved tracks. Multi-track persistence lives in `localStorage` alongside the existing single-track auto-save, which remains untouched as the working-board safety net.

## Functional Requirements

### Storage (`src/grid/shelf-store.ts`, new)
- **FR1:** Shelf state persists as a JSON array under `race-it:shelf` in `localStorage` (key names finalized in plan); each entry: `{ id, createdAt, snapshot }` where `snapshot` reuses the existing validated `GridSnapshot` shape.
- **FR2:** `saveToShelf(grid)` appends a new entry (always append, no dedupe), capped at 12 entries; a save attempted when full is a wordless no-op that reports `full` to the caller for UI feedback.
- **FR3:** `loadShelf()` reads defensively using the same validation style as `track-store.ts`: corrupt/invalid entries are silently dropped at load time; any storage failure yields an empty shelf, never a throw.
- **FR4:** `deleteFromShelf(id)` removes the entry best-effort; storage failures never crash the game.
- **FR5:** The existing working-board auto-save (`race-it:track` via `track-store.ts`) is unchanged — loading from the shelf never loses the kid's last working board.

### Shelf overlay UI (`src/ui/shelf-overlay.ts`, new)
- **FR6:** Tapping the corner-cluster shelf button opens the overlay over the build scene; a single big close (✕) button returns to building; shelf is reachable in build mode only (hidden during countdown/race/trophy, consistent with current cluster behavior).
- **FR7:** The overlay renders 12 fixed slots; occupied slots show a **mini top-down schematic card** (2D glyph grid of straight/curve/start/finish pieces rendered from the snapshot on a small canvas); empty slots are dimmed.
- **FR8:** When the shelf is empty, dim slots pulse gently and the save action is highlighted — wordless invitation, no text.
- **FR9:** A prominent **save action** captures the current working board (valid or not — save anything); on success the new card pops in with the existing toy-bounce animation + a soft confirmation click via the audio director; when the shelf is full, the save action wiggles with red tint (same delete-mode language) and no entry is added.
- **FR10:** Tapping a saved card loads its snapshot onto the working board in one tap (no confirm), closes the overlay, and returns to build mode with the board re-rendered.
- **FR11:** **Long-press (~600ms) on an occupied card** wiggles it (deletable language), then requires a wordless confirm step (✓/✗) before deleting; ✕ cancels and the card returns to normal.
- **FR12:** Cards are ordered newest first; a saved card's position is stable within a session once inserted at the top.

### Wiring
- **FR13:** `corner-cluster.ts`'s existing `onShelf` callback is wired to open the overlay; the `shelf stub` behavior and its test note are removed.
- **FR14:** Successful save/load/delete produce audio feedback through the shared `audio-director` (existing one-shots only — no new assets).

## Non-Functional Requirements
- **NFR1:** Wordless UI — no text anywhere in the overlay (icons, color, motion only).
- **NFR2:** Touch targets ≥ ~64px for cards, save, and close.
- **NFR3:** Defensive storage — quota/private-mode failures never interrupt play.
- **NFR4:** Schematic rendering is cheap (2D canvas glyphs, no 3D offscreen render, no new assets).
- **NFR5:** Overlay layout adapts to portrait & landscape, phone & iPad, always fitting the screen.

## Acceptance Criteria
1. Save → close app → reopen → shelf still shows the saved track (localStorage persistence).
2. Save 12 tracks → 13th save attempt wiggles red, adds nothing, game continues normally.
3. Load a card → board matches the schematic exactly (including rotations); previous board still in auto-save.
4. Long-press → wiggle → confirm ✓ deletes the card; ✗ cancels with no change.
5. Corrupt `race-it:shelf` entry in devtools → shelf loads the healthy entries, no crash, no console errors.
6. Empty shelf → dim slots pulse, save action highlighted; all interactions work with zero text.
7. Shelf button does nothing harmful during race states (hidden, as today).

## Out of Scope
- Renaming/editing saved tracks, reordering by drag, shelf export/import/share, saving mid-race boards, cloud sync, slot-based overwrite saving, 3D thumbnails.
