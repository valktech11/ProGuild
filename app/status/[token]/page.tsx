'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface StatusData {
  homeowner: string
  address: string
  currentStep: number
  stepLabel: string
  steps: string[]
  scheduledDate: string | null
  pro: { name: string; phone: string | null }
  condition: { text: string | null; imageryDate: string | null; lat: number | null; lng: number | null } | null
}

export default function HomeownerStatusPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const [data, setData] = useState<StatusData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/status/${token}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setData(d); setState('ok') })
      .catch(() => setState('error'))
  }, [token])

  const TEAL = '#0F766E', NAVY = '#0F172A', MUTE = '#64748B'
  const wrap: React.CSSProperties = { minHeight: '100vh', background: '#F7F6F3', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif', color: NAVY }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20, marginBottom: 16 }

  if (state === 'loading') return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: MUTE }}>Loading…</div></div>
  if (state === 'error' || !data) return (
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div><div style={{ fontSize: 18, fontWeight: 700 }}>Link not found</div><div style={{ color: MUTE, marginTop: 6 }}>This status link is invalid or has expired. Please ask your roofer for an updated link.</div></div>
    </div>
  )

  const mapKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  const satUrl = data.condition?.lat && data.condition?.lng && mapKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${data.condition.lat},${data.condition.lng}&zoom=20&size=640x300&maptype=satellite&key=${mapKey}`
    : null

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{data.pro.name}</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px' }}>Your roof project</h1>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{data.homeowner}</div>
          <div style={{ fontSize: 14, color: MUTE, marginTop: 1 }}>{data.address}</div>
        </div>

        <div style={{ ...card, textAlign: 'center', background: TEAL, color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current status</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{data.stepLabel}</div>
          {data.scheduledDate && <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>Scheduled: {new Date(data.scheduledDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>}
        </div>

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Progress</div>
          {data.steps.map((label, i) => {
            const done = data.currentStep >= 0 && i < data.currentStep
            const current = i === data.currentStep
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: done || current ? TEAL : '#fff', border: `2px solid ${done || current ? TEAL : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>{done ? '✓' : ''}</div>
                <div style={{ fontSize: 14, fontWeight: current ? 800 : 500, color: done || current ? NAVY : '#94A3B8' }}>{label}</div>
              </div>
            )
          })}
        </div>

        {(satUrl || data.condition?.text) && (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Your roof</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {satUrl && <img src={satUrl} alt="Roof satellite view" style={{ width: '100%', borderRadius: 10, display: 'block', marginBottom: data.condition?.text ? 12 : 0 }} />}
            {data.condition?.text && <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.5 }}>{data.condition.text}</div>}
            {data.condition?.imageryDate && <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>Aerial imagery dated {data.condition.imageryDate}. For reference only.</div>}
          </div>
        )}

        <div style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 13, color: MUTE }}>Questions about your project?</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{data.pro.name}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const, marginTop: 12 }}>
            {(data.pro as any).phone && (
              <a href={`tel:${(data.pro as any).phone}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                  background: TEAL, color: '#fff', borderRadius: 10, textDecoration: 'none',
                  fontWeight: 700, fontSize: 14 }}>
                📞 Call
              </a>
            )}
            {(data.pro as any).email && (
              <a href={`mailto:${(data.pro as any).email}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                  background: '#F0FDF4', color: TEAL, borderRadius: 10, textDecoration: 'none',
                  fontWeight: 700, fontSize: 14, border: `1.5px solid ${TEAL}` }}>
                ✉ Email
              </a>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#94A3B8' }}>Powered by ProGuild</div>
      </div>
    </div>
  )
}
