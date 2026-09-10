import { expect, test } from '@playwright/test';

/**
 * Regression guard for the landscape-phone picker (found in the race-physics
 * Phase 5 verification): `.car-picker` is a fixed, vertically-centered flex
 * column, so on short viewports the RACE button used to be clipped below the
 * fold and unclickable. The compact max-height rules keep it fully in view.
 */
test('starts a race from the car picker in a landscape phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('.build-bar')).toBeVisible();

  const go = page.locator('button[data-action="go"]');
  await expect(go).toBeEnabled({ timeout: 15_000 });
  // Freeze the pulsing hint so the click target is stable.
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });
  await go.click();

  const race = page.locator('button[data-action="race"]');
  await expect(race).toBeVisible({ timeout: 15_000 });
  await expect(race).toBeEnabled({ timeout: 15_000 });
  await expect(race).toBeInViewport();
  await race.click({ timeout: 15_000 });

  await expect(page.locator('button[data-action="pause"]')).toBeVisible({ timeout: 15_000 });
});
