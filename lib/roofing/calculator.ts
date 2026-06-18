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

export interface CalcInput {
  squares: number
  pitchKey: string
  wastePct: number
  ridgeLF: number
  eaveLF: number
  perimLF: number
  prices: Record<string, number>
  pipeBoots: number
  tearoffLayers: number
}

export function calculateMaterials(input: CalcInput): { items: CalcLineItem[]; adjustedSquares: number } {
  const { squares, pitchKey, wastePct, ridgeLF, eaveLF, perimLF, prices, pipeBoots, tearoffLayers } = input

  const pitchFactor  = getPitchFactor(pitchKey)
  const adjSq        = squares * pitchFactor * (1 + wastePct / 100)
  const adjSqRounded = Math.round(adjSq * 10) / 10

  const ridgeBundles   = ridgeLF > 0 ? Math.ceil(ridgeLF / 35)        : null
  const starterBundles = eaveLF  > 0 ? Math.ceil(eaveLF / 105)        : null
  const dripPieces     = perimLF > 0 ? Math.ceil(perimLF / 10)        : null
  const iceSquares     = eaveLF  > 0 ? Math.ceil((eaveLF * 3) / 100)  : null

  const underlaymentQty = Math.round(adjSqRounded * 1.1 * 10) / 10
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
      unitPrice: prices.underlayment, total: Math.round(underlaymentQty) * prices.underlayment,
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
      key: 'starterStrip',
      description: 'Starter strip',
      note: starterBundles ? `${eaveLF} LF ÷ 105 = ${starterBundles} bundles` : 'Enter Eave LF above',
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
      description: 'Ice & water shield (eave protection)',
      note: iceSquares ? `3 ft eave strip (FL code) · ${iceSquares} sq` : 'Enter Eave LF above',
      quantity: iceSquares ?? 0, unit: 'squares',
      unitPrice: prices.iceWater, total: (iceSquares ?? 0) * prices.iceWater,
      isPlaceholder: !iceSquares,
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
