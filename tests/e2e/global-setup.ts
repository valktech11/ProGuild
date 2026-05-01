/**
 * global-setup.ts — runs ONCE before all Playwright tests.
 *
 * Uses the EXISTING test pro (test@proguild.ai) already in staging.
 * No insert needed — avoids schema constraint failures.
 * Just verifies the pro exists and cleans up any leftover test leads/clients
 * from a previous crashed run.
 */

import { FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export const E2E_PRO_EMAIL = process.env.TEST_PRO_EMAIL!
export let   E2E_PRO_ID    = ''   // resolved at runtime from DB

const SUPABASE_URL     = process.env.STAGING_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!

export default async function globalSetup(_config: FullConfig) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('global-setup: STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY are required')
  }
  if (!E2E_PRO_EMAIL) {
    throw new Error('global-setup: TEST_PRO_EMAIL is required')
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Resolve the pro's real ID from the existing staging account
  const { data: pro, error } = await admin
    .from('pros')
    .select('id')
    .eq('email', E2E_PRO_EMAIL)
    .single()

  if (error || !pro) {
    throw new Error(
      `global-setup: pro not found in staging for email "${E2E_PRO_EMAIL}"\n` +
      `Error: ${error?.message || 'no row returned'}\n` +
      `Ensure TEST_PRO_EMAIL matches an existing pro in staging Supabase (${SUPABASE_URL})`
    )
  }

  E2E_PRO_ID = pro.id

  // Write ID to a temp file so global-teardown and tests can read it
  const { writeFileSync } = await import('fs')
  const { join } = await import('path')
  writeFileSync(join(process.cwd(), 'tests/e2e/.e2e-pro-id'), E2E_PRO_ID)

  // Clean up leftover leads/clients from any previous crashed run
  await admin.from('leads').delete().eq('pro_id', E2E_PRO_ID)
  await admin.from('clients').delete().eq('pro_id', E2E_PRO_ID)

  console.log(`✓ global-setup: using existing pro "${E2E_PRO_EMAIL}" (id: ${E2E_PRO_ID})`)
}
