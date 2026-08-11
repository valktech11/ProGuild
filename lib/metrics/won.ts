// Single source of truth for "won" metrics across dashboards.
// A lead counts as won-in-a-month by the ACTUAL won date (lead_status_changed_at,
// stamped when the stage moved to the won anchor) — NOT created_at or updated_at,
// which drift and caused the Overview / Pipeline numbers to disagree.

interface WonLead {
  lead_status: string
  lead_status_changed_at?: string | null
  updated_at?: string
  quoted_amount?: number | null
}

/** Leads won in a given calendar month. offset 0 = this month, 1 = last month. */
export function wonInMonth<T extends WonLead>(leads: T[], wonStatus: string, offset = 0): T[] {
  const now = new Date()
  const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  return leads.filter(l => {
    if (l.lead_status !== wonStatus) return false
    const raw = l.lead_status_changed_at ?? l.updated_at  // fallback for legacy rows
    if (!raw) return false
    const d = new Date(raw)
    return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear()
  })
}

/** Sum of quoted_amount over a set of leads. */
export function sumQuoted(leads: WonLead[]): number {
  return leads.reduce((s, l) => s + (l.quoted_amount || 0), 0)
}

interface RevenueLead {
  quoted_amount?: number | null
  roofing_job_data?:
    | { approved_amount?: number | null }
    | { approved_amount?: number | null }[]
    | null
}

/** Revenue for a single lead: the approved (insurance) amount if present, else the quote. */
export function leadRevenue(l: RevenueLead): number {
  const rjd = Array.isArray(l.roofing_job_data) ? l.roofing_job_data[0] : l.roofing_job_data
  const approved = rjd?.approved_amount
  return approved != null && approved > 0 ? approved : (l.quoted_amount || 0)
}

/** Sum revenue (approved-else-quoted) over a set of leads. */
export function sumRevenue(leads: RevenueLead[]): number {
  return leads.reduce((s, l) => s + leadRevenue(l), 0)
}

// ── Shared derived sets/sums (were duplicated across summary routes) ──────────
// These existed independently in /api/overview, /api/invoices/summary, and
// /api/pipeline/summary with identical logic. Centralized here so the formula
// physically exists once and the routes can't drift.

import { getTerminalStages } from '@/lib/trades/_registry'

interface PaidInvoice { status?: string | null; total?: number | null }

/** "Collected" = realized cash = Σ total over PAID invoices, rounded to cents.
 *  Single definition shared by /api/overview and /api/invoices/summary. */
export function collectedFromInvoices(invoices: PaidInvoice[]): number {
  const sum = invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + ((i.total as number) || 0), 0)
  return Math.round(sum * 100) / 100
}

/** The set of lead_status values considered CLOSED for pipeline purposes:
 *  terminal stages + the won anchor + 'Paid'. Anything not in this set is "open".
 *  Single definition shared by /api/overview (estimatedValue) and
 *  /api/pipeline/summary (open-leads), so the two can't disagree on what's open. */
export function closedPipelineKeys(
  tradeSlug: string | null | undefined,
  wonAnchor: string,
): Set<string> {
  return new Set<string>([
    ...getTerminalStages(tradeSlug).map(s => s.key),
    wonAnchor,
    'Paid',
  ])
}
