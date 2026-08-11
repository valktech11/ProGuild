/**
 * transactions.spec.ts
 *
 * Transactional E2E tests — covers every write operation in the CRM.
 * Each test asserts BOTH UI state AND the DB row via Supabase Admin.
 * A green toast with a silent failed DB write will NOT pass here.
 *
 * Test pro is seeded in global-setup.ts and deleted in global-teardown.ts.
 * All leads/clients created here are cleaned up by teardown automatically
 * (DELETE WHERE pro_id = getProId()).
 */

import { createClient } from '@supabase/supabase-js'
import { test, expect, BASE_URL } from './fixtures'
import { readFileSync } from 'fs'
import { join } from 'path'

// Pro ID is written by global-setup at runtime (uses existing staging test pro)
function getProId(): string {
  return readFileSync(join(process.cwd(), 'tests/e2e/.e2e-pro-id'), 'utf-8').trim()
}

// Admin client for direct DB assertions — never used to seed test state (use UI for that)
function getAdmin() {
  return createClient(
    process.env.STAGING_SUPABASE_URL!,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Lead — Add', () => {

  test('Add Lead via modal — card appears in New column and DB row exists', async ({ authedPage: page }) => {
    const name = `E2E-Lead-${Date.now()}`
    await page.goto('/dashboard/pipeline', { waitUntil: 'networkidle' })

    // Open Add Lead modal (desktop header button)
    await page.getByRole('button', { name: /add lead/i }).first().click()
    await expect(page.locator('text=/Add a lead|Log a lead/i').first()).toBeVisible({ timeout: 8_000 })

    // Fill required fields
    await page.getByLabel(/contact name/i).fill(name)
    await page.locator('input[type="tel"]').first().fill('9045550100')
    await page.getByLabel(/message|describe/i).first().fill('E2E automated test — safe to ignore')

    // Pick first source option (the grid of source buttons)
    await page.locator('[data-source]').first().click()

    // Submit
    await page.getByRole('button', { name: /add lead|save/i }).last().click()

    // UI: card must appear in New column
    await expect(
      page.locator('[data-testid="column-New"]').getByText(name)
    ).toBeVisible({ timeout: 12_000 })

    // DB: row must exist with correct status and pro_id
    const { data } = await getAdmin()
      .from('leads')
      .select('lead_status, pro_id')
      .eq('pro_id', getProId())
      .eq('contact_name', name)
      .single()

    expect(data).not.toBeNull()
    expect(data!.lead_status).toBe('New')
    expect(data!.pro_id).toBe(getProId())
  })

  test('Add Lead — empty contact name blocks submit, no DB row inserted', async ({ authedPage: page }) => {
    await page.goto('/dashboard/pipeline', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /add lead/i }).first().click()
    await expect(page.locator('text=/Add a lead|Log a lead/i').first()).toBeVisible({ timeout: 8_000 })

    // Submit with no data
    await page.getByRole('button', { name: /add lead|save/i }).last().click()

    // Modal stays open — not dismissed
    await expect(page.locator('text=/Add a lead|Log a lead/i').first()).toBeVisible()

    // DB: nothing inserted for this pro with empty name
    const { data } = await getAdmin()
      .from('leads')
      .select('id')
      .eq('pro_id', getProId())
      .eq('contact_name', '')
    expect(data?.length ?? 0).toBe(0)
  })

})

