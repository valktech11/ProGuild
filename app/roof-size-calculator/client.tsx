'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

type Step = 'input' | 'loading' | 'result' | 'captured' | 'error'

interface RoofResult {
  sqft: number
  squares: number
  pitch: string
  imageryDate: string | null
  lat: number
  lng: number
  formattedAddress: string
}

const TEAL  = '#0F766E'
const NAVY  = '#0A1628'
const LIGHT = '#F8FAFC'

export default function RoofCalculatorClient() {
  const [step,    setStep]    = useState<Step>('input')
  const [address, setAddress] = useState('')
  const [result,  setResult]  = useState<RoofResult | null>(null)
  const [error,   setError]   = useState('')
  const [form,    setForm]    = useState({ name: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Google Places autocomplete
  useEffect(() => {
    const el = inputRef.current
    if (!el || typeof window === 'undefined') return
    const loadAC = () => {
      if (!(window as any).google?.maps?.places) return
      const ac = new (window as any).google.maps.places.Autocomplete(el, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (place?.formatted_address) setAddress(place.formatted_address)
      })
    }
    if ((window as any).google?.maps?.places) { loadAC(); return }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''}&libraries=places`
    s.async = true
    s.onload = loadAC
    document.head.appendChild(s)
  }, [])

  const calculate = useCallback(async () => {
    if (!address.trim()) return
    setStep('loading')
    setError('')
    try {
      const r = await fetch(`/api/roof-size-calculator?address=${encodeURIComponent(address)}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Could not calculate roof size.'); setStep('error'); return }
      setResult(d)
      setStep('result')
    } catch {
      setError('Something went wrong. Please try again.')
      setStep('error')
    }
  }, [address])

  const submit = useCallback(async () => {
    if (!form.name || !form.email || !result) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/roof-size-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, address: result.formattedAddress, sqft: result.sqft, squares: result.squares, pitch: result.pitch }),
      })
      if (r.ok) setStep('captured')
      else setError('Could not submit. Please try again.')
    } catch {
      setError('Could not submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [form, result])

  // Estimated replacement cost (Florida avg: $350–$500/square for asphalt shingle)
  function costRange(squares: number) {
    const low  = Math.round(squares * 350 / 100) * 100
    const high = Math.round(squares * 500 / 100) * 100
    return `$${low.toLocaleString()}–$${high.toLocaleString()}`
  }

  // Map thumbnail URL
  const mapThumb = result
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${result.lat},${result.lng}&zoom=20&size=640x320&maptype=satellite&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''}`
    : null

  return (
    <div style={{ minHeight: '100vh', background: LIGHT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{ background: NAVY, padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://proguild.ai" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, background: TEAL, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>ProGuild</span>
        </a>
        <a href="https://proguild.ai" style={{ color: '#5EEAD4', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>Are you a roofer? Get leads →</a>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E0F2F1', color: TEAL, borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            Free • Instant • No sign-up required
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: NAVY, margin: '0 0 12px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            Free Roof Size Calculator
          </h1>
          <p style={{ fontSize: 18, color: '#475569', margin: 0, lineHeight: 1.5 }}>
            Enter your address and get an instant roof measurement.<br />
            <strong style={{ color: NAVY }}>No drawing, no ladder, no measuring tape required.</strong>
          </p>
        </div>

        {/* Input step */}
        {(step === 'input' || step === 'error') && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)' }}>
            <label style={{ display: 'block', fontWeight: 600, color: NAVY, marginBottom: 8, fontSize: 15 }}>
              Your property address
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="123 Main St, Orlando, FL 32801"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && calculate()}
                style={{
                  flex: 1, padding: '14px 16px', fontSize: 16, borderRadius: 10,
                  border: '1.5px solid #CBD5E1', outline: 'none', color: NAVY,
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={calculate}
                disabled={!address.trim()}
                style={{
                  padding: '14px 22px', background: address.trim() ? TEAL : '#94A3B8',
                  color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
                  fontSize: 15, cursor: address.trim() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}>
                Calculate →
              </button>
            </div>
            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, fontSize: 14 }}>
                {error}
              </div>
            )}
            <p style={{ margin: '16px 0 0', fontSize: 13, color: '#94A3B8' }}>
              Powered by satellite imagery. Accuracy typically within 5–10% of actual measurements.
            </p>
          </div>
        )}

        {/* Loading step */}
        {step === 'loading' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ width: 48, height: 48, border: `3px solid #E2E8F0`, borderTopColor: TEAL, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <p style={{ color: '#475569', fontSize: 16, margin: 0 }}>Analyzing satellite imagery…</p>
            <p style={{ color: '#94A3B8', fontSize: 13, margin: '4px 0 0' }}>{address}</p>
          </div>
        )}

        {/* Result step */}
        {step === 'result' && result && (
          <div>
            {/* Satellite map */}
            {mapThumb && (
              <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mapThumb} alt={`Satellite view of ${result.formattedAddress}`} style={{ width: '100%', display: 'block' }} />
              </div>
            )}

            {/* Address */}
            <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 16px', textAlign: 'center' }}>
              📍 {result.formattedAddress}
            </p>

            {/* Result cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Square footage', value: result.sqft.toLocaleString(), unit: 'sq ft' },
                { label: 'Roofing squares', value: result.squares.toString(), unit: 'squares' },
                { label: 'Dominant pitch', value: result.pitch, unit: '' },
              ].map(({ label, value, unit }) => (
                <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '20px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: TEAL, letterSpacing: '-0.02em' }}>{value}</div>
                  {unit && <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>{unit}</div>}
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
            {/* Estimated replacement cost — full width, prominent */}
            <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 12, padding: '18px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: '#166534', fontWeight: 600, marginBottom: 2 }}>Estimated roof replacement cost</div>
                <div style={{ fontSize: 11, color: '#4ADE80' }}>Florida asphalt shingle · estimate only</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#15803D', letterSpacing: '-0.02em' }}>{costRange(result.squares)}</div>
                <div style={{ fontSize: 11, color: '#166534' }}>Actual quotes may vary significantly</div>
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: '#92400E' }}>
              ⚠️ Estimated from satellite imagery{result.imageryDate ? ` (${result.imageryDate})` : ''}. Actual measurements may vary by 5–10%. For insurance or permit purposes, a licensed contractor should verify on-site.
            </div>

            {/* CTA — get quotes */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
                Get up to 3 free quotes from licensed Florida roofers
              </h2>
              <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 20px' }}>
                Compare estimates from verified local contractors. No obligation, no spam.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="text" placeholder="Your name *"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ padding: '12px 14px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 15, fontFamily: 'inherit', color: NAVY }} />
                <input
                  type="email" placeholder="Email address *"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ padding: '12px 14px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 15, fontFamily: 'inherit', color: NAVY }} />
                <input
                  type="tel" placeholder="Phone number (optional)"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ padding: '12px 14px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 15, fontFamily: 'inherit', color: NAVY }} />
                <button
                  onClick={submit}
                  disabled={!form.name || !form.email || submitting}
                  style={{
                    padding: '14px', background: (!form.name || !form.email || submitting) ? '#94A3B8' : TEAL,
                    color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
                    fontSize: 16, cursor: (!form.name || !form.email || submitting) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                  {submitting ? 'Submitting…' : 'Get My Free Quote →'}
                </button>
                {error && <p style={{ color: '#DC2626', fontSize: 13, margin: 0 }}>{error}</p>}
              </div>
            </div>

            <button
              onClick={() => { setStep('input'); setResult(null); setError('') }}
              style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
              ← Calculate a different address
            </button>
          </div>
        )}

        {/* Success / captured step */}
        {step === 'captured' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ width: 56, height: 56, background: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>You're all set!</h2>
            <p style={{ color: '#475569', fontSize: 16, margin: '0 0 24px', lineHeight: 1.5 }}>
              A licensed Florida roofer will reach out to you shortly with a free quote based on your <strong>{result?.sqft.toLocaleString()} sq ft</strong> roof.
            </p>
            {result && (
              <div style={{ background: LIGHT, borderRadius: 10, padding: '14px 20px', display: 'inline-block', marginBottom: 24, textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>Your roof: <strong style={{ color: NAVY }}>{result.sqft.toLocaleString()} sq ft · {result.squares} squares · {result.pitch} pitch</strong></p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>📍 {result.formattedAddress}</p>
              </div>
            )}
            <button
              onClick={() => { setStep('input'); setResult(null); setAddress(''); setForm({ name: '', email: '', phone: '' }) }}
              style={{ background: 'none', border: `1.5px solid ${TEAL}`, color: TEAL, borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Measure another address
            </button>
          </div>
        )}

        {/* How it works */}
        {step === 'input' && (
          <div style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 24 }}>How it works</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { icon: '📍', title: 'Enter your address', desc: 'Type in your home address and select it from the dropdown.' },
                { icon: '🛰️', title: 'Satellite analysis', desc: 'We analyze satellite imagery to calculate your roof area automatically.' },
                { icon: '📐', title: 'Get instant results', desc: 'See your roof size in square feet, roofing squares, and pitch — in seconds.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{ background: '#fff', borderRadius: 12, padding: 20, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 14, marginBottom: 6 }}>{title}</div>
                  <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* FAQ — good for SEO */}
            <div style={{ marginTop: 48 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 20 }}>Frequently asked questions</h2>
              {[
                { q: 'How accurate is the roof size calculator?', a: 'Our calculator uses satellite imagery analysis and is typically accurate within 5–10% of the actual roof area. For insurance claims, permits, or contractor estimates, we recommend having a licensed roofer verify the measurements on-site.' },
                { q: 'What is a roofing square?', a: 'A roofing square is a unit used by contractors. One square equals 100 square feet of roof area. If your roof is 2,000 sq ft, it is 20 squares. Contractors use squares to estimate materials and labor costs.' },
                { q: 'What does roof pitch mean?', a: 'Roof pitch (or slope) describes how steep your roof is. It is expressed as rise over run — for example, 4/12 means the roof rises 4 inches for every 12 inches of horizontal distance. Steeper roofs cost more to install and replace.' },
                { q: 'Does this work for all roof types?', a: 'Yes — the calculator works for gable, hip, flat, and most other residential roof types. Complex roofs with many facets, dormers, or additions may have slightly lower accuracy.' },
                { q: 'Is this tool free?', a: 'Yes, completely free. No sign-up or account required. Just enter your address and get your results instantly.' },
                { q: 'Can I measure my roof without climbing it?', a: 'Yes — that is exactly what this tool does. Using satellite imagery, we calculate your roof size from above. No ladder, no drone, no contractor visit required to get an estimate.' },
                { q: 'How many roofing squares does my house have?', a: 'One roofing square equals 100 square feet of roof area. Enter your address above and we will calculate your exact square count instantly. A typical Florida home has between 15 and 40 squares.' },
                { q: 'Can insurance companies use satellite roof measurements?', a: 'Many insurance companies and adjusters use satellite measurement tools for initial estimates. However, for final claims settlements, a licensed contractor or adjuster will typically verify measurements on-site.' },
                { q: 'Does this work for tile roofs common in Florida?', a: 'Yes. The calculator measures roof area regardless of roofing material — asphalt shingle, concrete tile, clay tile, or metal. Note that tile roofs cost more to replace per square than asphalt, so the cost estimate on this page reflects asphalt shingle pricing.' },
                { q: 'Does this work after a hurricane or storm?', a: 'Yes, though accuracy may be slightly lower if the satellite imagery predates recent storm damage. The imagery date is shown with your results. For post-storm damage assessments, a licensed roofing contractor or public adjuster should inspect in person.' },
                { q: 'Is my address or personal information stored?', a: 'Your address is used only to retrieve roof measurements from satellite imagery. If you choose to request quotes, your contact information is shared only with licensed Florida roofing contractors through ProGuild. We do not sell your data.' },
              ].map(({ q, a }) => (
                <details key={q} style={{ borderBottom: '1px solid #E2E8F0', padding: '16px 0' }}>
                  <summary style={{ fontWeight: 600, color: NAVY, cursor: 'pointer', fontSize: 15, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {q} <span style={{ color: '#94A3B8', fontSize: 18 }}>+</span>
                  </summary>
                  <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>{a}</p>
                </details>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      {/* Contractor CTA footer */}
      <div style={{ background: '#0F172A', borderTop: '1px solid #1E293B', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ color: '#94A3B8', fontSize: 15, margin: '0 0 12px', fontWeight: 500 }}>
          Are you a licensed Florida roofing contractor?
        </p>
        <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 16px' }}>
          Join ProGuild and receive homeowner leads directly. No per-lead fees.
        </p>
        <a href="https://proguild.ai" style={{ display: 'inline-block', background: TEAL, color: '#fff', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          Join ProGuild — It's Free →
        </a>
      </div>
      <footer style={{ background: NAVY, padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#334155', fontSize: 12, margin: 0 }}>
          © {new Date().getFullYear()} ProGuild LLC · <a href="https://proguild.ai" style={{ color: '#475569', textDecoration: 'none' }}>proguild.ai</a>
          {' · '}
          <a href="https://proguild.ai/privacy" style={{ color: '#475569', textDecoration: 'none' }}>Privacy</a>
        </p>
      </footer>
    </div>
  )
}
