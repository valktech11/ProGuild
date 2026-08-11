import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  CALCULATOR_LINE_NAMES,
  LABOUR_LINE_NAME,
  LINE_NAME_TO_PRICE_KEY,
  settingsToCalculatorPrices,
} from '@/lib/roofing/calculator'
import { resolveTaxRate } from '@/app/api/estimates/route'

// ── GET /api/roofing/calculator-state?lead_id=<id>&pro_id=<id> ────────────────
//
// THE single place that decides where every calculator input comes from. Both
// the web calculator and the mobile calculator call this and render the result —
// neither sources inputs on its own anymore. That is what stops web and mobile
// from drifting: one server decision, one answer, two identical screens.
//
// Decision:
//   • An estimate already exists for this lead  → source = "estimate".
//       Inputs come from the saved estimate (the v114 measurement snapshot, the
//       saved line prices, the labour line, the real tax rate). Any field a
//       PRE-v114 estimate never captured (ridge/eave/perimeter/boots/tear-off)
//       falls back per-field to the roof report so old jobs still hydrate.
//   • No estimate yet (brand-new job)           → source = "fresh".
//       Inputs come from the lead's roof report + the pro's saved price settings
//       + the pro's state tax rate.
//
// READ-ONLY. Nothing is written here. (Hydration on the clients is the next slice.)

