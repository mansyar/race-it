import { expect, type Page, test } from '@playwright/test';

/**
 * Session-resilience end-to-end: hiding the page must hold an in-flight race
 * behind the resume overlay, a bfcache restore must keep the scene alive and
 * interactive, and the game surface must suppress native gesture defaults.
 * Exercises the real main.ts wiring against the production build served by
 * vite preview.
 */

/** Starts the seeded demo-loop race and waits until the pause HUD is up. */
async function startRace(page: Page): Promise<void> {
  await expect(page.locator('button[data-action="go"]')).toBeEnabled({ timeout: 15_000 });
  // The valid GO button pulses forever; freeze the animation so the click
  // passes Playwright's stability check (same trick as smoke.spec).
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });
  await page.locator('button[data-action="go"]').click();
  const race = page.locator('button[data-action="race"]');
  await expect(race).toBeVisible({ timeout: 15_000 });
  await expect(race).toBeEnabled({ timeout: 15_000 });
  await race.click();
  await expect(page.locator('button[data-action="pause"]')).toBeVisible({ timeout: 15_000 });
}

/** Fakes a visibility flip; Chromium cannot background a tab mid-test. */
async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('hiding the page holds the running race until Resume', async ({ page }) => {
  await page.goto('/');
  await startRace(page);

  await setVisibility(page, 'hidden');

  // The hold shows the resume/quit overlay and hides the pause button.
  await expect(page.locator('.race-overlay')).toBeVisible();
  await expect(page.locator('button[data-action="pause"]')).toBeHidden();
  await expect(page.locator('.race-hud')).toBeVisible();

  // The race must stay frozen while hidden: the overlay only clears on Resume.
  await page.waitForTimeout(1000);
  await expect(page.locator('.race-overlay')).toBeVisible();

  // Coming back visible restores audio but keeps the hold; Resume continues.
  await setVisibility(page, 'visible');
  await expect(page.locator('.race-overlay')).toBeVisible();
  await page.locator('button[data-action="resume"]').click();
  await expect(page.locator('.race-overlay')).toBeHidden();
  await expect(page.locator('button[data-action="pause"]')).toBeVisible();
});

test('bfcache restore keeps the build scene alive and interactive', async ({ page }) => {
  const errors: string[] = [];
  // Pre-existing boot noise unrelated to lifecycle: Kenney GLBs reference a
  // colormap texture that ships without the kit; the models render fine.
  const isBootNoise = (text: string) => text.includes("THREE.GLTFLoader: Couldn't load texture");
  page.on('console', (message) => {
    if (message.type() === 'error' && !isBootNoise(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/');
  await expect(page.locator('button[data-action="go"]')).toBeEnabled({ timeout: 15_000 });

  // Synthetic bfcache round-trip: hide without teardown, then restore.
  await page.evaluate(() => {
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false }));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  });

  // The canvas survives and the build UI is untouched.
  await expect(page.locator('#app > canvas')).toBeVisible();
  await expect(page.locator('.build-bar')).toBeVisible();
  await expect(page.locator('button[data-action="go"]')).toBeEnabled();

  // Placing still works: select a piece and tap an empty board cell; the
  // placement enables Undo, which starts disabled. The seeded demo loop is a
  // ring, so a few taps just above the board center are safe empty cells.
  const undo = page.locator('button[data-action="undo"]');
  await expect(undo).toBeDisabled();
  await page.locator('button[data-piece="straight"]').click();
  const box = await page.locator('#app > canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  for (const offset of [40, 70, 0]) {
    await page.mouse.click(centerX, centerY - offset);
    if (await undo.isEnabled()) break;
  }
  await expect(undo).toBeEnabled();

  expect(errors).toEqual([]);
});

test('native gesture defaults are suppressed on the game surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.build-bar')).toBeVisible();

  const prevented = await page.evaluate(() => {
    const target = document.querySelector('#app > canvas');
    if (!target) throw new Error('canvas missing');
    const dispatch = (type: string) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    return { contextmenu: dispatch('contextmenu'), dblclick: dispatch('dblclick') };
  });

  // dispatchEvent returns false when a listener called preventDefault().
  expect(prevented.contextmenu).toBe(false);
  expect(prevented.dblclick).toBe(false);
});
