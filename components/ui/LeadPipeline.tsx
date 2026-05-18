'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
import type { Lead } from '@/types'

interface LeadPipelineProps {
  leads: Lead[]
  darkMode?: boolean
  dk?: boolean
  onAddLead?: () => void
  onStatusChange?: (leadId: string, status: string) => void
  onUpdate?: (leadId: string, fields: Partial<Lead>) => void
  isPaid?: boolean
  tradeSlug?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOFING_STAGES = [
  { key: 'lead_in',             label: 'Lead In',            subLabel: 'New inquiry',          color: '#64748B', bg: '#F8FAFC', topBar: '#64748B' },
  { key: 'inspection_scheduled',label: 'Inspection Sched.',  subLabel: 'Inspection booked',    color: '#475569', bg: '#F1F5F9', topBar: '#475569' },
  { key: 'proposal_sent',       label: 'Proposal Sent',      subLabel: 'Proposal with owner',  color: '#0F766E', bg: '#F0FDFA', topBar: '#0F766E' },
  { key: 'proposal_signed',     label: 'Proposal Signed',    subLabel: 'Ready for insurance',  color: '#0D9488', bg: '#CCFBF1', topBar: '#0D9488' },
  { key: 'insurance_approved',  label: 'Insurance Approved', subLabel: 'Waiting on carrier',   color: '#92400E', bg: '#FEF3C7', topBar: '#F59E0B' },
  { key: 'scheduled',           label: 'Scheduled',          subLabel: 'Job on calendar',      color: '#155E75', bg: '#ECFEFF', topBar: '#155E75' },
  { key: 'in_progress',         label: 'In Progress',        subLabel: 'Crew on site',         color: '#1E40AF', bg: '#EFF6FF', topBar: '#1E40AF' },
  { key: 'job_won',             label: 'Job Won',            subLabel: 'Completed',            color: '#047857', bg: '#D1FAE5', topBar: '#047857' },
]

const STAGE_CTAS: Record<string, string> = {
  lead_in:               'Schedule Inspection',
  inspection_scheduled:  'Run Inspection',
  proposal_sent:         'Get Signature',
  proposal_signed:       'Submit to Insurance',
  insurance_approved:    'Schedule Install',
  scheduled:             'Start Job',
  in_progress:           'Mark Complete',
  job_won:               '✓ Job Won',
}

const EMPTY_STATE_COPY: Record<string, { icon: string; title: string; body: string; tip?: string }> = {
  lead_in: {
    icon: '📥',
    title: 'No new leads',
    body: 'Add a lead or connect your lead sources to fill this column.',
  },
  inspection_scheduled: {
    icon: '🔭',
    title: 'No inspections scheduled',
    body: 'Move a new lead here after booking an inspection time.',
    tip: 'Tip: Leads scheduled within 2h of first contact close 40% more.',
  },
  proposal_sent: {
    icon: '📋',
    title: 'No proposals out',
    body: 'Send a proposal from an inspected lead to see it here.',
    tip: 'Tip: Following up within 24h increases close rate by 34%.',
  },
  proposal_signed: {
    icon: '✍️',
    title: 'No signed proposals',
    body: 'Once a homeowner signs, move them here to start the insurance process.',
  },
  insurance_approved: {
    icon: '🏛',
    title: 'Waiting on carrier',
    body: 'Drop approved claims here after adjuster approval.',
    tip: 'Avg carrier approval: 18 days after submission.',
  },
  scheduled: {
    icon: '📅',
    title: 'Nothing on the calendar',
    body: 'Book a job from Insurance Approved to fill this column.',
  },
  in_progress: {
    icon: '🏗',
    title: 'No active jobs',
    body: 'Start a scheduled job to move it here.',
  },
  job_won: {
    icon: '🏆',
    title: 'No completed jobs yet',
    body: 'Mark a job complete to see it here.',
    tip: 'Won jobs auto-request a review from the homeowner.',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name: string): string {
  const colors = [
    '#0F766E','#0D9488','#1E40AF','#155E75',
    '#047857','#92400E','#64748B','#475569',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

function timeAgo(dateStr: string): { label: string; isHot: boolean; isWarm: boolean; isStale: boolean } {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const isHot = mins < 30
  const isWarm = mins >= 30 && hours < 6
  const isStale = days >= 7
  let label = ''
  if (mins < 60) label = `${mins}m`
  else if (hours < 24) label = `${hours}h`
  else label = `${days}d`
  return { label, isHot, isWarm, isStale }
}

function formatAge(days: number): string {
  if (days < 1) return '< 1d'
  return `${days.toFixed(1)}d`
}

function formatAmount(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function sourceLabel(src: string | undefined): string {
  if (!src) return ''
  return src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function sourceIcon(src: string | undefined): string {
  if (!src) return ''
  const s = src.toLowerCase()
  if (s.includes('storm')) return '⛈ '
  if (s.includes('facebook') || s.includes('fb')) return '📘 '
  if (s.includes('phone') || s.includes('call')) return '📞 '
  if (s.includes('referral')) return '🤝 '
  if (s.includes('google')) return '🔍 '
  if (s.includes('door') || s.includes('knock')) return '🚪 '
  return ''
}

// ─── KPI Bar ──────────────────────────────────────────────────────────────────

function KPIBar({ leads, dk }: { leads: Lead[]; dk: boolean }) {
  const TERMINAL = ['job_won', 'lost']
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const activeLeads = leads.filter(l => !TERMINAL.includes(l.lead_status))
  const pipelineValue = activeLeads.reduce((s, l) => s + (l.quoted_amount || 0), 0)

  const wonThisMonth = leads.filter(l =>
    l.lead_status === 'job_won' && new Date(l.created_at) >= startOfMonth
  ).length

  const newThisMonth = leads.filter(l => new Date(l.created_at) >= startOfMonth).length

  const ageDays = activeLeads.map(l => (Date.now() - new Date(l.created_at).getTime()) / 86400000)
  const avgAge = ageDays.length ? ageDays.reduce((a, b) => a + b, 0) / ageDays.length : 0
  const ageIsStale = avgAge >= 7

  const card = dk ? '#1E293B' : '#FFFFFF'
  const border = dk ? '#334155' : '#EEE8E0'
  const textPrimary = dk ? '#F1F5F9' : '#0A1628'
  const textMuted = '#9CA3AF'

  const kpis = [
    {
      icon: '💰',
      label: 'Pipeline Value',
      value: pipelineValue > 0 ? `$${pipelineValue.toLocaleString()}` : '—',
      sub: `${activeLeads.length} active leads`,
      accent: '#0F766E',
    },
    {
      icon: '🏆',
      label: 'Won This Month',
      value: wonThisMonth > 0 ? wonThisMonth : '—',
      sub: 'jobs completed',
      accent: '#047857',
    },
    {
      icon: '📥',
      label: 'New This Month',
      value: newThisMonth > 0 ? newThisMonth : '—',
      sub: 'leads received',
      accent: '#0D9488',
    },
    {
      icon: '⏱',
      label: 'Avg Lead Age',
      value: activeLeads.length > 0 ? formatAge(avgAge) : '—',
      sub: 'active pipeline',
      accent: ageIsStale ? '#F59E0B' : '#64748B',
      warn: ageIsStale,
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      marginBottom: 20,
    }}>
      {kpis.map(k => (
        <div key={k.label} style={{
          background: card,
          border: `1px solid ${border}`,
          borderRadius: 10,
          padding: '14px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          borderTop: `3px solid ${k.accent}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>{k.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {k.label}
            </span>
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            color: k.warn ? '#F59E0B' : textPrimary,
            lineHeight: 1.1,
            marginBottom: 2,
          }}>
            {k.value}
          </div>
          <div style={{ fontSize: 11, color: textMuted }}>{k.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ stageKey, dk }: { stageKey: string; dk: boolean }) {
  const copy = EMPTY_STATE_COPY[stageKey] || {
    icon: '📭',
    title: 'Empty',
    body: 'No leads here yet.',
  }
  const textMuted = dk ? '#94A3B8' : '#9CA3AF'
  const tipBg = dk ? '#1E293B' : '#F8FAFC'
  const tipBorder = dk ? '#334155' : '#E2E8F0'

  return (
    <div style={{
      padding: '24px 12px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
    }}>
      <div style={{ fontSize: 24, marginBottom: 2 }}>{copy.icon}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: textMuted }}>{copy.title}</div>
      <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5, maxWidth: 160 }}>{copy.body}</div>
      {copy.tip && (
        <div style={{
          marginTop: 8,
          background: tipBg,
          border: `1px solid ${tipBorder}`,
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 10,
          color: textMuted,
          lineHeight: 1.5,
          maxWidth: 170,
          textAlign: 'left',
        }}>
          {copy.tip}
        </div>
      )}
    </div>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, stageKey, dk, onClick }: {
  lead: Lead
  stageKey: string
  dk: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const router = useRouter()
  const { label: ageLabel, isHot, isWarm, isStale } = timeAgo(lead.created_at)

  const cardBg = dk ? '#1E293B' : '#FFFFFF'
  const cardBorder = dk ? '#334155' : '#EEE8E0'
  const textPrimary = dk ? '#F1F5F9' : '#0A1628'
  const textMuted = dk ? '#94A3B8' : '#6B7280'

  // Urgency left-border: stale leads get amber, otherwise transparent
  const urgencyBorder = isStale ? '#F59E0B' : 'transparent'

  const displayName = lead.contact_name
    ? lead.contact_name.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : 'Unknown'

  const src = lead.lead_source
  const hasAddress = lead.property_address !== null && lead.property_address !== undefined && lead.property_address !== ''
  const hasAmount = lead.quoted_amount !== null && lead.quoted_amount !== undefined && lead.quoted_amount > 0
  const hasScheduled = lead.scheduled_date !== null && lead.scheduled_date !== undefined
  const isInsurance = stageKey === 'insurance_approved' || (lead as any).insurance_claim
  const ctaLabel = STAGE_CTAS[stageKey] || 'Next Step'
  const isWon = stageKey === 'job_won'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderLeft: `3px solid ${urgencyBorder !== 'transparent' ? urgencyBorder : cardBorder}`,
        borderRadius: 10,
        padding: '12px',
        cursor: 'pointer',
        boxShadow: hovered
          ? '0 4px 14px rgba(0,0,0,0.11)'
          : '0 1px 4px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow 150ms ease, transform 150ms ease',
        minHeight: 110,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Row 1: Avatar + Name + Age */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Avatar */}
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: avatarColor(displayName),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: '#FFFFFF',
          flexShrink: 0,
        }}>
          {getInitials(displayName)}
        </div>

        {/* Name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 120,
            }}>
              {displayName}
            </span>
            {isHot && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                borderRadius: 4,
                padding: '1px 5px',
                flexShrink: 0,
              }}>🔥 HOT</span>
            )}
            {isWarm && !isHot && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                background: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FDE68A',
                borderRadius: 4,
                padding: '1px 5px',
                flexShrink: 0,
              }}>WARM</span>
            )}
          </div>
          {/* Address */}
          {hasAddress && (
            <div style={{
              fontSize: 11,
              color: textMuted,
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 170,
            }}>
              {lead.property_address?.replace(', USA', '')}
            </div>
          )}
        </div>

        {/* Age — top right */}
        <span style={{
          fontSize: 10,
          color: isStale ? '#F59E0B' : '#9CA3AF',
          fontWeight: isStale ? 600 : 400,
          flexShrink: 0,
          marginTop: 1,
        }}>
          {isStale ? `⚠ ${ageLabel}` : ageLabel}
        </span>
      </div>

      {/* Row 2: Context chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {/* Lead source chip */}
        {src && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            background: '#F1F5F9',
            color: '#475569',
            borderRadius: 4,
            padding: '2px 6px',
          }}>
            {sourceIcon(src)}{sourceLabel(src)}
          </span>
        )}
        {/* Amount chip */}
        {hasAmount && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            background: '#D1FAE5',
            color: '#047857',
            borderRadius: 4,
            padding: '2px 6px',
          }}>
            {formatAmount(lead.quoted_amount!)}
          </span>
        )}
        {/* Scheduled date chip */}
        {hasScheduled && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            background: isToday(lead.scheduled_date!) ? '#ECFEFF' : '#F0FDFA',
            color: isToday(lead.scheduled_date!) ? '#155E75' : '#0F766E',
            borderRadius: 4,
            padding: '2px 6px',
          }}>
            📅 {isToday(lead.scheduled_date!) ? 'Today' : formatDate(lead.scheduled_date!)}
          </span>
        )}
        {/* Insurance claim chip — amber, roofing DNA */}
        {isInsurance && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            background: '#FEF3C7',
            color: '#92400E',
            border: '1px solid #FDE68A',
            borderRadius: 4,
            padding: '2px 6px',
          }}>
            🏛 Claim
          </span>
        )}
      </div>

      {/* Row 3: Actions — hierarchy: ghost Call | primary CTA | icon chevron */}
      {!isWon && (
        <div
          style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Call — ghost */}
          {lead.contact_phone && (
            <a
              href={`tel:${lead.contact_phone ?? ""}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: '#475569',
                background: 'transparent',
                border: '1px solid #CBD5E1',
                borderRadius: 6,
                padding: '4px 8px',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.07 1.17 2 2 0 012.06.07h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l.81-.81a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
              Call
            </a>
          )}

          {/* Stage CTA — primary teal fill */}
          <button
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 600,
              color: '#FFFFFF',
              background: '#0F766E',
              border: 'none',
              borderRadius: 6,
              padding: '5px 8px',
              cursor: 'pointer',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ctaLabel}
          </button>

          {/* Chevron — icon only, ghost */}
          <button
            onClick={() => router.push(`/dashboard/pipeline/${lead.id}`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              background: 'transparent',
              border: '1px solid #CBD5E1',
              borderRadius: 6,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      {/* Job Won state */}
      {isWon && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: '#D1FAE5',
          borderRadius: 6,
          padding: '5px 8px',
          marginTop: 'auto',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>✓ Job Won</span>
        </div>
      )}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  dk,
  onCardClick,
}: {
  stage: typeof ROOFING_STAGES[0]
  leads: Lead[]
  dk: boolean
  onCardClick: (id: string) => void
}) {
  const cardBg = dk ? '#0F172A' : '#FFFFFF'
  const colBg = dk ? '#1A2744' : '#FAFAFA'
  const colBorder = dk ? '#1E3A5F' : '#EEE8E0'
  const textPrimary = dk ? '#F1F5F9' : '#0A1628'
  const textMuted = '#9CA3AF'

  const totalValue = leads.reduce((s, l) => s + (l.quoted_amount || 0), 0)
  const avgAgeDays = leads.length
    ? leads.reduce((s, l) => s + (Date.now() - new Date(l.created_at).getTime()) / 86400000, 0) / leads.length
    : 0

  return (
    <div style={{
      width: 220,
      minWidth: 220,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: colBg,
      border: `1px solid ${colBorder}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Top accent bar — 3px stage color */}
      <div style={{ height: 3, background: stage.topBar, flexShrink: 0 }} />

      {/* Column header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${colBorder}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          {/* Stage name + count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
              {stage.label}
            </span>
            <span style={{
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: leads.length > 0 ? stage.topBar : (dk ? '#334155' : '#E2E8F0'),
              color: leads.length > 0 ? '#FFFFFF' : textMuted,
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 5px',
            }}>
              {leads.length}
            </span>
          </div>
          {/* Column total value */}
          {totalValue > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#047857' }}>
              {formatAmount(totalValue)}
            </span>
          )}
        </div>
        {/* Sub-line: lead count + avg age */}
        <div style={{ fontSize: 10, color: textMuted }}>
          {leads.length === 1 ? '1 lead' : `${leads.length} leads`}
          {leads.length > 0 && ` · avg ${formatAge(avgAgeDays)}`}
        </div>
      </div>

      {/* Cards area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 120,
      }}>
        {leads.length === 0 ? (
          <EmptyState stageKey={stage.key} dk={dk} />
        ) : (
          leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              stageKey={stage.key}
              dk={dk}
              onClick={() => onCardClick(lead.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Named export consumed by pipeline/[id]/page.tsx and roofing/property/[id]/page.tsx ──
export function getPipelineStages(_tradeSlug?: string | null) {
  return [
    ...ROOFING_STAGES.map(s => ({ ...s, terminal: false })),
    { key: 'lost',        label: 'Lost',        subLabel: 'Not proceeding', color: '#6B7280', bg: '#F3F4F6', topBar: '#6B7280', terminal: true },
    { key: 'unqualified', label: 'Unqualified', subLabel: 'Not a fit',      color: '#6B7280', bg: '#F3F4F6', topBar: '#6B7280', terminal: true },
  ]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadPipeline({ leads, darkMode = false, dk: dkProp, onAddLead, onStatusChange, onUpdate, isPaid, tradeSlug }: LeadPipelineProps) {
  const router = useRouter()
  const boardRef = useRef<HTMLDivElement>(null)
  const dk = dkProp !== undefined ? dkProp : darkMode

  const pageBg = dk ? '#0B1120' : '#F5F4F0'
  const textPrimary = dk ? '#F1F5F9' : '#0A1628'
  const textMuted = '#9CA3AF'
  const headerBg = dk ? '#0F172A' : '#FFFFFF'
  const headerBorder = dk ? '#1E293B' : '#EEE8E0'

  // Group leads by stage
  const leadsByStage: Record<string, Lead[]> = {}
  ROOFING_STAGES.forEach(s => { leadsByStage[s.key] = [] })
  leads.forEach(lead => {
    const key = lead.lead_status as string
    if (leadsByStage[key]) {
      leadsByStage[key].push(lead)
    } else {
      // Map legacy/generic stage names to roofing stages
      const legacyMap: Record<string, string> = {
        'new':       'lead_in',
        'New':       'lead_in',
        'Contacted': 'inspection_scheduled',
        'Quoted':    'proposal_sent',
        'Scheduled': 'scheduled',
        'Completed': 'in_progress',
        'Paid':      'job_won',
      }
      const mapped = legacyMap[key]
      if (mapped && leadsByStage[mapped]) leadsByStage[mapped].push(lead)
    }
  })

  const handleCardClick = (id: string) => {
    router.push(`/dashboard/pipeline/${id}`)
  }

  return (
    <div style={{ background: pageBg, minHeight: '100vh', padding: '0 0 40px' }}>
      {/* Page header */}
      <div style={{
        background: headerBg,
        borderBottom: `1px solid ${headerBorder}`,
        padding: '16px 24px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: textPrimary, margin: 0 }}>Jobs</h1>
            <span style={{ fontSize: 13, color: textMuted }}>
              {leads.filter(l => !['job_won', 'lost'].includes(l.lead_status)).length} active
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Board / List toggle */}
          <div style={{
            display: 'flex',
            background: dk ? '#1E293B' : '#F1F5F9',
            borderRadius: 8,
            padding: 3,
            gap: 2,
          }}>
            {['Board', 'List'].map(v => (
              <button key={v} style={{
                fontSize: 12,
                fontWeight: 600,
                color: v === 'Board' ? '#0F766E' : textMuted,
                background: v === 'Board' ? (dk ? '#0F172A' : '#FFFFFF') : 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: '4px 12px',
                cursor: 'pointer',
                boxShadow: v === 'Board' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>{v}</button>
            ))}
          </div>
          <button
            onClick={onAddLead}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#FFFFFF',
              background: '#0F766E',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Lead
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <div style={{ padding: '16px 24px 0' }}>
        <KPIBar leads={leads} dk={dk} />
      </div>

      {/* Board — horizontally scrollable */}
      <div style={{ padding: '0 24px' }}>
        {/* Scroll hint gradient on right edge */}
        <div style={{ position: 'relative' }}>
          <div
            ref={boardRef}
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              paddingBottom: 12,
              scrollbarWidth: 'thin',
              scrollbarColor: '#E2E8F0 transparent',
              // Min height so board doesn't collapse
              minHeight: 'calc(100vh - 280px)',
              alignItems: 'flex-start',
            }}
          >
            {ROOFING_STAGES.map(stage => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                leads={leadsByStage[stage.key] || []}
                dk={dk}
                onCardClick={handleCardClick}
              />
            ))}
          </div>

          {/* Right-edge fade to hint at scroll */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 40,
            height: '100%',
            background: `linear-gradient(to right, transparent, ${pageBg})`,
            pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  )
}
