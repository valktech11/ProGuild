#!/usr/bin/env node
/**
 * scripts/seed-test-pro.js
 * Creates the E2E test pro account in staging Supabase.
 * Run once: node scripts/seed-test-pro.js
 *
 * Requires env: STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, TEST_PRO_EMAIL
 */

const { createClient } = require('@supabase/supabase-js')

const URL  = process.env.STAGING_SUPABASE_URL
const KEY  = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_PRO_EMAIL || 'test@proguild.ai'

if (!URL || !KEY) {
  console.error('Missing STAGING_SUPABASE_URL or STAGING_SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // Check if test pro already exists
  const { data: existing } = await db
    .from('pros')
    .select('id, email')
    .eq('email', EMAIL)
    .maybeSingle()

  if (existing) {
    console.log(`✅ Test pro already exists: ${existing.email} (id: ${existing.id})`)
    return
  }

  // Create test pro
  const { data, error } = await db
    .from('pros')
    .insert({
      full_name:      'Test Pro (E2E)',
      email:          EMAIL,
      plan_tier:      'Pro',
      profile_status: 'Active',
      city:           'Miami',
      state:          'FL',
      is_verified:    false,
      is_claimed:     true,
    })
    .select('id, email')
    .single()

  if (error) {
    console.error('❌ Failed to create test pro:', error.message)
    process.exit(1)
  }

  console.log(`✅ Created test pro: ${data.email} (id: ${data.id})`)
  console.log(`   Login via /api/auth with email: ${EMAIL}`)
}

main()
