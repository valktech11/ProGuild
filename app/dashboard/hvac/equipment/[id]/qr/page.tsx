'use client'
// Printable QR sticker for an equipment unit. Renders a print-optimized
// sticker (or sheet of stickers) that a tech prints and applies to the
// physical unit. The QR encodes the unit's Digital Twin URL.
//
// Uses a QR image API (no npm dependency) so it builds clean on Vercel.

import { useState, useEffect, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { useProSession } from '@/lib/hooks/useProSession'

function QrStickerInner() {
  const { id } = useParams<{ id: string }>()
  const { session } = useProSession()
  const [eq, setEq] = useState<any>(null)
  const [err, setErr] = useState('')
  const [copies, setCopies] = useState(1)

  useEffect(() => {
    if (!session?.id || !id) return
    apiFetch(`/api/hvac/equipment/${id}/timeline?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setEq(d.equipment) })
      .catch(e => setErr(e.message))
  }, [session, id])

  const twinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/dashboard/hvac/equipment/${id}`
    : ''
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(twinUrl)}`

  const title = eq
    ? [eq.brand, eq.model_number].filter(Boolean).join(' ') || 'Equipment Unit'
    : 'Equipment Unit'

  if (err) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Could not load unit</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{err}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 640, margin: '0 auto' }}>
      {/* Controls — hidden when printing */}
      <div className="no-print" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>QR Sticker</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 16px' }}>
          Print and stick on the unit. Scanning it opens the full service history.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, fontWeight: 600 }}>Copies:</label>
          {[1, 2, 4, 6].map(n => (
            <button key={n} onClick={() => setCopies(n)}
              style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${copies === n ? '#0F766E' : '#cbd5e1'}`,
                background: copies === n ? '#0F766E' : '#fff',
                color: copies === n ? '#fff' : '#334155', fontWeight: 700, fontSize: 14 }}>
              {n}
            </button>
          ))}
          <button onClick={() => window.print()}
            style={{ marginLeft: 'auto', padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#0F766E', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* Sticker sheet */}
      <div style={{ display: 'grid', gridTemplateColumns: copies > 1 ? '1fr 1fr' : '1fr',
        gap: 16, justifyItems: 'center' }}>
        {Array.from({ length: copies }).map((_, i) => (
          <div key={i} className="sticker" style={{
            width: 260, padding: 20, textAlign: 'center',
            border: '1.5px solid #e2e8f0', borderRadius: 16, background: '#fff',
            breakInside: 'avoid' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>❄ ProGuild</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR code" width={180} height={180}
              style={{ display: 'block', margin: '0 auto' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 12 }}>{title}</div>
            {eq?.serial_number && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>SN: {eq.serial_number}</div>
            )}
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Scan for service history</div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  )
}

export default function QrStickerPage() {
  return (
    <Suspense fallback={null}>
      <QrStickerInner />
    </Suspense>
  )
}
