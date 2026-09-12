import { expect, type Page, test } from '@playwright/test';
import {
  createServedCopy,
  ensureUpdateFixtures,
  startStaticSite,
  swapServedCopy,
} from './harness/static-site';

/**
 * Safe PWA update flow end-to-end over two real production builds:
 *  - variants `a` and `b` differ in their asset hashes and in
 *    `__raceItDebug.pwa.buildLabel`;
 *  - a tiny static server serves a mutable copy, so `b` can be "deployed"
 *    while the app is running on `a`.
 *
 * Test 1 proves a waiting update never interrupts a race and instead lands
 * silently at the next quiet Build-mode moment. Test 2 proves the quiet
 * window waits for input to stop.
 */
test.use({ serviceWorkers: 'allow' });

test.beforeAll(() => {
  ensureUpdateFixtures();
});

async function readLabel(page: Page): Promise<string | null> {
  try {
    // Keep the access inline: page.evaluate functions are serialized and
    // cannot see test-scope helpers from the browser side.
    return await page.evaluate(
      () =>
        (window as unknown as { __raceItDebug?: { pwa: { buildLabel: string | null } } })
          .__raceItDebug?.pwa.buildLabel ?? null,
    );
  } catch {
    // Mid-navigation the execution context is briefly gone; poll retries.
    return null;
  }
}

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
}

/**
 * The very first load registers the worker but does not claim the page (no
 * clientsClaim in prompt mode). One reload puts the page under SW control so
 * a later deploy genuinely enters the waiting state instead of auto-activating
 * (Chromium skips waiting when the old worker controls no clients).
 */
async function reloadForControl(page: Page): Promise<void> {
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);
}

async function hasWaitingWorker(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.waiting);
    });
  } catch {
    return false;
  }
}

async function requestUpdate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
}

/** One synthetic, side-effect-free pointer tap (no UI is actually touched). */
function tap(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerup'));
  });
}

function pieceCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __raceItDebug: { pieces: () => unknown[] } }).__raceItDebug.pieces()
        .length,
  );
}

test('a waiting update never reloads a running race and lands after Build Again', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const serveDir = createServedCopy('a');
  const site = await startStaticSite(serveDir);
  try {
    await page.goto(`${site.origin}/?debug&tier=high`);
    await waitForServiceWorker(page);
    // Take control first so a deploy genuinely enters the waiting state.
    await reloadForControl(page);

    const go = page.locator('button[data-action="go"]');
    await expect(go).toBeEnabled({ timeout: 20_000 });
    await expect.poll(() => pieceCount(page), { timeout: 20_000 }).toBeGreaterThan(0);
    const piecesBefore = await pieceCount(page);

    // Freeze the pulsing GO animation so clicks pass Playwright's stability check.
    await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });

    // A window-level sentinel that only survives if the page never navigates.
    await page.evaluate(() => {
      (window as unknown as { __raceItSentinel?: string }).__raceItSentinel = 'kept';
    });

    await go.click();
    const race = page.locator('button[data-action="race"]');
    await expect(race).toBeEnabled({ timeout: 20_000 });
    await race.click();

    // Deploy `b` mid-race and force the browser to notice it.
    swapServedCopy(serveDir, 'b');
    await requestUpdate(page);
    await expect.poll(() => hasWaitingWorker(page), { timeout: 30_000 }).toBe(true);

    // Well past the 3s quiet window: still racing, so nothing may reload.
    await page.waitForTimeout(5_000);
    expect(await readLabel(page)).toBe('a');
    const sentinel = await page.evaluate(
      () => (window as unknown as { __raceItSentinel?: string }).__raceItSentinel,
    );
    expect(sentinel).toBe('kept');

    // Finish the race, then the next quiet Build moment swaps silently.
    const buildAgain = page.locator('button[data-action="build-again"]');
    await expect(buildAgain).toBeVisible({ timeout: 150_000 });
    await buildAgain.click();

    await expect.poll(() => readLabel(page), { timeout: 20_000 }).toBe('b');

    // The board survived the swap reload.
    await expect(go).toBeEnabled({ timeout: 20_000 });
    await expect.poll(() => pieceCount(page), { timeout: 20_000 }).toBe(piecesBefore);
  } finally {
    await site.close();
  }
});

test('repeated input defers the swap until the screen goes quiet', async ({ page }) => {
  test.setTimeout(120_000);
  const serveDir = createServedCopy('a');
  const site = await startStaticSite(serveDir);
  try {
    await page.goto(`${site.origin}/?debug&tier=high`);
    await waitForServiceWorker(page);
    // Take control first so a deploy genuinely enters the waiting state.
    await reloadForControl(page);
    await expect(page.locator('button[data-action="go"]')).toBeEnabled({ timeout: 20_000 });

    // Keep the app freshly interacted-with *before* the deploy lands, so the
    // quiet window is genuinely exercised (otherwise a long-idle app would be
    // allowed to swap immediately on discovery).
    await tap(page);
    swapServedCopy(serveDir, 'b');
    await requestUpdate(page);

    let sawWaiting = false;
    for (let i = 0; i < 10; i += 1) {
      await tap(page);
      await page.waitForTimeout(700);
      if (!sawWaiting && (await hasWaitingWorker(page))) {
        sawWaiting = true;
      }
    }
    expect(sawWaiting).toBe(true);
    // Input was continuous across the whole window, so the swap is still pending.
    expect(await readLabel(page)).toBe('a');

    // Input stops: the swap lands within a few seconds.
    await expect.poll(() => readLabel(page), { timeout: 20_000 }).toBe('b');
  } finally {
    await site.close();
  }
});
