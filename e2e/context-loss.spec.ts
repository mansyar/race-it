import { expect, type Page, test } from '@playwright/test';

/**
 * WebGL context-loss end-to-end: drives the real `WEBGL_lose_context`
 * extension against the production build (vite preview). This is the Red-phase
 * spec for the contextrecovery track — it exercises the `?debug` seam
 * (`window.__raceItContext`) and the guard wiring in `src/main.ts`:
 *
 * 1. loss mid-race → the existing resume overlay holds the race; restore +
 *    Resume continues the race to completion without a reload;
 * 2. loss in build mode → silent (no new UI), board edits ignored while lost,
 *    restore re-renders the scene and the board stays editable;
 * 3. loss with no restore → exactly one silent reload within the grace, and
 *    an invalid half-built board survives it (always-autosave);
 * 4. consecutive immediate losses never exceed the reload attempt cap.
 */

/** Session-storage key the guard uses to cap fallback reloads. */
const RELOAD_KEY = 'race-it:context-reloads';

/** Locates the live three.js canvas. */
async function canvasBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#app > canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return box;
}

/** Runs lose/restore on the scene canvas via the `WEBGL_lose_context` extension. */
async function contextExtension(page: Page, action: 'lose' | 'restore'): Promise<void> {
  await page.evaluate((mode) => {
    const canvas = document.querySelector('#app > canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('canvas missing');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    if (!gl) throw new Error('WebGL context missing');
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('WEBGL_lose_context extension unavailable');
    if (mode === 'lose') {
      ext.loseContext();
    } else {
      ext.restoreContext();
    }
  }, action);
}

/** Guard state exposed by the `?debug` seam. */
function contextState(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (window as unknown as { __raceItContext: { state: () => string } }).__raceItContext.state(),
  );
}

/** Last-frame draw calls exposed by the `?debug` seam. */
function drawCalls(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __raceItContext: { drawCalls: () => number } }
      ).__raceItContext.drawCalls(),
  );
}

/** Placed-piece count from the existing `?debug` inspector. */
function pieceCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __raceItDebug: { pieces: () => unknown[] } }).__raceItDebug.pieces()
        .length,
  );
}

/** Boots the app and waits for the builder chrome. */
async function waitForBoot(page: Page): Promise<void> {
  await expect(page.locator('button[data-action="go"]')).toBeVisible({ timeout: 15_000 });
}

/** Reads the persisted fallback-reload counter (null when never written). */
function storedReloads(page: Page): Promise<string | null> {
  return page.evaluate((key) => sessionStorage.getItem(key), RELOAD_KEY);
}

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

/**
 * Waits until track pieces have rendered and returns the settled count.
 * Pieces load asynchronously after boot; the file has to be quiet before a
 * later decrease can be attributed to an edit.
 */
