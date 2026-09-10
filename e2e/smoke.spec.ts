import { expect, test } from '@playwright/test';

/** Boot-and-race smoke: the production build must start a race from the seeded demo loop. */
test('boot, seed demo loop, and start a race', async ({ page }) => {
  await page.goto('/');

  // Build UI renders: wordless palette bar with the four piece buttons.
  await expect(page.locator('.build-bar')).toBeVisible();
  await expect(page.locator('button[data-piece="straight"]')).toBeVisible();

  // First launch seeds the demo loop (valid closed circuit) -> GO enables.
  const go = page.locator('button[data-action="go"]');
  await expect(go).toBeEnabled({ timeout: 15_000 });

  // The valid GO button pulses forever; freeze the animation so the click
  // passes Playwright's stability check.
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });

  // Start the race: after the countdown the pause HUD appears (state 'running').
  await go.click();
  await expect(page.locator('button[data-action="pause"]')).toBeVisible({ timeout: 15_000 });
});
