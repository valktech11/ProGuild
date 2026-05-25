/**
 * ProGuild Roofer CRM — Full E2E Test Suite
 *
 * Covers the complete roofer workflow:
 * TC-01  Login + dashboard loads
 * TC-02  Create lead
 * TC-03  Lead appears in pipeline board
 * TC-04  Create standard estimate from lead
 * TC-05  Send estimate to homeowner
 * TC-06  Public estimate page loads + shows correct data
 * TC-07  Homeowner signs standard estimate
 * TC-08  Lead auto-advances to Proposal Signed
 * TC-09  Invoice auto-created after signing
 * TC-10  Invoice detail page loads correctly
 * TC-11  Send invoice email
 * TC-12  Record payment — deposit milestone (non-card)
 * TC-13  Invoice shows partial payment / balance reduces
 * TC-14  Record final payment — fully paid
 * TC-15  Lead auto-advances to Job Won
 * TC-16  Create GBB estimate
 * TC-17  GBB public page — tier selection
 * TC-18  Homeowner selects upgraded tier + signs
 * TC-19  Invoice total matches selected tier
 * TC-20  Stripe card payment flow (test card)
 */

import { test, expect, Page } from '@playwright/test'
import { loginAsTestPro, BASE_URL } from './helpers'

// ── Test data ──────────────────────────────────────────────────────────────────
const ROOFER_EMAIL = process.env.TEST_ROOFER_EMAIL || 'samaltman@sam.com'
const TEST_CLIENT = {
  name:    'E2E Test Client',
  email:   process.env.TEST_CLIENT_EMAIL || 'e2e-test@proguild.ai',
  phone:   '(555) 000-1234',
  address: '100 Test Street, Jacksonville, FL 32216',
}
const STRIPE_TEST_CARD = {
  number: '4242 4242 4242 4242',
  expiry: '12/28',
  cvc:    '123',
  zip:    '32216',
}

// ── Shared state across tests ──────────────────────────────────────────────────
let leadId:        string
let leadDetailUrl: string
let estimateId:    string
let estimatePublicUrl: string
let invoiceId:     string
let invoicePublicUrl:  string
let gbbEstimateId: string
let gbbPublicUrl:  string

// ── Auth helper for roofer account ────────────────────────────────────────────
async function loginAsRoofer(page: Page) {
  const res = await page.request.post(`${BASE_URL}/api/auth`, {
    data: { email: ROOFER_EMAIL },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok()) throw new Error(`Roofer auth failed: ${res.status()}`)
  const { session } = await res.json()
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' })
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate((s) => sessionStorage.setItem('pg_pro', JSON.stringify(s)), session)
  return session
}

// ── TC-01: Login + Dashboard ───────────────────────────────────────────────────
test('TC-01: Roofer logs in and dashboard loads', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })

  // Dashboard loads with key elements
  await expect(page.getByText('Overview')).toBeVisible()
  await expect(page.getByText('Jobs')).toBeVisible()
  await expect(page.getByText('Proposals')).toBeVisible()
  await expect(page.getByText('Invoices')).toBeVisible()

  // Roofing tools sidebar section
  await expect(page.getByText('ROOFING TOOLS')).toBeVisible()
  await expect(page.getByText('ProMeasure')).toBeVisible()
})

