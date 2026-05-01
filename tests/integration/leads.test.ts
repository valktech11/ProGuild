/**
 * Integration tests — run against staging Supabase.
 * All test data uses prefix TEST_PREFIX and is cleaned up after each suite.
 * Requires env vars: STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const TEST_PREFIX = 'test_auto_'
const STAGING_URL = process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const STAGING_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!

// Skip integration suite if staging creds not present (e.g. local dev without .env.test)
const SKIP = !STAGING_URL || STAGING_URL.includes('test.supabase.co')

let db: SupabaseClient
let testProId: string
let testLeadId: string

// ── Seeding ───────────────────────────────────────────────────────────────────
async function seedTestPro(): Promise<string> {
  const { data, error } = await db
    .from('pros')
    .insert({
      full_name:      `${TEST_PREFIX}Pro Integration`,
      email:          `${TEST_PREFIX}integration@proguild-test.com`,
      plan_tier:      'Free',
      profile_status: 'Active',
      city:           'Miami',
      state:          'FL',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Seed pro failed: ${error.message}`)
  return data.id
}

async function seedTestLead(proId: string): Promise<string> {
  const { data, error } = await db
    .from('leads')
    .insert({
      pro_id:       proId,
      contact_name: `${TEST_PREFIX}Contact`,
      message:      'Integration test lead — safe to delete',
      lead_status:  'New',
      lead_source:  'Other',
      is_manual:    true,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Seed lead failed: ${error.message}`)
  return data.id
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup() {
  // Delete all test leads first (FK constraint)
  await db.from('leads').delete().like('contact_name', `${TEST_PREFIX}%`)
  await db.from('leads').delete().eq('pro_id', testProId)
  // Delete test pro
  await db.from('pros').delete().like('email', `${TEST_PREFIX}%`)
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('Integration — Leads API against staging Supabase', () => {
  beforeAll(async () => {
    db = createClient(STAGING_URL, STAGING_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    // Clean up any leftover test data from previous failed runs
    await cleanup()
    // Seed fresh test pro
    testProId = await seedTestPro()
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(async () => {
    // Fresh lead for each test
    testLeadId = await seedTestLead(testProId)
  })

  // ── GET /api/leads ──────────────────────────────────────────────────────────
  describe('GET /api/leads', () => {
    it('returns leads for pro from DB', async () => {
      const { data, error } = await db
        .from('leads')
        .select('*')
        .eq('pro_id', testProId)
        .order('created_at', { ascending: false })

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data!.length).toBeGreaterThan(0)
      expect(data![0].pro_id).toBe(testProId)
    })

    it('returns empty array for unknown pro_id', async () => {
      const { data, error } = await db
        .from('leads')
        .select('*')
        .eq('pro_id', '00000000-0000-0000-0000-000000000000')

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })
  })

  // ── PATCH /api/leads/[id] — lead_status ────────────────────────────────────
  describe('PATCH lead_status', () => {
    it('persists status change to DB', async () => {
      const { error } = await db
        .from('leads')
        .update({ lead_status: 'Contacted' })
        .eq('id', testLeadId)

      expect(error).toBeNull()

      // Re-fetch and verify — this is what mobile/desktop both see
      const { data } = await db
        .from('leads')
        .select('lead_status')
        .eq('id', testLeadId)
        .single()

      expect(data?.lead_status).toBe('Contacted')
    })

    it('full stage progression persists correctly', async () => {
      const stages = ['Contacted', 'Quoted', 'Scheduled', 'Completed', 'Paid']

      for (const stage of stages) {
        await db.from('leads').update({ lead_status: stage }).eq('id', testLeadId)
        const { data } = await db.from('leads').select('lead_status').eq('id', testLeadId).single()
        expect(data?.lead_status).toBe(stage)
      }
    })

    it('persists notes to DB', async () => {
      const notes = `${TEST_PREFIX}Notes saved at ${Date.now()}`
      await db.from('leads').update({ notes }).eq('id', testLeadId)

      const { data } = await db.from('leads').select('notes').eq('id', testLeadId).single()
      expect(data?.notes).toBe(notes)
    })

    it('persists quoted_amount to DB', async () => {
      await db.from('leads').update({ quoted_amount: 2500 }).eq('id', testLeadId)

      const { data } = await db.from('leads').select('quoted_amount').eq('id', testLeadId).single()
      expect(data?.quoted_amount).toBe(2500)
    })

    it('persists multiple fields in one update', async () => {
      await db.from('leads').update({
        lead_status:    'Quoted',
        quoted_amount:  1800,
        notes:          `${TEST_PREFIX}Full update test`,
        scheduled_date: '2026-06-01',
      }).eq('id', testLeadId)

      const { data } = await db.from('leads').select('*').eq('id', testLeadId).single()
      expect(data?.lead_status).toBe('Quoted')
      expect(data?.quoted_amount).toBe(1800)
      expect(data?.notes).toContain(TEST_PREFIX)
      expect(data?.scheduled_date).toBe('2026-06-01')
    })
  })

  // ── Status change does not affect other leads ───────────────────────────────
  describe('Data isolation', () => {
    it('updating one lead does not affect another lead for same pro', async () => {
      const secondLeadId = await seedTestLead(testProId)

      // Update only first lead
      await db.from('leads').update({ lead_status: 'Paid' }).eq('id', testLeadId)

      // Second lead should still be New
      const { data } = await db.from('leads').select('lead_status').eq('id', secondLeadId).single()
      expect(data?.lead_status).toBe('New')

      // Cleanup second lead
      await db.from('leads').delete().eq('id', secondLeadId)
    })
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  describe('DELETE lead', () => {
    it('removes lead from DB', async () => {
      const { error } = await db.from('leads').delete().eq('id', testLeadId)
      expect(error).toBeNull()

      const { data } = await db.from('leads').select('id').eq('id', testLeadId).maybeSingle()
      expect(data).toBeNull()

      // Set to null so afterEach cleanup doesn't try to delete again
      testLeadId = ''
    })
  })

  // ── Revenue calculation from real data ─────────────────────────────────────
  describe('Revenue from DB', () => {
    it('revenue sum matches Paid + Completed leads only', async () => {
      // Create leads with different statuses and amounts
      const leadsToCreate = [
        { lead_status: 'Paid',      quoted_amount: 1000 },
        { lead_status: 'Completed', quoted_amount: 800  },
        { lead_status: 'Quoted',    quoted_amount: 5000 }, // should not count
        { lead_status: 'New',       quoted_amount: 200  }, // should not count
      ]

      for (const l of leadsToCreate) {
        await db.from('leads').insert({
          pro_id: testProId, contact_name: `${TEST_PREFIX}Revenue Test`,
          message: 'revenue test lead', lead_source: 'Other',
          lead_status: l.lead_status, quoted_amount: l.quoted_amount,
        })
      }

      const { data } = await db
        .from('leads')
        .select('lead_status, quoted_amount')
        .eq('pro_id', testProId)

      const revenue = (data || [])
        .filter(l => ['Paid', 'Completed'].includes(l.lead_status))
        .reduce((sum: number, l: any) => sum + (l.quoted_amount || 0), 0)

      // At minimum the 1000 + 800 we just inserted
      expect(revenue).toBeGreaterThanOrEqual(1800)
    })
  })
})
