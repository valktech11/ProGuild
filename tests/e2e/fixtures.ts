/**
 * fixtures.ts — extends Playwright base test with `authedPage`.
 *
 * Calls /api/auth with the test pro email → injects Session into
 * sessionStorage(pg_pro) via page.evaluate. Bypasses the login UI entirely
 * and works correctly with the app's sessionStorage-based auth (not localStorage).
 *
 * Runs against localhost:3000 in CI (webServer block starts it automatically).
 * No Vercel password protection to worry about.
 */

import { test as base, expect, Page } from '@playwright/test'

export const BASE_URL       = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
export const TEST_PRO_EMAIL = process.env.TEST_PRO_EMAIL!

type Fixtures = { authedPage: Page }

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    // Get a real Session from the auth API (same call the login page makes)
    const res = await page.request.post(`${BASE_URL}/api/auth`, {
      data: { email: TEST_PRO_EMAIL },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok()) {
      throw new Error(
        `authedPage fixture: /api/auth returned ${res.status()} — ` +
        `is TEST_PRO_EMAIL (${TEST_PRO_EMAIL}) seeded in staging Supabase?`
      )
    }

    const { session } = await res.json()

    // Navigate to origin to unlock sessionStorage, then inject session
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate((s) => {
      sessionStorage.setItem('pg_pro', JSON.stringify(s))
    }, session)

    // Navigate to dashboard — must stay on /dashboard (not redirect to /login)
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    await use(page)
  },
})

export { expect }
