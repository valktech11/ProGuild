// ── Roofing Stage Rules — the single source of stage-move truth ─────────────
//
// One brain, consumed by web + mobile via /api/roofing/stage-plan. Replaces the
// old divergent copies (web evalGate + mobile _gateReason). Pure: no I/O. The
// stage-plan endpoint gathers a StageContext and calls evaluateStagePlan().
//
// Model (agreed):
//  - manual stages (lead_in, inspection_scheduled, scheduled, in_progress) are
//    moved by the roofer, behind a gate + an optional date prompt.
//  - auto stages (insurance_approved, proposal_sent, proposal_signed, job_won)
//    are ACTION-driven: reached only by their real action (claim approved, send,
//    sign, payment), never by a manual chip-flip — the action carries side
//    effects (invoice creation, estimate status) a flip would skip. They show
//    LOCKED with a hint. Backward moves into them are allowed as corrections
//    (the side effects already happened; we're only moving the pointer).
//  - terminal stages (lost, unqualified) are manual with a reason prompt.
//  - backward moves skip gates everywhere (confirmed by the client).
//
// job_won is intentionally tightened vs config.ts: "invoice paid in full", not
// "invoice exists" — won == money collected, by any method.

import type { RoofingStage } from './types'
import {
  ROOFING_STAGES,
  ROOFING_STAGE_ORDER,
  ROOFING_VALID_TRANSITIONS,
} from './state-machine'

// ── Context the endpoint assembles for one lead ─────────────────────────────
export interface StageContext {
  currentStage:     RoofingStage
  propertyAddress?: string | null
  insuranceClaim?:  boolean
  claimStatus?:     string | null
  estimate?:  { exists: boolean; status?: string | null; total?: number | null }
  invoice?:   { exists: boolean; status?: string | null; balanceDue?: number | null }
  scheduledDate?:   string | null
  inspectionDate?:  string | null
}

export type StagePrompt = 'date' | 'datetime' | 'reason'
export type StageKind   = 'manual' | 'auto' | 'terminal'

export interface StagePlanEntry {
  key:        RoofingStage
  kind:       StageKind
  isCurrent:  boolean
  isComplete: boolean              // a past linear stage
  backward:   boolean              // earlier in order than current
  locked:     boolean              // not a tappable move target right now
  allowed:    boolean              // user may initiate this move now
  suggested:  boolean              // in the branch graph from current
  reason:     string | null        // gate failure, or the action hint when locked
  prompt:     StagePrompt | null   // what to collect before committing
  date?:      string | null        // "happened on" date — attached by the route, not the evaluator
}

export interface StagePlan {
  currentStage: RoofingStage
  stages:       StagePlanEntry[]
}

// ── Static per-stage facts ──────────────────────────────────────────────────
const STAGE_KIND: Record<RoofingStage, StageKind> = {
  lead_in:              'manual',
  inspection_scheduled: 'manual',
  insurance_approved:   'auto',
  proposal_sent:        'auto',
  proposal_signed:      'auto',
  scheduled:            'manual',
  in_progress:          'manual',
  job_won:              'auto',
  lost:                 'terminal',
  unqualified:          'terminal',
}

const STAGE_PROMPT: Partial<Record<RoofingStage, StagePrompt>> = {
  inspection_scheduled: 'date',
  scheduled:            'datetime',
  lost:                 'reason',
  unqualified:          'reason',
}

// Hint shown when an auto stage is locked — tells the roofer how it advances.
const ACTION_HINT: Partial<Record<RoofingStage, string>> = {
  insurance_approved: 'Advances when the insurance claim is approved',
  proposal_sent:      'Advances when the estimate is sent',
  proposal_signed:    'Advances when the proposal is signed',
  job_won:            'Advances when the invoice is paid in full',
}

// Gate token → test + the message shown when it fails. These are the canonical
// requirements (A/B decisions enforced; job_won tightened to paid-in-full).
type GateToken =
  | 'lead_has_address' | 'insurance_claim_filed' | 'estimate_ready'
  | 'estimate_sent' | 'estimate_approved' | 'scheduled_date' | 'invoice_paid_full'

