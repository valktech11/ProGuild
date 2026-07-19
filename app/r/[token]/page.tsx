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
  viz_skus: { id: string; name: string; hex_preview: string }
}

interface ShareData {
  token:          string
  chosen_sku_id:  string | null
  session_id:     string
  visualizer_sessions: {
    photo_public_url: string
    visualizer_renders: Render[]
  }
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

  const renders = share?.visualizer_sessions?.visualizer_renders?.filter(r => r.status === 'done' && r.render_url) ?? []

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

      {/* Header */}
      <div style={{ background: t.cardBg, borderBottom: `1px solid ${t.cardBorder}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: BRAND.teal }}>ProGuild</span>
        <span style={{ color: t.textSubtle, fontSize: 13 }}>· Roof Visualizer</span>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Thanks for choosing!</h2>
            <p style={{ color: t.textMuted, fontSize: 15, margin: '0 0 24px' }}>
              Your roofer has been notified with your favourite shingle color.
            </p>
            {chosen && renders.find(r => r.viz_skus?.id === chosen) && (() => {
              const r = renders.find(r => r.viz_skus?.id === chosen)!
              return (
                <div style={{ maxWidth: 440, margin: '0 auto', borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.render_url} alt="Your chosen roof" style={{ width: '100%', display: 'block' }} />
                  <div style={{ height: 48, background: r.viz_skus.hex_preview, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{r.viz_skus.name} · ✓ Your pick</span>
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
              <h1 style={{ fontSize: 26, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Pick Your Favourite Shingle</h1>
              <p style={{ color: t.textMuted, fontSize: 15, margin: 0 }}>
                Tap a render to zoom in, then confirm your choice below.
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
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>{r.viz_skus?.name}</span>
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

            {chosen && !submitted && (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button onClick={() => handlePick(chosen)}
                  style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radMd, padding: '14px 48px', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
                  Confirm my choice →
                </button>
                <p style={{ fontSize: 12, color: t.textSubtle, marginTop: 10 }}>Your roofer will be notified with your selection.</p>
              </div>
            )}
          </>
        )}

        <p style={{ textAlign: 'center', color: t.textSubtle, fontSize: 12, marginTop: 40 }}>
          Roof visualization powered by{' '}
          <a href="https://proguild.ai" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>ProGuild.ai</a>
          {' '}· Free for homeowners
        </p>
      </div>
    </div>
  )
}
