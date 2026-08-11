import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { calculateMaterials, DEFAULT_PRICES, settingsToCalculatorPrices } from '@/lib/roofing/calculator'

// ── POST /api/roofing/calculate ───────────────────────────────────────────────
// Single source of truth for roofing material pricing. Web (calculator page) and
// mobile (calculator screen) BOTH call this — neither re-implements the formula
// (lib/roofing/calculator). Returns the priced line items + adjusted squares.
//
// Body:
//   pro_id?         — if present, the pro's saved material prices override defaults
//   squares         — base squares (from ProMeasure or manual)
//   pitch           — e.g. '6/12'
//   wastePct        — e.g. 12
//   ridgeLF, eaveLF, perimLF  — linear footage (0 = not provided → placeholder rows)
//   pipeBoots       — count (0 = omit)
//   tearoffLayers   — 0 = none, 1 = single, 2 = double (1.5× disposal)
//   prices?         — explicit price overrides (wins over saved + defaults)
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const proId = (body.pro_id as string | undefined) ?? undefined
  const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }

  // ── Price resolution: DEFAULT_PRICES ← pro's saved settings prices ← body.prices ──
  // The pro's saved prices live in pros.roofing_material_prices in SETTINGS UNITS.
  // settingsToCalculatorPrices (shared with the web page) converts them to the
  // CALCULATOR UNITS the formula expects, so web and mobile price identically.
  let prices: Record<string, number> = { ...DEFAULT_PRICES }
  if (proId) {
    const { data: pro } = await getSupabaseAdmin()
      .from('pros').select('roofing_material_prices').eq('id', proId).single()
    const saved = pro?.roofing_material_prices as Record<string, number> | null | undefined
    prices = { ...prices, ...settingsToCalculatorPrices(saved) }
  }
  if (body.prices && typeof body.prices === 'object') {
    // Explicit overrides are already in CALCULATOR units (used by Edit prices).
    prices = { ...prices, ...(body.prices as Record<string, number>) }
  }

  const result = calculateMaterials({
    squares:       num(body.squares),
    pitchKey:      (body.pitch as string) || '6/12',
    wastePct:      num(body.wastePct),
    ridgeLF:       num(body.ridgeLF),
    eaveLF:        num(body.eaveLF),
    perimLF:       num(body.perimLF),
    hipLF:         num(body.hipLF),
    valleyLF:      num(body.valleyLF),
    prices,
    pipeBoots:     num(body.pipeBoots),
    tearoffLayers: num(body.tearoffLayers),
  })

  return NextResponse.json({
    items: result.items,
    adjusted_squares: result.adjustedSquares,
    prices_used: prices,
  })
}
