/**
 * ProGuild Design System
 * ─────────────────────
 * Single source of truth for ALL semantic colours.
 *
 * Rules:
 *  - stageStyle(status, dk) — always pass dk. Returns correct bg/chipBg for the mode.
 *  - Dark mode stages: transparent tinted bg derived from the accent colour. No hardcoded hex.
 *  - estimateStatusStyle / invoiceStatusStyle — same pattern.
 */

import { BRAND } from './tokens'
import { getTradeConfig } from './trades/_registry'

// ─── Calendar event urgency ───────────────────────────────────────────────────

export function eventStyle(
  opts: { isOverdue: boolean; isFollowup: boolean; isCompleted: boolean; leadStatus: string },
  dk: boolean
): { bg: string; border: string; text: string; mutedText: string; opacity: number } {
  const { isOverdue, isFollowup, isCompleted, leadStatus } = opts

  if (isCompleted || leadStatus === 'Completed' || leadStatus === 'Paid') {
    return {
      bg:        dk ? '#181E2A' : '#F9FAFB',
      border:    '#6B7280',
      text:      dk ? '#94A3B8' : '#374151',
      mutedText: dk ? '#64748B' : '#9CA3AF',
      opacity:   0.65,
    }
  }
  if (isOverdue) {
    return {
      bg:        dk ? '#181E2A' : '#FEF2F2',
      border:    '#DC2626',
      text:      dk ? '#FCA5A5' : '#991B1B',
      mutedText: dk ? '#EF4444' : '#B91C1C',
      opacity:   1,
    }
  }
  if (isFollowup) {
    return {
      bg:        dk ? '#181E2A' : '#FFFBEB',
      border:    '#D97706',
      text:      dk ? '#FCD34D' : '#92400E',
      mutedText: dk ? '#F59E0B' : '#B45309',
      opacity:   1,
    }
  }
  return {
    bg:        dk ? '#181E2A' : '#F0FDFA',
    border:    BRAND.teal,
    text:      dk ? '#5EEAD4' : BRAND.teal,
    mutedText: dk ? '#14B8A6' : '#0D9488',
    opacity:   1,
  }
}

// ─── Lead pipeline stage colours ─────────────────────────────────────────────

export type StageStyle = {
  color:  string   // primary accent — text, border, icon. Same in light and dark.
  bg:     string   // surface background — light tint in light, dark tint in dark
  chipBg: string   // pill/badge background
  label:  string   // display label
}

// Light-mode base definitions — only `color` and `label` are invariant
const STAGE_BASE: Record<string, { color: string; lightBg: string; lightChip: string; label: string }> = {
  // Generic trade stages — same minimal palette principle
  New:       { color: '#64748B', lightBg: '#F8FAFC', lightChip: '#F1F5F9', label: 'New'       },
  Contacted: { color: '#475569', lightBg: '#F1F5F9', lightChip: '#E2E8F0', label: 'Contacted' },
  Quoted:    { color: BRAND.teal, lightBg: '#F0FDFA', lightChip: '#CCFBF1', label: 'Quoted'    },
  Scheduled: { color: BRAND.teal, lightBg: '#F0FDFA', lightChip: '#CCFBF1', label: 'Scheduled' },
  Completed: { color: '#0D9488', lightBg: '#F0FDFA', lightChip: '#CCFBF1', label: 'Completed' },
  Paid:      { color: '#059669', lightBg: '#ECFDF5', lightChip: '#D1FAE5', label: 'Job Won'   },
  Lost:      { color: '#6B7280', lightBg: '#F9FAFB', lightChip: '#F3F4F6', label: 'Lost'      },
  // Roofing stage fallbacks (stageStyle used as secondary source)
  // ── Roofing stages — each a distinct hue, no same-family pairs ──────────
  // Indigo → Sky → Teal → Violet → Amber → Blue → Navy → Emerald
  lead_in:              { color: '#0369A1', lightBg: '#F0F9FF', lightChip: '#BAE6FD', label: 'Lead In'              },
  inspection_scheduled: { color: '#0284C7', lightBg: '#F0F9FF', lightChip: '#BAE6FD', label: 'Inspection Scheduled' },
  proposal_sent:        { color: '#D97706', lightBg: '#FFFBEB', lightChip: '#FEF3C7', label: 'Proposal Sent'        },
  proposal_signed:      { color: '#059669', lightBg: '#ECFDF5', lightChip: '#D1FAE5', label: 'Proposal Signed'      },
  insurance_approved:   { color: '#0891B2', lightBg: '#F0F9FF', lightChip: '#BAE6FD', label: 'Insurance Approved'   },
  scheduled:            { color: '#2563EB', lightBg: '#EFF6FF', lightChip: '#DBEAFE', label: 'Scheduled'            },
  in_progress:          { color: '#EA580C', lightBg: '#FFF7ED', lightChip: '#FED7AA', label: 'In Progress'          },
  job_won:              { color: '#047857', lightBg: '#D1FAE5', lightChip: '#A7F3D0', label: 'Job Won'              },
  unqualified:          { color: '#6B7280', lightBg: '#F9FAFB', lightChip: '#F3F4F6', label: 'Unqualified'          },
}

