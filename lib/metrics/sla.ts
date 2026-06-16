// Single source of truth for stage-based SLA / "stalled" / "overdue" logic.
//
// Before this module, three places measured "overdue" with three different
// clocks and disagreed on screen:
//   - the per-lead ⚠ badge used flat created_at >= 7d
//   - the Stalled action card used time-in-stage vs stage SLA
//   - the "needs attention" filter used a flat created_at/stage >3d
// Everything now reads STAGE_SLA_DAYS + daysInStage from here, so the badge,
// the card count, and the board it filters to all agree.
//
// Clock rule: time in the CURRENT stage (lead_status_changed_at), not total
// lead age (created_at). A lead that just moved stages is fresh.

const DAY = 86400000

// Stage-specific SLAs in days. Roofing stages have wildly different expected
// durations — Insurance Approved legitimately sits for weeks — so a flat
// threshold is wrong. Stages absent from this map have no SLA and never count
// as past-SLA (this is what suppresses the badge on terminal stages: won / lost
// / unqualified are not keys here).
export const STAGE_SLA_DAYS: Record<string, number> = {
  lead_in:              1,
  inspection_scheduled: 3,
  insurance_approved:   14, // carrier cycles are long in FL
  proposal_sent:        7,
  proposal_signed:      14, // unscheduled
  scheduled:            7,
  in_progress:          7,
}

// Minimal shape — works for both DB rows (route) and Lead objects (components).
export interface SlaLead {
  lead_status?: string | null
  lead_status_changed_at?: string | null
  created_at?: string | null
}

/** Days the lead has spent in its current stage. */
export function daysInStage(lead: SlaLead, now: number = Date.now()): number {
  const since = lead.lead_status_changed_at ?? lead.created_at
  if (!since) return 0
  return (now - new Date(since).getTime()) / DAY
}

/**
 * True when the lead has exceeded its current stage's SLA.
 * Stages with no SLA entry (terminal: won / lost / unqualified) always return
 * false, which is what keeps the ⚠ badge off won/lost cards.
 * Drives the per-lead ⚠ badge directly.
 */
export function pastStageSla(lead: SlaLead, now: number = Date.now()): boolean {
  const status = lead.lead_status as string
  const sla = STAGE_SLA_DAYS[status]
  if (sla == null) return false
  return daysInStage(lead, now) >= sla
}

/**
 * True when the lead belongs in the Stalled action card.
 * Each lead lives in exactly one card, so Stalled excludes the stages that have
 * their own cards: the entry stage (Needs Contact) and insurance_approved
 * (Insurance Follow-Up). Everything else past its SLA is Stalled.
 */
export function isStalled(lead: SlaLead, entryKey: string | null, now: number = Date.now()): boolean {
  const status = lead.lead_status as string
  if (status === 'insurance_approved') return false // own card
  if (entryKey && status === entryKey)  return false // own card (Needs Contact)
  return pastStageSla(lead, now)
}
