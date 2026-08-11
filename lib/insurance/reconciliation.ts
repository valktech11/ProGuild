// Single source of truth for the insurance reconciliation panel.
//
// The locked 3-line panel: full job cost / insurance pays homeowner /
// homeowner out of pocket. Both web (calculator, live grandTotal) and mobile
// (lead detail, via the /api/roofing/reconciliation endpoint) render THIS
// formula — neither re-derives it. Previously web clamped insurancePays at 0
// while mobile showed an unclamped "net", so the two platforms could disagree.
// Clamping lives here once.

const round2 = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

export interface ReconciliationInput {
  jobCost: number          // full estimate total (the job cost)
  approvedAmount: number
  supplement: number
  deductible: number
}

export interface Reconciliation {
  fullJobCost: number
  insurancePays: number    // approved + supplement − deductible, clamped ≥ 0
  outOfPocket: number      // jobCost − insurancePays, clamped ≥ 0
  fullyCovered: boolean    // outOfPocket ≤ 0
}

export function computeInsuranceReconciliation(i: ReconciliationInput): Reconciliation {
  const fullJobCost   = round2(i.jobCost)
  const insurancePays = Math.max(round2(i.approvedAmount + i.supplement - i.deductible), 0)
  const outOfPocket   = Math.max(round2(fullJobCost - insurancePays), 0)
  return { fullJobCost, insurancePays, outOfPocket, fullyCovered: outOfPocket <= 0 }
}
