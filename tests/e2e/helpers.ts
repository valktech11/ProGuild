import { Page, request } from '@playwright/test'

export const TEST_PRO_EMAIL = process.env.TEST_PRO_EMAIL || 'test@proguild.ai'
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
export const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''

/**
 * Returns headers needed to bypass Vercel deployment protection.
 * Empty object in non-CI environments.
 */
export function bypassHeaders(): Record<string, string> {
  if (!BYPASS_SECRET) return {}
  return { 'x-vercel-protection-bypass': BYPASS_SECRET }
}

/**
 * Log in as the test pro and set session in sessionStorage.
 * Handles Vercel deployment protection bypass.
 */
export async function loginAsTestPro(page: Page) {
  // First navigate to login — sets cookies and context
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  // If Vercel protection page, set bypass cookie and reload
  if (BYPASS_SECRET) {
    await page.context().addCookies([{
      name: '_vercel_jwt',
      value: BYPASS_SECRET,
      domain: new URL(BASE_URL).hostname,
      path: '/',
    }])
  }

  // Call auth API directly using page.evaluate fetch so it runs in browser context
  // with cookies already set — bypasses Vercel protection
  const session = await page.evaluate(async ({ email, bypassSecret, baseUrl }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (bypassSecret) headers['x-vercel-protection-bypass'] = bypassSecret

    const res = await fetch(`${baseUrl}/api/auth`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Auth failed ${res.status}: ${text}`)
    }
    const data = await res.json()
    return data.session
  }, { email: TEST_PRO_EMAIL, bypassSecret: BYPASS_SECRET, baseUrl: BASE_URL })

  // Set session in sessionStorage
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
