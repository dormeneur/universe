import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end coverage stays deliberately thin. These tests are slow and flaky
 * in proportion to their number, and their value is confirming that the wiring
 * holds together — the logic is already covered by fast tests underneath.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  // Spread rather than `workers: undefined` — under exactOptionalPropertyTypes
  // an explicit undefined is not the same as an absent property, and Playwright
  // wants the property absent to apply its own default.
  ...(process.env['CI'] ? { workers: 1 } : {}),

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
