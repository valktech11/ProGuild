// ── Roofing State Machine ───────────────────────────────────────────────────
// Option C: state machine defines SUGGESTED transitions for the UI move sheet.
// The API accepts any known LeadStatus — no hard 422 gating.
// Discipline is in the UI (move sheet shows suggestions), not the API.

import type { RoofingStage, RoofingAutoAction } from './types'

export const ROOFING_STAGES: readonly RoofingStage[] = [
  'lead_in', 'inspection_scheduled', 'insurance_approved', 'proposal_sent',
  'proposal_signed', 'scheduled', 'in_progress', 'job_won', 'lost', 'unqualified',
] as const

export const ROOFING_ACTIVE_STAGES: readonly RoofingStage[] = [
  'lead_in', 'inspection_scheduled', 'insurance_approved', 'proposal_sent',
  'proposal_signed', 'scheduled', 'in_progress', 'job_won',
]

export const ROOFING_TERMINAL_STAGES: readonly RoofingStage[] = ['lost', 'unqualified']

export const ROOFING_STAGE_ORDER: Record<RoofingStage, number> = {
  lead_in: 0, inspection_scheduled: 1, insurance_approved: 2, proposal_sent: 3,
  proposal_signed: 4, scheduled: 5, in_progress: 6, job_won: 7,
  lost: 8, unqualified: 9,
}

// Suggested transitions — shown prominently in the move sheet.
// Not enforced at API level. Roofer can always access all stages via "All stages".
export const ROOFING_VALID_TRANSITIONS: Record<RoofingStage, RoofingStage[]> = {
  lead_in: [
    'inspection_scheduled',
    'proposal_sent',        // referral — skip inspection
    'proposal_signed',      // referral, signs immediately
    'lost',
    'unqualified',
  ],
  inspection_scheduled: [
    'insurance_approved',   // insurance/storm job — adjuster next
    'proposal_sent',        // cash job — skip insurance, go straight to proposal
    'lead_in',              // no show — reschedule
    'lost',
    'unqualified',
  ],
  proposal_sent: [
    'proposal_signed',
    'insurance_approved',   // insurer approves without signed contract (rare)
    'inspection_scheduled', // homeowner wants re-inspection
    'lead_in',              // went cold — back to start
    'lost',
    'unqualified',
  ],
  proposal_signed: [
    'scheduled',            // contract signed — schedule the install
    'proposal_sent',        // homeowner wants changes — revise
    'insurance_approved',   // scope dispute — back to insurance
    'lost',
  ],
  insurance_approved: [
    'proposal_sent',        // write estimate matching approved scope
    'scheduled',            // cash/pre-approved — skip estimate
    'inspection_scheduled', // adjuster wants re-inspection
    'lost',
  ],
  scheduled: [
    'in_progress',
    'proposal_signed',      // contract dispute — re-sign
    'insurance_approved',   // scheduling issue, back to approved
    'lost',
  ],
  in_progress: [
    'job_won',
    'scheduled',            // weather delay / rescheduled
    'lost',
  ],
  job_won: [
    'in_progress',          // punch list / warranty issue
    'scheduled',            // major rework needed
    'lost',                 // chargeback / dispute
  ],
  lost: [
    'lead_in',              // homeowner came back
    'inspection_scheduled', // came back, wants inspection immediately
  ],
  unqualified: [
    'lead_in',              // mis-classified — recover
  ],
}

export const ROOFING_AUTO_TRIGGERS: Partial<Record<RoofingStage, RoofingAutoAction[]>> = {
  proposal_signed: ['stripe_deposit', 'send_proposal_signed_email'],
  job_won:         ['create_warranty_record', 'queue_review_request', 'generate_job_summary'],
}

// ── Pure functions ──────────────────────────────────────────────────────────

/** Returns suggested next stages for the move sheet UI. Not API-enforced. */
export function getSuggestedTransitions(from: RoofingStage): RoofingStage[] {
  return ROOFING_VALID_TRANSITIONS[from] ?? []
}

/** For backward compat — still used in unit tests and stage API (soft check only). */
export function isValidRoofingTransition(from: RoofingStage, to: RoofingStage): boolean {
  if (from === to) return false
  return ROOFING_VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getRoofingAutoTriggers(stage: RoofingStage): RoofingAutoAction[] {
  return ROOFING_AUTO_TRIGGERS[stage] ?? []
}

export function isRoofingTerminal(stage: RoofingStage): boolean {
  return ROOFING_TERMINAL_STAGES.includes(stage)
}

export function isRoofingBackwardMove(from: RoofingStage, to: RoofingStage): boolean {
  return (ROOFING_STAGE_ORDER[to] ?? 0) < (ROOFING_STAGE_ORDER[from] ?? 0)
}

export function getRoofingInitialStage(): RoofingStage {
  return 'lead_in'
}