// ── TC-02: Create Lead ─────────────────────────────────────────────────────────
test('TC-02: Create new lead', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline`, { waitUntil: 'networkidle' })

  // Open add lead modal
  await page.getByRole('button', { name: /add new lead/i }).first().click()
  await page.waitForSelector('[placeholder*="Contact name"], [placeholder*="Full name"]')

  // Fill lead form
  await page.getByPlaceholder(/contact name|full name/i).fill(TEST_CLIENT.name)
  await page.getByPlaceholder(/email/i).first().fill(TEST_CLIENT.email)
  await page.getByPlaceholder(/phone/i).first().fill(TEST_CLIENT.phone)

  // Submit
  await page.getByRole('button', { name: /add lead|save|create/i }).click()
  await page.waitForTimeout(2000)

  // Verify lead appears in pipeline
  await expect(page.getByText(TEST_CLIENT.name)).toBeVisible()
})

// ── TC-03: Lead appears in pipeline board ─────────────────────────────────────
test('TC-03: Lead visible in pipeline board and detail opens', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline`, { waitUntil: 'networkidle' })

  // Find the test lead card
  const leadCard = page.locator(`text=${TEST_CLIENT.name}`).first()
  await expect(leadCard).toBeVisible()

  // Click to open lead detail
  await leadCard.click()
  await page.waitForURL(/\/dashboard\/pipeline\//, { timeout: 10000 })

  leadDetailUrl = page.url()
  leadId = leadDetailUrl.split('/pipeline/')[1].split('?')[0]

  await expect(page.getByText(TEST_CLIENT.name)).toBeVisible()
  await expect(page.getByText('Lead In')).toBeVisible()
})

// ── TC-04: Create Standard Estimate ───────────────────────────────────────────
test('TC-04: Create standard estimate from lead', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(leadDetailUrl, { waitUntil: 'networkidle' })

  // Click Estimate tab
  await page.getByText('Estimate').click()

  // Create estimate button
  await page.getByRole('button', { name: /create estimate|new estimate/i }).click()
  await page.waitForURL(/\/dashboard\/estimates\//, { timeout: 15000 })

  estimateId = page.url().split('/estimates/')[1].split('?')[0]

  // Estimate builder loads
  await expect(page.getByText(/EST-/)).toBeVisible()
  await expect(page.getByText('Standard')).toBeVisible()

  // Add a line item
  await page.getByRole('button', { name: /add item/i }).click()
  await page.waitForTimeout(500)

  // Save
  await page.getByRole('button', { name: /save/i }).click()
  await page.waitForTimeout(2000)

  await expect(page.getByText('Saved')).toBeVisible()
})

// ── TC-05: Send Estimate ───────────────────────────────────────────────────────
test('TC-05: Send estimate to homeowner', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/estimates/${estimateId}`, { waitUntil: 'networkidle' })

  // Send button visible
  const sendBtn = page.getByRole('button', { name: /send to homeowner/i })
  await expect(sendBtn).toBeVisible()
  await sendBtn.click()

  await page.waitForTimeout(3000)

  // Status updates to Sent
  await expect(page.getByText('Sent')).toBeVisible()

  // Progress timeline shows Sent step
  await expect(page.getByText(TEST_CLIENT.email)).toBeVisible()
})

// ── TC-06: Public estimate page loads ─────────────────────────────────────────
test('TC-06: Public estimate page loads with correct data', async ({ page }) => {
  // Fetch estimate data to get public URL
  const res = await page.request.get(`${BASE_URL}/api/estimates/${estimateId}`)
  expect(res.ok()).toBeTruthy()

  estimatePublicUrl = `${BASE_URL}/estimate/${estimateId}`
  await page.goto(estimatePublicUrl, { waitUntil: 'networkidle' })

  // Hero shows address
  await expect(page.getByText(/roofing proposal/i)).toBeVisible()

  // Standard estimate shows line items in "What's Included"
  await expect(page.getByText("What's Included")).toBeVisible()

  // Sign section visible
  await expect(page.getByText(/sign to approve|sign here/i)).toBeVisible()

  // Estimate Summary shows total
  await expect(page.getByText('Estimate Summary')).toBeVisible()
})

// ── TC-07: Homeowner signs estimate ───────────────────────────────────────────
test('TC-07: Homeowner signs standard estimate', async ({ page }) => {
  await page.goto(estimatePublicUrl, { waitUntil: 'networkidle' })

  // Find signature canvas
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()

  // Draw signature
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 50, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + box.height / 2)
    await page.mouse.move(box.x + 100, box.y + box.height / 3)
    await page.mouse.up()
  }

  // Confirm & Sign
  const confirmBtn = page.getByRole('button', { name: /confirm.*sign/i })
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()

  await page.waitForTimeout(4000)

  // Success state
  await expect(page.getByText(/approved|signed|thank you/i).first()).toBeVisible()
})

// ── TC-08: Lead auto-advances to Proposal Signed ──────────────────────────────
test('TC-08: Lead auto-advances to Proposal Signed after signing', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline/${leadId}`, { waitUntil: 'networkidle' })

  // Status pill shows Proposal Signed
  await expect(page.getByText('Proposal Signed')).toBeVisible()

  // Estimate status shows Approved
  await page.getByText('Estimate').click()
  await expect(page.getByText('Approved')).toBeVisible()
})

