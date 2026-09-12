import { expect, type Page, test } from '@playwright/test';

/**
 * Audio warmth E2E: boot warms every one-shot and the music loop in the
 * background as a non-critical readiness group. OGG requests are held or
 * failed at the network layer so warming, retry and recovery are deterministic.
 */

interface WarmEntry {
  status: string;
  attempts: number;
}

interface WarmSnapshot {
  sounds: Record<string, WarmEntry>;
  music: WarmEntry;
  poolSize: number;
}

/** Reads the `?debug` warm snapshot hook (absent until the audio group is wired). */
function readSnapshot(page: Page): Promise<WarmSnapshot | null> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __raceItAudio?: () => WarmSnapshot }).__raceItAudio;
    return hook ? hook() : null;
  });
}

/** All warm entries (every one-shot plus the music loop). */
function allEntries(snapshot: WarmSnapshot): WarmEntry[] {
  return [...Object.values(snapshot.sounds), snapshot.music];
}

test('slow OGGs: audio warms in the background, settles ready, and never gates GO', async ({
  page,
}) => {
  // Hold every audio response so warming stays observable.
  const held: Array<() => void> = [];
  let holding = true;
  await page.route('**/*.ogg', async (route) => {
    if (holding) {
      await new Promise<void>((resolve) => {
        held.push(() => resolve());
      });
    }
    await route.continue();
  });

  await page.goto('/?debug');

  // The warm snapshot hook appears once boot starts warming.
  await page.waitForFunction(
    () => typeof (window as unknown as { __raceItAudio?: unknown }).__raceItAudio === 'function',
    undefined,
    { timeout: 15_000 },
  );
  await expect
    .poll(async () => {
      const snapshot = await readSnapshot(page);
      return snapshot?.sounds.click?.status === 'warming' ? 1 : 0;
    })
    .toBe(1);

  // GO wakes from the critical assets alone: audio is still held.
  const go = page.locator('button[data-action="go"]');
  await expect(go).toHaveAttribute('data-boot', 'ready', { timeout: 15_000 });

  const beforeRace = await readSnapshot(page);
  const statusesBeforeRace = beforeRace ? allEntries(beforeRace).map((entry) => entry.status) : [];
  expect(statusesBeforeRace.some((status) => status !== 'ready')).toBe(true);

  // A race starts while the OGGs are still held.
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });
  await go.click();
  const race = page.locator('button[data-action="race"]');
  await expect(race).toBeVisible({ timeout: 15_000 });
  await race.click();
  await expect(page.locator('button[data-action="pause"]')).toBeVisible({ timeout: 15_000 });

  // Release the audio: warmth settles to ready for every sound and the music.
  holding = false;
  for (const release of held) {
    release();
  }
  await expect
    .poll(
      async () => {
        const snapshot = await readSnapshot(page);
        return snapshot !== null && allEntries(snapshot).every((entry) => entry.status === 'ready');
      },
      { timeout: 25_000 },
    )
    .toBe(true);
});

test('failed audio warmth retries silently, never touches GO, and recovers', async ({ page }) => {
  let failing = true;
  const pageErrors: string[] = [];
  const unhandled: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /uncaught|unhandled/i.test(message.text())) {
      unhandled.push(message.text());
    }
  });

  await page.route('**/*.ogg', async (route) => {
    if (failing) {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await page.goto('/?debug');
  await page.waitForFunction(
    () => typeof (window as unknown as { __raceItAudio?: unknown }).__raceItAudio === 'function',
    undefined,
    { timeout: 15_000 },
  );

  // GO is untouched by the failing audio group: no retry cue, race still ready.
  const go = page.locator('button[data-action="go"]');
  await expect(go).toHaveAttribute('data-boot', 'ready', { timeout: 15_000 });

  // Silent backoff retries: the click sound's attempt count climbs over time.
  await expect
    .poll(
      async () => {
        const snapshot = await readSnapshot(page);
        return snapshot?.sounds.click?.attempts ?? 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(3);
  await expect(go).toHaveAttribute('data-boot', 'ready');

  // Network recovers: the next retry warms everything to ready.
  failing = false;
  await expect
    .poll(
      async () => {
        const snapshot = await readSnapshot(page);
        return snapshot !== null && allEntries(snapshot).every((entry) => entry.status === 'ready');
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  expect(pageErrors).toEqual([]);
  expect(unhandled).toEqual([]);
});
