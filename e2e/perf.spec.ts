import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/** Storage key shared with src/render/quality-controller.ts. */
const QUALITY_KEY = 'race-it:quality';

/** Effective backing-store ratio of the WebGL canvas (buffer px ÷ CSS px). */
async function canvasRatio(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return 0;
    }
    return canvas.width / canvas.getBoundingClientRect().width;
  });
}

/** Draw calls reported by the ?perf harness for the last rendered frame. */
async function drawCalls(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __raceItPerf: () => { calls: number } }).__raceItPerf().calls,
  );
}

/** Placed-piece count from the ?debug hook; the perf pattern fills all 144 cells. */
async function pieceCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __raceItDebug: { pieces: () => unknown[] } }).__raceItDebug.pieces()
        .length,
  );
}

/** Waits until the full 12×12 perf board is rendered and the frame numbers settle. */
async function waitForPerfBoard(page: Page): Promise<void> {
  await expect.poll(() => pieceCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(144);
  await page.waitForTimeout(1_000);
}

test.describe('adaptive performance guardrails', () => {
  // A 2× display makes the DPR caps observable: at dpr 1 every cap ≥ 1
  // collapses to the same backing ratio.
  test.use({ deviceScaleFactor: 2 });

  test('low tier lowers the canvas backing ratio and draw calls vs high', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/?perf&debug&tier=high');
    await expect.poll(() => canvasRatio(page), { timeout: 20_000 }).toBe(2);
    await waitForPerfBoard(page);
    const highCalls = await drawCalls(page);
    expect(highCalls).toBeGreaterThan(0);

    await page.goto('/?perf&debug&tier=low');
    await expect.poll(() => canvasRatio(page), { timeout: 20_000 }).toBe(1);
    await waitForPerfBoard(page);
    const lowCalls = await drawCalls(page);

    // Instanced batching collapses the per-tile draw calls at the low tier.
    expect(lowCalls).toBeLessThan(highCalls * 0.7);
  });

  test('forced tier never overwrites the stored preference', async ({ page }) => {
    test.setTimeout(120_000);

    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      QUALITY_KEY,
      'high',
    ] as const);
    await page.goto('/?perf&tier=low');
    await expect.poll(() => canvasRatio(page), { timeout: 20_000 }).toBe(1);

    const stored = await page.evaluate((key) => localStorage.getItem(key), QUALITY_KEY);
    expect(stored).toBe('high');
  });

  test('stored tier is honored without a URL override, including on reload', async ({ page }) => {
    test.setTimeout(120_000);

    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      QUALITY_KEY,
      'low',
    ] as const);
    await page.goto('/?perf');
    await expect.poll(() => canvasRatio(page), { timeout: 20_000 }).toBe(1);

    await page.reload();
    await expect.poll(() => canvasRatio(page), { timeout: 20_000 }).toBe(1);
  });
});