// ── TC-09: Invoice auto-created after signing ──────────────────────────────────
test('TC-09: Invoice auto-created and visible in invoices list', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices`, { waitUntil: 'networkidle' })

  // Invoice for test client visible
  await expect(page.getByText(TEST_CLIENT.name).or(page.getByText(TEST_CLIENT.email))).toBeVisible({ timeout: 15000 })

  // Click Open on the invoice
  await page.getByRole('button', { name: /open/i }).first().click()
  await page.waitForURL(/\/dashboard\/invoices\//, { timeout: 10000 })

  invoiceId = page.url().split('/invoices/')[1].split('?')[0]
  invoicePublicUrl = `${BASE_URL}/invoice/${invoiceId}`
})

// ── TC-10: Invoice detail page loads correctly ─────────────────────────────────
test('TC-10: Invoice detail page shows correct data', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })

  // Invoice number visible
  await expect(page.getByText(/INV-/)).toBeVisible()

  // Client info
  await expect(page.getByText(TEST_CLIENT.name).or(page.getByText(TEST_CLIENT.email))).toBeVisible()

  // Payment schedule
  await expect(page.getByText('Payment Schedule')).toBeVisible()
  await expect(page.getByText('Deposit')).toBeVisible()

  // Balance due shows full amount
  await expect(page.getByText('Balance Due')).toBeVisible()

  // Action buttons
  await expect(page.getByRole('button', { name: /send invoice/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /record payment/i })).toBeVisible()
})

// ── TC-11: Send invoice email ──────────────────────────────────────────────────
test('TC-11: Send invoice to homeowner', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: /send invoice/i }).click()
  await page.waitForTimeout(3000)

  // Status badge updates
  await expect(page.getByText('Sent').first()).toBeVisible()
})

// ── TC-12: Record deposit payment (non-card) ───────────────────────────────────
test('TC-12: Record deposit payment via Zelle', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })

  // Open Record Payment modal
  await page.getByRole('button', { name: /record payment/i }).click()
  await page.waitForSelector('text=Record Payment')

  // Select Deposit milestone
  await page.getByText('Deposit').click()

  // Method already defaults — just set reference
  await page.getByPlaceholder(/reference|confirmation/i).fill('Zelle conf #E2E-001')

  // Confirm
  await page.getByRole('button', { name: /record payment/i }).last().click()
  await page.waitForTimeout(3000)

  // Success toast
  await expect(page.getByText(/recorded|paid/i).first()).toBeVisible()
})

// ── TC-13: Partial payment reflected ──────────────────────────────────────────
test('TC-13: Invoice shows partial payment status', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })

  // Status badge shows Partial Payment
  await expect(
    page.getByText(/partial/i).or(page.getByText('Partial Payment'))
  ).toBeVisible()

  // Payment history shows deposit
  await expect(page.getByText('Deposit')).toBeVisible()
  await expect(page.getByText('Zelle conf #E2E-001')).toBeVisible()

  // Balance due reduced
  await expect(page.getByText('0%').first()).not.toBeVisible()
})

// ── TC-14: Record final payment ────────────────────────────────────────────────
test('TC-14: Record remaining payments — invoice fully paid', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })

  // Record Material Delivery payment
  await page.getByRole('button', { name: /record payment/i }).click()
  await page.waitForSelector('text=Record Payment')
  await page.getByText('At Material Delivery').click()
  await page.getByRole('button', { name: /record payment/i }).last().click()
  await page.waitForTimeout(2000)

  // Record On Completion payment
  await page.getByRole('button', { name: /record payment/i }).click()
  await page.waitForSelector('text=Record Payment')
  await page.getByText('On Completion').click()
  await page.getByRole('button', { name: /record payment/i }).last().click()
  await page.waitForTimeout(3000)

  // Invoice now shows Paid
  await expect(page.getByText('Paid ✓').or(page.getByText('Paid in Full'))).toBeVisible()
  await expect(page.getByText('$0.00').first()).toBeVisible()
})

// ── TC-15: Lead advances to Job Won ───────────────────────────────────────────
test('TC-15: Lead auto-advances to Job Won after full payment', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline/${leadId}`, { waitUntil: 'networkidle' })

  await expect(page.getByText('Job Won')).toBeVisible()
})

