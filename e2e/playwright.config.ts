import { defineConfig, devices } from '@playwright/test';
import { E2E } from './env.mjs';

// Runs the built API, website and admin, then drives them in a real browser.
// Run with `pnpm e2e` (resets the e2e schema first). Needs `pnpm build`, Postgres and Redis.
const reuse = !process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'report' }]] : 'list',
  outputDir: 'results',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
    // Optional: a Chromium already on the machine instead of the one `playwright install` downloads.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
  webServer: [
    { command: 'node --enable-source-maps apps/api/dist/main.js', cwd: '..', url: 'http://localhost:4000/api/v1/site', env: E2E, reuseExistingServer: reuse, timeout: 60_000 },
    { command: 'pnpm --filter @sahyadri/web start', cwd: '..', url: 'http://localhost:3000', reuseExistingServer: reuse, timeout: 60_000 },
    { command: 'pnpm --filter @sahyadri/admin start', cwd: '..', url: 'http://localhost:3001/admin/login', reuseExistingServer: reuse, timeout: 60_000 },
  ],
});