const STAGE_REQUIRES: Partial<Record<RoofingStage, GateToken>> = {
  inspection_scheduled: 'lead_has_address',
  insurance_approved:   'insurance_claim_filed',
  proposal_sent:        'estimate_ready',
  proposal_signed:      'estimate_sent',
  scheduled:            'estimate_approved',
  in_progress:          'scheduled_date',
  job_won:              'invoice_paid_full',
}

const SENT_STATUSES     = ['sent', 'viewed', 'approved', 'invoiced', 'paid']
const APPROVED_STATUSES = ['approved', 'invoiced', 'paid']

const GATES: Record<GateToken, { test: (c: StageContext) => boolean; reason: string }> = {
  lead_has_address: {
    test: c => !!(c.propertyAddress && c.propertyAddress.trim()),
    reason: 'Add a property address before scheduling inspection.',
  },
  insurance_claim_filed: {
    test: c => c.insuranceClaim === true,
    reason: 'Mark this job as an insurance claim first.',
  },
  estimate_ready: {
    test: c => !!c.estimate?.exists && (c.estimate?.total ?? 0) > 0,
    reason: 'Create a proposal with line items before it can be sent.',
  },
  estimate_sent: {
    test: c => !!c.estimate?.exists && SENT_STATUSES.includes(c.estimate?.status ?? ''),
    reason: 'Send the proposal to the homeowner before it can be signed.',
  },
  estimate_approved: {
    test: c => !!c.estimate?.exists && APPROVED_STATUSES.includes(c.estimate?.status ?? ''),
    reason: 'Get the proposal signed before scheduling the job.',
  },
  scheduled_date: {
    test: c => !!(c.scheduledDate && c.scheduledDate.trim()),
    reason: 'Set a job date before marking as In Progress.',
  },
  invoice_paid_full: {
    test: c => !!c.invoice?.exists && (c.invoice?.balanceDue ?? 1) <= 0,
    reason: 'Job is won automatically when the invoice is paid in full.',
  },
}

// ── Evaluation ──────────────────────────────────────────────────────────────
export function evaluateStagePlan(ctx: StageContext): StagePlan {
  const curOrder = ROOFING_STAGE_ORDER[ctx.currentStage] ?? 0
  const suggestedSet = new Set(ROOFING_VALID_TRANSITIONS[ctx.currentStage] ?? [])

  const stages = ROOFING_STAGES.map<StagePlanEntry>(key => {
    const kind     = STAGE_KIND[key]
    const order    = ROOFING_STAGE_ORDER[key] ?? 0
    const isCurrent = key === ctx.currentStage
    const backward  = !isCurrent && order < curOrder
    const isComplete = backward && kind !== 'terminal'
    const prompt    = STAGE_PROMPT[key] ?? null
    const suggested = suggestedSet.has(key)

    // Auto stages are locked for forward moves (reach them by their action);
    // the current stage is never a move target.
    const lockedForward = kind === 'auto' && !backward
    const locked = isCurrent || lockedForward

    let allowed = false
    let reason: string | null = null

    if (isCurrent) {
      allowed = false
    } else if (lockedForward) {
      allowed = false
      reason  = ACTION_HINT[key] ?? null
    } else if (backward) {
      // Backward = correction; gates skipped, client confirms.
      allowed = true
    } else {
      // Forward manual / terminal — evaluate the gate.
      const token = STAGE_REQUIRES[key]
      if (token) {
        const g = GATES[token]
        allowed = g.test(ctx)
        reason  = allowed ? null : g.reason
      } else {
        allowed = true
      }
    }

    return { key, kind, isCurrent, isComplete, backward, locked, allowed, suggested, reason, prompt }
  })

  return { currentStage: ctx.currentStage, stages }
}

// ── Server-side enforcement primitive (used by the user-facing stage route) ──
// NOTE: the action routes (sign, mark-paid, claim-approved) set the stage
// directly — they ARE the authority and do not pass through this check.
export function validateUserMove(
  ctx: StageContext,
  target: RoofingStage,
): { ok: boolean; reason?: string } {
  const plan = evaluateStagePlan(ctx)
  const entry = plan.stages.find(s => s.key === target)
  if (!entry) return { ok: false, reason: 'Unknown stage' }
  if (entry.isCurrent) return { ok: false, reason: 'Already at this stage' }
  if (!entry.allowed) return { ok: false, reason: entry.reason ?? 'Move not allowed yet' }
  return { ok: true }
}
