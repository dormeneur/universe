import { expect, test } from '@playwright/test';

/**
 * Proves the harness works end to end before there is a product to test.
 * Phase 1 replaces this with the real journey: sign in → verify → publish.
 */
test('health endpoint reports ok', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Uni-verse' })).toBeVisible();
});
