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
  state: string | null
  serviced: boolean          // true when we have contractors in this state
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
  const [servicedOnSubmit, setServicedOnSubmit] = useState(true)
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
      if (r.ok) {
        const d = await r.json().catch(() => ({ serviced: true }))
        setServicedOnSubmit(d.serviced !== false)
        setStep('captured')
      }
      else setError('Could not submit. Please try again.')
    } catch {
      setError('Could not submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [form, result])

  // Estimated replacement cost — US national range for architectural asphalt
  // shingle, including tear-off, underlayment, disposal and labour. Regional
  // pricing varies significantly; the subtitle says so.
  function costRange(squares: number) {
    const low  = Math.round(squares * 400 / 100) * 100
    const high = Math.round(squares * 550 / 100) * 100
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
            Free • Results in seconds • No sign-up required
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
                placeholder="123 Main St, Springfield, IL 62704"
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
              Measured using high-resolution satellite imagery. Typically accurate within 5–10% of field measurements.
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
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, textAlign: 'center', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              Here&apos;s your instant roof estimate
            </h2>

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

            {/* ── Roof Summary — one card: metrics + cost + plain-English read ── */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)' }}>

              {/* Metrics row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { label: 'Square footage', value: result.sqft.toLocaleString(), unit: 'sq ft' },
                  { label: 'Roofing squares', value: result.squares.toString(), unit: 'squares' },
                  { label: 'Dominant pitch', value: result.pitch, unit: '' },
                ].map(({ label, value, unit }, i) => (
                  <div key={label} style={{ padding: '22px 16px', textAlign: 'center', borderLeft: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: TEAL, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
                    {unit && <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>{unit}</div>}
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Cost band — the number people are really looking for */}
              <div style={{ background: '#F0FDF4', borderTop: '1px solid #DCFCE7', borderBottom: '1px solid #DCFCE7', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#166534', fontWeight: 700, marginBottom: 2 }}>Estimated roof replacement cost</div>
                  <div style={{ fontSize: 11, color: '#16A34A' }}>Typical installed cost (architectural shingles)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 34, fontWeight: 800, color: '#15803D', letterSpacing: '-0.025em', lineHeight: 1.05 }}>{costRange(result.squares)}</div>
                  <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>Actual quotes may vary significantly</div>
                </div>
              </div>

              {/* Plain-English read — keyword-rich body copy, inside the same card */}
              <div style={{ padding: '18px 24px' }}>
                <p style={{ margin: 0, fontSize: 15, color: '#334155', lineHeight: 1.65 }}>
                  Your roof is approximately <strong style={{ color: NAVY }}>{result.sqft.toLocaleString()} square feet</strong> — about{' '}
                  <strong style={{ color: NAVY }}>{result.squares} roofing squares</strong> at a{' '}
                  <strong style={{ color: NAVY }}>{result.pitch}</strong> pitch. A roof this size typically needs around{' '}
                  <strong style={{ color: NAVY }}>{Math.ceil(result.squares * 3 * 1.1)} bundles</strong> of asphalt shingles
                  (including a 10% waste factor), and most crews complete a replacement in{' '}
                  <strong style={{ color: NAVY }}>{result.squares <= 20 ? '1–2 days' : result.squares <= 35 ? '2–3 days' : '3–5 days'}</strong>.
                </p>
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: '#92400E' }}>
              ⚠️ Estimated from satellite imagery{result.imageryDate ? ` (${result.imageryDate})` : ''}. Actual measurements may vary by 5–10%. For insurance or permit purposes, a licensed contractor should verify on-site.
            </div>

            {/* CTA — get quotes */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
                Get up to 3 free quotes from licensed roofers
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
                  {submitting ? 'Submitting…' : 'Get 3 Free Quotes →'}
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
            <h2 style={{ fontSize: 24, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
              {servicedOnSubmit ? "You're all set!" : "Thanks — you're on the list"}
            </h2>
            <p style={{ color: '#475569', fontSize: 16, margin: '0 0 24px', lineHeight: 1.5 }}>
              {servicedOnSubmit ? (
                <>A licensed roofer will reach out to you shortly with a free quote based on your <strong>{result?.sqft.toLocaleString()} sq ft</strong> roof.</>
              ) : (
                <>We don&apos;t have contractors in your area just yet — we&apos;re expanding fast. We&apos;ve saved your roof measurement and will notify you the moment licensed roofers are available near you.</>
              )}
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


            {/* ── SEO content section — ~800 words of genuinely useful copy ──── */}
            <div style={{ marginTop: 56, background: '#fff', borderRadius: 16, padding: '32px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Understanding your roof size
              </h2>
              <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 24px' }}>
                Everything a homeowner needs to know before getting a roof replacement quote.
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                How roof measurement works from satellite imagery
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 20px' }}>
                Traditional roof measurement means someone climbs a ladder with a tape measure, or a contractor sends a drone
                over your property. Satellite roof measurement replaces both. High-resolution aerial imagery is analysed to
                identify the roof outline, the individual roof planes (called facets), and the angle of each plane. From that,
                the total roof area is calculated in square feet. Because the imagery is taken from directly overhead, the
                measurement accounts for the actual sloped surface area — not just the flat footprint of the house. A steep
                roof has considerably more surface area than the ground floor beneath it, and that difference matters when a
                contractor is ordering materials.
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                Roof square footage vs. roofing squares
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
                Homeowners think in square feet. Roofing contractors think in squares. <strong>One roofing square equals 100
                square feet</strong> of roof area, and every quote, material order, and labour estimate in the industry is
                priced per square. If your roof measures 2,200 square feet, a contractor will call that a 22-square roof.
                Most single-family homes fall between 15 and 40 squares.
              </p>
              <div style={{ background: '#EFF6FF', borderLeft: `3px solid #3B82F6`, borderRadius: 6, padding: '12px 16px', margin: '0 0 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#1E3A8A', lineHeight: 1.6 }}>
                  <strong>Why this matters:</strong> knowing your square count before you call anyone lets you sanity-check a
                  quote instantly. If a contractor says your roof is 40 squares and this tool says 22, that discrepancy is
                  worth a conversation.
                </p>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                What roof pitch means and why it changes the price
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 20px' }}>
                Roof pitch describes steepness as a ratio of rise over run. A 4/12 pitch rises four inches for every twelve
                inches of horizontal distance. A 4/12 to 6/12 pitch is considered walkable — a roofer can stand on it
                comfortably. Anything above 8/12 requires harnesses, roof jacks, and considerably more time, which is why
                steeper roofs cost more per square to replace even though the material is identical. Pitch also affects the
                total surface area: two houses with the same footprint can have meaningfully different roof areas if one has a
                steeper pitch. That is why a satellite measurement that accounts for pitch is more accurate than simply
                measuring the outline of the house.
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                Estimating materials from your square count
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
                Asphalt shingles are sold in bundles, and <strong>three bundles cover one square</strong>. So a 22-square roof
                needs roughly 66 bundles — plus a waste factor:
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 20, color: '#475569', fontSize: 15, lineHeight: 1.8 }}>
                <li><strong>10% waste</strong> — a simple gable roof with few cuts</li>
                <li><strong>15% waste</strong> — a complex roof with many hips, valleys, and dormers</li>
              </ul>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 20px' }}>
                Waste accounts for cuts, starter strips, and ridge caps. Beyond shingles, a replacement also needs underlayment,
                drip edge, ridge vent, and fasteners — all of which scale with square count. Knowing your squares gives you a
                defensible basis for reviewing the material line item on any quote.
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                What a roof replacement typically costs
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
                Typical national cost per square, including tear-off, disposal, underlayment, and labour:
              </p>
              <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: '#475569', fontSize: 15, lineHeight: 1.8 }}>
                <li><strong>Architectural asphalt shingle</strong> — $400 to $550 per square</li>
                <li><strong>Metal</strong> — roughly $600 to $900 per square</li>
                <li><strong>Concrete or clay tile</strong> — often $700 to $1,200 per square</li>
              </ul>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
                Regional variation is significant, driven by three things: local labour rates, disposal costs, and building code.
                Coastal and high-wind regions require enhanced fastening schedules, secondary water barriers, and wind-uplift
                ratings that push costs well above the national average. Cold-climate regions add ice-and-water shield
                requirements along eaves and valleys. Permit fees and inspection regimes vary by municipality.
              </p>
              <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', borderRadius: 6, padding: '12px 16px', margin: '0 0 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#92400E', lineHeight: 1.6 }}>
                  <strong>A warning on cheap quotes:</strong> a bid that comes in far below these ranges is worth scrutinising.
                  It often means a code requirement is being skipped — which becomes a failed inspection later, at your expense.
                </p>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                Roof size and your insurance claim
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 20px' }}>
                If you are filing a hurricane or hail claim, roof size is the foundation of the entire settlement. The carrier's
                adjuster measures the roof, applies unit pricing per square, and produces a scope of work. If their measurement
                is low, every downstream number is low too. Homeowners who know their own square count going into an inspection
                are in a much stronger position.
              </p>
              <div style={{ background: '#F0FDF4', borderLeft: `3px solid ${TEAL}`, borderRadius: 6, padding: '12px 16px', margin: '0 0 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#166534', lineHeight: 1.6 }}>
                  <strong>If the adjuster&apos;s number looks low:</strong> a figure materially below an independent measurement is
                  grounds for a supplement request. In most states your policy entitles you to a settlement that restores the
                  roof to code-compliant condition — which frequently costs more than the initial estimate assumes.
                </p>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
                What this tool can and cannot tell you
              </h3>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
                This calculator gives you an accurate estimate of roof area, square count, and dominant pitch from satellite
                imagery — typically within 5 to 10% of a physical measurement. That is more than enough to sanity-check a quote
                or understand the scale of the job.
              </p>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: '0 0 12px' }}>
                What it <strong>cannot</strong> do is assess condition. It cannot see:
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 20, color: '#475569', fontSize: 15, lineHeight: 1.8 }}>
                <li>Whether your shingles are curling, cracked, or losing granules</li>
                <li>Whether the decking beneath is rotted or soft</li>
                <li>Whether flashing has failed around a chimney or valley</li>
                <li>Whether a prior repair was done badly</li>
                <li>Damage that occurred <em>after</em> the imagery was captured — the imagery date is shown with your results</li>
              </ul>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                For a claim, a permit, or a final contract, a licensed contractor still needs to inspect the roof in person.
              </p>
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
                { q: 'How many roofing squares does my house have?', a: 'One roofing square equals 100 square feet of roof area. Enter your address above and we will calculate your square count instantly. Most single-family homes fall between 15 and 40 squares.' },
                { q: 'Can insurance companies use satellite roof measurements?', a: 'Many insurance companies and adjusters use satellite measurement tools for initial estimates. However, for final claims settlements, a licensed contractor or adjuster will typically verify measurements on-site.' },
                { q: 'Does this work for tile or metal roofs?', a: 'Yes. The calculator measures roof area regardless of roofing material — asphalt shingle, concrete tile, clay tile, or metal. Note that tile and metal cost more per square to replace than asphalt, so the cost estimate shown reflects architectural asphalt shingle pricing.' },
                { q: 'Does this work after a hurricane or storm?', a: 'Yes, though accuracy may be slightly lower if the satellite imagery predates recent storm damage. The imagery date is shown with your results. For post-storm damage assessments, a licensed roofing contractor or public adjuster should inspect in person.' },
                { q: 'Is my address or personal information stored?', a: 'Your address is used only to retrieve roof measurements from satellite imagery. If you choose to request quotes, your contact information is shared only with licensed roofing contractors through ProGuild. We do not sell your data.' },
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
          Are you a licensed roofing contractor?
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