/**
 * Returns stage colours appropriate for the current mode.
 * Dark mode: bg and chipBg are derived transparently from the accent colour.
 * Always pass dk so dark mode works automatically everywhere.
 */
export function stageStyle(status: string, dk = false, tradeSlug?: string): StageStyle {
  // Primary source: trade config stage (single source of truth for colors)
  // Fallback: STAGE_BASE (for generic/legacy stages not in any trade config)
  if (tradeSlug) {
    const plugin = getTradeConfig(tradeSlug)
    const stage  = plugin?.stages?.find((s: any) => s.key === status)
    if (stage) {
      return {
        color:  stage.color,
        bg:     dk ? stage.color + '1A' : stage.bg,
        chipBg: dk ? stage.color + '33' : (stage.dot + '33'),
        label:  stage.label,
      }
    }
  }
  // Fallback to STAGE_BASE for generic stages (Paid, Lost, New, etc.)
  const base = STAGE_BASE[status] || STAGE_BASE['New']
  if (dk) {
    return {
      color:  base.color,
      bg:     base.color + '1A',
      chipBg: base.color + '33',
      label:  base.label,
    }
  }
  return {
    color:  base.color,
    bg:     base.lightBg,
    chipBg: base.lightChip,
    label:  base.label,
  }
}

// ─── Invoice status ───────────────────────────────────────────────────────────

export type StatusStyle = { bg: string; text: string; label: string }

// Same pattern: accent colour is invariant, bg is derived in dark mode
const INVOICE_BASE: Record<string, { lightBg: string; text: string; darkText: string; label: string }> = {
  draft:           { lightBg: '#F3F4F6', text: '#4B5563', darkText: '#94A3B8', label: 'Draft'   },
  sent:            { lightBg: '#EFF6FF', text: '#1D4ED8', darkText: '#93C5FD', label: 'Sent'    },
  viewed:          { lightBg: '#F5F3FF', text: '#6D28D9', darkText: '#C4B5FD', label: 'Viewed'  },
  partial_payment: { lightBg: '#FFFBEB', text: '#B45309', darkText: '#FCD34D', label: 'Partial' },
  paid:            { lightBg: '#F0FDF4', text: '#15803D', darkText: '#6EE7B7', label: 'Paid'    },
  void:            { lightBg: '#F9FAFB', text: '#9CA3AF', darkText: '#475569', label: 'Void'    },
}

export function invoiceStatusStyle(status: string, dk = false): StatusStyle {
  const base = INVOICE_BASE[status] || INVOICE_BASE['draft']
  return {
    bg:   dk ? base.darkText + '1A' : base.lightBg,
    text: dk ? base.darkText        : base.text,
    label: base.label,
  }
}

// ─── Estimate status ──────────────────────────────────────────────────────────

const ESTIMATE_BASE: Record<string, { lightBg: string; text: string; darkText: string; label: string }> = {
  draft:    { lightBg: '#F3F4F6', text: '#4B5563', darkText: '#94A3B8', label: 'Draft'    },
  sent:     { lightBg: '#EFF6FF', text: '#1D4ED8', darkText: '#93C5FD', label: 'Sent'     },
  viewed:   { lightBg: '#F5F3FF', text: '#6D28D9', darkText: '#C4B5FD', label: 'Viewed'   },
  approved: { lightBg: '#F0FDF4', text: '#15803D', darkText: '#6EE7B7', label: 'Approved' },
  declined: { lightBg: '#FEF2F2', text: '#DC2626', darkText: '#FCA5A5', label: 'Declined' },
  invoiced: { lightBg: '#FFFBEB', text: '#B45309', darkText: '#FCD34D', label: 'Invoiced' },
  paid:     { lightBg: '#DCFCE7', text: '#15803D', darkText: '#6EE7B7', label: 'Paid'     },
  void:     { lightBg: '#F9FAFB', text: '#9CA3AF', darkText: '#475569', label: 'Void'     },
}

export function estimateStatusStyle(status: string, dk = false): StatusStyle {
  const base = ESTIMATE_BASE[status] || ESTIMATE_BASE['draft']
  return {
    bg:    dk ? base.darkText + '1A' : base.lightBg,
    text:  dk ? base.darkText        : base.text,
    label: base.label,
  }
}

// ─── SVG icon paths ───────────────────────────────────────────────────────────

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
