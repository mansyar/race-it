import { expect, test } from '@playwright/test';

/**
 * Shelf end-to-end: the corner-cluster shelf button must open the wordless
 * overlay, save the current board, persist it across a reload, and load it
 * back — with long-press delete. Exercises the real main.ts wiring against
 * the production build served by vite preview.
 */
test('open shelf, save, persist across reload, load, delete', async ({ page }) => {
  await page.goto('/');

  // The build scene must be up (seeded demo loop) before touching the shelf.
  await expect(page.locator('button[data-action="go"]')).toBeEnabled({ timeout: 15_000 });

  // Shelf button opens the wordless overlay.
  await page.locator('button[data-action="shelf"]').click();
  const overlay = page.locator('.shelf-overlay');
  await expect(overlay).toBeVisible();

  // The save action pulses when the shelf is empty; freeze the animation so
  // the click can land (same trick as the pulsing GO button in smoke.spec).
  await page.addStyleTag({ content: '.shelf-save.pulsing { animation: none; }' });

  // Saving pops in the newest card (demo loop board is valid or not — both ok).
  await page.locator('button[data-action="save"]').click();
  const card = page.locator('.shelf-slot.occupied').first();
  await expect(card).toBeVisible();

  // The board auto-save is untouched by shelf saves: reloading brings the
  // working board back, and the shelf still holds the saved entry.
  await page.reload();
  await expect(page.locator('button[data-action="go"]')).toBeEnabled({ timeout: 15_000 });
  await page.locator('button[data-action="shelf"]').click();
  await expect(overlay).toBeVisible();
  await expect(page.locator('.shelf-slot.occupied')).toHaveCount(1);

  // One-tap load: closes the overlay, returns to the build scene.
  await card.click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('button[data-action="go"]')).toBeVisible();

  // Long-press (~600ms) arms delete; the wordless confirm (✓) removes the card.
  await page.locator('button[data-action="shelf"]').click();
  const slot = page.locator('.shelf-slot.occupied').first();
  await expect(slot).toBeVisible();
  await slot.locator('.slot-card').dispatchEvent('pointerdown');
  await page.waitForTimeout(800);
  await expect(slot.locator('.slot-confirm [data-confirm="yes"]')).toBeVisible();
  await slot.locator('.slot-confirm [data-confirm="yes"]').click();
  await expect(page.locator('.shelf-slot.occupied')).toHaveCount(0);
  await expect(page.locator('.shelf-slot.empty').first()).toBeVisible();
});
