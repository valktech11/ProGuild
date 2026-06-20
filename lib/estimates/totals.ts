// Single source of truth for estimate subtotal / tax / total.
//
// THE ONE RULE:
//   • Tiered (Good/Better/Best) estimate  → total is the SELECTED tier's subtotal.
//   • Standard estimate                   → total is the SUM of the line items.
// Then tax = subtotal × rate, total = subtotal + tax (rounded to cents).
//
// This is the ONLY place an estimate's money is computed. The detail GET, the
// PATCH save path, and any other server path call this. Clients (web + mobile)
// render the result — they never compute the total themselves.
//
// Why this file exists: previously the detail endpoint re-summed the line items
// for EVERY estimate, which is wrong for tiered estimates (the items are the full
// menu; the price is the one selected tier). That made mobile show a different
// number than web. One calculator, called everywhere, makes that impossible.

export type EstimateTotals = {
  subtotal: number
  tax_amount: number
  total: number
}

type Tier = { key?: string | null; subtotal?: number | null }

export type EstimateTotalsInput = {
  estimate_type?: string | null
  tiered_data?: { selected_tier?: string | null; tiers?: Tier[] | null } | null
  items?: { amount?: number | null }[] | null
  tax_rate?: number | null
}

// Pick the authoritative tier. Mirrors the save-path rule exactly:
// selected_tier if present, else the "upgraded" (middle/most-popular) tier,
// else the middle tier by position, else the first.
function selectedTierSubtotal(tiers: Tier[], selectedKey?: string | null): number | null {
  if (!tiers.length) return null
  const sel =
    (selectedKey ? tiers.find((t) => t.key === selectedKey) : undefined) ??
    tiers.find((t) => t.key === 'upgraded') ??
    tiers[Math.floor(tiers.length / 2)] ??
    tiers[0]
  const sub = Number(sel?.subtotal)
  return Number.isFinite(sub) ? sub : null
}

export function computeEstimateTotals(input: EstimateTotalsInput): EstimateTotals {
  const taxRate = Number(input.tax_rate) || 0
  // estimate_type defaults to 'tiered' (matches the rest of the codebase); only
  // an explicit 'standard' is treated as non-tiered.
  const isTiered = (input.estimate_type ?? 'tiered') !== 'standard'

  let subtotal: number | null = null
  const tiers = input.tiered_data?.tiers ?? null
  if (isTiered && tiers && tiers.length) {
    subtotal = selectedTierSubtotal(tiers, input.tiered_data?.selected_tier)
  }
  // Standard estimate, or a tiered estimate with no usable tier data → sum items.
  if (subtotal === null) {
    subtotal = (input.items ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  }

  subtotal = Math.round(subtotal * 100) / 100
  const tax_amount = Math.round((subtotal * taxRate) / 100 * 100) / 100
  const total = Math.round((subtotal + tax_amount) * 100) / 100
  return { subtotal, tax_amount, total }
}
