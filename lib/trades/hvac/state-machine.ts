// ── HVAC State Machine ──────────────────────────────────────────────────────

import type { HVACStage, HVACAutoAction } from './types'

export const HVAC_STAGES: readonly HVACStage[] = [
  'new_call',
  'diagnosed',
  'quoted',
  'parts_ordered',
  'scheduled',
  'in_progress',
  'job_won',
  'lost',
  'unqualified',
] as const

export const HVAC_ACTIVE_STAGES: readonly HVACStage[] = [
  'new_call',
  'diagnosed',
  'quoted',
  'parts_ordered',
  'scheduled',
  'in_progress',
  'job_won',
]

export const HVAC_TERMINAL_STAGES: readonly HVACStage[] = [
  'lost',
  'unqualified',
]

export const HVAC_STAGE_ORDER: Record<HVACStage, number> = {
  new_call:     0,
  diagnosed:    1,
  quoted:       2,
  parts_ordered:3,
  scheduled:    4,
  in_progress:  5,
  job_won:      6,
  lost:         7,
  unqualified:  8,
}

export const HVAC_VALID_TRANSITIONS: Record<HVACStage, HVACStage[]> = {
  new_call: [
    'diagnosed',
    'quoted',      // simple service — skip diagnosis
    'lost',
    'unqualified',
  ],
  diagnosed: [
    'new_call',    // re-assess
    'quoted',
    'lost',
    'unqualified',
  ],
  quoted: [
    'diagnosed',   // customer wants re-quote
    'parts_ordered',
    'scheduled',   // simple job, no parts needed
    'lost',
    'unqualified',
  ],
  parts_ordered: [
    'quoted',      // parts unavailable — re-quote
    'scheduled',
    'lost',
  ],
  scheduled: [
    'parts_ordered', // parts delayed
    'in_progress',
    'lost',
  ],
  in_progress: [
    'scheduled',   // access issue
    'job_won',
    'lost',
  ],
  job_won: [
    'in_progress', // warranty callback
  ],
  lost: [
    'new_call',    // customer calls back
  ],
  unqualified: [],
}

export const HVAC_AUTO_TRIGGERS: Partial<Record<HVACStage, HVACAutoAction[]>> = {
  job_won: [
    'create_maintenance_reminder',
    'queue_review_request',
    'generate_service_summary',
  ],
}

export function isValidHVACTransition(from: HVACStage, to: HVACStage): boolean {
  if (from === to) return false
  return HVAC_VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getHVACAutoTriggers(stage: HVACStage): HVACAutoAction[] {
  return HVAC_AUTO_TRIGGERS[stage] ?? []
}

export function isHVACTerminal(stage: HVACStage): boolean {
  return HVAC_TERMINAL_STAGES.includes(stage)
}

export function isHVACBackwardMove(from: HVACStage, to: HVACStage): boolean {
  return (HVAC_STAGE_ORDER[to] ?? 0) < (HVAC_STAGE_ORDER[from] ?? 0)
}

export function getHVACInitialStage(): HVACStage {
  return 'new_call'
}
