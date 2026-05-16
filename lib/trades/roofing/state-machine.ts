// ── Roofing State Machine ───────────────────────────────────────────────────
// Single source of truth for all valid roofing pipeline transitions.
// The API route, unit tests, and UI all import from here.
// Never duplicate this logic elsewhere.

import type { RoofingStage, RoofingAutoAction } from './types'

export const ROOFING_STAGES: readonly RoofingStage[] = [
  'lead_in',
  'inspection_scheduled',
  'proposal_sent',
  'proposal_signed',
  'insurance_approved',
  'scheduled',
  'in_progress',
  'job_won',
  'lost',
  'unqualified',
] as const

export const ROOFING_ACTIVE_STAGES: readonly RoofingStage[] = [
  'lead_in',
  'inspection_scheduled',
  'proposal_sent',
  'proposal_signed',
  'insurance_approved',
  'scheduled',
  'in_progress',
  'job_won',
]

export const ROOFING_TERMINAL_STAGES: readonly RoofingStage[] = [
  'lost',
  'unqualified',
]

// Stage order for backward-move detection (UI warning)
export const ROOFING_STAGE_ORDER: Record<RoofingStage, number> = {
  lead_in:              0,
  inspection_scheduled: 1,
  proposal_sent:        2,
  proposal_signed:      3,
  insurance_approved:   4,
  scheduled:            5,
  in_progress:          6,
  job_won:              7,
  lost:                 8,
  unqualified:          9,
}

// Every valid transition. Explicit — no implicit "you can go anywhere".
// Backward moves are allowed (homeowners change mind) but must be deliberate.
export const ROOFING_VALID_TRANSITIONS: Record<RoofingStage, RoofingStage[]> = {
  lead_in: [
    'inspection_scheduled',
    'proposal_sent',      // referral — skip inspection
    'lost',
    'unqualified',
  ],
  inspection_scheduled: [
    'lead_in',            // no show — back to new
    'proposal_sent',
    'lost',
    'unqualified',
  ],
  proposal_sent: [
    'inspection_scheduled', // homeowner wants re-inspection
    'lead_in',              // went cold
    'proposal_signed',
    'lost',
    'unqualified',
  ],
  proposal_signed: [
    'proposal_sent',        // homeowner wants changes
    'insurance_approved',   // insurance job
    'scheduled',            // retail job — skip insurance
    'lost',
  ],
  insurance_approved: [
    'proposal_signed',      // adjuster reduced scope
    'scheduled',
    'lost',
  ],
  scheduled: [
    'insurance_approved',   // schedule fell through
    'in_progress',
    'lost',
  ],
  in_progress: [
    'scheduled',            // weather delay
    'job_won',
    'lost',
  ],
  job_won: [
    'in_progress',          // re-open: punch list, warranty issue
    'lost',                 // extreme edge case: chargeback, dispute
  ],
  lost: [
    'lead_in',              // homeowner came back months later
  ],
  unqualified: [
    // Truly terminal — intentional dead end
    // Bad lead, fraud, outside service area
  ],
}

// Auto-triggers fire when a stage transition completes successfully.
// API route executes these after the DB update confirms.
export const ROOFING_AUTO_TRIGGERS: Partial<Record<RoofingStage, RoofingAutoAction[]>> = {
  proposal_signed: [
    'stripe_deposit',
    'send_proposal_signed_email',
  ],
  job_won: [
    'create_warranty_record',
    'queue_review_request',
    'generate_job_summary',
  ],
}

// ── Pure functions — no side effects, fully unit-testable ──────────────────

export function isValidRoofingTransition(
  from: RoofingStage,
  to:   RoofingStage,
): boolean {
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
