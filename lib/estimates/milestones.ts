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
