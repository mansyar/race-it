import { expect, test } from '@playwright/test';

// Chrome's own Add-to-Home-Screen criteria, queried over CDP — the same check
// DevTools' installability section uses. Runs in the headed `installability`
// project: headless Chrome skips these checks and reports no errors even for
// broken manifests (verified empirically).
test.use({ serviceWorkers: 'allow' });

test('the production build passes Chrome installability checks', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');

  // Playwright contexts are incognito, which Chrome reports as an
  // installability error even for healthy apps — everything else must be clean.
  const realErrors = installabilityErrors.filter((error) => error.errorId !== 'in-incognito');
  expect(realErrors).toEqual([]);
});
