import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import { FL_UNIT_RATES, resolveRates, type FLCustomRates } from '@/lib/fl/supplement'

export const runtime = 'nodejs'

// GET /api/user/supplement-rates?pro_id=X
// Returns the pro's effective rates (custom overrides merged over defaults).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pro_id = searchParams.get('pro_id')
  const __auth = await requirePro(req, pro_id)
  if (__auth.error) return __auth.error

  const sb = getSupabaseAdmin()
  const { data: pro } = await sb
    .from('pros')
    .select('fl_supplement_rates')
    .eq('id', __auth.proId!)
    .maybeSingle()

  const custom = (pro?.fl_supplement_rates ?? null) as FLCustomRates | null
  const effective = resolveRates(custom)

  // Return defaults metadata alongside effective rates so the UI can show
  // which values are customized vs still at the default.
  const defaults = Object.fromEntries(
    Object.entries(FL_UNIT_RATES).map(([k, v]) => [k, v.rate])
  ) as Record<string, number>

  // Strip keys from custom where the stored value equals the default —
  // guards against stale DB rows that saved all 9 keys before the diff-only fix.
  const customFiltered: Record<string, number> = {}
  if (custom) {
    for (const [k, v] of Object.entries(custom as Record<string, number>)) {
      const def = defaults[k]
      if (def === undefined || Math.abs(v - def) >= 0.001) {
        customFiltered[k] = v
      }
    }
  }

  return NextResponse.json({
    effective,
    custom: customFiltered,
    defaults,
    meta: Object.fromEntries(
      Object.entries(FL_UNIT_RATES).map(([k, v]) => [k, { label: v.label, unit: v.unit, xact: v.xact }])
    ),
  })
}

// POST /api/user/supplement-rates?pro_id=X
// Body: { rates: FLCustomRates }  — partial or full override map.
// Pass null for a key to reset it to default.
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pro_id = searchParams.get('pro_id')
  const __auth = await requirePro(req, pro_id)
  if (__auth.error) return __auth.error

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const incoming = body?.rates
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'rates object required' }, { status: 400 })
  }

  // Validate: only known keys, only positive numbers or null
  const validKeys = new Set(Object.keys(FL_UNIT_RATES))
  const sanitized: FLCustomRates = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (!validKeys.has(k)) continue
    if (v === null) {
      // null = reset to default (omit from custom)
      continue
    }
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: `Invalid rate for ${k}: must be a positive number` }, { status: 400 })
    }
    (sanitized as any)[k] = Math.round(n * 100) / 100
  }

  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('pros')
    .update({ fl_supplement_rates: Object.keys(sanitized).length > 0 ? sanitized : null })
    .eq('id', __auth.proId!)

  if (error) {
    console.error('[supplement-rates] save failed:', error)
    return NextResponse.json({ error: 'Failed to save rates' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: sanitized, effective: resolveRates(sanitized) })
}
