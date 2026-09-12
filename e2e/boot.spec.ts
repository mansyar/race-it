import { expect, test } from '@playwright/test';

/**
 * Boot readiness E2E: the table fills in stages and GO only wakes once the
 * critical assets (pieces + karts) are ready. Loading is held or failed at
 * the network layer so the sleeping and retry cues are deterministic.
 */

test('GO sleeps while critical assets load, then wakes and starts the race', async ({ page }) => {
  // Hold every model response so the sleeping cue is observable.
  const held: Array<() => void> = [];
  let holding = true;
  await page.route('**/*.glb', async (route) => {
    if (holding) {
      await new Promise<void>((resolve) => {
        held.push(() => resolve());
      });
    }
    await route.continue();
  });

  await page.goto('/');

  const go = page.locator('button[data-action="go"]');
  await expect(go).toHaveAttribute('data-boot', 'sleeping');
  await expect(go).toHaveAttribute('aria-disabled', 'true');

  // A tap while sleeping must never open the picker.
  await go.dispatchEvent('click');
  await expect(page.locator('button[data-action="race"]')).toBeHidden();

  // Release the held responses: assets land, GO wakes, and the race starts.
  holding = false;
  for (const release of held) {
    release();
  }
  await expect(go).toHaveAttribute('data-boot', 'ready', { timeout: 15_000 });
  await expect(go).toBeEnabled({ timeout: 15_000 });

  // The valid GO button pulses forever; freeze the animation so the click
  // passes Playwright's stability check.
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });
  await go.click();
  const race = page.locator('button[data-action="race"]');
  await expect(race).toBeVisible({ timeout: 15_000 });
  await race.click();
  await expect(page.locator('button[data-action="pause"]')).toBeVisible({ timeout: 15_000 });
});

test('failed kart loads retry gently, show the retry cue, and recover on tap', async ({ page }) => {
  let failing = true;
  const kartRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/kart-*.glb', async (route) => {
    kartRequests.push(route.request().url());
    if (failing) {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await page.goto('/');

  const go = page.locator('button[data-action="go"]');
  await expect(go).toHaveAttribute('data-boot', 'sleeping');

  // After the stall threshold the wordless retry cue appears.
  await expect(go).toHaveAttribute('data-boot', 'retry', { timeout: 15_000 });

  // Retries are automatic and gentle: kart URLs are requested again over time.
  const firstKartUrl = kartRequests[0] ?? '';
  await expect
    .poll(() => kartRequests.filter((url) => url === firstKartUrl).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(3);

  // A tap on the cue forces an immediate attempt.
  const before = kartRequests.length;
  await go.dispatchEvent('click');
  await expect.poll(() => kartRequests.length, { timeout: 5_000 }).toBeGreaterThan(before);

  // Network recovers: the next attempt succeeds and GO wakes.
  failing = false;
  await go.dispatchEvent('click');
  await expect(go).toHaveAttribute('data-boot', 'ready', { timeout: 20_000 });

  expect(pageErrors).toEqual([]);
});
