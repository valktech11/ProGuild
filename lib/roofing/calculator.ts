// Single source of truth for the roofing material calculator.
//
// Extracted VERBATIM from app/dashboard/roofing/calculator/page.tsx so the formula
// lives in exactly one place. The web calculator page and POST /api/roofing/calculate
// (consumed by mobile) both import this — neither re-implements the math. Every
// constant, divisor, and rounding rule below is preserved exactly; changing any of
// them changes both surfaces at once (that is the point).

import { getPitchFactor } from '@/lib/roofing/pitchFactors'

export interface CalcLineItem {
  key: string
  description: string
  note?: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  isPlaceholder: boolean
  optional?: boolean   // not part of the required takeoff — won't be flagged as 'missing LF'
}

// ── Canonical line-item names the calculator emits ───────────────────────────
// Used by POST /api/estimates to tell calculator-owned material lines apart from
// lines a roofer added by hand. When the calculator re-prices an estimate it
// replaces ONLY these lines and leaves everything else (custom lines) untouched.
// 'Labour & installation' is appended by the apply handler, not calculateMaterials,
// so it's included here explicitly.
export const LABOUR_LINE_NAME = 'Labour & installation'

export const CALCULATOR_LINE_NAMES: readonly string[] = [
  'Architectural shingles',
  'Synthetic underlayment',
  'Ridge cap shingles',
  'Starter strip',
  'Roofing nails',
  'Drip edge',
  'Self-adhered membrane (full deck)',
  'Pipe boots & vent covers',
  'Tear-off & disposal',
  LABOUR_LINE_NAME,
]

// ── Line name → price key ────────────────────────────────────────────────────
// Each calculator-owned material line maps 1:1 to a price key in DEFAULT_PRICES.
// Lets a server endpoint turn a SAVED estimate line's unit_price back into a
// calculator price override (so reopening the calculator restores edited prices
// instead of resetting to defaults). Labour is excluded — handled separately.
export const LINE_NAME_TO_PRICE_KEY: Record<string, string> = {
  'Architectural shingles':               'shingles',
  'Synthetic underlayment':               'underlayment',
  'Ridge cap shingles':                   'ridgeCap',
  'Starter strip':                        'starterStrip',
  'Roofing nails':                        'nails',
  'Drip edge':                            'dripEdge',
  'Self-adhered membrane (full deck)':    'iceWater',
  'Self-adhered underlayment (eave)':     'iceWater',  // prior name — keep so saved estimates restore prices
  'Ice & water shield (eave protection)': 'iceWater',  // legacy name — keep so saved estimates restore prices
  'Pipe boots & vent covers':             'pipeBoot',
  'Tear-off & disposal':                  'disposal',
}

// ── Default FL market prices (per the web calculator) ─────────────────────────
export const DEFAULT_PRICES: Record<string, number> = {
  shingles:     95,   // per bundle (3 bundles = 1 square)
  underlayment: 45,   // per square
  ridgeCap:     55,   // per bundle (35 LF/bundle)
  starterStrip: 50,   // per bundle (105 LF/bundle)
  nails:         8,   // per lb
  dripEdge:     12,   // per 10 ft piece
  iceWater:     75,   // per square (3 ft eave strip, FL code)
  pipeBoot:     35,   // per boot
  disposal:    375,   // dumpster flat — single layer
  labour:        0,   // roofer fills in separately
}

