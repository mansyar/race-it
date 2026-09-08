# Race-It — Product Guidelines

## Design Philosophy
**A toy, not an app.** Every screen should feel like playing with a physical toy race set on a table. Delight, immediacy, and zero friction — a child should never need an adult to play.

## UX Principles
1. **Wordless UI** — no text anywhere a child must read. Communication happens through icons, colors, animations, and sound. (The only text allowed: the winner's color word on the trophy screen, always paired with a large color icon.)
2. **Big touch targets** — minimum ~64px touch targets everywhere; palettes and buttons sized for imprecise small fingers.
3. **One action per screen state** — build mode: place pieces; race mode: watch. Never mix competing interactions.
4. **Toddler-proof** — accidental taps during a race do nothing except the clearly separated pause button; destructive actions (delete track, quit race) always require a long-press or a confirm step.
5. **Instant restartability** — from any state, getting back to play is one tap. RACE AGAIN is always the biggest button.
6. **No failure states** — a kid can't "lose". Track building always permits fixing (rotate/remove); every race produces a happy winner.
7. **Fairness is the game** — races must be close and winnable by any color. Photo-finishes are the desired outcome, not a bug.

## Visual & Art Direction
- **Style:** chunky low-poly toy diorama (Kenney Racing Kit / Car Kit aesthetic), bright saturated colors, soft shadows, clean top-lit "play table" lighting.
- **Setting:** track on a rounded wooden table with visible edges; the table is the world.
- **Cars:** friendly karts in highly distinguishable primary colors (red, blue, green, yellow).
- **Motion:** exaggerated, bouncy, toy-like animation (wiggling palette pieces, victory spins, confetti). Motion communicates state — selected pieces wiggle, the GO button pulses when the track is valid.
- **Feedback:** every touch produces immediate visual + audio feedback. Nothing feels dead.

## Audio Direction
- Cheerful, warm, never harsh: countdown beeps, soft engine hum, victory jingle, one upbeat playful loop.
- Volume-safe defaults (never max volume); mute toggle always reachable in a corner.
- Sound reinforces meaning (e.g., rising countdown pitch, fanfare = winner).

## Voice & Tone (any text that does appear: store listing, errors, settings)
- Warm, playful, encouraging — speak to both the child ("You built a loop!") and the parent ("Track saved").
- Short sentences. No jargon. No dark patterns, no ads, no nagging.

## Quality Bars
- 60 fps target on device floor (iPhone 11+, iPad 9th gen+, mid-range Android); graceful degradation acceptable below.
- Measured build-mode budgets (full 12x12 board, 144 pieces): ~542 draw calls, ~21,756 triangles - large headroom on device floor (headless run ~240 fps uncapped). Fallback if on-device fps < 60: batch tile types into InstancedMesh.
- Offline-first: after first load, the app must work with zero connectivity.
- Responsive layout for portrait & landscape, phone & tablet.
