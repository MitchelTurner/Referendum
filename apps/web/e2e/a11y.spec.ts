import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function expectClean(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test('public routes pass axe', async ({ page }) => {
  for (const path of ['/', '/data', '/follow', '/notices', '/account', '/staff']) {
    await page.goto(path);
    await expectClean(page);
  }
});

test('a published item page passes axe', async ({ page }) => {
  const itemId = readFileSync('/tmp/referendum-e2e-item-id', 'utf8').trim();
  await page.goto(`/items/${itemId}`);
  await expect(page.getByRole('heading', { name: '[DEMO] Fixture moorage item' })).toBeVisible();
  await page.locator('#comment-name').fill('[DEMO] Tester');
  await page.locator('#comment-body').fill('[DEMO] Please keep the floats open.');
  await page.getByRole('button', { name: 'Submit comment' }).click();
  await expect(page.getByRole('status')).toContainText('Comment received.');
  await expectClean(page);
});

test('embed renders on a plain host page', async ({ page }) => {
  await page.goto('/embed-host.html');
  const calendar = page.locator('ref-calendar');
  await expect(calendar).toBeVisible();
  await expect.poll(async () => calendar.evaluate((element) => element.shadowRoot?.textContent ?? '')).toMatch(/ASM|Assembly|No published|Fixture|unavailable/i);
});
