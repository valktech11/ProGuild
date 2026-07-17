'use client'
// app/roof-visualizer/client.tsx — v2 with all improvements

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { theme, BRAND, T } from '@/lib/tokens'
import Link from 'next/link'

interface Sku {
  id: string; slug: string; name: string; hex_preview: string
  is_default: boolean; sort_order: number
  viz_product_lines: { id: string; slug: string; name: string
    viz_manufacturers: { id: string; slug: string; name: string } }
}
interface RenderResult {
  skuId: string; renderUrl: string | null; skuName: string
  hexPreview: string; mfgName?: string; error?: string
}
type Step = 'upload' | 'segmenting' | 'pick' | 'rendering' | 'results' | 'gate' | 'share'

function groupSkusByManufacturer(skus: Sku[]) {
  const map: Record<string, { manufacturer: string; skus: Sku[] }> = {}
  for (const sku of skus) {
    const mfg = sku.viz_product_lines?.viz_manufacturers?.name ?? 'Other'
    if (!map[mfg]) map[mfg] = { manufacturer: mfg, skus: [] }
    map[mfg].skus.push(sku)
  }
  return Object.values(map)
}
function getMfgName(sku: Sku) { return sku.viz_product_lines?.viz_manufacturers?.name ?? '' }

// ── Before/After Slider ───────────────────────────────────────────────────────
function BeforeAfterSlider({ original, rendered, label, hex, mfg }: {
  original: string; rendered: string; label: string; hex: string; mfg: string
}) {
  const t = theme(false)
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updatePos = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return
      updatePos('touches' in e ? e.touches[0].clientX : e.clientX)
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [updatePos])

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(rendered)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `proguild-${label.toLowerCase().replace(/\s/g,'-')}.jpg`
      a.click(); URL.revokeObjectURL(url)
    } catch { /* silent */ }
  }, [rendered, label])

  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}`, userSelect: 'none' }}>
      <div ref={containerRef} style={{ position: 'relative', aspectRatio: '4/3', cursor: 'ew-resize' }}
        onMouseDown={e => { dragging.current = true; updatePos(e.clientX) }}
        onTouchStart={e => { dragging.current = true; updatePos(e.touches[0].clientX) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rendered} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${pos}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={original} alt="Original" style={{ position: 'absolute', inset: 0, width: pos > 0 ? `${10000/pos}%` : '100%', maxWidth: 'none', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, transform: 'translateX(-50%)', width: 3, background: '#fff', boxShadow: '0 0 6px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 32, height: 32, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555', fontWeight: 700 }}>⇔</div>
        </div>
        <div style={{ position: 'absolute', top: 8, left: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, pointerEvents: 'none', opacity: pos > 15 ? 1 : 0, transition: 'opacity 0.2s' }}>BEFORE</div>
        <div style={{ position: 'absolute', top: 8, right: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, pointerEvents: 'none', opacity: pos < 85 ? 1 : 0, transition: 'opacity 0.2s' }}>AFTER</div>
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.65)', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>proguild.ai</div>
      </div>
      <div style={{ padding: '10px 14px', background: t.cardBg, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: hex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: t.textPri, fontSize: 13 }}>{label}</span>
          {mfg && <span style={{ color: t.textSubtle, fontSize: 11, marginLeft: 6 }}>{mfg}</span>}
        </div>
        <button onClick={handleDownload} title="Download"
          style={{ background: 'none', border: `1px solid ${t.cardBorder}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          ↓ Save
        </button>
      </div>
    </div>
  )
}

function OriginalCard({ photoUrl }: { photoUrl: string }) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `2px solid ${t.cardBorder}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="Original" style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
      <div style={{ padding: '10px 14px', background: t.cardBg, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#888', border: '1px solid rgba(0,0,0,0.15)' }} />
        <span style={{ fontWeight: 700, color: t.textPri, fontSize: 13 }}>Original</span>
        <span style={{ color: t.textSubtle, fontSize: 11, marginLeft: 4 }}>Current roof</span>
      </div>
    </div>
  )
}

function SkeletonCard({ label }: { label?: string }) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
      <div style={{ aspectRatio: '4/3', background: t.cardBgAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 12, color: t.textMuted }}>{label ? `Rendering ${label}…` : 'Generating…'}</span>
      </div>
      <div style={{ padding: '10px 14px', background: t.cardBg, height: 38 }} />
    </div>
  )
}

function ErrorCard({ label }: { label: string }) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px dashed ${t.cardBorder}` }}>
      <div style={{ aspectRatio: '4/3', background: t.cardBgAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 28 }}>🔄</span>
        <span style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', padding: '0 16px' }}>Render timed out.<br/>Try again with fewer colors.</span>
      </div>
      <div style={{ padding: '10px 14px', background: t.cardBg }}>
        <span style={{ fontSize: 13, color: t.textSubtle }}>{label}</span>
      </div>
    </div>
  )
}

