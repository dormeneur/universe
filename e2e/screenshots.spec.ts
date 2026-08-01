import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/**
 * Captures the sign-in journey as images. Not an assertion suite — it exists
 * so the screens can be reviewed without running the app by hand.
 *
 * Skipped unless CAPTURE_SCREENS is set, since it produces files rather than
 * verifying behaviour.
 */
const SINK = process.env['DEV_MAIL_SINK'] ?? '/tmp/uniiverse-e2e-mail.jsonl';

test.skip(!process.env['CAPTURE_SCREENS'], 'set CAPTURE_SCREENS=1 to capture');

async function latestCodeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const contents = await readFile(SINK, 'utf8').catch(() => '');
    const entry = contents
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { to: string; code: string })
      .filter((e) => e.to === email)
      .at(-1);
    if (entry) return entry.code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No code delivered to ${email}`);
}

test('capture the sign-in journey', async ({ page }) => {
  const email = `shot-${Date.now()}@college.ac.in`;
  const dir = process.env['SCREENSHOT_DIR'] ?? 'screenshots';

  await page.goto('/sign-in');
  await page.screenshot({ path: `${dir}/1-sign-in.png`, fullPage: true });

  await page.getByLabel('College email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.screenshot({ path: `${dir}/2-enter-code.png`, fullPage: true });

  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Almost there' })).toBeVisible();
  await page.screenshot({ path: `${dir}/3-onboarding.png`, fullPage: true });

  await page.getByLabel('Your name').fill('Aditya Bharti');
  await page.getByLabel('Expected graduation year').fill('2028');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Aditya Bharti' })).toBeVisible();
  await page.screenshot({ path: `${dir}/4-signed-in.png`, fullPage: true });
});
