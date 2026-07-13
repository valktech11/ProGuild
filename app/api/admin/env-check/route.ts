// GET /api/admin/env-check
// Temporary admin-only endpoint to inspect which env vars are set and their
// masked values. DELETE this route before prod cutover.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

async function verifyAdmin(req: NextRequest) {
  const proId = req.headers.get('x-pro-id')
  if (!proId) return false
  const { data } = await getSupabaseAdmin()
    .from('pros').select('is_admin').eq('id', proId).single()
  return data?.is_admin === true
}

function mask(val: string | undefined): string {
  if (!val) return '❌ NOT SET'
  if (val.length <= 6) return '✓ SET (short)'
  return `✓ ${val.slice(0, 6)}… (${val.length} chars)`
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({
    environment: process.env.VERCEL_ENV || 'local',
    url:         process.env.VERCEL_URL || 'localhost',
    warning:     'DELETE this route before prod cutover. Admin eyes only.',
    vars: {
      // Supabase
      SUPABASE_URL:                       mask(process.env.SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_URL:           mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY:      mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY:          mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_JWT_SECRET:                mask(process.env.SUPABASE_JWT_SECRET),
      // Google
      NEXT_PUBLIC_GOOGLE_MAPS_KEY:        mask(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY),
      GOOGLE_SOLAR_API_KEY:               mask(process.env.GOOGLE_SOLAR_API_KEY),
      GEMINI_API_KEY:                     mask(process.env.GEMINI_API_KEY),
      // Stripe
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: mask(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      STRIPE_SECRET_KEY:                  mask(process.env.STRIPE_SECRET_KEY),
      STRIPE_WEBHOOK_SECRET:              mask(process.env.STRIPE_WEBHOOK_SECRET),
      // Email
      RESEND_API_KEY:                     mask(process.env.RESEND_API_KEY),
      EMAIL_FROM:                         mask(process.env.EMAIL_FROM),
      WAITLIST_FROM_EMAIL:                mask(process.env.WAITLIST_FROM_EMAIL),
      // R2
      R2_ACCESS_KEY_ID:                   mask(process.env.R2_ACCESS_KEY_ID),
      R2_SECRET_ACCESS_KEY:               mask(process.env.R2_SECRET_ACCESS_KEY),
      R2_BUCKET_NAME:                     mask(process.env.R2_BUCKET_NAME),
      R2_PUBLIC_BUCKET_URL:               mask(process.env.R2_PUBLIC_BUCKET_URL),
      // Calculator
      ROOF_CALC_PRO_ID:                   mask(process.env.ROOF_CALC_PRO_ID),
      ROOF_CALC_DAILY_CAP:                process.env.ROOF_CALC_DAILY_CAP  || '❌ NOT SET',
      ROOF_CALC_IP_LIMIT:                 process.env.ROOF_CALC_IP_LIMIT   || '❌ NOT SET',
      ROOF_CALC_LEAD_LIMIT:               process.env.ROOF_CALC_LEAD_LIMIT || '❌ NOT SET',
      // App
      NEXT_PUBLIC_SITE_URL:               mask(process.env.NEXT_PUBLIC_SITE_URL),
      OPENWEATHER_API_KEY:                mask(process.env.OPENWEATHER_API_KEY),
      STAGING_PASSWORD:                   mask(process.env.STAGING_PASSWORD),
      PROD_LOCKED:                        process.env.PROD_LOCKED || '❌ NOT SET',
      NODE_ENV:                           process.env.NODE_ENV,
      VERCEL_ENV:                         process.env.VERCEL_ENV || 'not set',
    },
  })
}
