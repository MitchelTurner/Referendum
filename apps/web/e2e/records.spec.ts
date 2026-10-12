import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const require = createRequire(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), 'packages/db/package.json'));
const { authenticator } = require('otplib') as { authenticator: { generate: (secret: string) => string } };

const EMAIL = 'records.e2e@demo.referendum.local';
const PASSWORD = 'Demo-password-1';
const TOTP = 'JBSWY3DPEHPK3PXP';

test.beforeAll(() => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execSync(
    `set -a && . "${root}/.env" && set +a && pnpm exec tsx -e "import { provisionStaff } from './src/auth.ts'; import { withTenant } from './src/client.ts'; async function main(){ const borough = await withTenant({ governmentIds: 'all' }, (tx) => tx.government.findFirstOrThrow({ where: { shortName: 'Borough' } })); await provisionStaff({ email: '${EMAIL}', name: 'Records E2E Clerk', password: '${PASSWORD}', totpSecret: '${TOTP}', memberships: [{ governmentId: borough.id, role: 'CLERK' }] }); } main();"`,
    { cwd: path.join(root, 'packages/db'), stdio: 'inherit', env: process.env, shell: '/bin/bash' },
  );
});

test('a records request stays private until staff publish it', async ({ page }) => {
  const description = '[DEMO] E2E harbor ledger request';
  const response = '[DEMO] E2E ledger extract for the requester.';
  await page.goto('/records');
  await expect(page.getByRole('heading', { name: 'Public records requests' })).toBeVisible();
  await page.getByLabel('Government').selectOption({ label: 'Ketchikan Gateway Borough' });
  await page.getByLabel('Name').fill('[DEMO] E2E Requester');
  await page.getByLabel('Email').first().fill(EMAIL);
  await page.getByLabel('What records do you want?').fill(description);
  await page.getByRole('button', { name: 'File request' }).click();
  const filed = page.getByRole('status');
  await expect(filed).toContainText('Response deadline not configured');
  const tracking = ((await filed.textContent()) ?? '').match(/RR-\d{4}-\d{4}/)?.[0];
  expect(tracking).toBeTruthy();

  await page.getByLabel('Tracking number').fill(tracking ?? '');
  await page.getByLabel('Email used on the request').fill(EMAIL);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByText(response)).toHaveCount(0);

  await page.goto('/staff');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Authenticator code').fill(authenticator.generate(TOTP));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
  await page.getByRole('link', { name: 'Records' }).click();
  await page.getByRole('button', { name: new RegExp(tracking ?? 'missing') }).click();
  await page.getByLabel('Status').selectOption('FULFILLED');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Request updated.');
  await page.getByLabel('Response title').fill('Ledger extract');
  await page.getByLabel('Response', { exact: true }).fill(response);
  await page.getByRole('button', { name: 'Add response' }).click();
  await expect(page.getByRole('status')).toContainText('stays off the public log');

  await page.goto('/records');
  await expect(page.getByText(response)).toHaveCount(0);

  await page.goto('/staff/records');
  await page.getByRole('button', { name: new RegExp(tracking ?? 'missing') }).click();
  await page.getByRole('button', { name: 'Publish response' }).click();
  await expect(page.getByRole('status')).toContainText('Response published.');

  await page.goto('/records');
  await expect(page.getByText(response)).toBeVisible();
  await expect(page.getByText(EMAIL)).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('records intake fits a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/records');
  await expect(page.getByRole('heading', { name: 'Public records requests' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'File request' })).toBeVisible();
  const box = await page.getByLabel('What records do you want?').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.width ?? 0).toBeLessThan(390);
});