function SkuSwatch({ sku, selected, onClick }: { sku: Sku; selected: boolean; onClick: () => void }) {
  const t = theme(false)
  return (
    <button onClick={onClick} title={`${getMfgName(sku)} — ${sku.name}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px', borderRadius: T.radMd, border: `2px solid ${selected ? BRAND.teal : t.cardBorder}`, background: selected ? BRAND.tealAlpha : t.cardBg, cursor: 'pointer', transition: 'all 0.15s', minWidth: 70 }}>
      <div style={{ width: 36, height: 36, borderRadius: T.radSm, background: sku.hex_preview, border: '1px solid rgba(0,0,0,0.15)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      <span style={{ fontSize: 10, color: t.textMuted, textAlign: 'center', lineHeight: 1.2, maxWidth: 64 }}>{sku.name}</span>
      {selected && <span style={{ fontSize: 10, color: BRAND.teal, fontWeight: 600 }}>✓</span>}
    </button>
  )
}

export default function RoofVisualizerClient({ skus }: { skus: Sku[] }) {
  const t = theme(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]             = useState<Step>('upload')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [sessionId, setSessionId]   = useState<string | null>(null)
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>(() =>
    skus.filter(s => s.is_default).slice(0, 3).map(s => s.id))
  const [renders, setRenders]       = useState<RenderResult[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [shareUrl, setShareUrl]     = useState<string | null>(null)
  const [gateEmail, setGateEmail]   = useState('')
  const [gateBusy, setGateBusy]     = useState(false)
  const groups = groupSkusByManufacturer(skus)
  const skuMap = Object.fromEntries(skus.map(s => [s.id, s]))

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload a photo (JPG or PNG)'); return }
    if (file.size > 10 * 1024 * 1024)   { setError('Photo must be under 10MB'); return }
    const reader = new FileReader()
    reader.onload = e => setPhotoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    setError(null); setStep('segmenting')
    try {
      const form = new FormData()
      form.append('photo', file)
      const res  = await fetch('/api/roof-visualizer/segment', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.detail ? `${data.error} — ${data.detail}` : (data.error || 'Could not detect roof.')); setStep('upload'); return }
      setSessionId(data.sessionId); setStep('pick')
    } catch { setError('Upload failed. Please try again.'); setStep('upload') }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const toggleSku = (id: string) => setSelectedSkuIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 3 ? [...prev.slice(1), id] : [...prev, id])

  const handleRender = async () => {
    if (!sessionId || selectedSkuIds.length === 0) return
    setStep('rendering'); setRenders([])
    try {
      const res  = await fetch('/api/roof-visualizer/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, skuIds: selectedSkuIds }),
      })
      const data = await res.json()
      if (data.gate)  { setStep('gate'); return }
      if (!res.ok)    { setError(data.error || 'Render failed.'); setStep('pick'); return }
      setRenders((data.renders as RenderResult[]).map(r => ({ ...r, mfgName: skuMap[r.skuId] ? getMfgName(skuMap[r.skuId]) : '' })))
      setStep('results')
    } catch { setError('Render failed. Please try again.'); setStep('pick') }
  }

  const handleGateSubmit = async () => {
    if (!gateEmail || !sessionId) return; setGateBusy(true)
    try { await fetch('/api/roof-visualizer/session', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, email: gateEmail }) }); await handleRender() }
    finally { setGateBusy(false) }
  }

  const handleShare = async () => {
    if (!sessionId) return
    try {
      const res  = await fetch('/api/roof-visualizer/session', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action: 'share' }) })
      const data = await res.json()
      if (data.shareUrl) { setShareUrl(data.shareUrl); setStep('share') }
    } catch { setError('Could not create share link.') }
  }

  const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: T.radLg, padding: T.sp6, ...extra }}>{children}</div>
  )

  const successRenders = renders.filter(r => r.renderUrl)
  const gridCols = Math.min(successRenders.length + 1, 4)

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, fontFamily: 'inherit' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ background: t.cardBg, borderBottom: `1px solid ${t.cardBorder}`, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><span style={{ fontWeight: 800, fontSize: 18, color: BRAND.teal, letterSpacing: '-0.5px' }}>ProGuild</span></Link>
        <span style={{ fontSize: 13, color: t.textMuted }}>Roof Visualizer</span>
        <Link href="/login" style={{ fontSize: 13, color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: t.textPri, margin: '0 0 10px', letterSpacing: '-0.5px' }}>See Your New Roof Before You Buy</h1>
          <p style={{ fontSize: 16, color: t.textMuted, margin: 0, maxWidth: 540, marginInline: 'auto' }}>Upload a photo of your home and instantly visualize different shingle colors — no app, no account required.</p>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: T.radMd, padding: '12px 16px', marginBottom: 20, color: '#DC2626', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16 }}>×</button>
          </div>
        )}

        {step === 'upload' && card(
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${BRAND.teal}`, borderRadius: T.radLg, padding: '56px 32px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
            <p style={{ fontWeight: 700, fontSize: 18, color: t.textPri, margin: '0 0 8px' }}>Upload a photo of your home</p>
            <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 20px' }}>Drag & drop or click to browse — JPG or PNG, max 10MB</p>
            <div style={{ display: 'inline-block', background: BRAND.teal, color: '#fff', padding: '10px 28px', borderRadius: T.radMd, fontWeight: 700, fontSize: 14 }}>Choose Photo</div>
            <p style={{ color: t.textSubtle, fontSize: 12, margin: '16px 0 0' }}>Best results: straight-on street view, clear sky, minimal tree coverage</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
          </div>
        )}

        {step === 'segmenting' && card(
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            {photoPreview && <img src={photoPreview} alt="Your home" style={{ maxHeight: 220, borderRadius: T.radMd, marginBottom: 24, maxWidth: '100%', objectFit: 'cover' }} />}
            <div style={{ width: 40, height: 40, border: `4px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 700, color: t.textPri, fontSize: 17, margin: '0 0 6px' }}>Detecting your roof…</p>
            <p style={{ color: t.textMuted, fontSize: 14, margin: 0 }}>AI is analyzing your photo — takes about 15 seconds</p>
          </div>
        )}

        {step === 'pick' && (
          <div style={{ display: 'grid', gridTemplateColumns: photoPreview ? '1fr 1fr' : '1fr', gap: 20 }}>
            {photoPreview && (
              <div style={{ position: 'relative', borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Your home" style={{ width: '100%', display: 'block', maxHeight: 360, objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(15,118,110,0.85)', color: '#fff', borderRadius: T.radSm, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>✓ Roof detected</div>
              </div>
            )}
            {card(
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: t.textPri, margin: '0 0 4px' }}>Pick up to 3 shingle colors</p>
                <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 20px' }}>We'll show all three with a before/after slider — free</p>
                {groups.map(group => (
                  <div key={group.manufacturer} style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>{group.manufacturer}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {group.skus.map(sku => <SkuSwatch key={sku.id} sku={sku} selected={selectedSkuIds.includes(sku.id)} onClick={() => toggleSku(sku.id)} />)}
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: 12, color: t.textSubtle, margin: '0 0 14px' }}>{selectedSkuIds.length === 0 ? 'Select at least one color' : `${selectedSkuIds.length} color${selectedSkuIds.length > 1 ? 's' : ''} selected`}</p>
                <button onClick={handleRender} disabled={selectedSkuIds.length === 0}
                  style={{ width: '100%', background: selectedSkuIds.length > 0 ? BRAND.teal : '#ccc', color: '#fff', border: 'none', borderRadius: T.radMd, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: selectedSkuIds.length > 0 ? 'pointer' : 'not-allowed' }}>
                  Visualize My Roof →
                </button>
                <p style={{ fontSize: 11, color: t.textSubtle, textAlign: 'center', margin: '10px 0 0' }}>Free — no account required for first 3 renders</p>
              </div>
            )}
          </div>
        )}

        {step === 'rendering' && (
          <div>
            <p style={{ fontWeight: 700, fontSize: 17, color: t.textPri, margin: '0 0 20px' }}>Generating your renders…</p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(selectedSkuIds.length + 1, 4)}, 1fr)`, gap: 16 }}>
              {photoPreview && (
                <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Original" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '10px 14px', background: t.cardBg }}><span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>Original</span></div>
                </div>
              )}
              {selectedSkuIds.map(id => <SkeletonCard key={id} label={skuMap[id]?.name} />)}
            </div>
          </div>
        )}

        {step === 'results' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 4px' }}>Your Roof Visualized</h2>
                <p style={{ fontSize: 14, color: t.textMuted, margin: 0 }}>Drag the slider to compare before and after</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('pick')} style={{ padding: '9px 18px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>← Try Other Colors</button>
                <button onClick={handleShare} style={{ padding: '9px 18px', borderRadius: T.radMd, border: 'none', background: BRAND.teal, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Share with Homeowner →</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 16 }}>
              {photoPreview && <OriginalCard photoUrl={photoPreview} />}
              {renders.map(r => r.renderUrl && photoPreview ? (
                <BeforeAfterSlider key={r.skuId} original={photoPreview} rendered={r.renderUrl} label={r.skuName} hex={r.hexPreview} mfg={r.mfgName ?? ''} />
              ) : (
                <ErrorCard key={r.skuId} label={r.skuName} />
              ))}
            </div>
            {card(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <p style={{ fontWeight: 700, color: t.textPri, margin: '0 0 4px', fontSize: 16 }}>Are you a roofing contractor?</p>
                  <p style={{ color: t.textMuted, fontSize: 14, margin: 0 }}>Close more sales with the visualizer. 3 free renders — unlimited with a free ProGuild account.</p>
                </div>
                <Link href="/login?tab=signup" style={{ display: 'inline-block', background: BRAND.teal, color: '#fff', padding: '11px 24px', borderRadius: T.radMd, fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>Join ProGuild Free →</Link>
              </div>,
              { marginTop: 20 }
            )}
          </div>
        )}

        {step === 'gate' && card(
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🎨</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Want to see more renders?</h2>
            <p style={{ color: t.textMuted, fontSize: 15, margin: '0 0 28px', maxWidth: 400, marginInline: 'auto' }}>Enter your email to unlock unlimited renders — free, no credit card.</p>
            <div style={{ maxWidth: 340, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="email" placeholder="your@email.com" value={gateEmail} onChange={e => setGateEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGateSubmit()}
                style={{ padding: '12px 16px', borderRadius: T.radMd, border: `1.5px solid ${t.inputBorder}`, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              <button onClick={handleGateSubmit} disabled={!gateEmail || gateBusy}
                style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radMd, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: gateEmail ? 'pointer' : 'not-allowed', opacity: !gateEmail ? 0.6 : 1 }}>
                {gateBusy ? 'Unlocking…' : 'Unlock Free Renders →'}
              </button>
              <p style={{ fontSize: 12, color: t.textSubtle, margin: 0 }}>Already have an account? <Link href="/login" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Sign in</Link></p>
            </div>
          </div>
        )}

        {step === 'share' && card(
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📨</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Share with your homeowner</h2>
            <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 24px', maxWidth: 440, marginInline: 'auto' }}>Send this link to your homeowner. They'll pick their favourite color and you'll be notified instantly.</p>
            {shareUrl && (
              <div style={{ maxWidth: 480, margin: '0 auto' }}>
                <div style={{ display: 'flex', gap: 8, background: t.cardBgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: T.radMd, padding: '10px 14px', marginBottom: 16, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: t.textBody, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareUrl}</span>
                  <button onClick={() => navigator.clipboard.writeText(shareUrl)} style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radSm, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Copy Link</button>
                </div>
                <button onClick={() => setStep('results')} style={{ background: 'none', border: 'none', color: BRAND.teal, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>← Back to renders</button>
              </div>
            )}
          </div>
        )}

        {step === 'upload' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
            {[
              { icon: '📸', title: 'Upload a photo', body: 'Street-view photo of your home — just the front' },
              { icon: '🤖', title: 'AI detects your roof', body: 'Our AI finds the roof automatically — no clicking required' },
              { icon: '⇔', title: 'Before/after slider', body: 'Drag to compare original vs new shingles side by side' },
            ].map(s => card(
              <div key={s.title} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{s.icon}</div>
                <p style={{ fontWeight: 700, color: t.textPri, margin: '0 0 6px', fontSize: 14 }}>{s.title}</p>
                <p style={{ color: t.textMuted, fontSize: 13, margin: 0, lineHeight: 1.4 }}>{s.body}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
