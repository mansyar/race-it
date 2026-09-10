/**
 * Captures real in-app scenes from the production build for the PWA manifest
 * `screenshots` entries (Chrome's rich install UI on Android).
 *
 * Scenes:
 *  - narrow portrait (390x844): the build screen with the seeded demo loop.
 *  - wide landscape (1180x820): a live race from the seeded demo loop.
 *
 * Starts its own preview server on port 4173 (keep that port free) and stops
 * it afterwards. Run:
 *   pnpm capture:screenshots
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const OUT_DIR = join('public', 'screenshots');

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1180, height: 820 };

/** Boots `pnpm preview` and resolves once the server answers. */
function startPreview() {
  const server = spawn('pnpm', ['preview', '--host', '127.0.0.1'], {
    shell: true,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview server timed out')), 60_000);
    function chunk(data) {
      if (data.toString().includes('4173')) {
        clearTimeout(timer);
        server.stdout.off('data', chunk);
        resolve(server);
      }
    }
    server.stdout.on('data', chunk);
    server.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Freezes the pulsing GO button so Playwright's stability check passes. */
async function armGoButton(page) {
  await page.addStyleTag({ content: '.go-button button.pulsing { animation: none; }' });
}

/** Parks the pointer in a corner so no hover state pollutes the shot. */
async function parkMouse(page) {
  await page.mouse.move(5, 5);
}

/** Waits for the seeded demo loop and a settled build scene. */
async function settleBuildScreen(page) {
  const go = page.locator('button[data-action="go"]');
  await go.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(go).toBeEnabled({ timeout: 15_000 });
  await armGoButton(page);
  // Let the entrance animations and first render settle before the shot.
  await page.waitForTimeout(2500);
  await parkMouse(page);
}

/** Walks GO -> car picker -> RACE -> countdown, leaving the race running. */
async function startDemoRace(page) {
  await settleBuildScreen(page);
  const go = page.locator('button[data-action="go"]');
  await go.click();
  const race = page.locator('button[data-action="race"]');
  await race.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(race).toBeEnabled({ timeout: 15_000 });
  await race.click();
  const pause = page.locator('button[data-action="pause"]');
  await pause.waitFor({ state: 'visible', timeout: 15_000 });
  await dismissPauseDialogs(page);
  await parkMouse(page);
}

/** Closes any pause overlay / quit confirm so the race runs clean. */
async function dismissPauseDialogs(page) {
  const confirmNo = page.locator('.race-confirm button[data-confirm="no"]');
  if (await confirmNo.isVisible()) {
    await confirmNo.click();
  }
  const resume = page.locator('.race-overlay button[data-action="resume"]');
  if (await resume.isVisible()) {
    await resume.click();
  }
  await expect(page.locator('button[data-action="pause"]')).toBeVisible();
}

const server = await startPreview();
mkdirSync(OUT_DIR, { recursive: true });

try {
  const browser = await chromium.launch();

  // Narrow portrait: build screen with the seeded demo loop.
  const portrait = await browser.newContext({ viewport: NARROW, deviceScaleFactor: 1 });
  const portraitPage = await portrait.newPage();
  await portraitPage.goto(BASE_URL);
  await settleBuildScreen(portraitPage);
  await portraitPage.screenshot({
    path: join(OUT_DIR, 'scene-narrow-390x844.png'),
    type: 'png',
  });
  await portrait.close();

  // Wide landscape: live race scene on the seeded demo loop.
  const landscape = await browser.newContext({ viewport: WIDE, deviceScaleFactor: 1 });
  const landscapePage = await landscape.newPage();
  await landscapePage.goto(BASE_URL);
  await startDemoRace(landscapePage);
  // Let the karts leave the grid so the shot reads as an action moment.
  await landscapePage.waitForTimeout(8000);
  await dismissPauseDialogs(landscapePage);
  await landscapePage.screenshot({
    path: join(OUT_DIR, 'scene-wide-1180x820.png'),
    type: 'png',
  });
  await landscape.close();

  await browser.close();
  console.log('captured manifest screenshots');
} finally {
  server.kill('SIGTERM');
}
