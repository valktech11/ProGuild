'use client'
// app/dashboard/hvac/maintenance/page.tsx
// Upcoming maintenance reminders for HVAC pros.
// Sorted by due date ascending. One-tap creates a pre-filled lead.
// Pulls from /api/hvac/maintenance-reminders (returns pending, joined with equipment + client).

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import { capName } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'

const EQUIP_ICONS: Record<string, string> = {
  AC_Unit: '❄️', Furnace: '🔥', Heat_Pump: '♻️',
  Air_Handler: '💨', Mini_Split: '🌡️', Boiler: '⚙️', Other: '🔧',
}
const EQUIP_LABELS: Record<string, string> = {
  AC_Unit: 'AC Unit', Furnace: 'Furnace', Heat_Pump: 'Heat Pump',
  Air_Handler: 'Air Handler', Mini_Split: 'Mini-Split', Boiler: 'Boiler', Other: 'Other',
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function dueBadge(days: number) {
  if (days < 0)  return { label: `${Math.abs(days)}d overdue`, bg: '#FEE2E2', color: '#DC2626' }
  if (days === 0) return { label: 'Due today',               bg: '#FEF3C7', color: '#B45309' }
  if (days <= 7)  return { label: `Due in ${days}d`,         bg: '#FEF3C7', color: '#B45309' }
  if (days <= 30) return { label: `Due in ${days}d`,         bg: '#E0F2FE', color: '#0284C7' }
  return { label: `Due in ${days}d`, bg: '#F3F4F6', color: '#6B7280' }
}

export default function MaintenancePlansPage() {
  const router = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }

  const [reminders,    setReminders]    = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [scheduling,   setScheduling]   = useState<string | null>(null)
  const [dismissing,   setDismissing]   = useState<string | null>(null)
  const [successId,    setSuccessId]    = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const r = await apiFetch(`/api/hvac/maintenance-reminders?pro_id=${session.id}`)
      const d = await r.json()
      setReminders(d.reminders || [])
    } catch {}
    setLoading(false)
  }, [session])

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    load()
  }, [session, router, _authLoading, load])

  // One-tap: create a pre-filled lead for this maintenance call, mark reminder scheduled
  async function scheduleNow(reminder: any) {
    if (!session) return
    setScheduling(reminder.id)
    const eq     = reminder.hvac_equipment
    const client = reminder.clients
    const scope  = [
      `Annual maintenance —`,
      eq ? `${EQUIP_LABELS[eq.equipment_type] || eq.equipment_type}` : '',
      eq?.brand ? `(${eq.brand}` + (eq.model_number ? ` ${eq.model_number})` : ')') : '',
    ].filter(Boolean).join(' ')

    try {
      const r = await apiFetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          contact_name:  client?.full_name  || 'Maintenance Customer',
          contact_phone: client?.phone      || null,
          contact_email: client?.email      || null,
          message:       scope,
          lead_source:   'Phone_Call',
          is_manual:     true,
          issue_type:    'maintenance',
          system_type:   eq?.equipment_type === 'Furnace' ? 'furnace'
                       : eq?.equipment_type === 'Heat_Pump' ? 'heat_pump'
                       : eq?.equipment_type === 'Mini_Split' ? 'mini_split'
                       : 'split_ac',
        }),
      })
      const leadData = await r.json()
      if (r.ok && leadData.lead?.id) {
        // Mark reminder as scheduled
        await apiFetch('/api/hvac/maintenance-reminders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pro_id: session.id, id: reminder.id, status: 'Scheduled', scheduled_lead_id: leadData.lead.id }),
        })
        setSuccessId(reminder.id)
        setTimeout(() => {
          setSuccessId(null)
          load()
        }, 1800)
      }
    } catch {}
    setScheduling(null)
  }

  async function dismiss(reminder: any) {
    if (!session) return
    setDismissing(reminder.id)
    await apiFetch('/api/hvac/maintenance-reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, id: reminder.id, status: 'Dismissed' }),
    })
    setDismissing(null)
    load()
  }

  const t = theme(dk)
  const overdueCount = reminders.filter(r => daysUntil(r.due_date) < 0).length

  if (!session || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.pageBg }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #0EA5E9', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 40px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 13 }}>
            <Link href="/dashboard" style={{ color: t.textMuted, textDecoration: 'none' }}>Dashboard</Link>
            <span style={{ color: t.textSubtle }}>/</span>
            <span style={{ fontWeight: 600, color: t.textPri }}>Maintenance Plans</span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.textPri, margin: 0, letterSpacing: '-0.025em' }}>
              🔔 Maintenance Plans
            </h1>
            <p style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
              {reminders.length} pending reminder{reminders.length !== 1 ? 's' : ''}
              {overdueCount > 0 && (
                <span style={{ marginLeft: 10, fontWeight: 700, color: '#DC2626' }}>· {overdueCount} overdue</span>
              )}
            </p>
          </div>

          {/* Info tip */}
          <div style={{ padding: '12px 16px', borderRadius: 12, background: dk ? 'rgba(14,165,233,0.08)' : '#E0F2FE', border: `1px solid ${dk ? 'rgba(14,165,233,0.2)' : '#BAE6FD'}`, fontSize: 12, color: '#0284C7', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Reminders are auto-created when you set a next service date on equipment. Tap <strong>Schedule</strong> to create a pre-filled job instantly.
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reminders.length === 0 ? (
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 6 }}>No pending reminders</div>
                <p style={{ fontSize: 13, color: t.textMuted, maxWidth: 300, margin: '0 auto' }}>
                  Set a next service date on any equipment record and a reminder will appear here automatically.
                </p>
                <Link href="/dashboard/hvac/equipment" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 10, background: '#0EA5E9', color: 'white', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  View Equipment Records
                </Link>
              </div>
            ) : reminders.map((reminder: any) => {
              const eq     = reminder.hvac_equipment
              const client = reminder.clients
              const days   = daysUntil(reminder.due_date)
              const badge  = dueBadge(days)
              const isScheduling = scheduling === reminder.id
              const isDismissing = dismissing === reminder.id
              const isSuccess    = successId  === reminder.id

              return (
                <div key={reminder.id} style={{
                  background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14,
                  padding: '16px 18px',
                  opacity: isDismissing ? 0.5 : 1,
                  transition: 'opacity 200ms',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Icon */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: dk ? 'rgba(14,165,233,0.12)' : '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {eq ? (EQUIP_ICONS[eq.equipment_type] || '🔧') : '🔔'}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>
                          {eq ? (EQUIP_LABELS[eq.equipment_type] || eq.equipment_type) : 'Service Reminder'}
                          {eq?.brand ? ` · ${eq.brand}` : ''}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>

                      {client && (
                        <button
                          onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                          style={{ fontSize: 13, fontWeight: 600, color: '#0EA5E9', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 4 }}>
                          {capName(client.full_name)}
                          {client.phone && <span style={{ fontWeight: 400, color: t.textMuted, marginLeft: 8 }}>{client.phone}</span>}
                        </button>
                      )}

                      {eq && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {eq.model_number && <span style={{ fontSize: 12, color: t.textSubtle }}>Model: {eq.model_number}</span>}
                          {eq.filter_size  && <span style={{ fontSize: 12, color: t.textSubtle }}>Filter: {eq.filter_size}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    {isSuccess ? (
                      <div style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#ECFDF5', color: '#15803D', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                        ✓ Lead created
                      </div>
                    ) : (
                      <button onClick={() => scheduleNow(reminder)} disabled={isScheduling} style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
                        background: isScheduling ? '#94A3B8' : 'linear-gradient(135deg,#0EA5E9,#0369A1)',
                        color: 'white', fontSize: 13, fontWeight: 700, cursor: isScheduling ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        {isScheduling ? 'Creating…' : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                            Schedule Job
                          </>
                        )}
                      </button>
                    )}
                    <button onClick={() => router.push(`/dashboard/clients/${client?.id}`)} style={{
                      padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`,
                      background: 'transparent', color: t.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                      View Client
                    </button>
                    <button onClick={() => dismiss(reminder)} disabled={isDismissing} style={{
                      padding: '10px 12px', borderRadius: 10, border: `1.5px solid #FEE2E2`,
                      background: 'transparent', color: '#DC2626', fontSize: 12, fontWeight: 600,
                      cursor: isDismissing ? 'not-allowed' : 'pointer', opacity: isDismissing ? 0.5 : 1,
                    }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