// ── settingsToCalculatorPrices ────────────────────────────────────────────────
// The pro's saved prices (pros.roofing_material_prices, surfaced by the settings
// API as `material_prices`) are stored in SETTINGS UNITS: $/sq for sheet goods,
// $/LF for linear items, keyed shingles_upgraded / underlayment / ice_water /
// ridge_cap / starter_strip / drip_edge. The calculator expects CALCULATOR UNITS
// ($/bundle, $/10ft piece, $/sq), keyed shingles / underlayment / iceWater /
// ridgeCap / starterStrip / dripEdge. This conversion is the SINGLE definition
// used by BOTH the web calculator page and the /api/roofing/calculate endpoint,
// so neither side can drift from the other. Returns a partial override map to be
// spread over DEFAULT_PRICES.
export function settingsToCalculatorPrices(sp: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!sp || typeof sp !== 'object') return out
  // Shingles: $/sq → $/bundle (3 bundles/sq)
  if (sp.shingles_upgraded != null) out.shingles     = Math.round(sp.shingles_upgraded / 3)
  // Sheet goods: both $/sq — direct
  if (sp.underlayment      != null) out.underlayment = sp.underlayment
  if (sp.ice_water         != null) out.iceWater     = sp.ice_water
  // Linear items: $/LF → $/bundle or $/10ft piece
  if (sp.ridge_cap         != null) out.ridgeCap     = Math.round(sp.ridge_cap     * 35)   // 35 LF/bundle
  if (sp.starter_strip     != null) out.starterStrip = Math.round(sp.starter_strip * 105)  // 105 LF/bundle
  if (sp.drip_edge         != null) out.dripEdge     = Math.round(sp.drip_edge     * 10)   // 10 ft/piece
  return out
}

export interface CalcInput {
  squares: number
  pitchKey: string
  wastePct: number
  ridgeLF: number
  eaveLF: number
  perimLF: number
  hipLF: number
  valleyLF: number
  prices: Record<string, number>
  pipeBoots: number
  tearoffLayers: number
}

