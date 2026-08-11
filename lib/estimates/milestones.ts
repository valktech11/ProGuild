// Single source of truth for payment milestone computation.
//
// Locked 30 / 40 / 30 schedule. Deposit 30%, At Material Delivery 40%,
// On Completion 30%. The first two round to cents; the LAST absorbs the
// remainder so the three always sum to EXACTLY the total (no leftover-cents
// drift). This is the ONLY place milestones are computed — GET, PATCH, and the
// PDF/send path all call this. Clients (web + mobile) render the result; they do
// not compute milestones themselves.

export type PaymentMilestone = {
  id: string
  name: string
  pct: number
  due_when: string
  amount: number
}

const LOCKED: { id: string; name: string; pct: number; due_when: string }[] = [
  { id: 'dep', name: 'Deposit',              pct: 30, due_when: 'Due at signing' },
  { id: 'mat', name: 'At Material Delivery', pct: 40, due_when: 'Due at delivery' },
  { id: 'com', name: 'On Completion',        pct: 30, due_when: 'Due on completion' },
]

export function computeMilestones(total: number): PaymentMilestone[] {
  const t = Number(total) || 0
  const dep = Math.round(t * 0.3 * 100) / 100
  const mat = Math.round(t * 0.4 * 100) / 100
  const com = Math.round((t - dep - mat) * 100) / 100 // last absorbs rounding
  return [
    { ...LOCKED[0], amount: dep },
    { ...LOCKED[1], amount: mat },
    { ...LOCKED[2], amount: com },
  ]
}

// ── HVAC: two-milestone schedule ──────────────────────────────────────────────
// Diagnostic/Deposit up front (default 50%) + balance on completion. HVAC jobs
// don't have a material-delivery milestone the way roofing does — parts and
// labour are typically deposit + completion.
export function computeHVACMilestones(total: number, depositPct = 50): PaymentMilestone[] {
  const t   = Number(total) || 0
  const dep = Math.round(t * (depositPct / 100) * 100) / 100
  const bal = Math.round((t - dep) * 100) / 100 // balance absorbs rounding
  return [
    { id: 'dep', name: 'Deposit',       pct: depositPct,       due_when: 'Due at signing',     amount: dep },
    { id: 'com', name: 'On Completion', pct: 100 - depositPct,  due_when: 'Due on completion',  amount: bal },
  ]
}

// ── Trade-aware dispatcher ────────────────────────────────────────────────────
// Roofing → locked 30/40/30. HVAC → deposit + completion. Other trades default
// to the HVAC two-milestone shape (simpler, safer than assuming material delivery).
export function computeMilestonesForTrade(
  total: number,
  tradeSlug: string | null | undefined,
  depositPct = 50,
): PaymentMilestone[] {
  if (tradeSlug?.includes('roof')) return computeMilestones(total)
  return computeHVACMilestones(total, depositPct)
}
