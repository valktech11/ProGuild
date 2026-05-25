/**
 * global-teardown.ts — runs ONCE after all Playwright tests (pass or fail).
 * Deletes leads/clients created during tests. Never deletes the pro row.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'

export default async function globalTeardown() {
  const SUPABASE_URL     = process.env.STAGING_SUPABASE_URL!
  const SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return

  const idFile = join(process.cwd(), 'tests/e2e/.e2e-pro-id')
  if (!existsSync(idFile)) return

  const proId = readFileSync(idFile, 'utf-8').trim()
  unlinkSync(idFile)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Only delete leads created by E2E tests (name starts with 'E2E')
  // Never wipe ALL leads — protects real test data
  const { data: e2eLeads } = await admin.from('leads')
    .select('id').eq('pro_id', proId)
    .or('contact_name.ilike.E2E%')
  if (e2eLeads?.length) {
    await admin.from('leads').delete().in('id', e2eLeads.map((l: any) => l.id))
    console.log(`✓ global-teardown: deleted ${e2eLeads.length} E2E test leads`)
  }

  console.log(`✓ global-teardown: cleaned up test leads/clients for pro ${proId}`)
}
