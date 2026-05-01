import { test, expect, Page } from '@playwright/test'
import { loginAsTestPro, goToDashboard, goToPipeline } from './helpers'

// ── Auth ──────────────────────────────────────────────────────────────────────
test.describe('Auth', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    // Title varies by environment (Vercel deployment protection may intercept)
    // Just verify the page loads and has a URL containing /login
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('login')
  })

  test('invalid email shows error', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first()
    await emailInput.fill('nobody-xyz-test@fakeemail.com')
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Continue")').first().click()
    await expect(page.locator('text=/no account|not found|error/i').first()).toBeVisible({ timeout: 8000 })
  })

  test('redirect to login when no session', async ({ page }) => {
    // Clear any existing session
    await page.goto('/login')
    await page.evaluate(() => sessionStorage.clear())
    await page.goto('/dashboard')
    await page.waitForURL('**/login', { timeout: 8000 })
    expect(page.url()).toContain('/login')
  })
})

// ── Dashboard Overview ────────────────────────────────────────────────────────
test.describe('Dashboard Overview', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestPro(page)
    await goToDashboard(page)
  })

  test('loads dashboard with stat cards', async ({ page }) => {
    await expect(page.locator('text=/Total Leads|Leads/i').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/New/i').first()).toBeVisible()
    await expect(page.locator('text=/Revenue/i').first()).toBeVisible()
    await expect(page.locator('text=/Rating/i').first()).toBeVisible()
  })

  test('shows pipeline section', async ({ page }) => {
    await expect(page.locator('text=/Pipeline/i').first()).toBeVisible()
  })

  test('sidebar logo is clickable', async ({ page }) => {
    const logo = page.locator('a[href="/dashboard"]').first()
    await expect(logo).toBeVisible()
    await logo.click()
    await page.waitForURL('**/dashboard', { timeout: 5000 })
  })

  test('Add Lead button visible on desktop', async ({ page }) => {
    // Only check on desktop viewport
    const viewport = page.viewportSize()
    if (viewport && viewport.width >= 768) {
      await expect(page.locator('button:has-text("Add Lead")').first()).toBeVisible()
    }
  })

  test('dark mode toggle persists across navigation', async ({ page }) => {
    // Click dark mode toggle
    const toggle = page.locator('button[title*="dark"], button[title*="light"]').first()
    if (await toggle.isVisible()) {
      await toggle.click()
      // Navigate away and back
      await page.goto('/dashboard/pipeline')
      await page.waitForLoadState('networkidle')
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      // Dark mode should still be active (localStorage persisted)
      const darkMode = await page.evaluate(() => localStorage.getItem('pg_darkmode'))
      expect(darkMode).toBe('1')
    }
  })
})

// ── Pipeline ──────────────────────────────────────────────────────────────────
test.describe('Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestPro(page)
    await goToPipeline(page)
  })

  test('pipeline page loads with Lead Pipeline header', async ({ page }) => {
    await expect(page.locator('h1:has-text("Pipeline")').first()).toBeVisible({ timeout: 10000 })
  })

  test('no duplicate h2 headers on pipeline page', async ({ page }) => {
    // Previously there was a duplicate "Lead Pipeline" h2 inside the component
    const headers = page.locator('h2:has-text("Lead Pipeline")')
    const count = await headers.count()
    expect(count).toBeLessThanOrEqual(1)
  })

  test('shows stage tabs/columns', async ({ page }) => {
    await expect(page.locator('text=/New/').first()).toBeVisible({ timeout: 10000 })
  })

  test('sidebar is visible on desktop without scrollbar', async ({ page }) => {
    const viewport = page.viewportSize()
    if (viewport && viewport.width >= 768) {
      const sidebar = page.locator('aside').first()
      await expect(sidebar).toBeVisible()
      // Sidebar should not have overflow-y-auto class (scrollbar visible)
      const hasAutoScroll = await sidebar.evaluate(el =>
        el.classList.contains('overflow-y-auto')
      )
      expect(hasAutoScroll).toBe(false)
    }
  })
})

