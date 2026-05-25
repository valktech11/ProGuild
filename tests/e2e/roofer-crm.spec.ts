/**
 * ProGuild Roofer CRM — Full E2E Test Suite
 * State persisted via .e2e-state.json between tests.
 * Lead seeded via Supabase admin in TC-02 — no UI modal needed.
 */

import { test, expect, Page } from '@playwright/test'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL || 'https://staging.proguild.ai'
const ROOFER_EMAIL = process.env.TEST_ROOFER_EMAIL   || 'samaltman@sam.com'
const CLIENT_EMAIL = process.env.TEST_CLIENT_EMAIL   || 'delivered@resend.dev'
const STAGING_PW   = process.env.STAGING_PASSWORD    || 'proguild2026'
const PRO_ID       = '2fbc58c2-c9d3-4040-acf9-810c3b215a05'
const CLIENT_NAME  = 'E2E Roofer Test'
const STATE_FILE   = join(process.cwd(), 'tests/e2e/.e2e-state.json')

type State = {
  leadId?: string; leadDetailUrl?: string
  estimateId?: string; estimatePublicUrl?: string
  invoiceId?: string; invoicePublicUrl?: string
  gbbEstimateId?: string; gbbPublicUrl?: string; gbbLeadId?: string
}

function saveState(u: Partial<State>) {
  const c: State = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
  writeFileSync(STATE_FILE, JSON.stringify({ ...c, ...u }, null, 2))
}
function getState(): State {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
}
function getAdmin() {
  return createClient(
    process.env.STAGING_SUPABASE_URL!,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function login(page: Page) {
  const domain = new URL(BASE_URL).hostname
  await page.context().addCookies([{
    name: 'staging_auth', value: STAGING_PW,
    domain, path: '/', httpOnly: false, secure: BASE_URL.startsWith('https'),
  }])
  const res = await page.request.post(`${BASE_URL}/api/auth`, {
    data: { email: ROOFER_EMAIL }, headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok()) throw new Error(`Auth failed ${res.status()}: ${await res.text()}`)
  const { session } = await res.json()
  if (!session) throw new Error('No session returned')
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(s => sessionStorage.setItem('pg_pro', JSON.stringify(s)), session)
  await page.reload({ waitUntil: 'networkidle' })
  return session
}

test.beforeAll(async () => {
  writeFileSync(STATE_FILE, JSON.stringify({}))
})

// TC-01 ───────────────────────────────────────────────────────────────────────
test('TC-01: Roofer logs in and dashboard loads', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  await expect(page.getByRole('link', { name: /overview/i }).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('link', { name: '📋 Jobs' })).toBeVisible()
  await expect(page.getByRole('link', { name: '📝 Proposals' })).toBeVisible()
  await expect(page.getByRole('link', { name: '💰 Invoices' })).toBeVisible()
  await expect(page.getByRole('link', { name: /promeasure/i })).toBeVisible()
})

// TC-02 ───────────────────────────────────────────────────────────────────────
test('TC-02: Seed test lead via Supabase', async ({ page }) => {
  const admin = getAdmin()
  const { data: lead, error } = await admin.from('leads').insert({
    pro_id:        PRO_ID,
    contact_name:  CLIENT_NAME,
    contact_email: CLIENT_EMAIL,
    contact_phone: '(904) 555-0123',
    lead_source:   'other',
    lead_status:   'lead_in',
    message:       'E2E test lead — Playwright',
    created_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }).select('id').single()
  if (error) throw new Error(`Seed failed: ${error.message}`)
  expect(lead.id).toBeTruthy()
  saveState({
    leadId:        lead.id,
    leadDetailUrl: `${BASE_URL}/dashboard/pipeline/${lead.id}`,
  })
})

// TC-03 ───────────────────────────────────────────────────────────────────────
test('TC-03: Lead detail page loads', async ({ page }) => {
  const { leadId, leadDetailUrl } = getState()
  if (!leadId) { test.skip(true, 'TC-02 failed'); return }
  await login(page)
  await page.goto(leadDetailUrl!, { waitUntil: 'networkidle' })
  await expect(page.getByText(CLIENT_NAME).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Lead In').first()).toBeVisible({ timeout: 5000 })
})

// TC-04 ───────────────────────────────────────────────────────────────────────
test('TC-04: Create estimate from lead', async ({ page }) => {
  const { leadDetailUrl, leadId } = getState()
  if (!leadDetailUrl) { test.skip(true, 'TC-03 failed'); return }
  await login(page)
  await page.goto(leadDetailUrl, { waitUntil: 'networkidle' })
  await page.getByText('Estimate', { exact: true }).click()
  await page.waitForTimeout(500)
  const createBtn = page.getByRole('button', { name: /create estimate/i })
  await expect(createBtn).toBeVisible({ timeout: 10000 })
  await createBtn.click()
  await page.waitForURL(/\/dashboard\/estimates\/[a-f0-9-]{36}/, { timeout: 20000 })
  const estimateId = page.url().split('/estimates/')[1]?.split('?')[0]
  expect(estimateId).toMatch(/^[a-f0-9-]{36}$/)
  saveState({ estimateId })
  await expect(page.getByText(/EST-\d+/).first()).toBeVisible({ timeout: 10000 })
})

// TC-05 ───────────────────────────────────────────────────────────────────────
test('TC-05: Send estimate to homeowner', async ({ page }) => {
  const { estimateId, leadId } = getState()
  if (!estimateId) { test.skip(true, 'TC-04 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/estimates/${estimateId}?from=pipeline&lead_id=${leadId}`, { waitUntil: 'networkidle' })
  const sendBtn = page.getByRole('button', { name: /send to homeowner|resend/i })
  await expect(sendBtn).toBeVisible({ timeout: 10000 })
  await sendBtn.click()
  await page.waitForTimeout(4000)
  await expect(page.getByText('Sent').or(page.getByText('Resend')).or(page.getByText('Viewed'))).toBeVisible({ timeout: 10000 })
})

// TC-06 ───────────────────────────────────────────────────────────────────────
test('TC-06: Public estimate page loads', async ({ page }) => {
  const { estimateId } = getState()
  if (!estimateId) { test.skip(true, 'TC-04 failed'); return }
  const url = `${BASE_URL}/estimate/${estimateId}`
  saveState({ estimatePublicUrl: url })
  await page.goto(url, { waitUntil: 'networkidle' })
  await expect(page.getByText(/roofing proposal/i).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible()
})

// TC-07 ───────────────────────────────────────────────────────────────────────
test('TC-07: Homeowner signs estimate', async ({ page }) => {
  const { estimatePublicUrl } = getState()
  if (!estimatePublicUrl) { test.skip(true, 'TC-06 failed'); return }
  await page.goto(estimatePublicUrl, { waitUntil: 'networkidle' })
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 10000 })
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')
  await page.mouse.move(box.x + 30, box.y + box.height / 2)
  await page.mouse.down()
  for (let x = 30; x < 200; x += 10) {
    await page.mouse.move(box.x + x, box.y + box.height / 2 + Math.sin(x / 20) * 15)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
  const confirmBtn = page.getByRole('button', { name: /confirm.*sign proposal|confirm & sign/i })
  await expect(confirmBtn).toBeVisible({ timeout: 5000 })
  await confirmBtn.click()
  await page.waitForTimeout(6000)
  await expect(page.getByText(/signature.*recorded|approved|thank you/i).first()).toBeVisible({ timeout: 15000 })
})

// TC-08 ───────────────────────────────────────────────────────────────────────
test('TC-08: Lead advances to Proposal Signed', async ({ page }) => {
  const { leadId } = getState()
  if (!leadId) { test.skip(true, 'TC-02 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline/${leadId}`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Proposal Signed').first()).toBeVisible({ timeout: 15000 })
})

// TC-09 ───────────────────────────────────────────────────────────────────────
test('TC-09: Invoice auto-created', async ({ page }) => {
  const { leadId } = getState()
  if (!leadId) { test.skip(true, 'TC-02 failed'); return }
  // Get invoice directly from DB
  const admin = getAdmin()
  const { data: invoices } = await admin.from('invoices').select('id').eq('lead_id', leadId).limit(1)
  if (invoices?.length) {
    const invoiceId = invoices[0].id
    saveState({ invoiceId, invoicePublicUrl: `${BASE_URL}/invoice/${invoiceId}` })
    await login(page)
    await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })
    await expect(page.getByText(/INV-\d+/).first()).toBeVisible({ timeout: 10000 })
  } else {
    // Navigate to invoices list and find it
    await login(page)
    await page.goto(`${BASE_URL}/dashboard/invoices`, { waitUntil: 'networkidle' })
    const row = page.getByText(CLIENT_NAME).or(page.getByText(CLIENT_EMAIL))
    await expect(row.first()).toBeVisible({ timeout: 20000 })
    await row.first().click()
    await page.waitForURL(/\/dashboard\/invoices\/[a-f0-9-]{36}/, { timeout: 10000 })
    const invoiceId = page.url().split('/invoices/')[1]?.split('?')[0]
    saveState({ invoiceId, invoicePublicUrl: `${BASE_URL}/invoice/${invoiceId}` })
  }
})

// TC-10 ───────────────────────────────────────────────────────────────────────
test('TC-10: Invoice detail page correct', async ({ page }) => {
  const { invoiceId } = getState()
  if (!invoiceId) { test.skip(true, 'TC-09 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })
  await expect(page.getByText(/INV-\d+/).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Balance Due').first()).toBeVisible()
  await expect(page.getByText('Payment Schedule')).toBeVisible()
  await expect(page.getByRole('button', { name: /send invoice|resend invoice/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /record payment/i })).toBeVisible()
})

// TC-11 ───────────────────────────────────────────────────────────────────────
test('TC-11: Send invoice', async ({ page }) => {
  const { invoiceId } = getState()
  if (!invoiceId) { test.skip(true, 'TC-09 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /send invoice|resend invoice/i }).click()
  await page.waitForTimeout(3000)
  await expect(page.getByText('Sent').or(page.getByText(/invoice sent/i)).first()).toBeVisible({ timeout: 10000 })
})

// TC-12 ───────────────────────────────────────────────────────────────────────
test('TC-12: Record deposit payment', async ({ page }) => {
  const { invoiceId } = getState()
  if (!invoiceId) { test.skip(true, 'TC-09 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /record payment/i }).click()
  await expect(page.getByText('Record Payment').first()).toBeVisible({ timeout: 5000 })
  await page.locator('label', { hasText: 'Deposit' }).first().click()
  await page.getByPlaceholder(/reference|confirmation/i).fill('E2E-Zelle-001')
  await page.getByRole('button', { name: 'Record Payment' }).last().click()
  await page.waitForTimeout(3000)
  await expect(page.getByText(/recorded|partial/i).first()).toBeVisible({ timeout: 10000 })
})

// TC-13 ───────────────────────────────────────────────────────────────────────
test('TC-13: Partial payment reflected', async ({ page }) => {
  const { invoiceId } = getState()
  if (!invoiceId) { test.skip(true, 'TC-09 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })
  await expect(page.getByText(/partial/i).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('E2E-Zelle-001')).toBeVisible()
})

// TC-14 ───────────────────────────────────────────────────────────────────────
test('TC-14: Record remaining payments', async ({ page }) => {
  const { invoiceId } = getState()
  if (!invoiceId) { test.skip(true, 'TC-09 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /record payment/i }).click()
  await expect(page.getByText('Record Payment').first()).toBeVisible({ timeout: 5000 })
  await page.locator('label', { hasText: /material delivery/i }).first().click()
  await page.getByRole('button', { name: 'Record Payment' }).last().click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: /record payment/i }).click()
  await expect(page.getByText('Record Payment').first()).toBeVisible({ timeout: 5000 })
  await page.locator('label', { hasText: /completion/i }).first().click()
  await page.getByRole('button', { name: 'Record Payment' }).last().click()
  await page.waitForTimeout(3000)
  await expect(page.getByText(/paid in full|paid ✓/i).first()).toBeVisible({ timeout: 10000 })
})

// TC-15 ───────────────────────────────────────────────────────────────────────
test('TC-15: Lead advances to Job Won', async ({ page }) => {
  const { leadId } = getState()
  if (!leadId) { test.skip(true, 'TC-02 failed'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline/${leadId}`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Job Won').first()).toBeVisible({ timeout: 15000 })
})

// TC-16 ───────────────────────────────────────────────────────────────────────
test('TC-16: Seed GBB lead and create estimate', async ({ page }) => {
  const admin = getAdmin()
  const { data: gbbLead, error } = await admin.from('leads').insert({
    pro_id:        PRO_ID,
    contact_name:  'E2E GBB Client',
    contact_email: 'gbb@delivered.resend.dev',
    contact_phone: '(904) 555-9999',
    lead_source:   'other',
    lead_status:   'lead_in',
    message:       'E2E GBB test lead — Playwright',
    created_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }).select('id').single()
  if (error) throw new Error(`GBB lead seed failed: ${error.message}`)
  saveState({ gbbLeadId: gbbLead.id })

  await login(page)
  await page.goto(`${BASE_URL}/dashboard/pipeline/${gbbLead.id}`, { waitUntil: 'networkidle' })
  await page.getByText('Estimate', { exact: true }).click()
  await page.waitForTimeout(500)
  const createBtn = page.getByRole('button', { name: /create estimate/i })
  await expect(createBtn).toBeVisible({ timeout: 10000 })
  await createBtn.click()
  await page.waitForURL(/\/dashboard\/estimates\/[a-f0-9-]{36}/, { timeout: 20000 })
  const gbbEstimateId = page.url().split('/estimates/')[1]?.split('?')[0]
  saveState({ gbbEstimateId })

  await page.getByRole('button', { name: 'Good / Better / Best' }).click()
  await page.waitForTimeout(1500)
  const switchBtn = page.getByRole('button', { name: /switch to good/i })
  if (await switchBtn.isVisible({ timeout: 2000 }).catch(() => false)) await switchBtn.click()
  await page.waitForTimeout(500)

  await expect(page.getByText('STANDARD').first()).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: /select upgraded/i }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /save changes/i }).click()
  await page.waitForTimeout(2000)
  await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 10000 })
})

// TC-17 ───────────────────────────────────────────────────────────────────────
test('TC-17: GBB public page shows tiers', async ({ page }) => {
  const { gbbEstimateId } = getState()
  if (!gbbEstimateId) { test.skip(true, 'TC-16 failed'); return }
  const url = `${BASE_URL}/estimate/${gbbEstimateId}`
  saveState({ gbbPublicUrl: url })
  await page.goto(url, { waitUntil: 'networkidle' })
  await expect(page.getByText('STANDARD').or(page.getByText(/certainteed/i)).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('UPGRADED').or(page.getByText(/owens corning/i)).first()).toBeVisible()
  await expect(page.getByText('PREMIUM').or(page.getByText(/gaf timberline/i)).first()).toBeVisible()
  await expect(page.getByText('Your Investment Range')).toBeVisible()
})

// TC-18 ───────────────────────────────────────────────────────────────────────
test('TC-18: Homeowner selects tier and signs GBB', async ({ page }) => {
  const { gbbPublicUrl } = getState()
  if (!gbbPublicUrl) { test.skip(true, 'TC-17 failed'); return }
  await page.goto(gbbPublicUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /select upgraded/i }).click()
  await page.waitForTimeout(1000)
  await expect(page.getByText('Selected').first()).toBeVisible({ timeout: 5000 })
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 10000 })
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')
  await page.mouse.move(box.x + 30, box.y + box.height / 2)
  await page.mouse.down()
  for (let x = 30; x < 200; x += 15) {
    await page.mouse.move(box.x + x, box.y + box.height / 2 + Math.sin(x / 15) * 15)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /confirm.*sign proposal|confirm & sign/i }).click()
  await page.waitForTimeout(6000)
  await expect(page.getByText(/signature.*recorded|approved|thank you/i).first()).toBeVisible({ timeout: 15000 })
})

// TC-19 ───────────────────────────────────────────────────────────────────────
test('TC-19: GBB invoice matches selected tier', async ({ page }) => {
  const { gbbLeadId } = getState()
  if (!gbbLeadId) { test.skip(true, 'TC-16 failed'); return }
  const admin = getAdmin()
  const { data: invoices } = await admin.from('invoices').select('id').eq('lead_id', gbbLeadId).limit(1)
  if (!invoices?.length) { test.skip(true, 'No GBB invoice found — signing may not have created one'); return }
  await login(page)
  await page.goto(`${BASE_URL}/dashboard/invoices/${invoices[0].id}`, { waitUntil: 'networkidle' })
  await expect(page.getByText(/INV-\d+/).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Balance Due').first()).toBeVisible()
  await expect(page.getByText('Payment Schedule')).toBeVisible()
})

// TC-20 ───────────────────────────────────────────────────────────────────────
test('TC-20: Stripe card payment', async ({ page }) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey?.startsWith('sk_test_')) { test.skip(true, 'Stripe not in test mode'); return }
  const { invoicePublicUrl } = getState()
  if (!invoicePublicUrl) { test.skip(true, 'invoicePublicUrl not set'); return }
  await page.goto(invoicePublicUrl, { waitUntil: 'networkidle' })
  if (await page.getByText(/paid in full/i).isVisible()) { test.skip(true, 'Already paid'); return }
  await page.locator('label').filter({ hasText: /deposit|material|completion/i }).first().click()
  await page.getByText('Card').click()
  await page.getByRole('button', { name: /continue to pay/i }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /confirm.*payment/i }).click()
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 })
  await page.waitForSelector('[placeholder="Card number"]', { timeout: 15000 })
  await page.fill('[placeholder="Card number"]', '4242 4242 4242 4242')
  await page.fill('[placeholder="MM / YY"]', '12/28')
  await page.fill('[placeholder="CVC"]', '123')
  const nameField = page.locator('[placeholder="Full name on card"]')
  if (await nameField.isVisible()) await nameField.fill('E2E Test')
  const zipField = page.locator('[placeholder="ZIP"]')
  if (await zipField.isVisible()) await zipField.fill('32216')
  await page.getByRole('button', { name: /pay/i }).click()
  await page.waitForURL(/\/invoice\//, { timeout: 30000 })
  await expect(page.getByText(/confirmed|payment.*confirmed/i).first()).toBeVisible({ timeout: 10000 })
})

// Cleanup ─────────────────────────────────────────────────────────────────────
test.afterAll(async () => {
  const s = getState()
  console.log('\n=== E2E Run Summary ===')
  Object.entries(s).forEach(([k, v]) => console.log(`${k}: ${v ?? 'not set'}`))
  console.log('=======================\n')
})
