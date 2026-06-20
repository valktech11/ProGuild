'use client'
import React, { useRef, useState, useEffect } from 'react'

type Tier = { key: string; subtotal: number }

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// In-person signature capture. The homeowner signs on the rep's device; we POST
// the drawn signature to /api/estimates/[id]/sign-offline, which records it
// (channel = in-person) and runs the shared signed-effects engine.
export default function InPersonSignModal({ estimateId, proId, tiers, onClose, onSigned }: {
  estimateId: string
  proId: string
  tiers: Tier[] | null
  onClose: () => void
  onSigned: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [signerName, setSignerName] = useState('')
  const [selectedTier, setSelectedTier] = useState<string | null>(tiers?.[0]?.key ?? null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0F172A'
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    canvasRef.current!.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasDrawn) setHasDrawn(true)
    if (err) setErr(null)
  }
  const end = () => { drawing.current = false }
  const clear = () => {
    const c = canvasRef.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setHasDrawn(false)
  }

  const submit = async () => {
    if (!signerName.trim()) { setErr('Enter the signer\u2019s name.'); return }
    if (!hasDrawn) { setErr('Please capture the homeowner\u2019s signature.'); return }
    setSaving(true)
    setErr(null)
    const dataUrl = canvasRef.current!.toDataURL('image/png')
    try {
      const r = await fetch(`/api/estimates/${estimateId}/sign-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: proId, signer_name: signerName.trim(), sig_data_url: dataUrl, selected_tier: selectedTier }),
      })
      if (r.ok) {
        onSigned()
      } else {
        const d = await r.json().catch(() => ({}))
        setErr(d.error || 'Failed to record signature.')
        setSaving(false)
      }
    } catch {
      setErr('Network error — please try again.')
      setSaving(false)
    }
  }

  const C = { teal: '#0F766E', border: '#E2E8F0', muted: '#64748B', text: '#0F172A', red: '#DC2626' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Sign in person</div>
          <button onClick={() => !saving && onClose()} style={{ border: 'none', background: 'none',
            fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>

        <div style={{ padding: '18px 24px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tier selection (GBB only) */}
          {tiers && tiers.length > 1 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Option chosen</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tiers.map(tr => {
                  const on = tr.key === selectedTier
                  return (
                    <button key={tr.key} onClick={() => setSelectedTier(tr.key)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '11px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        border: `1.5px solid ${on ? C.teal : C.border}`,
                        background: on ? '#F0FDFA' : '#fff' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize',
                        color: on ? C.teal : C.text }}>{tr.key}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: on ? C.teal : C.text }}>{money(tr.subtotal)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Signer name */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Signer name</div>
            <input value={signerName} onChange={e => { setSignerName(e.target.value); if (err) setErr(null) }}
              placeholder="Homeowner's full name"
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
                borderRadius: 10, fontSize: 15, outline: 'none', boxSizing: 'border-box', color: C.text }} />
          </div>

          {/* Signature pad */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.muted }}>Signature</span>
              <button onClick={clear} style={{ fontSize: 12, fontWeight: 600, color: C.teal,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
            </div>
            <canvas ref={canvasRef}
              onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
              style={{ width: '100%', height: 160, border: `1.5px dashed ${C.border}`, borderRadius: 12,
                background: '#FAFAFA', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
              By signing, the homeowner agrees to the terms of this estimate. This signature is captured
              in person on the contractor&rsquo;s device and recorded with a timestamp.
            </div>
          </div>

          {err && <div style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{err}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
            <button onClick={() => !saving && onClose()}
              style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1.5px solid ${C.border}`,
                background: '#fff', color: C.muted, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={submit} disabled={saving}
              style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: saving ? '#5EAAA4' : C.teal, color: '#fff', fontSize: 15, fontWeight: 800,
                cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Recording…' : 'Confirm & Sign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
