import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /installability\.spec\.ts/,
      use: { browserName: 'chromium' },
    },
    {
      // Chrome only runs its installability checks in headed mode (headless
      // skips them and reports an empty error list even for broken apps), so
      // this project launches a real window; CI wraps the run in xvfb.
      name: 'installability',
      testMatch: /installability\.spec\.ts/,
      use: { browserName: 'chromium', headless: false },
    },
  ],
  webServer: {
    command: 'pnpm preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
