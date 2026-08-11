import type { GCStage } from './types'

export const GC_STAGE_ORDER: Record<GCStage, number> = {
  lead_in: 0, bidding: 1, contract_signed: 2, permit_submitted: 3,
  milestone_1: 4, milestone_2: 5, closeout: 6, job_won: 7,
  lost: 8, unqualified: 9,
}

export const GC_VALID_TRANSITIONS: Record<GCStage, GCStage[]> = {
  lead_in:          ['bidding', 'lost', 'unqualified'],
  bidding:          ['lead_in', 'contract_signed', 'lost', 'unqualified'],
  contract_signed:  ['bidding', 'permit_submitted', 'milestone_1', 'lost'],
  permit_submitted: ['contract_signed', 'milestone_1', 'lost'],
  milestone_1:      ['permit_submitted', 'milestone_2', 'lost'],
  milestone_2:      ['milestone_1', 'closeout', 'lost'],
  closeout:         ['milestone_2', 'job_won', 'lost'],
  job_won:          ['closeout'],
  lost:             ['lead_in'],
  unqualified:      [],
}

export function isValidGCTransition(from: GCStage, to: GCStage): boolean {
  if (from === to) return false
  return GC_VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function isGCBackwardMove(from: GCStage, to: GCStage): boolean {
  return (GC_STAGE_ORDER[to] ?? 0) < (GC_STAGE_ORDER[from] ?? 0)
}

export function getGCInitialStage(): GCStage { return 'lead_in' }