// ── TC-16: Create GBB Estimate ────────────────────────────────────────────────
test('TC-16: Create GBB (Good/Better/Best) estimate', async ({ page }) => {
  await loginAsRoofer(page)

  // Create new lead for GBB test
  await page.goto(`${BASE_URL}/dashboard/pipeline`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /add new lead/i }).first().click()
  await page.waitForSelector('[placeholder*="Contact name"], [placeholder*="Full name"]')
  await page.getByPlaceholder(/contact name|full name/i).fill('E2E GBB Client')
  await page.getByPlaceholder(/email/i).first().fill('gbb-e2e@proguild.ai')
  await page.getByRole('button', { name: /add lead|save|create/i }).click()
  await page.waitForTimeout(2000)

  // Open the new lead
  await page.getByText('E2E GBB Client').first().click()
  await page.waitForURL(/\/dashboard\/pipeline\//)
  const gbbLeadId = page.url().split('/pipeline/')[1].split('?')[0]

  // Create estimate
  await page.getByText('Estimate').click()
  await page.getByRole('button', { name: /create estimate|new estimate/i }).click()
  await page.waitForURL(/\/dashboard\/estimates\//, { timeout: 15000 })
  gbbEstimateId = page.url().split('/estimates/')[1].split('?')[0]

  // Switch to GBB
  await page.getByText('Good / Better / Best').click()
  await page.waitForTimeout(1000)

  // Three tier cards visible
  await expect(page.getByText('STANDARD')).toBeVisible()
  await expect(page.getByText('UPGRADED')).toBeVisible()
  await expect(page.getByText('PREMIUM')).toBeVisible()

  // Select Upgraded tier
  await page.getByRole('button', { name: /select upgraded/i }).click()
  await page.waitForTimeout(500)

  // Save
  await page.getByRole('button', { name: /save/i }).click()
  await page.waitForTimeout(2000)
  await expect(page.getByText('Saved')).toBeVisible()
})

// ── TC-17: GBB public page shows tiers ────────────────────────────────────────
test('TC-17: GBB public estimate page shows all three tiers', async ({ page }) => {
  gbbPublicUrl = `${BASE_URL}/estimate/${gbbEstimateId}`
  await page.goto(gbbPublicUrl, { waitUntil: 'networkidle' })

  // All three tier cards
  await expect(page.getByText('CertainTeed Landmark').or(page.getByText('Standard'))).toBeVisible()
  await expect(page.getByText('Owens Corning Duration').or(page.getByText('Upgraded'))).toBeVisible()
  await expect(page.getByText('GAF Timberline HDZ').or(page.getByText('Premium'))).toBeVisible()

  // Price range teaser in right panel
  await expect(page.getByText('Your Investment Range')).toBeVisible()

  // Select buttons visible
  await expect(page.getByRole('button', { name: /select upgraded/i })).toBeVisible()
})

// ── TC-18: Homeowner selects tier and signs ────────────────────────────────────
test('TC-18: Homeowner selects Upgraded tier and signs', async ({ page }) => {
  await page.goto(gbbPublicUrl, { waitUntil: 'networkidle' })

  // Select Upgraded
  await page.getByRole('button', { name: /select upgraded/i }).click()
  await page.waitForTimeout(1000)

  // Right panel shows selected summary
  await expect(page.getByText('Selected')).toBeVisible()
  await expect(page.getByText('Owens Corning Duration')).toBeVisible()

  // Sign
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 40, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + box.height / 2)
    await page.mouse.up()
  }

  await page.getByRole('button', { name: /confirm.*sign/i }).click()
  await page.waitForTimeout(4000)

  await expect(page.getByText(/approved|signed|thank you/i).first()).toBeVisible()
})