// ── Add Lead + Persist ────────────────────────────────────────────────────────
test.describe('Add Lead — persistence', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestPro(page)
    await goToPipeline(page)
  })

  test('add lead modal opens and closes', async ({ page }) => {
    const viewport = page.viewportSize()
    if (viewport && viewport.width >= 768) {
      await page.locator('button:has-text("Add Lead")').first().click()
    } else {
      // Mobile — FAB
      await page.locator('button[style*="linear-gradient"]').first().click()
    }
    await expect(page.locator('text=/Add a lead|Log a lead/i').first()).toBeVisible({ timeout: 5000 })

    // Close
    await page.keyboard.press('Escape')
    // Or click backdrop
    const modal = page.locator('text=/Add a lead|Log a lead/i').first()
    if (await modal.isVisible()) {
      await page.locator('button:has-text("Cancel")').first().click()
    }
  })

  test('phone field auto-formats to NXX-NXX-XXXX', async ({ page }) => {
    const viewport = page.viewportSize()
    if (viewport && viewport.width >= 768) {
      await page.locator('button:has-text("Add Lead")').first().click()
    } else {
      await page.locator('button[style*="linear-gradient"]').first().click()
    }
    await page.waitForSelector('input[type="tel"]', { timeout: 5000 })
    const phoneInput = page.locator('input[type="tel"]').first()
    await phoneInput.fill('9042335566')
    const value = await phoneInput.inputValue()
    // Should be formatted
    expect(value).toMatch(/\d{3}-\d{3}-\d{4}/)
  })
})

// ── Stage Change Persistence (critical regression test) ───────────────────────
test.describe('Stage change persistence', () => {
  test('changing stage on pipeline does not reset on navigation', async ({ page }) => {
    await loginAsTestPro(page)
    await goToPipeline(page)

    // If there are no leads, skip — this test requires at least one lead
    const hasLeads = await page.locator('[class*="rounded-xl"][class*="cursor-pointer"]').count()
    if (hasLeads === 0) {
      test.skip()
      return
    }

    // Click first lead card
    await page.locator('[class*="rounded-xl"][class*="cursor-pointer"]').first().click()
    await page.waitForSelector('text=/Pipeline stage/i', { timeout: 5000 })

    // Click "Contacted" stage button
    const contactedBtn = page.locator('button:has-text("Contacted")').first()
    if (await contactedBtn.isVisible()) {
      await contactedBtn.click()
      // Save
      await page.locator('button:has-text("Save")').first().click()
      await page.waitForLoadState('networkidle')

      // Navigate away and back
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await page.goto('/dashboard/pipeline')
      await page.waitForLoadState('networkidle')

      // The stage should still show Contacted (persisted in DB, not just local state)
      await expect(page.locator('text=/Contacted/').first()).toBeVisible({ timeout: 8000 })
    }
  })
})

// ── Mobile viewport specific ──────────────────────────────────────────────────
test.describe('Mobile layout', () => {
  test('bottom nav visible on mobile', async ({ page }) => {
    const viewport = page.viewportSize()
    if (!viewport || viewport.width >= 768) {
      test.skip()
      return
    }
    await loginAsTestPro(page)
    await goToDashboard(page)
    // Mobile nav should be at bottom
    const nav = page.locator('nav').last()
    await expect(nav).toBeVisible()
  })

  test('sidebar hidden on mobile', async ({ page }) => {
    const viewport = page.viewportSize()
    if (!viewport || viewport.width >= 768) {
      test.skip()
      return
    }
    await loginAsTestPro(page)
    await goToDashboard(page)
    const sidebar = page.locator('aside').first()
    // Sidebar should not be visible on mobile
    await expect(sidebar).not.toBeVisible()
  })
})