export function calculateMaterials(input: CalcInput): { items: CalcLineItem[]; adjustedSquares: number } {
  const { squares, pitchKey, wastePct, ridgeLF, eaveLF, perimLF, hipLF, valleyLF, prices, pipeBoots, tearoffLayers } = input

  const pitchFactor  = getPitchFactor(pitchKey)
  const adjSq        = squares * pitchFactor * (1 + wastePct / 100)
  const adjSqRounded = Math.round(adjSq * 10) / 10

  const ridgeBundles   = ridgeLF   > 0 ? Math.ceil(ridgeLF   / 35)  : null
  const hipBundles     = hipLF     > 0 ? Math.ceil(hipLF     / 35)  : null  // same coverage as ridge cap
  const valleyRolls    = valleyLF  > 0 ? Math.ceil(valleyLF  / 33)  : null  // std 33 LF roll
  const starterBundles = perimLF   > 0 ? Math.ceil(perimLF   / 105) : null  // FL: starter runs full perimeter (eaves + rakes), same as drip edge
  const dripPieces     = perimLF   > 0 ? Math.ceil(perimLF   / 10)  : null
  // FL secondary water barrier = whole-deck self-adhered membrane (not a northern
  // eave ice-dam strip). Same whole-deck basis as synthetic underlayment — it's the
  // peel-and-stick alternative to it, not an add-on. Optional + excluded from the
  // subtotal so it never double-counts the synthetic underlayment line.
  const swbSquares     = Math.round(adjSqRounded * 1.1)

  // Underlayment is ordered in whole squares. Price AND store the rounded qty so
  // the calculator total (qty×price) matches what the estimate recomputes on save.
  // (Previously qty was 37.5 but total used round(37.5)=38 → calculator $836 vs
  // saved estimate 37.5×price → $825. Rounding the qty itself keeps them identical.)
  const underlaymentQty = Math.round(adjSqRounded * 1.1)
  const nailsQty        = Math.ceil(adjSqRounded * 2.5)
  const shinglesQty     = Math.ceil(adjSqRounded * 3)

  const items: CalcLineItem[] = [
    {
      key: 'shingles',
      description: 'Architectural shingles',
      note: `${shinglesQty} bundles (${adjSqRounded} adj sq × 3 per sq · ${wastePct}% waste)`,
      quantity: shinglesQty, unit: 'bundles',
      unitPrice: prices.shingles, total: shinglesQty * prices.shingles,
      isPlaceholder: false,
    },
    {
      key: 'underlayment',
      description: 'Synthetic underlayment',
      note: `${underlaymentQty} sq (10% overlap)`,
      quantity: underlaymentQty, unit: 'squares',
      unitPrice: prices.underlayment, total: underlaymentQty * prices.underlayment,
      isPlaceholder: false,
    },
    {
      key: 'ridgeCap',
      description: 'Ridge cap shingles',
      note: ridgeBundles ? `${ridgeLF} LF ÷ 35 = ${ridgeBundles} bundles` : 'Enter Ridge LF above',
      quantity: ridgeBundles ?? 0, unit: 'bundles',
      unitPrice: prices.ridgeCap, total: (ridgeBundles ?? 0) * prices.ridgeCap,
      isPlaceholder: !ridgeBundles,
    },
    {
      key: 'hipCap',
      description: 'Hip cap shingles',
      note: hipBundles ? `${hipLF} LF ÷ 35 = ${hipBundles} bundles` : 'Enter Hip LF above',
      quantity: hipBundles ?? 0, unit: 'bundles',
      unitPrice: prices.ridgeCap, // same unit price as ridge cap
      total: (hipBundles ?? 0) * prices.ridgeCap,
      isPlaceholder: !hipBundles,
    },
    {
      key: 'valleyMetal',
      description: 'Valley lining (metal)',
      note: valleyRolls ? `${valleyLF} LF ÷ 33 = ${valleyRolls} rolls` : 'Enter Valley LF above',
      quantity: valleyRolls ?? 0, unit: 'rolls',
      unitPrice: prices.valleyMetal ?? prices.iceWater ?? 85,
      total: (valleyRolls ?? 0) * (prices.valleyMetal ?? prices.iceWater ?? 85),
      isPlaceholder: !valleyRolls,
    },
    {
      key: 'starterStrip',
      description: 'Starter strip',
      note: starterBundles ? `${perimLF} LF ÷ 105 = ${starterBundles} bundles` : 'Enter Perimeter LF above',
      quantity: starterBundles ?? 0, unit: 'bundles',
      unitPrice: prices.starterStrip, total: (starterBundles ?? 0) * prices.starterStrip,
      isPlaceholder: !starterBundles,
    },
    {
      key: 'nails',
      description: 'Roofing nails',
      note: `~2.5 lbs/sq × ${adjSqRounded} sq`,
      quantity: nailsQty, unit: 'lbs',
      unitPrice: prices.nails, total: nailsQty * prices.nails,
      isPlaceholder: false,
    },
    {
      key: 'dripEdge',
      description: 'Drip edge',
      note: dripPieces ? `${perimLF} LF ÷ 10 = ${dripPieces} pcs` : 'Enter Perimeter LF above',
      quantity: dripPieces ?? 0, unit: 'pieces',
      unitPrice: prices.dripEdge, total: (dripPieces ?? 0) * prices.dripEdge,
      isPlaceholder: !dripPieces,
    },
    {
      key: 'iceWater',
      description: 'Self-adhered membrane (full deck)',
      note: `Whole-deck secondary water barrier · ${swbSquares} sq · FL peel-and-stick alternative to synthetic underlayment`,
      quantity: swbSquares, unit: 'squares',
      unitPrice: prices.iceWater, total: swbSquares * prices.iceWater,
      isPlaceholder: false,
      optional: true,
    },
  ]

  if (pipeBoots > 0) {
    items.push({
      key: 'pipeBoot',
      description: 'Pipe boots & vent covers',
      note: `${pipeBoots} units`, quantity: pipeBoots, unit: 'each',
      unitPrice: prices.pipeBoot, total: pipeBoots * prices.pipeBoot,
      isPlaceholder: false,
    })
  }

  if (tearoffLayers > 0) {
    const disposalCost = tearoffLayers === 1 ? prices.disposal : Math.round(prices.disposal * 1.5)
    items.push({
      key: 'disposal',
      description: 'Tear-off & disposal',
      note: `${tearoffLayers === 1 ? '1 layer' : '2 layers'} · ${Math.round(squares)} sq`,
      quantity: 1, unit: 'dumpster',
      unitPrice: disposalCost, total: disposalCost,
      isPlaceholder: false,
    })
  }

  return { items, adjustedSquares: adjSqRounded }
}
