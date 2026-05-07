/**
 * ProGuild Design System
 * ─────────────────────
 * Single source of truth for ALL semantic colors.
 * Replaces: statusColors() in theme.ts, STATUS_STYLES in invoice files,
 *           and the color fields in PIPELINE_STAGES.
 *
 * Rules:
 *  - 4 urgency colors: teal (job), amber (follow-up/attention), red (overdue/critical), gray (done)
 *  - Dark mode: cardBg background + colored border + colored text. No dark-tinted status backgrounds.
 *  - Icons differentiate types; color differentiates urgency.
 */

// ─── Urgency palette — 4 semantic meanings ────────────────────────────────────

/** Returns bg/border/text/icon color for a calendar event based on urgency, not status */
export function eventStyle(
  opts: { isOverdue: boolean; isFollowup: boolean; isCompleted: boolean; leadStatus: string },
  dk: boolean
): { bg: string; border: string; text: string; mutedText: string; opacity: number } {
  const { isOverdue, isFollowup, isCompleted, leadStatus } = opts

  // Completed / paid — gray, reduced opacity
  if (isCompleted || leadStatus === 'Completed' || leadStatus === 'Paid') {
    return {
      bg:        dk ? '#1E293B' : '#F9FAFB',
      border:    '#6B7280',
      text:      dk ? '#94A3B8' : '#374151',
      mutedText: dk ? '#64748B' : '#9CA3AF',
      opacity:   0.65,
    }
  }

  // Overdue — red
  if (isOverdue) {
    return {
      bg:        dk ? '#1E293B' : '#FEF2F2',
      border:    '#DC2626',
      text:      dk ? '#FCA5A5' : '#991B1B',
      mutedText: dk ? '#EF4444' : '#B91C1C',
      opacity:   1,
    }
  }

  // Follow-up — amber
  if (isFollowup) {
    return {
      bg:        dk ? '#1E293B' : '#FFFBEB',
      border:    '#D97706',
      text:      dk ? '#FCD34D' : '#92400E',
      mutedText: dk ? '#F59E0B' : '#B45309',
      opacity:   1,
    }
  }

  // Active job (Scheduled, New, Contacted, Quoted) — teal
  return {
    bg:        dk ? '#1E293B' : '#F0FDFA',
    border:    '#0F766E',
    text:      dk ? '#5EEAD4' : '#0F766E',
    mutedText: dk ? '#14B8A6' : '#0D9488',
    opacity:   1,
  }
}

// ─── Lead stage colors — used by pipeline, lead detail, calendar ──────────────

export type StageStyle = {
  color: string     // primary accent (text, border)
  bg: string        // light background tint
  chipBg: string    // pill/badge background
  label: string     // display label
}

const STAGE_STYLES: Record<string, StageStyle> = {
  New:       { color: '#D97706', bg: '#FFFBEB', chipBg: '#FEF3C7', label: 'New' },
  Contacted: { color: '#2563EB', bg: '#EFF6FF', chipBg: '#DBEAFE', label: 'Contacted' },
  Quoted:    { color: '#7C3AED', bg: '#F5F3FF', chipBg: '#EDE9FE', label: 'Quoted' },
  Scheduled: { color: '#0F766E', bg: '#F0FDFA', chipBg: '#CCFBF1', label: 'Scheduled' },
  Completed: { color: '#374151', bg: '#F9FAFB', chipBg: '#F3F4F6', label: 'Completed' },
  Paid:      { color: '#15803D', bg: '#DCFCE7', chipBg: '#BBF7D0', label: 'Job Won' },
  Lost:      { color: '#9CA3AF', bg: '#F9FAFB', chipBg: '#F3F4F6', label: 'Lost' },
}

/** Stage style for pipeline, lead detail stage pills, etc. */
export function stageStyle(status: string): StageStyle {
  return STAGE_STYLES[status] || STAGE_STYLES['New']
}

// ─── Invoice status styles ────────────────────────────────────────────────────

export type InvoiceStatusStyle = { bg: string; text: string; label: string }

export function invoiceStatusStyle(status: string): InvoiceStatusStyle {
  const map: Record<string, InvoiceStatusStyle> = {
    draft:           { bg: '#F3F4F6', text: '#4B5563', label: 'Draft' },
    sent:            { bg: '#EFF6FF', text: '#1D4ED8', label: 'Sent' },
    viewed:          { bg: '#F5F3FF', text: '#6D28D9', label: 'Viewed' },
    partial_payment: { bg: '#FFFBEB', text: '#B45309', label: 'Partial' },
    paid:            { bg: '#F0FDF4', text: '#15803D', label: 'Paid' },
    void:            { bg: '#F9FAFB', text: '#9CA3AF', label: 'Void' },
  }
  return map[status] || map['draft']
}

// ─── Estimate status styles ───────────────────────────────────────────────────

export type EstimateStatusStyle = { bg: string; text: string; label: string }

export function estimateStatusStyle(status: string): EstimateStatusStyle {
  const map: Record<string, EstimateStatusStyle> = {
    draft:    { bg: '#F3F4F6', text: '#4B5563', label: 'Draft' },
    sent:     { bg: '#EFF6FF', text: '#1D4ED8', label: 'Sent' },
    viewed:   { bg: '#F5F3FF', text: '#6D28D9', label: 'Viewed' },
    approved: { bg: '#F0FDF4', text: '#15803D', label: 'Approved' },
    declined: { bg: '#FEF2F2', text: '#DC2626', label: 'Declined' },
    invoiced: { bg: '#FFFBEB', text: '#B45309', label: 'Invoiced' },
    paid:     { bg: '#DCFCE7', text: '#15803D', label: 'Paid' },
    void:     { bg: '#F9FAFB', text: '#9CA3AF', label: 'Void' },
  }
  return map[status] || map['draft']
}

// ─── SVG icon paths — used by EventChip and anywhere icons are needed ─────────

export const ICON_PATH = {
  wrench:   'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  phone:    'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6',
  warning:  'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  check:    'M20 6L9 17l-5-5',
  chevronR: 'M9 18l6-6-6-6',
  chevronL: 'M15 18l-6-6 6-6',
  mapPin:   'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 10m-3 0a3 3 0 106 0 3 3 0 00-6 0',
  plus:     'M12 5v14M5 12h14',
} as const
