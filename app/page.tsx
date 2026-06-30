'use client'
import { useState } from 'react'

const TRADES = [
  { icon: '🏠', label: 'Roofing' },
  { icon: '❄️', label: 'HVAC' },
  { icon: '⚡', label: 'Electrician' },
  { icon: '🪠', label: 'Plumber' },
  { icon: '🏗️', label: 'General Contractor' },
  { icon: '🏊', label: 'Pool & Spa' },
  { icon: '🎨', label: 'Painter' },
  { icon: '🪟', label: 'Impact Windows' },
  { icon: '☀️', label: 'Solar' },
  { icon: '🌿', label: 'Landscaper' },
  { icon: '🐛', label: 'Pest Control' },
  { icon: '🪚', label: 'Carpenter' },
]

export default function ComingSoonPage() {
  const [email,   setEmail]   = useState('')
  const [role,    setRole]    = useState<'homeowner' | 'contractor'>('homeowner')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit() {
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address.'); return }
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      if (r.ok) { setDone(true) }
      else { const d = await r.json(); setError(d.error || 'Something went wrong.') }
    } catch { setError('Something went wrong — try again.') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px 60px' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 52 }}>
        <div style={{ width: 36, height: 36, background: '#0F766E', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'white', letterSpacing: '-0.3px' }}>
          ProGuild<span style={{ color: '#14B8A6' }}>.ai</span>
        </span>
      </div>

      <div style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', color: '#5EEAD4', fontSize: 11, fontWeight: 600, padding: '5px 16px', borderRadius: 100, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 28 }}>
        Launching 2026
      </div>

      <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)', fontWeight: 700, color: 'white', textAlign: 'center', lineHeight: 1.15, letterSpacing: '-1px', marginBottom: 18, maxWidth: 580, fontFamily: "'DM Serif Display', serif" }}>
        Hire a licensed contractor<br />
        <span style={{ color: '#14B8A6' }}>you can actually verify.</span>
      </h1>

      <p style={{ fontSize: 17, color: '#94A3B8', textAlign: 'center', lineHeight: 1.65, maxWidth: 440, marginBottom: 10 }}>
        Every contractor on ProGuild is verified against official state licensing databases. Zero per-lead fees. Direct contact.
      </p>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 36, textAlign: 'center' }}>
        United States &mdash; Starting in Florida &amp; California
      </p>

      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 420, marginBottom: 52 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'white', marginBottom: 6 }}>You are on the list!</div>
            <div style={{ fontSize: 14, color: '#64748B' }}>We will email you the moment ProGuild launches in your area.</div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>Get early access</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {([{ value: 'homeowner' as const, label: '🏠 I need a contractor' }, { value: 'contractor' as const, label: '🔧 I am a contractor' }]).map(opt => (
                <button key={opt.value} onClick={() => setRole(opt.value)} style={{ flex: 1, padding: '9px 8px', borderRadius: 10, border: role === opt.value ? '1.5px solid #14B8A6' : '1px solid rgba(255,255,255,0.1)', background: role === opt.value ? 'rgba(20,184,166,0.1)' : 'transparent', color: role === opt.value ? '#5EEAD4' : '#64748B', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="your@email.com"
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: 'white', fontSize: 14, outline: 'none', marginBottom: error ? 8 : 12, boxSizing: 'border-box' }} />
            {error && <p style={{ fontSize: 12, color: '#F87171', marginBottom: 10 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', background: loading ? 'rgba(15,118,110,0.5)' : 'linear-gradient(135deg, #0F766E, #0D9488)', color: 'white', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
              {loading ? 'Saving...' : 'Notify me at launch \u2192'}
            </button>
            <p style={{ fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 10 }}>No spam. Unsubscribe anytime.</p>
          </>
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 480, borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 28 }} />
      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 16 }}>Trades we cover</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: '100%', maxWidth: 480, marginBottom: 44 }}>
        {TRADES.map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
            <div style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 500, lineHeight: 1.3 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 36, marginBottom: 44, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[{ num: '$0', label: 'Per-lead fees, ever' }, { num: 'DBPR', label: 'License verified' }, { num: '1:1', label: 'Direct pro contact' }].map(s => (
          <div key={s.num} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'white', fontFamily: "'DM Serif Display', serif" }}>{s.num}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', lineHeight: 1.7 }}>
        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>&copy; 2026 ProGuild LLC &mdash; Your Craft. Your Guild.</p>
        <p style={{ fontSize: 12, color: '#475569', margin: '4px 0 0' }}>
          ProGuild.ai is operated by ProGuild LLC.{' '}
          <a href="mailto:contact@proguild.ai" style={{ color: '#5EEAD4', textDecoration: 'none' }}>contact@proguild.ai</a>
        </p>
      </div>
    </div>
  )
}
