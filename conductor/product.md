# Race-It — Product Definition

## Summary
A preschool-friendly 3D racing PWA (ages 3–5) where kids build a toy-table race track from big grid tiles — straights, curves, start and finish lines — tap GO, and watch 2–4 colorful kart racers battle automatically to a photo-finish. Built with Three.js and Kenney CC0 assets as a fixed-camera diorama; installable and fully offline; wordless, icon-only UI with an auto-saved track shelf, traffic-light countdown, a race camera that follows the lead battle, and a confetti trophy celebration.

## Target Audience
Preschoolers ages 3–5 (with a parent installing/curating). No reading ability assumed; developing motor skills.

## Core Loop
**Build → Pick cars → Countdown → Race → Celebrate → Race again / Build again**

## Key Features

### Track Building (Diorama Mode)
- 3D toy-table diorama: track sits on a rounded, wood-edged table; fixed tilted camera.
- Grid-based board that always fits the screen — portrait & landscape, phone & iPad. No scrolling or zooming.
- Interaction: tap a piece from the bottom palette (straight, curve, start line, finish line), then tap a grid cell to place (raycast onto the table). Tap a placed piece to rotate; dedicated remove/long-press mode to delete.
- Closed-loop validation gates the GO button; wordless pulsing-gap hints show what's missing.
- Auto-save shelf on device; long-press a saved track to delete.
- Auto scenery (trees, grandstands, barriers) on empty non-adjacent cells so the table feels like a physical toy set; never blocks placing track.
- Toy micro-feedback: pieces pop in when placed; remove mode wiggles pieces with a red tint; soft contact shadow and chunky wood rim under the board.

### The Race
- Kid taps 2–4 cars to enter and picks each car's color from big swatches (defaults work with one tap).
- Traffic-light countdown (3… 2… 1… GO!) with sound; racing is fully automatic — kid is a pure spectator.
- Race outcomes: randomized per-race speeds, tuned so races are always close with frequent photo-finishes; any color can win from any start slot (grid distances are normalized).
- Toy-like motion: cars launch from a standstill at GO, lean and slow through corners, bob on their suspension, and roll out past the line before the victory spin — pure spectacle, never affecting fairness.
- Camera: fixed diorama angle while building → pack-fitting follow of the lead battle that holds close through the finish.
- One lap: first car to cross the start/finish line (F1-style — the start line doubles as the finish line; the finish piece is a decorative banner) wins; race length ~30–45 seconds.
- Mid-race pause button → Resume / Quit-to-builder (with a confirm step).
- Finish: confetti burst, winning car victory spin, giant "🏆 [COLOR] WINS!" (color word + icon), one huge RACE AGAIN button.
- Photo-finish drama: when the finish is close, the final stretch dips into a brief slow-motion with one soft screen flash, a crowd cheer at the crossing, and a gentle camera push before the celebration — ordinary finishes are unchanged.

### Audio
- CC0 sounds: Kenney countdown beeps, engine hum, victory jingle, one upbeat playful music loop, plus a Freesound crowd-cheer one-shot for photo finishes.
- Corner mute button.

## Non-Functional Requirements
- **Platform:** Installable PWA; works fully offline; all data stays on device (local storage, no accounts/cloud/ads).
- **Device floor:** Hardware from the last ~5 years (iPhone 11+, iPad 9th gen+, mid-range Android).
- **Performance:** 60 fps target on the device floor with automatic graceful degradation — the game lowers render quality (pixel-ratio cap, then batched instanced tiles) when frame rate drops and recovers when it improves; no settings or user action needed.
- **UI:** Wordless, icon-only; large touch targets; toddler-proof against accidental exits.
- **Hosting:** Customer's own server, served over HTTPS (required for PWA install); static bundle deployment.
- **Assets:** Kenney Racing Kit (track pieces/scenery), Kenney Car Kit (karts), Kenney audio packs plus one CC0 crowd-cheer one-shot (Freesound) — all CC0.

## Out of Scope (v1)
Player-controlled cars, lap counts > 1, camera zoom/pan, drag-and-drop placement, fixed car personalities, user profiles/cloud sync, text-based UI.
