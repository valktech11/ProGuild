// GET /api/admin/env-check
// Returns masked env var values for the admin UI.
// Protected: admin-only via x-pro-id header check.
// NOTE: Delete this route before prod cutover (or keep but restrict to admin IDs only).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'GEMINI_API_KEY',
  'REPLICATE_API_TOKEN',
  'R2_PUBLIC_BUCKET_URL',
  'R2_BUCKET_NAME',
  'R2_ACCOUNT_ID',
  'GOOGLE_SOLAR_API_KEY',
  'NEXT_PUBLIC_GOOGLE_MAPS_KEY',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'ROOF_CALC_PRO_ID',
  'ROOF_CALC_DAILY_CAP',
  'ROOF_CALC_IP_LIMIT',
  'ROOF_CALC_LEAD_LIMIT',
]

function mask(val: string | undefined): string {
  if (!val) return '❌ NOT SET'
  if (val.length <= 6) return '✓ SET'
  return val.slice(0, 6) + '••••••'
}

export async function GET(req: NextRequest) {
  // Admin check
  const proId = req.headers.get('x-pro-id')
  if (!proId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const { data: pro } = await sb.from('pros').select('is_admin').eq('id', proId).single()
  if (!pro?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result: Record<string, string> = {}
  for (const key of VARS) {
    result[key] = mask(process.env[key])
  }

  return NextResponse.json({ vars: result, env: process.env.NODE_ENV })
}
