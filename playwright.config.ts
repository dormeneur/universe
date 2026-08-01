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

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Honour a pre-installed browser when the environment provides one
        // (CI images and sandboxes often do), rather than downloading a build
        // that matches this exact Playwright version.
        ...(process.env['CHROMIUM_PATH']
          ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
          : {}),
      },
    },
  ],

  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
    env: {
      // Deliberately no NODE_ENV override: `next build` miscompiles React when
      // forced into development, and these tests are more useful against the
      // real production build anyway. ALLOW_CONSOLE_MAIL below is what makes
      // that possible.
      DATABASE_URL:
        process.env['TEST_DATABASE_URL'] ?? 'postgresql://postgres@localhost:5432/uniiverse_test',
      CAMPUS_EMAIL_DOMAINS: 'college.ac.in,*.college.ac.in',
      // `next start` forces NODE_ENV=production, so logging codes has to be
      // opted into explicitly. That is the point of the flag.
      ALLOW_CONSOLE_MAIL: 'true',
      DEV_MAIL_SINK: process.env['DEV_MAIL_SINK'] ?? '/tmp/uniiverse-e2e-mail.jsonl',
      LOG_LEVEL: 'warn',
    },
  },
});