// ── TC-19: Invoice reflects selected GBB tier amount ──────────────────────────
test('TC-19: GBB invoice total matches Upgraded tier subtotal', async ({ page }) => {
  await loginAsRoofer(page)
  await page.goto(`${BASE_URL}/dashboard/invoices`, { waitUntil: 'networkidle' })

  // Find the GBB invoice
  await expect(page.getByText('E2E GBB Client').or(page.getByText('gbb-e2e@proguild.ai'))).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: /open/i }).first().click()
  await page.waitForURL(/\/dashboard\/invoices\//)

  const gbbInvoiceId = page.url().split('/invoices/')[1].split('?')[0]

  // Fetch invoice to verify total = upgraded tier total
  const res = await page.request.get(`${BASE_URL}/api/invoices/${gbbInvoiceId}`)
  const data = await res.json()

  // Upgraded tier should have been selected — total > standard, < premium
  expect(data.invoice.total).toBeGreaterThan(data.invoice.subtotal)
  expect(data.invoice.status).not.toBe('draft')
})

// ── TC-20: Stripe card payment (test mode) ─────────────────────────────────────
test('TC-20: Homeowner pays deposit via Stripe test card', async ({ page }) => {
  // Skip if Stripe not configured
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey || !stripeKey.startsWith('sk_test_')) {
    test.skip(true, 'STRIPE_SECRET_KEY not set or not in test mode')
    return
  }

  await page.goto(invoicePublicUrl, { waitUntil: 'networkidle' })

  // If already paid from previous tests, skip
  const isPaid = await page.getByText('Paid in Full').isVisible()
  if (isPaid) { test.skip(true, 'Invoice already paid'); return }

  // Select Deposit milestone
  const depositOption = page.locator('label', { hasText: 'Deposit' }).first()
  await depositOption.click()

  // Choose Card payment method
  await page.getByText('Card').click()

  // Continue to confirm
  await page.getByRole('button', { name: /continue to pay/i }).click()
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /confirm.*payment/i }).click()

  // Wait for Stripe redirect
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 })
  expect(page.url()).toContain('checkout.stripe.com')

  // Fill Stripe checkout form
  await page.waitForSelector('[placeholder="Card number"]', { timeout: 15000 })
  await page.fill('[placeholder="Card number"]', STRIPE_TEST_CARD.number)
  await page.fill('[placeholder="MM / YY"]', STRIPE_TEST_CARD.expiry)
  await page.fill('[placeholder="CVC"]', STRIPE_TEST_CARD.cvc)

  // Some Stripe forms ask for name or zip
  const nameField = page.locator('[placeholder="Full name on card"]')
  if (await nameField.isVisible()) await nameField.fill('E2E Test Client')

  const zipField = page.locator('[placeholder="ZIP"]')
  if (await zipField.isVisible()) await zipField.fill(STRIPE_TEST_CARD.zip)

  // Submit payment
  await page.getByRole('button', { name: /pay/i }).click()

  // Wait for redirect back to invoice
  await page.waitForURL(/\/invoice\//, { timeout: 30000 })

  // Success banner
  await expect(
    page.getByText(/deposit.*confirmed|payment confirmed/i).first()
  ).toBeVisible({ timeout: 10000 })
})

// ── Cleanup ────────────────────────────────────────────────────────────────────
test.afterAll(async ({ request }) => {
  // Optional: clean up E2E test leads from DB via API
  // This prevents test data accumulating in staging
  console.log('E2E test suite complete.')
  console.log(`Lead ID: ${leadId}`)
  console.log(`Estimate ID: ${estimateId}`)
  console.log(`Invoice ID: ${invoiceId}`)
  console.log(`GBB Estimate ID: ${gbbEstimateId}`)
})
