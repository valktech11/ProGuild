'use client'
// lib/trades/hvac/components/OverviewWidget.tsx
// HVAC-specific dashboard overview sections rendered in the OverviewWidget slot.
//
// Sections:
//   1. Today's Service Calls — leads in active stages due today
//   2. Upcoming Maintenance — next 5 pending reminders sorted by due date
//   3. Quick stats strip — open calls, equipment on record, this month revenue

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { theme } from '@/lib/theme'
import { apiFetch } from '@/lib/api-fetch'
import type { OverviewWidgetProps } from '@/lib/trades/_registry/types'

const BLUE = '#0EA5E9'
const BLUE_DARK = '#0369A1'

const EQUIP_ICONS: Record<string, string> = {
  AC_Unit: '❄️', Furnace: '🔥', Heat_Pump: '♻️',
  Air_Handler: '💨', Mini_Split: '🌡️', Boiler: '⚙️', Other: '🔧',
}
const EQUIP_LABELS: Record<string, string> = {
  AC_Unit: 'AC Unit', Furnace: 'Furnace', Heat_Pump: 'Heat Pump',
  Air_Handler: 'Air Handler', Mini_Split: 'Mini-Split', Boiler: 'Boiler', Other: 'Other',
}
const ISSUE_LABELS: Record<string, string> = {
  repair: 'Repair', maintenance: 'Maintenance', replacement: 'Replacement', new_install: 'New Install',
}
const STAGE_LABELS: Record<string, string> = {
  new_call: 'New Call', diagnosed: 'Diagnosed', quoted: 'Quoted',
  parts_ordered: 'Parts Ordered', scheduled: 'Scheduled', in_progress: 'In Progress', job_won: 'Complete',
}
const STAGE_COLOR: Record<string, string> = {
  new_call: '#6B7280', diagnosed: '#0284C7', quoted: '#7C3AED',
  parts_ordered: '#EA580C', scheduled: '#2563EB', in_progress: '#D97706', job_won: '#15803D',
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n.toLocaleString()}`
}

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate)
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

const ACTIVE_STAGES = new Set(['scheduled', 'in_progress', 'diagnosed', 'parts_ordered'])

export default function HVACOverviewWidget({ leads, session, dk }: OverviewWidgetProps) {
  const router = useRouter()
  const [reminders,  setReminders]  = useState<any[]>([])
  const [equipment,  setEquipment]  = useState<any[]>([])
  const [loadingR,   setLoadingR]   = useState(true)

  useEffect(() => {
    if (!session?.id) return
    Promise.all([
      apiFetch(`/api/hvac/maintenance-reminders?pro_id=${session.id}`).then(r => r.json()),
      apiFetch(`/api/hvac/equipment?pro_id=${session.id}`).then(r => r.json()),
    ]).then(([rd, ed]) => {
      setReminders((rd.reminders || []).slice(0, 5))
      setEquipment(ed.equipment || [])
      setLoadingR(false)
    }).catch(() => setLoadingR(false))
  }, [session?.id])

  const t = theme(dk)

  // Today's active service calls — leads in scheduled/in_progress with created_at today
  // or any lead with follow_up_date today. Fallback: leads in active stages, most recent 5.
  const todayLeads = leads
    .filter(l => ACTIVE_STAGES.has(l.lead_status))
    .slice(0, 5)

  // Stats
  const openCalls  = leads.filter(l => !['job_won', 'lost'].includes(l.lead_status)).length
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const monthRevenue = leads
    .filter(l => l.lead_status === 'job_won' && new Date(l.updated_at || l.created_at) >= monthStart)
    .reduce((s: number, l: any) => s + (l.quoted_amount || 0), 0)

  const overdueReminders = reminders.filter(r => daysUntil(r.due_date) < 0).length

  const cardStyle: React.CSSProperties = {
    background: t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  }
  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: `1px solid ${t.divider}`,
  }
  const headingStyle: React.CSSProperties = {
    fontSize: 15, fontWeight: 800, color: t.textPri, letterSpacing: '-0.02em',
    display: 'flex', alignItems: 'center', gap: 8,
  }
  const linkStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: BLUE, textDecoration: 'none',
  }
  const emptyStyle: React.CSSProperties = {
    padding: '28px 20px', textAlign: 'center', color: t.textMuted, fontSize: 13,
  }

  return (
    <>
      {/* ── Quick stats strip ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Open calls', value: openCalls, accent: BLUE },
          { label: 'Equipment', value: equipment.length, accent: '#0F766E' },
          { label: 'This month', value: monthRevenue > 0 ? fmtMoney(monthRevenue) : '—', accent: '#15803D' },
        ].map(s => (
          <div key={s.label} style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.accent, letterSpacing: '-0.025em' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Today's Service Calls ──────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span style={headingStyle}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: dk ? 'rgba(14,165,233,0.15)' : '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>🔧</span>
            Active Jobs
          </span>
          <Link href="/dashboard/pipeline" style={linkStyle}>View all →</Link>
        </div>

        {todayLeads.length === 0 ? (
          <div style={emptyStyle}>
            No active service calls. <Link href="/dashboard/pipeline" style={{ color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Add a call →</Link>
          </div>
        ) : todayLeads.map((lead: any, i: number) => (
          <div key={lead.id}
            onClick={() => router.push(`/dashboard/pipeline/${lead.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = t.tableRowHover}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STAGE_COLOR[lead.lead_status] || BLUE, flexShrink: 0 }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lead.contact_name}
              </div>
              {lead.property_address && (
                <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lead.property_address}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: (STAGE_COLOR[lead.lead_status] || BLUE) + '18', color: STAGE_COLOR[lead.lead_status] || BLUE }}>
                {STAGE_LABELS[lead.lead_status] || lead.lead_status}
              </span>
              {lead.quoted_amount > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{fmtMoney(lead.quoted_amount)}</span>
              )}
            </div>

            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        ))}
      </div>

      {/* ── Upcoming Maintenance ───────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span style={headingStyle}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: dk ? 'rgba(14,165,233,0.15)' : '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>🔔</span>
            Upcoming Maintenance
            {overdueReminders > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#DC2626' }}>
                {overdueReminders} overdue
              </span>
            )}
          </span>
          <Link href="/dashboard/hvac/maintenance" style={linkStyle}>View all →</Link>
        </div>

        {loadingR ? (
          <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${BLUE}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : reminders.length === 0 ? (
          <div style={emptyStyle}>
            No pending reminders. Set a next service date on equipment to auto-schedule.
          </div>
        ) : reminders.map((r: any, i: number) => {
          const eq     = r.hvac_equipment
          const client = r.clients
          const days   = daysUntil(r.due_date)
          const overdue   = days < 0
          const dueSoon   = days >= 0 && days <= 7

          return (
            <div key={r.id}
              onClick={() => router.push('/dashboard/hvac/maintenance')}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = t.tableRowHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

              <div style={{ fontSize: 20, flexShrink: 0 }}>
                {eq ? (EQUIP_ICONS[eq.equipment_type] || '🔧') : '🔔'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>
                  {client?.full_name || 'Customer'}
                </div>
                <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 1 }}>
                  {eq ? (EQUIP_LABELS[eq.equipment_type] || eq.equipment_type) + (eq.brand ? ` · ${eq.brand}` : '') : 'Service reminder'}
                </div>
              </div>

              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                background: overdue ? '#FEE2E2' : dueSoon ? '#FEF3C7' : (dk ? 'rgba(14,165,233,0.12)' : '#E0F2FE'),
                color:      overdue ? '#DC2626' : dueSoon ? '#B45309' : '#0284C7',
              }}>
                {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
              </span>

              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          )
        })}
      </div>
    </>
  )
}
