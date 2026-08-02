'use client'
// Equipment Digital Twin — full history of one HVAC unit.
// Assembles: equipment record, refrigerant events, service calls,
// maintenance history and measurements into a single timeline.

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import { capName, timeAgo } from '@/lib/utils'
import { apiFetch } from '@/lib/api-fetch'

const EQUIP_LABELS: Record<string, string> = {
  AC_Unit: 'AC Unit', Furnace: 'Furnace', Heat_Pump: 'Heat Pump',
  Air_Handler: 'Air Handler', Mini_Split: 'Mini-Split', Boiler: 'Boiler', Other: 'Other',
}
const EQUIP_ICONS: Record<string, string> = {
  AC_Unit: '❄️', Furnace: '🔥', Heat_Pump: '♻️',
  Air_Handler: '💨', Mini_Split: '🌡️', Boiler: '⚙️', Other: '🔧',
}
const EVENT_ICONS: Record<string, string> = {
  install: '🏗️', refrigerant: '🧪', service: '🔧', maintenance: '🗓️',
  measurement: '📊',
}
const EVENT_COLORS: Record<string, string> = {
  install: '#6366F1', refrigerant: '#0284C7', service: '#0F766E',
  maintenance: '#D97706', measurement: '#7C3AED',
}

type TimelineEvent = {
  id: string; type: string; date: string; title: string; subtitle: string;
  meta: Record<string, any>
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function EquipmentDetailInner() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { session } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }
  const t = theme(dk)

  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    if (!session?.id || !id) return
    apiFetch(`/api/hvac/equipment/${id}/timeline?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErr(d.error); return }
        setData(d)
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [session?.id, id])

  const card: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
    borderRadius: 14, padding: 16, marginBottom: 12,
  }

  if (!data && loading) return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ color: t.textMuted }}>Loading equipment record…</div>
      </div>
    </DashboardShell>
  )

  if (err || !data || !data.equipment) return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.textPri, marginBottom: 8 }}>
          Could not load equipment record
        </div>
        <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>
          {err || 'Equipment not found'}
        </div>
        <button onClick={() => window.location.reload()}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#0F766E', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    </DashboardShell>
  )

  const eq  = data.equipment
  const tl  = (data.timeline ?? []) as TimelineEvent[]
  const lm  = data.latest_measurement
  const rs  = data.refrigerant_stats

  const typeLabel = EQUIP_LABELS[eq.equipment_type] ?? eq.equipment_type ?? '—'
  const icon      = EQUIP_ICONS[eq.equipment_type] ?? '🔧'
  const age       = eq.install_date
    ? Math.floor((Date.now() - new Date(eq.install_date).getTime()) / (365.25 * 864e5))
    : null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 60px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          {/* Back */}
          <button onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: 600, color: t.textMuted }}>
            ← Back
          </button>

          {/* Header — equipment identity */}
          <div style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0,
              background: dk ? 'rgba(14,165,233,0.12)' : '#E0F2FE',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.textPri }}>
                {[eq.brand, eq.model_number].filter(Boolean).join(' ') || typeLabel}
              </div>
              <div style={{ fontSize: 13.5, color: t.textMuted, marginTop: 2 }}>
                {typeLabel}
                {eq.serial_number ? ` · SN: ${eq.serial_number}` : ''}
                {eq.refrigerant_type ? ` · ${eq.refrigerant_type}` : ''}
              </div>
              {eq.install_date && (
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4 }}>
                  Installed {fmtDate(eq.install_date)}{age !== null ? ` (${age} yr${age !== 1 ? 's' : ''} ago)` : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                const qs = new URLSearchParams({ brand: eq.brand || '', model: eq.model_number || '', tab: 'manuals' })
                router.push(`/dashboard/hvac/reference?${qs}`)
              }}
              style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 8,
                background: 'transparent', border: `1px solid ${t.cardBorder}`,
                cursor: 'pointer', color: '#0F766E', flexShrink: 0 }}>
              📖 Manual
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Service calls', value: tl.filter(e => e.type === 'service').length },
              { label: 'Refrig. events', value: rs.leak_events > 0 ? `${tl.filter(e => e.type === 'refrigerant').length} (${rs.leak_events} leak)` : tl.filter(e => e.type === 'refrigerant').length },
              { label: 'Lbs added', value: rs.total_added_lbs > 0 ? `${rs.total_added_lbs.toFixed(1)} lbs` : '—' },
              { label: 'Age (yrs)', value: age ?? '—' },
            ].map(s => (
              <div key={s.label} style={{ ...card, marginBottom: 0, padding: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: t.textMuted }}>{s.label.toUpperCase()}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: t.textPri, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Latest measurements */}
          {lm && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: t.textMuted, marginBottom: 10 }}>
                LAST MEASUREMENTS — {fmtDate(lm.measured_at)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[
                  { label: 'Superheat', value: lm.superheat_actual != null ? `${lm.superheat_actual}°F` : null },
                  { label: 'Subcooling', value: lm.subcool_actual != null ? `${lm.subcool_actual}°F` : null },
                  { label: 'Suction', value: lm.suction_pressure != null ? `${lm.suction_pressure} psig` : null },
                  { label: 'Liquid', value: lm.liquid_pressure != null ? `${lm.liquid_pressure} psig` : null },
                  { label: 'Delta-T', value: lm.delta_t != null ? `${lm.delta_t}°F` : null },
                  { label: 'Static', value: lm.static_pressure != null ? `${lm.static_pressure}" WC` : null },
                ].filter(x => x.value).map(x => (
                  <div key={x.label} style={{ padding: '7px 12px', borderRadius: 8,
                    background: dk ? 'rgba(15,118,110,0.12)' : '#F0FDFA',
                    border: '1px solid rgba(15,118,110,0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0F766E' }}>{x.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0F766E' }}>{x.value}</div>
                  </div>
                ))}
              </div>
              {lm.diagnosis && (
                <div style={{ marginTop: 10, fontSize: 13, color: t.textMuted, borderTop: `1px solid ${t.divider}`, paddingTop: 10 }}>
                  {lm.diagnosis}
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: t.textMuted, marginBottom: 10 }}>
            SERVICE HISTORY ({tl.length} events)
          </div>
          {tl.length === 0 && (
            <div style={{ ...card, color: t.textMuted, fontSize: 14, textAlign: 'center', padding: 40 }}>
              No service history yet — events appear here after refrigerant work, service calls and measurements.
            </div>
          )}
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 19, top: 8, bottom: 8,
              width: 2, background: t.divider, zIndex: 0 }} />
            {tl.map((ev, i) => {
              const color = EVENT_COLORS[ev.type] ?? '#64748B'
              const isLead = ev.type === 'service' && ev.meta?.lead_id
              return (
                <div key={ev.id}
                  onClick={() => isLead && router.push(`/dashboard/pipeline/${ev.meta.lead_id}`)}
                  style={{ display: 'flex', gap: 16, marginBottom: 14, position: 'relative', zIndex: 1, cursor: isLead ? 'pointer' : 'default' }}>
                  {/* Dot */}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: `${color}18`, border: `2px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {EVENT_ICONS[ev.type] ?? '●'}
                  </div>
                  {ev.subtitle && (
                    <div style={{ fontSize: 12.5, color: t.textMuted }}>{ev.subtitle}</div>
                  )}
                  {ev.type === 'service' && ev.meta?.quoted_amount && (
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: '#0F766E' }}>
                      ${Number(ev.meta.quoted_amount).toLocaleString()}
                    </div>
                  )}
                  {ev.type === 'refrigerant' && ev.meta?.notes && (
                    <div style={{ marginTop: 4, fontSize: 12, color: t.textMuted }}>{ev.meta.notes}</div>
                  )}
                  {isLead && (
                    <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#0F766E' }}>View job →</div>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </DashboardShell>
  )
}

export default function EquipmentDetailPage() {
  return (
    <Suspense fallback={null}>
      <EquipmentDetailInner />
    </Suspense>
  )
}