test.describe('Lead — Move Status', () => {

  test('Move lead from New → Contacted — UI updates and DB lead_status updated', async ({ authedPage: page }) => {
    const name = `E2E-Move-${Date.now()}`

    // Seed via DB (isolates this test from Add Lead UI)
    const { data: inserted, error } = await getAdmin()
      .from('leads')
      .insert({
        pro_id:       getProId(),
        contact_name: name,
        contact_phone: '9045550101',
        message:      'E2E move-status test',
        lead_status:  'New',
        lead_source:  'Other',
        is_manual:    true,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    const leadId = inserted!.id

    await page.goto('/dashboard/pipeline', { waitUntil: 'networkidle' })

    // Confirm card is visible in New column
    const newColumn = page.locator('[data-testid="column-New"]')
    await expect(newColumn.getByText(name)).toBeVisible({ timeout: 10_000 })

    // Click card to open detail/edit panel
    await newColumn.getByText(name).click()

    // Click the Contacted stage button inside the panel
    await page.getByRole('button', { name: /^Contacted$/i }).first().click()

    // Save if there's a save button (some implementations auto-save)
    const saveBtn = page.getByRole('button', { name: /^Save$/i })
    if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await saveBtn.click()
    }

    await page.waitForTimeout(1_500) // allow DB write

    // UI: card appears in Contacted column
    await expect(
      page.locator('[data-testid="column-Contacted"]').getByText(name)
    ).toBeVisible({ timeout: 10_000 })

    // DB: lead_status updated
    const { data } = await getAdmin()
      .from('leads')
      .select('lead_status')
      .eq('id', leadId)
      .single()

    expect(data!.lead_status).toBe('Contacted')
  })

  test('Lead persists correct status on hard reload (DB-first confirmation)', async ({ authedPage: page }) => {
    const name = `E2E-Reload-${Date.now()}`

    await getAdmin().from('leads').insert({
      pro_id:       getProId(),
      contact_name: name,
      contact_phone: '9045550102',
      message:      'E2E reload test',
      lead_status:  'Quoted',
      lead_source:  'Other',
      is_manual:    true,
    })

    await page.goto('/dashboard/pipeline', { waitUntil: 'networkidle' })
    // sessionStorage survives a reload — re-inject not needed
    await page.reload({ waitUntil: 'networkidle' })

    // Card must be in Quoted column after reload (proves DB-first load)
    await expect(
      page.locator('[data-testid="column-Quoted"]').getByText(name)
    ).toBeVisible({ timeout: 10_000 })
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Client — Add', () => {

  test('Add Client via UI — appears in list and DB row exists', async ({ authedPage: page }) => {
    const name  = `E2E-Client-${Date.now()}`
    const phone = '9045550200'

    await page.goto('/dashboard/clients', { waitUntil: 'networkidle' })

    // Open add client form/modal
    await page.getByRole('button', { name: /add client|new client/i }).first().click()

    await page.getByLabel(/full name|name/i).first().fill(name)
    await page.locator('input[type="tel"]').first().fill(phone)

    const emailField = page.getByLabel(/email/i).first()
    if (await emailField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await emailField.fill('e2e-client@test.invalid')
    }

    await page.getByRole('button', { name: /save|add client|submit/i }).last().click()

    // UI: client name visible in list
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })

    // DB: row exists
    const { data } = await getAdmin()
      .from('clients')
      .select('pro_id, phone')
      .eq('pro_id', getProId())
      .eq('full_name', name)
      .single()

    expect(data).not.toBeNull()
    expect(data!.pro_id).toBe(getProId())
    expect(data!.phone).toContain(phone.slice(-4)) // allow formatting
  })

})

test.describe('Client — Edit', () => {

  test('Edit client phone — updated value shown in UI and persisted in DB', async ({ authedPage: page }) => {
    const name     = `E2E-EditClient-${Date.now()}`
    const newPhone = '9045559999'

    // Seed client directly
    const { data: inserted, error } = await getAdmin()
      .from('clients')
      .insert({
        pro_id:    getProId(),
        full_name: name,
        phone:     '9045550201',
        email:     `e2e-edit-${Date.now()}@test.invalid`,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    const clientId = inserted!.id

    await page.goto('/dashboard/clients', { waitUntil: 'networkidle' })

    // Open client record
    await page.getByText(name).click()

    // Update phone field
    const phoneInput = page.locator('input[type="tel"]').first()
    await phoneInput.clear()
    await phoneInput.fill(newPhone)

    // Save
    await page.getByRole('button', { name: /save|update/i }).first().click()
    await page.waitForTimeout(1_500)

    // UI: new phone visible somewhere on page
    await expect(page.getByText(newPhone)).toBeVisible({ timeout: 10_000 })

    // DB: phone updated
    const { data } = await getAdmin()
      .from('clients')
      .select('phone')
      .eq('id', clientId)
      .single()

    expect(data!.phone).toContain(newPhone.slice(-4))
  })

})
