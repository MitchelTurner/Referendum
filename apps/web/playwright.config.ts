import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm --filter @referendum/api start',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @referendum/web dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
