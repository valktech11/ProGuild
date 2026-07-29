'use client'
// app/dashboard/hvac/equipment/page.tsx
// Cross-client equipment records list for HVAC pros.
// Pulls all hvac_equipment rows for the pro, groups by type,
// highlights overdue / due-soon service.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import { capName } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'

const EQUIPMENT_LABELS: Record<string, string> = {
  AC_Unit: 'AC Unit', Furnace: 'Furnace', Heat_Pump: 'Heat Pump',
  Air_Handler: 'Air Handler', Mini_Split: 'Mini-Split', Boiler: 'Boiler', Other: 'Other',
}
const EQUIP_ICONS: Record<string, string> = {
  AC_Unit: '❄️', Furnace: '🔥', Heat_Pump: '♻️',
  Air_Handler: '💨', Mini_Split: '🌡️', Boiler: '⚙️', Other: '🔧',
}
const FILTER_OPTIONS = ['All', 'AC_Unit', 'Heat_Pump', 'Furnace', 'Mini_Split', 'Air_Handler', 'Boiler', 'Other']

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function EquipmentRecordsPage() {
  const router = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }

  const [equipment, setEquipment] = useState<any[]>([])
  const [clients,   setClients]   = useState<Record<string, any>>({})
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('All')
  const [search,    setSearch]    = useState('')

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    Promise.all([
      apiFetch(`/api/hvac/equipment?pro_id=${session.id}`).then(r => r.json()),
      apiFetch(`/api/clients?pro_id=${session.id}`).then(r => r.json()),
    ]).then(([eqData, clientData]) => {
      setEquipment(eqData.equipment || [])
      const map: Record<string, any> = {}
      for (const c of (clientData.clients || [])) map[c.id] = c
      setClients(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, router, _authLoading])

  const t = theme(dk)

  const filtered = equipment.filter(eq => {
    if (filter !== 'All' && eq.equipment_type !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const client = clients[eq.client_id]
      return (
        (eq.brand || '').toLowerCase().includes(q) ||
        (eq.model_number || '').toLowerCase().includes(q) ||
        (eq.serial_number || '').toLowerCase().includes(q) ||
        (client?.full_name || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const overdueCount  = equipment.filter(eq => { const d = daysUntil(eq.next_service_date); return d !== null && d < 0 }).length
  const dueSoonCount  = equipment.filter(eq => { const d = daysUntil(eq.next_service_date); return d !== null && d >= 0 && d <= 30 }).length

  if (!session || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.pageBg }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #0EA5E9', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 40px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 13 }}>
            <Link href="/dashboard" style={{ color: t.textMuted, textDecoration: 'none' }}>Dashboard</Link>
            <span style={{ color: t.textSubtle }}>/</span>
            <span style={{ fontWeight: 600, color: t.textPri }}>Equipment Records</span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.textPri, margin: 0, letterSpacing: '-0.025em' }}>
              ❄️ Equipment Records
            </h1>
            <p style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
              {equipment.length} unit{equipment.length !== 1 ? 's' : ''} across all clients
              {overdueCount > 0 && <span style={{ marginLeft: 10, fontWeight: 700, color: '#DC2626' }}>· {overdueCount} overdue</span>}
              {dueSoonCount > 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: '#B45309' }}>· {dueSoonCount} due soon</span>}
            </p>
          </div>

          {/* Search + filter bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search brand, model, serial, client…"
              style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13, outline: 'none' }}
            />
          </div>

          {/* Type filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {FILTER_OPTIONS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: `1.5px solid ${filter === f ? '#0EA5E9' : t.inputBorder}`,
                background: filter === f ? '#0EA5E9' : 'transparent',
                color: filter === f ? 'white' : t.textMuted,
                transition: 'all 150ms',
              }}>
                {f === 'All' ? `All (${equipment.length})` : `${EQUIP_ICONS[f]} ${EQUIPMENT_LABELS[f]}`}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri, marginBottom: 6 }}>
                  {equipment.length === 0 ? 'No equipment on record yet' : 'No results for that filter'}
                </div>
                <p style={{ fontSize: 13, color: t.textMuted, maxWidth: 280, margin: '0 auto' }}>
                  {equipment.length === 0
                    ? 'Add equipment from a client record after completing a job.'
                    : 'Try clearing the search or changing the type filter.'}
                </p>
              </div>
            ) : filtered.map((eq: any, i: number) => {
              const client = clients[eq.client_id]
              const days   = daysUntil(eq.next_service_date)
              const overdue   = days !== null && days < 0
              const dueSoon   = days !== null && days >= 0 && days <= 30
              const reminders = eq.hvac_maintenance_reminders || []
              const pendingReminders = reminders.filter((r: any) => r.status === 'Pending')

              return (
                <div key={eq.id} style={{
                  borderTop: i > 0 ? `1px solid ${t.divider}` : 'none',
                  padding: '16px 20px',
                  cursor: client ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                  onClick={() => client && router.push(`/dashboard/clients/${eq.client_id}`)}
                  onMouseEnter={e => { if (client) e.currentTarget.style.background = t.tableRowHover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Icon */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: dk ? 'rgba(14,165,233,0.12)' : '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {EQUIP_ICONS[eq.equipment_type] || '🔧'}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>
                          {EQUIPMENT_LABELS[eq.equipment_type] || eq.equipment_type}
                          {eq.brand ? ` · ${eq.brand}` : ''}
                        </span>
                        {overdue && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#DC2626' }}>
                            ⚠ Overdue
                          </span>
                        )}
                        {dueSoon && !overdue && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: '#B45309' }}>
                            Due in {days}d
                          </span>
                        )}
                        {pendingReminders.length > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: dk ? 'rgba(14,165,233,0.12)' : '#E0F2FE', color: '#0284C7' }}>
                            🔔 {pendingReminders.length} reminder{pendingReminders.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Client name */}
                      {client && (
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0EA5E9', marginBottom: 4 }}>
                          {capName(client.full_name)}
                        </div>
                      )}

                      {/* Specs — labeled chips, scannable */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        {[
                          eq.model_number     && { l: 'Model', v: eq.model_number },
                          eq.serial_number    && { l: 'S/N',   v: eq.serial_number },
                          eq.refrigerant_type && { l: 'Ref',   v: eq.refrigerant_type },
                          eq.filter_size      && { l: 'Filter',v: eq.filter_size },
                        ].filter(Boolean).map((s: any) => (
                          <span key={s.l} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: 12, padding: '2px 8px', borderRadius: 6, background: dk ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: `1px solid ${t.divider}` }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: t.textSubtle }}>{s.l}</span>
                            <span style={{ fontWeight: 600, color: t.textMuted }}>{s.v}</span>
                          </span>
                        ))}
                      </div>

                      {/* Service dates line */}
                      {(eq.installation_date || eq.next_service_date) && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
                          {eq.installation_date && (
                            <span style={{ fontSize: 12, color: t.textSubtle }}>
                              Installed {new Date(eq.installation_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                            </span>
                          )}
                          {eq.next_service_date && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? '#DC2626' : dueSoon ? '#B45309' : '#0F766E' }}>
                              Next service {new Date(eq.next_service_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Chevron */}
                    {client && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 4 }}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer tip */}
          {equipment.length > 0 && (
            <p style={{ fontSize: 12, color: t.textSubtle, textAlign: 'center', marginTop: 16 }}>
              Tap a unit to open the client record · Equipment is added from the client's Equipment tab
            </p>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
