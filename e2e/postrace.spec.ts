import { expect, test } from '@playwright/test';

/**
 * Post-race navigation end-to-end: after the race finishes and the trophy is
 * up, Build Again must return to the builder with the same track intact and GO
 * still enabled — no reload, no lost board.
 */
test('finish a race, tap Build Again, and return to the builder', async ({ page }) => {
  // Countdown + one lap + every kart finishing takes ~45s of wall time.
  test.setTimeout(150_000);

  await page.goto('/?debug');

  const go = page.locator('button[data-action="go"]');
  await expect(go).toBeEnabled({ timeout: 15_000 });

  // Snapshot the seeded demo-loop board so we can prove it survives the trip.
  const pieceCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { __raceItDebug: { pieces: () => unknown[] } }).__raceItDebug.pieces()
          .length,
    );
  // Pieces load asynchronously after boot; wait for the board to fill in.
  await expect.poll(pieceCount, { timeout: 15_000 }).toBeGreaterThan(0);
  const pieceCountBefore = await pieceCount();

  // The valid GO button pulses forever; freeze the animation so the click
  // passes Playwright's stability check (same trick as smoke.spec).
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });

  // Start the race from the default lineup.
  await go.click();
  const race = page.locator('button[data-action="race"]');
  await expect(race).toBeEnabled({ timeout: 15_000 });
  await race.click();

  // The trophy only appears once every kart has crossed the finish line.
  const buildAgain = page.locator('button[data-action="build-again"]');
  await expect(buildAgain).toBeVisible({ timeout: 100_000 });

  await buildAgain.click();

  // Back in the builder: trophy dismissed, build bar restored, GO enabled on
  // the same board.
  await expect(buildAgain).toBeHidden();
  await expect(page.locator('.build-bar')).toBeVisible();
  await expect(go).toBeEnabled();

  const pieceCountAfter = await pieceCount();
  expect(pieceCountAfter).toBe(pieceCountBefore);
});
