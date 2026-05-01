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

  await admin.from('leads').delete().eq('pro_id', proId)
  await admin.from('clients').delete().eq('pro_id', proId)

  console.log(`✓ global-teardown: cleaned up test leads/clients for pro ${proId}`)
}
