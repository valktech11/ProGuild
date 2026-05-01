import { Page } from '@playwright/test'

export const TEST_PRO_EMAIL = process.env.TEST_PRO_EMAIL || 'test@proguild.ai'
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

/**
 * Log in as the test pro via /api/auth and set sessionStorage.
 * staging.proguild.ai is unprotected (Vercel Standard Protection excludes custom domains).
 */
export async function loginAsTestPro(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  const session = await page.evaluate(async ({ email, baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Auth failed ${res.status}: ${text}`)
    }
    const data = await res.json()
    return data.session
  }, { email: TEST_PRO_EMAIL, baseUrl: BASE_URL })

  await page.evaluate((s) => {
    sessionStorage.setItem('pg_pro', JSON.stringify(s))
  }, session)

  return session
}

export async function goToDashboard(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
}

export async function goToPipeline(page: Page) {
  await page.goto('/dashboard/pipeline', { waitUntil: 'networkidle' })
}
