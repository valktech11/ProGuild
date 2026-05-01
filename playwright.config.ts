import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false, // sequential — avoids staging rate limits
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // reduce retries to speed up CI
  workers: 1, // single worker against staging to avoid hammering it
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Pass bypass secret as header on every request
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : {},
    // Set bypass as cookie so Vercel accepts the session
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
      storageState: {
        cookies: [{
          name: '_vercel_jwt',
          value: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          domain: new URL(BASE_URL).hostname,
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'None' as const,
        }],
        origins: [],
      }
    } : {}),
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  ...(process.env.CI ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120000,
    },
  }),
})
