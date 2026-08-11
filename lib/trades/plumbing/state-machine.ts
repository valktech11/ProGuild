import type { PlumbingStage } from './types'

export const PLUMBING_STAGES: readonly PlumbingStage[] = [
  'new_call','assessed','quoted','scheduled','in_progress','job_won','lost','unqualified',
]

export const PLUMBING_STAGE_ORDER: Record<PlumbingStage, number> = {
  new_call: 0, assessed: 1, quoted: 2, scheduled: 3,
  in_progress: 4, job_won: 5, lost: 6, unqualified: 7,
}

export const PLUMBING_VALID_TRANSITIONS: Record<PlumbingStage, PlumbingStage[]> = {
  new_call:    ['assessed', 'quoted', 'lost', 'unqualified'],
  assessed:    ['new_call', 'quoted', 'lost', 'unqualified'],
  quoted:      ['assessed', 'scheduled', 'lost', 'unqualified'],
  scheduled:   ['quoted', 'in_progress', 'lost'],
  in_progress: ['scheduled', 'job_won', 'lost'],
  job_won:     ['in_progress'],
  lost:        ['new_call'],
  unqualified: [],
}

export function isValidPlumbingTransition(from: PlumbingStage, to: PlumbingStage): boolean {
  if (from === to) return false
  return PLUMBING_VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function isPlumbingBackwardMove(from: PlumbingStage, to: PlumbingStage): boolean {
  return (PLUMBING_STAGE_ORDER[to] ?? 0) < (PLUMBING_STAGE_ORDER[from] ?? 0)
}

export function getPlumbingInitialStage(): PlumbingStage { return 'new_call' }
