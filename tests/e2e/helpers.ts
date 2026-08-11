import { Page, APIRequestContext } from '@playwright/test'

export const TEST_PRO_EMAIL = process.env.TEST_PRO_EMAIL || 'test@proguild.ai'
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

/**
 * Log in as the test pro.
 * Uses page.request (Playwright's own HTTP client — not browser fetch)
 * so it's immune to page navigation destroying the JS context.
 */
export async function loginAsTestPro(page: Page) {
  // Use Playwright's request context — runs outside the browser, no navigation risk
  const res = await page.request.post(`${BASE_URL}/api/auth`, {
    data: { email: TEST_PRO_EMAIL },
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok()) {
    const text = await res.text()
    throw new Error(`Auth API failed ${res.status()}: ${text}`)
  }

  const { session } = await res.json()

  // Now navigate to a neutral page and inject the session
  // Use /login but wait for it to fully settle before touching sessionStorage
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' })
  
  // If the page redirected to dashboard (prior session), that's fine — 
  // we just need any stable page to inject sessionStorage into
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate((s) => {
    sessionStorage.setItem('pg_pro', JSON.stringify(s))
  }, session)

  return session
}

export async function goToDashboard(page: Page) {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
}

export async function goToPipeline(page: Page) {
  await page.goto(`${BASE_URL}/dashboard/pipeline`, { waitUntil: 'networkidle' })
}
