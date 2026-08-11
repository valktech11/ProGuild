'use client'
// app/r/[token]/page.tsx
// Homeowner share page — public, no auth.
// Roofer sends this link to their homeowner.
// Homeowner sees the 3 renders, picks a favourite, roofer gets notified.

import React, { useEffect, useState, use } from 'react'
import { theme, BRAND, T } from '@/lib/tokens'

interface Render {
  render_url:  string
  status:      string
  viz_skus: { id: string; name: string; hex_preview: string; viz_product_lines?: { viz_manufacturers?: { name: string } } | null }
}

interface ShareData {
  token:          string
  chosen_sku_id:  string | null
  session_id:     string
  visualizer_sessions: {
    photo_public_url: string
    pro_id:           string | null
    pros:             { full_name: string; phone: string | null } | null
    visualizer_renders: Render[]
  }
}

function getMfg(r: Render): string | null {
  return r.viz_skus?.viz_product_lines?.viz_manufacturers?.name ?? null
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const t = theme(false)

  const [share, setShare]     = useState<ShareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chosen, setChosen]   = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  useEffect(() => {
    fetch(`/api/roof-visualizer/session?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.share) {
          setShare(d.share)
          setChosen(d.share.chosen_sku_id)
          if (d.share.chosen_sku_id) setSubmitted(true)
        } else {
          setError('This link has expired or is invalid.')
        }
      })
      .catch(() => setError('Could not load this page.'))
      .finally(() => setLoading(false))
  }, [token])

  const handlePick = async (skuId: string) => {
    if (submitted) return
    setChosen(skuId)
    try {
      const res = await fetch('/api/roof-visualizer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, skuId }),
      })
      if (res.ok) setSubmitted(true)
    } catch {
      setError('Could not save your choice — please try again.')
    }
  }

  const handleDownload = async (url: string, name: string) => {
    try {
      const res = await fetch(`/api/roof-visualizer/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name.replace(/\s+/g, '-'))}.jpg`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${name.replace(/\s+/g, '-')}.jpg`
      a.click()
    } catch { /* silent */ }
  }

  const renders  = share?.visualizer_sessions?.visualizer_renders?.filter(r => r.status === 'done' && r.render_url) ?? []
  const pro      = share?.visualizer_sessions?.pros ?? null
  const proName  = pro?.full_name ?? null
  const proPhone = pro?.phone ?? null

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.pageBg }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.pageBg, flexDirection: 'column', gap: 12, padding: 20 }}>
      <span style={{ fontSize: 40 }}>⚠️</span>
      <p style={{ color: t.textMuted, fontSize: 16, textAlign: 'center' }}>{error}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, fontFamily: 'inherit' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.label} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: T.radLg, display: 'block' }} />
          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{lightbox.label}</span>
            <button onClick={e => { e.stopPropagation(); handleDownload(lightbox.url, lightbox.label) }}
              style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radMd, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              ↓ Save
            </button>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 10 }}>Tap anywhere to close</p>
        </div>
      )}

      {/* Header — contractor branded when pro is linked */}
      <div style={{ background: t.cardBg, borderBottom: `1px solid ${t.cardBorder}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: BRAND.teal }}>
            {proName ?? 'ProGuild'}
          </span>
          <span style={{ color: t.textSubtle, fontSize: 13 }}>· Roof Colour Preview</span>
        </div>
        {proPhone && (
          <a href={`tel:${proPhone.replace(/\D/g,'')}`}
            style={{ color: BRAND.teal, fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            📞 {proPhone}
          </a>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>
              Great choice!
            </h2>
            <p style={{ color: t.textMuted, fontSize: 15, margin: '0 0 8px' }}>
              {proName ? `${proName} has been notified and will be in touch shortly.` : 'Your roofer has been notified and will be in touch shortly.'}
            </p>
            <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 24px' }}>
              What happens next: your roofer will review your selection, confirm material availability, and reach out with a final quote.
            </p>
            {chosen && renders.find(r => r.viz_skus?.id === chosen) && (() => {
              const r = renders.find(r => r.viz_skus?.id === chosen)!
              return (
                <div style={{ maxWidth: 440, margin: '0 auto', borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.render_url} alt="Your chosen roof" style={{ width: '100%', display: 'block' }} />
                  <div style={{ height: 48, background: r.viz_skus.hex_preview, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                        {getMfg(r) && <span style={{ fontWeight: 400, opacity: 0.8 }}>{getMfg(r)} · </span>}
                        {r.viz_skus.name} · ✓ Your pick
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px', background: t.cardBg, display: 'flex', justifyContent: 'center' }}>
                    <button onClick={() => handleDownload(r.render_url, r.viz_skus.name)}
                      style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radMd, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      ↓ Save this render
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28, textAlign: 'center' }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Your Roof, New Colours</h1>
              <p style={{ color: t.textMuted, fontSize: 15, margin: 0 }}>
                {proName ? `${proName} prepared these options for your home.` : 'Tap a render to zoom in, then confirm your choice below.'}
                {' '}Tap to zoom, then select your favourite.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(renders.length, 3)}, 1fr)`, gap: 16 }}>
              {renders.map(r => (
                <div key={r.viz_skus?.id}
                  style={{
                    borderRadius: T.radLg, overflow: 'hidden',
                    border: `3px solid ${chosen === r.viz_skus?.id ? BRAND.teal : t.cardBorder}`,
                    transition: 'border-color 0.15s, transform 0.1s',
                    transform: chosen === r.viz_skus?.id ? 'scale(1.02)' : 'scale(1)',
                    background: t.cardBg,
                  }}>
                  {/* Render image — tap to zoom */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.render_url} alt={r.viz_skus?.name}
                    onClick={() => setLightbox({ url: r.render_url, label: r.viz_skus?.name })}
                    style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover', cursor: 'zoom-in' }} />
                  {/* Large colour band */}
                  <div style={{ height: 44, background: r.viz_skus?.hex_preview, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                        {getMfg(r) && <span style={{ fontWeight: 400, opacity: 0.8 }}>{getMfg(r)} · </span>}
                        {r.viz_skus?.name}
                      </span>
                    </div>
                  </div>
                  {/* Actions row */}
                  <div style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button onClick={() => handlePick(r.viz_skus?.id)}
                      style={{
                        flex: 1, padding: '9px 0', borderRadius: T.radMd, border: 'none',
                        background: chosen === r.viz_skus?.id ? BRAND.teal : t.cardBgAlt,
                        color: chosen === r.viz_skus?.id ? '#fff' : t.textBody,
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      }}>
                      {chosen === r.viz_skus?.id ? '✓ Selected' : 'Choose this'}
                    </button>
                    <button onClick={() => handleDownload(r.render_url, r.viz_skus?.name ?? 'render')}
                      title="Save image"
                      style={{ padding: '9px 12px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, cursor: 'pointer' }}>
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Original photo comparison */}
            {share?.visualizer_sessions?.photo_public_url && (
              <div style={{ marginTop: 32, padding: '20px 24px', background: t.cardBg, borderRadius: T.radLg, border: `1px solid ${t.cardBorder}` }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: t.textMuted, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your current roof</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={share.visualizer_sessions.photo_public_url} alt="Original roof"
                  style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: T.radMd, display: 'block' }} />
              </div>
            )}

            {chosen && !submitted && (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button onClick={() => handlePick(chosen)}
                  style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radMd, padding: '14px 48px', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
                  Confirm my choice →
                </button>
                <p style={{ fontSize: 12, color: t.textSubtle, marginTop: 10 }}>
                  {proName ? `${proName} will be notified with your selection.` : 'Your roofer will be notified with your selection.'}
                </p>
              </div>
            )}

            {/* Schedule CTA — shown after pick or if no choice yet */}
            {proPhone && (
              <div style={{ marginTop: 32, padding: '20px 24px', background: BRAND.teal + '12', borderRadius: T.radLg, border: `1px solid ${BRAND.teal}44`, textAlign: 'center' }}>
                <p style={{ fontWeight: 800, fontSize: 16, color: t.textPri, margin: '0 0 6px' }}>
                  Ready to get started?
                </p>
                <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 16px' }}>
                  Call {proName ?? 'your roofer'} to schedule a free inspection.
                </p>
                <a href={`tel:${proPhone.replace(/\D/g,'')}`}
                  style={{ display: 'inline-block', background: BRAND.teal, color: '#fff', textDecoration: 'none', borderRadius: T.radMd, padding: '12px 32px', fontWeight: 700, fontSize: 15 }}>
                  📞 Call {proPhone}
                </a>
              </div>
            )}
          </>
        )}

        <p style={{ textAlign: 'center', color: t.textSubtle, fontSize: 12, marginTop: 40 }}>
          Roof visualization by{' '}
          <a href="https://proguild.ai" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>ProGuild.ai</a>
          {proName ? ` · Prepared by ${proName}` : ''}{' '}· Free for homeowners
        </p>
      </div>
    </div>
  )
}