async function waitForPieces(page: Page): Promise<number> {
  await expect.poll(() => pieceCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  return pieceCount(page);
}

/** Clicks the safe empty-cell offsets proven by lifecycle.spec. */
async function clickEmptyCellCandidates(page: Page): Promise<void> {
  const box = await canvasBox(page);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  for (const offset of [40, 70, 0]) {
    await page.mouse.click(centerX, centerY - offset);
  }
}

/** Clicks the empty-cell candidates one at a time until a placement lands. */
async function placeOnEmptyCell(page: Page): Promise<void> {
  const box = await canvasBox(page);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const undo = page.locator('button[data-action="undo"]');
  for (const offset of [40, 70, 0]) {
    await page.mouse.click(centerX, centerY - offset);
    if (await undo.isEnabled()) break;
  }
}

/**
 * Enters remove mode and scans canvas offsets outward from the board center
 * until a track piece is deleted (piece count drops) — deterministically
 * producing an invalid half-built board. Bottom-center candidates are skipped
 * so the scan can never hit the GO button or the build bar.
 */
async function breakLoopByRemoval(page: Page): Promise<number> {
  const before = await pieceCount(page);
  await page.locator('button[data-action="remove"]').click();
  const box = await canvasBox(page);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dxs = [0, -70, 70, -140, 140, -210, 210, -280, 280];
  const dys = [0, -70, 70, -140, 140, -210, 210];
  const candidates = dxs
    .flatMap((dx) => dys.map((dy) => [dx, dy] as const))
    .filter(([dx, dy]) => !(Math.abs(dx) < 80 && Math.abs(dy) < 80))
    .filter(([dx, dy]) => !(dy > 0 && Math.abs(dx) < 130))
    .sort(([ax, ay], [bx, by]) => Math.abs(ax) + Math.abs(ay) - (Math.abs(bx) + Math.abs(by)))
    .slice(0, 36);
  for (const [dx, dy] of candidates) {
    await page.mouse.click(centerX + dx, centerY + dy);
    const now = await pieceCount(page);
    if (now < before) {
      return now;
    }
  }
  throw new Error(`no ring piece removed by scan (stuck at ${before} pieces)`);
}

test('a context loss during a race holds it; restore + Resume finishes it', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/?debug&tier=high');
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await startRace(page);
  await page.waitForTimeout(3500); // let the countdown finish and the pack roll

  await contextExtension(page, 'lose');

  // The existing resume overlay is the only visible change; the race holds.
  await expect(page.locator('.race-overlay')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('button[data-action="pause"]')).toBeHidden();
  await expect.poll(() => contextState(page), { timeout: 3_000 }).toBe('lost');

  await contextExtension(page, 'restore');
  await expect.poll(() => contextState(page), { timeout: 5_000 }).toBe('stable');

  // A held race stays held until the child taps Resume — even after restore.
  await page.waitForTimeout(1000);
  await expect(page.locator('.race-overlay')).toBeVisible();

  await page.locator('button[data-action="resume"]').click();
  await expect(page.locator('.race-overlay')).toBeHidden();
  await expect(page.locator('button[data-action="pause"]')).toBeVisible();

  // ...and the race runs to completion afterwards.
  await expect(page.locator('button[data-action="build-again"]')).toBeVisible({
    timeout: 100_000,
  });

  expect(navigations).toBe(0);
  expect(await storedReloads(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('a context loss in build mode is wordless and recoverable in place', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/?debug&tier=high');
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });

  await waitForBoot(page);
  const before = await waitForPieces(page);

  await contextExtension(page, 'lose');
  await expect.poll(() => contextState(page), { timeout: 3_000 }).toBe('lost');

  // Wordless: no overlay, no new UI — the builder stays exactly as-is.
  await expect(page.locator('.race-overlay')).toBeHidden();
  await expect(page.locator('.build-bar')).toBeVisible();

  // Board edits are ignored while the scene is invisible.
  const undo = page.locator('button[data-action="undo"]');
  await expect(undo).toBeDisabled();
  await page.locator('button[data-piece="straight"]').click();
  await clickEmptyCellCandidates(page);
  await expect(undo).toBeDisabled();
  expect(await pieceCount(page)).toBe(before);

  // Restore re-renders in place — no reload, no overlay.
  await contextExtension(page, 'restore');
  await expect.poll(() => contextState(page), { timeout: 5_000 }).toBe('stable');
  await expect.poll(() => drawCalls(page), { timeout: 5_000 }).toBeGreaterThan(0);

  // The same taps now land: the board is editable again.
  await placeOnEmptyCell(page);
  await expect(undo).toBeEnabled();
  expect(await pieceCount(page)).toBe(before + 1);

  expect(navigations).toBe(0);
  expect(await storedReloads(page)).toBeNull();
});

test('a suppressed restore silently reloads once and keeps an invalid board', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/?debug&tier=high');
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });

  await waitForBoot(page);
  await waitForPieces(page);

  // Break the demo loop so the board is invalid but valuable (half-built).
  const brokenCount = await breakLoopByRemoval(page);
  const go = page.locator('button[data-action="go"]');
  await expect(go).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('button[data-action="undo"]')).toBeEnabled();

  const nav = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame(),
    timeout: 15_000,
  });
  await contextExtension(page, 'lose');
  await nav;

  // The fallback reload returns the child to exactly their broken board.
  await waitForBoot(page);
  await expect(go).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => pieceCount(page), { timeout: 10_000 }).toBe(brokenCount);
  expect(navigations).toBe(1);
  expect(await storedReloads(page)).toBe('1');
});

test('consecutive immediate losses never exceed the reload cap', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/?debug&tier=high');
  await waitForBoot(page);

  for (const cycle of ['1', '2'] as const) {
    const nav = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 15_000,
    });
    await contextExtension(page, 'lose');
    await nav;
    await waitForBoot(page);
    expect(await storedReloads(page)).toBe(cycle);
  }

  // Third immediate loss: the cap (2) is reached — the guard gives up silently
  // instead of reloading forever.
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await contextExtension(page, 'lose');
  await expect.poll(() => contextState(page), { timeout: 8_000 }).toBe('failed');
  await page.waitForTimeout(4_000);
  expect(navigations).toBe(0);
  expect(await storedReloads(page)).toBe('2');
});