// Shape of the roofing_estimate_data row this endpoint reads (all nullable —
// pre-v114 estimates won't have the LF/boots/tear-off columns populated).
interface EstimateMeasurements {
  estimate_type?:  string | null
  square_count?:   number | null
  pitch?:          string | null
  waste_pct?:      number | null
  ridge_lf?:       number | null
  hip_lf?:         number | null
  valley_lf?:      number | null
  eave_lf?:        number | null
  perimeter_lf?:   number | null
  pipe_boots?:     number | null
  tearoff_layers?: number | null
}

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams
  const leadId  = sp.get('lead_id')
  const proId   = sp.get('pro_id')

  if (!leadId || !proId) {
    return NextResponse.json({ error: 'lead_id and pro_id are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Pro: state (for tax) + saved material prices (for the fresh branch).
  const { data: pro } = await sb
    .from('pros')
    .select('state, roofing_material_prices')
    .eq('id', proId)
    .maybeSingle()
  const proState = (pro?.state ?? '').toUpperCase()

  // Job-location state — the authoritative source for tax (pro state is fallback).
  const { data: leadRow } = await sb
    .from('leads')
    .select('contact_state')
    .eq('id', leadId)
    .maybeSingle()
  const leadState = (leadRow?.contact_state ?? '').toUpperCase()

  // Lead's roof-report data — the fresh source AND the per-field fallback.
  const { data: rjd } = await sb
    .from('roofing_job_data')
    .select('square_count, pitch, waste_pct, linear_footage')
    .eq('lead_id', leadId)
    .maybeSingle()
  // Human-traced ProMeasure LF is the ONLY authoritative source (Bible §25).
  // roofing_job_data.linear_footage is written by both ProMeasure (gated, carries
  // source: 'promeasure_manual') and — historically — DSM. We only seed LF from it
  // when the source marker proves it is ProMeasure-traced; DSM-derived footage is
  // never served (eave −42%, hip +130%, valley −53%).
  const rawLF = (rjd?.linear_footage ?? null) as Record<string, unknown> | null
  const pmLF = rawLF && rawLF.source === 'promeasure_manual' ? rawLF : null
  const numLF = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  // Is there a live estimate for this lead? (Same priority pick as POST /api/estimates.)
  const { data: existing } = await sb
    .from('estimates')
    .select('id, estimate_number, tax_rate, status, created_at')
    .eq('pro_id', proId)
    .eq('lead_id', leadId)
    .not('status', 'in', '("void","declined")')
    .order('created_at', { ascending: false })
    .limit(10)

  const priority = ['approved', 'invoiced', 'paid', 'sent', 'viewed', 'draft']
  const best = (existing && existing.length > 0)
    ? [...existing].sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0]
    : null

  // ── FRESH branch ───────────────────────────────────────────────────────────
  if (!best) {
    return NextResponse.json({
      source:        'fresh',
      estimate_id:   null,
      estimate_type: null,
      estimate_number: null,
      status:        null,
      measurements: {
        squares:        rjd?.square_count ?? null,
        pitch:          rjd?.pitch        ?? null,
        waste_pct:      rjd?.waste_pct    ?? null,
        // LF seeds ONLY from human-traced ProMeasure (source-gated above); DSM
        // satellite footage is never served (Bible §25). No ProMeasure → blank.
        ridge_lf:       pmLF ? numLF(pmLF.ridge_ft)  : null,
        hip_lf:         pmLF ? numLF(pmLF.hip_ft)    : null,
        valley_lf:      pmLF ? numLF(pmLF.valley_ft) : null,
        eave_lf:        pmLF ? numLF(pmLF.eave_ft)   : null,
        perimeter_lf:   pmLF ? numLF(pmLF.perimeter_lf ?? pmLF.perimeter) : null,
        pipe_boots:     3,
        tearoff_layers: 1,
      },
      price_overrides: settingsToCalculatorPrices((pro?.roofing_material_prices ?? null) as Record<string, number> | null),
      labour_amount:   0,
      custom_items:    [],
      tax_rate:        resolveTaxRate(leadState, proState),
    })
  }

  // ── ESTIMATE branch ──────────────────────────────────────────────────────────
  const [redRes, itemsRes] = await Promise.all([
    sb.from('roofing_estimate_data')
      .select('estimate_type, square_count, pitch, waste_pct, ridge_lf, hip_lf, valley_lf, eave_lf, perimeter_lf, pipe_boots, tearoff_layers')
      .eq('estimate_id', best.id)
      .maybeSingle(),
    sb.from('estimate_items').select('*').eq('estimate_id', best.id),
  ])
  const red: EstimateMeasurements = redRes.data ?? {}
  const items = (itemsRes.data ?? []).map((i: any) => ({
    name:       String(i.name ?? i.description ?? ''),
    quantity:   Number(i.qty ?? i.quantity ?? 1),
    unit_price: Number(i.unit_price ?? 0),
    amount:     Number(i.amount ?? i.total ?? 0),
  }))

  // Saved line prices → calculator price overrides (restores edited unit prices).
  const priceOverrides: Record<string, number> = {}
  for (const it of items) {
    const key = LINE_NAME_TO_PRICE_KEY[it.name]
    if (key) priceOverrides[key] = it.unit_price
  }

  // Labour line amount, and the hand-added (non-calculator) lines.
  const labourLine = items.find((i: any) => i.name === LABOUR_LINE_NAME)
  const labourAmount = labourLine ? labourLine.amount : 0
  const customItems = items
    .filter((i: any) => !CALCULATOR_LINE_NAMES.includes(i.name))
    .map((i: any) => ({ description: i.name, quantity: i.quantity, unit_price: i.unit_price, amount: i.amount }))

  return NextResponse.json({
    source:        'estimate',
    estimate_id:   best.id,
    estimate_type: red.estimate_type ?? 'standard',
    estimate_number: best.estimate_number ?? null,
    status:        best.status ?? null,
    measurements: {
      // Snapshot first, per-field fallback to the roof report for pre-v114 estimates.
      squares:        red.square_count   ?? rjd?.square_count ?? null,
      pitch:          red.pitch          ?? rjd?.pitch        ?? null,
      waste_pct:      red.waste_pct      ?? rjd?.waste_pct    ?? null,
      // LF precedence: human-entered saved estimate value first, then human-traced
      // ProMeasure (source-gated), never DSM (Bible §25). Blank → blank.
      ridge_lf:       red.ridge_lf       ?? (pmLF ? numLF(pmLF.ridge_ft)  : null),
      hip_lf:         red.hip_lf         ?? (pmLF ? numLF(pmLF.hip_ft)    : null),
      valley_lf:      red.valley_lf      ?? (pmLF ? numLF(pmLF.valley_ft) : null),
      eave_lf:        red.eave_lf        ?? (pmLF ? numLF(pmLF.eave_ft)   : null),
      perimeter_lf:   red.perimeter_lf   ?? (pmLF ? numLF(pmLF.perimeter_lf ?? pmLF.perimeter) : null),
      pipe_boots:     red.pipe_boots     ?? 3,
      tearoff_layers: red.tearoff_layers ?? 1,
    },
    price_overrides: priceOverrides,
    labour_amount:   labourAmount,
    custom_items:    customItems,
    tax_rate:        best.tax_rate ?? resolveTaxRate(leadState, proState),
  })
}
