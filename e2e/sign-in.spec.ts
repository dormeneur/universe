import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/**
 * The Phase 1 definition of done, exercised for real: a campus email receives
 * a code, enters it, and lands signed in — with no GitHub account anywhere in
 * the flow.
 *
 * The code is read from the development mail sink, which is what the console
 * mailer writes instead of sending. That is the same affordance a developer
 * uses locally, so the test drives the product rather than a test-only path.
 */

const SINK = process.env['DEV_MAIL_SINK'] ?? '/tmp/uniiverse-e2e-mail.jsonl';

/**
 * Reads the newest code for an address, retrying briefly.
 *
 * The sink is append-only and never truncated: tests run in parallel against
 * one file, so clearing it would let one worker delete another's code. Unique
 * addresses keep them from colliding instead. The retry covers the gap between
 * the browser seeing the next page and the server finishing its write.
 */
async function latestCodeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const contents = await readFile(SINK, 'utf8').catch(() => '');
    const entries = contents
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { to: string; code: string })
      .filter((entry) => entry.to === email);

    const last = entries.at(-1);
    if (last) return last.code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No sign-in code was delivered to ${email}`);
}

/** A fresh address per run, so tests do not collide over one account. */
function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}@college.ac.in`;
}

test('a student signs up with a college email and no GitHub account', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to Uni-verse' })).toBeVisible();

  await page.getByLabel('College email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Sign in' }).click();

  // A new account has no graduation year yet, so onboarding comes after
  // authentication rather than before it.
  await expect(page.getByRole('heading', { name: 'Almost there' })).toBeVisible();

  await page.getByLabel('Your name').fill('E2E Student');
  await page.getByLabel('Expected graduation year').fill('2028');
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByRole('heading', { name: 'Hi, E2E Student' })).toBeVisible();
  await expect(page.getByText(/GitHub isn.t linked yet/)).toBeVisible();
});

/**
 * The returning-student path — signing in again and skipping onboarding — is
 * covered at the use-case layer instead of here.
 *
 * Driving it end to end would mean requesting a second code for the same
 * address, which the sixty-second resend cooldown correctly refuses. Waiting
 * out a real minute per run buys nothing that
 * `confirmSignInCode > signs in an existing user without creating another
 * account` does not already assert.
 */
test('asking for a second code too soon is refused', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-in');
  await page.getByLabel('College email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  // Straight back for another one, well inside the cooldown.
  await page.goto('/sign-in');
  await page.getByLabel('College email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();

  await expect(page.locator('p.error')).toContainText('ask for another');
});

test('an incorrect code is rejected and counts down remaining attempts', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-in');
  await page.getByLabel('College email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();

  await page.getByLabel('Six-digit code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Targeted at the error paragraph rather than by role: Next's route
  // announcer is also role="alert", and matches first.
  await expect(page.locator('p.error')).toContainText('attempts left');
  // Still on the code screen, not signed in.
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('signing out clears the session', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-in');
  await page.getByLabel('College email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('Six-digit code').fill(await latestCodeFor(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Your name').fill('Session Student');
  await page.getByLabel('Expected graduation year').fill('2028');
  await page.getByRole('button', { name: 'Finish' }).click();

  await page.getByRole('button', { name: 'Sign out' }).click();

  // The home page must now bounce to sign-in rather than render.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Uni-verse' })).toBeVisible();
});
