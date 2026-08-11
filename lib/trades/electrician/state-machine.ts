import type { ElectricianStage } from './types'

export const ELECTRICIAN_STAGES: readonly ElectricianStage[] = [
  'new_call','site_visit','quoted','permit_submitted',
  'permit_approved','scheduled','in_progress','job_won','lost','unqualified',
]

export const ELECTRICIAN_STAGE_ORDER: Record<ElectricianStage, number> = {
  new_call: 0, site_visit: 1, quoted: 2, permit_submitted: 3,
  permit_approved: 4, scheduled: 5, in_progress: 6,
  job_won: 7, lost: 8, unqualified: 9,
}

export const ELECTRICIAN_VALID_TRANSITIONS: Record<ElectricianStage, ElectricianStage[]> = {
  new_call:         ['site_visit', 'quoted', 'lost', 'unqualified'],
  site_visit:       ['new_call', 'quoted', 'lost', 'unqualified'],
  quoted:           ['site_visit', 'permit_submitted', 'scheduled', 'lost', 'unqualified'],
  permit_submitted: ['quoted', 'permit_approved', 'lost'],
  permit_approved:  ['permit_submitted', 'scheduled', 'lost'],
  scheduled:        ['permit_approved', 'in_progress', 'lost'],
  in_progress:      ['scheduled', 'job_won', 'lost'],
  job_won:          ['in_progress'],
  lost:             ['new_call'],
  unqualified:      [],
}

export function isValidElectricianTransition(from: ElectricianStage, to: ElectricianStage): boolean {
  if (from === to) return false
  return ELECTRICIAN_VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function isElectricianBackwardMove(from: ElectricianStage, to: ElectricianStage): boolean {
  return (ELECTRICIAN_STAGE_ORDER[to] ?? 0) < (ELECTRICIAN_STAGE_ORDER[from] ?? 0)
}

export function getElectricianInitialStage(): ElectricianStage { return 'new_call' }
