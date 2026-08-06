'use client'
// app/hvac/equipment/[id]/page.tsx
// Public homeowner-facing Equipment Digital Twin.
// No auth required — read-only. Linked via QR code on the physical unit
// or via a URL the contractor texts to the homeowner.
// Shows: equipment identity, service timeline, last measurements, contractor branding.

import { useState, useEffect, Suspense } from 'react'
import { useParams } from 'next/navigation'

const EQUIP_LABELS: Record<string, string> = {
  AC_Unit: 'AC Unit', Furnace: 'Furnace', Heat_Pump: 'Heat Pump',
  Air_Handler: 'Air Handler', Mini_Split: 'Mini-Split', Boiler: 'Boiler', Other: 'Other',
}
const EQUIP_ICONS: Record<string, string> = {
  AC_Unit: '❄️', Furnace: '🔥', Heat_Pump: '♻️',
  Air_Handler: '💨', Mini_Split: '🌡️', Boiler: '⚙️', Other: '🔧',
}
const EVENT_COLORS: Record<string, string> = {
  install: '#6366F1', refrigerant: '#0284C7', service: '#0F766E',
  maintenance: '#D97706', measurement: '#7C3AED',
}
const EVENT_LABELS: Record<string, string> = {
  install: 'INSTALL', refrigerant: 'REFRIGERANT', service: 'SERVICE',
  maintenance: 'MAINTENANCE', measurement: 'MEASUREMENT',
}

type TimelineEvent = { id: string; type: string; date: string; title: string; subtitle: string }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function r1(v: any) {
  return v == null ? '' : (Math.round(Number(v) * 10) / 10).toString()
}

function TwinInner() {
  const { id } = useParams<{ id: string }>()
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')

  useEffect(() => {
    if (!id) return
    fetch(`/api/hvac/equipment/${id}/public`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErr(d.error); return }
        setData(d)
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #0F766E', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 14, color: '#64748B' }}>Loading equipment history…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (err || !data?.equipment) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Equipment record not found</div>
        <div style={{ fontSize: 14, color: '#64748B' }}>{err || 'This link may be outdated or the record was removed.'}</div>
      </div>
    </div>
  )

  const { equipment: eq, contractor, timeline, latest_measurement: lm, refrigerant_stats: rs, service_count } = data
  const typeLabel = EQUIP_LABELS[eq.equipment_type] ?? eq.equipment_type ?? '—'
  const icon      = EQUIP_ICONS[eq.equipment_type] ?? '🔧'
  const age       = eq.installation_date
    ? Math.floor((Date.now() - new Date(eq.installation_date).getTime()) / (365.25 * 864e5))
    : null

  const card: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E2E8F0',
    borderRadius: 14, padding: '16px', marginBottom: 12,
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* ProGuild header */}
      <div style={{ background: '#0F766E', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>ProGuild</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Equipment History</span>
        </div>
        {contractor?.business_name && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            {contractor.business_name}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* Equipment identity card */}
        <div style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, background: '#E0F2FE',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#0F172A' }}>
              {[eq.brand, eq.model_number].filter(Boolean).join(' ') || typeLabel}
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 3 }}>
              {typeLabel}
              {eq.serial_number ? ` · SN: ${eq.serial_number}` : ''}
              {eq.refrigerant_type ? ` · ${eq.refrigerant_type}` : ''}
            </div>
            {eq.installation_date && (
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                Installed {fmtDate(eq.installation_date)}{age !== null ? ` · ${age} yr${age !== 1 ? 's' : ''} old` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Service calls', value: service_count || 0 },
            { label: 'Refrig. events', value: rs.event_count },
            { label: 'Age (yrs)', value: age ?? '—' },
          ].map(s => (
            <div key={s.label} style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: '#94A3B8', textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Latest measurements */}
        {lm && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 10, textTransform: 'uppercase' }}>
              Last Field Measurements — {fmtDate(lm.measured_at)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { label: 'Superheat',  value: lm.superheat_actual  != null ? `${r1(lm.superheat_actual)}°F` : null },
                { label: 'Subcooling', value: lm.subcool_actual    != null ? `${r1(lm.subcool_actual)}°F` : null },
                { label: 'Suction',    value: lm.suction_pressure  != null ? `${r1(lm.suction_pressure)} psig` : null },
                { label: 'Delta-T',    value: lm.delta_t            != null ? `${r1(lm.delta_t)}°F` : null },
                { label: 'Static',     value: lm.static_pressure    != null ? `${lm.static_pressure}" WC` : null },
              ].filter(x => x.value).map(x => (
                <div key={x.label} style={{ padding: '7px 12px', borderRadius: 8,
                  background: '#F0FDFA', border: '1px solid rgba(15,118,110,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>{x.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0F766E' }}>{x.value}</div>
                </div>
              ))}
            </div>
            {lm.diagnosis && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                {lm.diagnosis}
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 10, textTransform: 'uppercase' }}>
          Service History ({(timeline as TimelineEvent[]).length} events)
        </div>

        {(timeline as TimelineEvent[]).length === 0 ? (
          <div style={{ ...card, color: '#94A3B8', fontSize: 14, textAlign: 'center', padding: 40 }}>
            No service history recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(timeline as TimelineEvent[]).map(ev => {
              const color = EVENT_COLORS[ev.type] ?? '#64748B'
              const label = EVENT_LABELS[ev.type] ?? ev.type.toUpperCase()
              return (
                <div key={ev.id} style={{
                  background: '#FFF', border: '1px solid #E2E8F0',
                  borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '13px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
                      color, background: `${color}1A`, padding: '2px 7px', borderRadius: 4 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', flex: 1 }}>{ev.title}</span>
                    <span style={{ fontSize: 11.5, color: '#94A3B8', whiteSpace: 'nowrap' }}>{fmtDate(ev.date)}</span>
                  </div>
                  {ev.subtitle && (
                    <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>{ev.subtitle}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            Service records maintained by{' '}
            <span style={{ color: '#0F766E', fontWeight: 700 }}>
              {contractor?.business_name || 'your HVAC contractor'}
            </span>
            {' '}via ProGuild
          </div>
          <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 4 }}>proguild.ai</div>
        </div>
      </div>
    </div>
  )
}

export default function PublicEquipmentTwinPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #0F766E', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <TwinInner />
    </Suspense>
  )
}
