'use client'
import { theme, T } from '@/lib/tokens'
import { capName } from '@/lib/utils'
import { useState, useRef } from 'react'
import { getTradeConfig, getTradeLabels } from '@/lib/trades/_registry'
import { usePlacesAutocomplete } from '@/lib/hooks/usePlacesAutocomplete'

// ── Constants ─────────────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const TEAL_L = '#14B8A6'
const NAVY   = '#0A1628'
const BORDER = '#E2E8F0'

const SOURCES = [
  { value: 'Phone_Call', label: 'Phone Call',  color: '#0F766E', bg: '#F0FDFA' },
  { value: 'Facebook',   label: 'Facebook',    color: '#1877F2', bg: '#EFF6FF' },
  { value: 'Instagram',  label: 'Instagram',   color: '#E1306C', bg: '#FFF1F2' },
  { value: 'Referral',   label: 'Referral',    color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'Website',    label: 'My Website',  color: '#2563EB', bg: '#EFF6FF' },
  { value: 'Yard_Sign',  label: 'Yard Sign',   color: '#B45309', bg: '#FFFBEB' },
  { value: 'Walk_In',    label: 'Walk-in',     color: '#059669', bg: '#ECFDF5' },
  { value: 'Other',      label: 'Other',       color: '#6B7280', bg: '#F9FAFB' },
]

// ── Source icon SVGs ──────────────────────────────────────────────────────────
function SourceIcon({ value, size = 18 }: { value: string; size?: number }) {
  const s = size
  if (value === 'Facebook') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  )
  if (value === 'Instagram') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><defs><radialGradient id="ig1" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="5" fill="url(#ig1)"/><path d="M12 7a5 5 0 100 10A5 5 0 0012 7zm0 8.2A3.2 3.2 0 1112 8.8a3.2 3.2 0 010 6.4zM17.2 6.4a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" fill="white"/></svg>
  )
  if (value === 'Phone_Call') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
  )
  if (value === 'Referral') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  )
  if (value === 'Website') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
  )
  if (value === 'Yard_Sign') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="12" rx="2"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
  )
  if (value === 'Walk_In') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="4" r="2"/><path d="M12 6v6l-3 3M12 12l3 3M9 17l-1 4M15 17l1 4"/></svg>
  )
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}-${d.slice(3)}`
  return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
}
function sanitize(v: string) { return v.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g,'').trimStart() }
function getScopePlaceholder(tradeSlug?: string) {
  const labels = getTradeLabels(tradeSlug)
  if ((labels as any).scopePlaceholder) return (labels as any).scopePlaceholder
  return 'Describe what needs to be done, size of job, any urgency...'
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
        {hint && <span style={{ color: '#94A3B8', fontWeight: 500, textTransform: 'none' as const, letterSpacing: 0, marginLeft: 5 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative' as const }}>
      {icon && <div style={{ position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' as const, color: focused ? TEAL : '#94A3B8', transition: 'color 0.15s' }}>{icon}</div>}
      <input
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e => { setFocused(false); props.onBlur?.(e) }}
        style={{
          width: '100%', boxSizing: 'border-box' as const,
          padding: icon ? '10px 14px 10px 38px' : '10px 14px',
          border: `1.5px solid ${focused ? TEAL : BORDER}`,
          borderRadius: 10, fontSize: 14, outline: 'none',
          background: focused ? '#fff' : '#FAFBFC',
          color: NAVY,
          boxShadow: focused ? `0 0 0 3px rgba(15,118,110,0.1)` : 'none',
          transition: 'all 0.15s',
          ...props.style,
        }}
      />
    </div>
  )
}

function Textarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e) }}
      onBlur={e => { setFocused(false); props.onBlur?.(e) }}
      style={{
        width: '100%', boxSizing: 'border-box' as const,
        padding: '10px 14px',
        border: `1.5px solid ${focused ? TEAL : BORDER}`,
        borderRadius: 10, fontSize: 14, outline: 'none', resize: 'none' as const,
        background: focused ? '#fff' : '#FAFBFC',
        color: NAVY,
        boxShadow: focused ? `0 0 0 3px rgba(15,118,110,0.1)` : 'none',
        transition: 'all 0.15s',
        ...props.style,
      }}
    />
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({ n, label, sub }: { n: string; label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${TEAL}, ${TEAL_L})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
        {n}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, letterSpacing: '-0.01em' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface AddLeadModalProps {
  proId: string
  tradeSlug?: string
  onClose: () => void
  onAdded: (lead: any) => void
  dk?: boolean
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AddLeadModal({ proId, tradeSlug, onClose, onAdded, dk = false }: AddLeadModalProps) {
  const t = theme(dk)
  const scopePlaceholder = getScopePlaceholder(tradeSlug)

  const [name,      setName]      = useState('')
  const [phone,     setPhone]     = useState('')
  const [email,     setEmail]     = useState('')
  const [need,      setNeed]      = useState('')
  const [source,    setSource]    = useState('Phone_Call')
  const [street,    setStreet]    = useState('')
  const [city,      setCity]      = useState('')
  const [addrState, setAddrState] = useState('')
  const [zip,       setZip]       = useState('')
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')

  const streetRef = useRef<HTMLInputElement>(null)
  usePlacesAutocomplete(streetRef, (formatted: string) => {
    const zipMatch   = formatted.match(/\b(\d{5})\b/)
    const stateMatch = formatted.match(/,\s*([A-Z]{2})\s+\d{5}/)
    const parts      = formatted.replace(', USA', '').split(', ')
    if (parts.length >= 1) setStreet(parts[0] || '')
    if (parts.length >= 2) setCity(parts[1] || '')
    if (stateMatch)        setAddrState(stateMatch[1])
    if (zipMatch)          setZip(zipMatch[1])
  })

  async function save() {
    if (!name.trim())                       { setErr('Contact name is required'); return }
    if (!phone.trim() && !email.trim())     { setErr('Phone or email is required'); return }
    if (!need.trim())                       { setErr('Describe what they need'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id:           proId,
        contact_name:     name.trim(),
        contact_phone:    phone.trim() || null,
        contact_email:    email.trim() || null,
        property_address: street.trim() || null,
        contact_city:     city.trim() || null,
        contact_state:    addrState.trim() || null,
        contact_zip:      zip.trim() || null,
        message:          need.trim(),
        lead_source:      source,
        is_manual:        true,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) { onAdded(d.lead); onClose() }
    else setErr(d.error || 'Failed to save lead')
  }

  const activeSource = SOURCES.find(s => s.value === source)!

  return (
    // ── Backdrop ──────────────────────────────────────────────────────────────
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>

      {/* ── Modal shell — wide, fixed height ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 780,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 20,
          boxShadow: '0 24px 80px rgba(10,22,40,0.25), 0 4px 16px rgba(10,22,40,0.1)',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>

        {/* ── Fixed header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 18px', borderBottom: '1px solid #F1F5F9', flexShrink: 0, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Gradient icon */}
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${TEAL}, ${TEAL_L})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px rgba(15,118,110,0.35)` }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: 0, letterSpacing: '-0.02em' }}>Log New Lead</h2>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, marginTop: 2 }}>Capture every opportunity — takes 30 seconds</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '24px 28px' }}>

          {/* ── SECTION 1: Lead source ── */}
          <SectionHead n="1" label="Lead Source" sub="Where did this customer come from?" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 28 }}>
            {SOURCES.map(s => {
              const active = source === s.value
              return (
                <button key={s.value} onClick={() => setSource(s.value)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '14px 10px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${active ? s.color : BORDER}`,
                  background: active ? s.bg : '#FAFBFC',
                  transition: 'all 0.15s', position: 'relative',
                  boxShadow: active ? `0 2px 8px ${s.color}25` : 'none',
                }}>
                  {active && (
                    <div style={{ position: 'absolute', top: 7, right: 7, width: 16, height: 16, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                  <SourceIcon value={s.value} size={20} />
                  <span style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? s.color : '#64748B', lineHeight: 1.2, textAlign: 'center' }}>{s.label}</span>
                </button>
              )
            })}
          </div>

          {/* ── SECTION 2: Contact details ── */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 24, marginBottom: 24 }}>
            <SectionHead n="2" label="Contact Details" sub="Who is the homeowner?" />

            {/* Two-col: name + phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Full name" required>
                <Input
                  value={name} onChange={e => setName(sanitize(e.target.value))}
                  placeholder="Jane Smith"
                  icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                />
              </Field>
              <Field label="Phone number" required>
                <Input
                  value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="813-555-0100" type="tel" inputMode="numeric" maxLength={12}
                  icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
                />
              </Field>
            </div>

            {/* Email */}
            <Field label="Email" hint="(optional)">
              <Input
                value={email} onChange={e => setEmail(sanitize(e.target.value))}
                onBlur={e => setEmail(e.target.value.trim().toLowerCase())}
                placeholder="jane@example.com" type="email"
                icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
              />
            </Field>
          </div>

          {/* ── SECTION 3: Property + Job ── */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 24 }}>
            <SectionHead n="3" label="Property & Job Details" sub="Where is the job and what do they need?" />

            {/* Two-col: address + scope */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Left col: address */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Street address" hint="(optional — autocomplete enabled)">
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94A3B8' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <input
                      ref={streetRef}
                      value={street} onChange={e => setStreet(e.target.value)}
                      placeholder="3919 Highgate Court"
                      autoComplete="off"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, outline: 'none', background: '#FAFBFC', color: NAVY, transition: 'all 0.15s' }}
                      onFocus={e => { e.target.style.borderColor = TEAL; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(15,118,110,0.1)' }}
                      onBlur={e => { e.target.style.borderColor = BORDER; e.target.style.background = '#FAFBFC'; e.target.style.boxShadow = 'none' }}
                    />
                  </div>
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 68px 84px', gap: 8 }}>
                  <Field label="City">
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Jacksonville" />
                  </Field>
                  <Field label="State">
                    <select value={addrState} onChange={e => setAddrState(e.target.value)}
                      style={{ width: '100%', padding: '10px 8px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 13, outline: 'none', background: '#FAFBFC', color: NAVY, cursor: 'pointer' }}
                      onFocus={e => { e.target.style.borderColor = TEAL; e.target.style.boxShadow = '0 0 0 3px rgba(15,118,110,0.1)' }}
                      onBlur={e => { e.target.style.borderColor = BORDER; e.target.style.boxShadow = 'none' }}>
                      <option value="">ST</option>
                      {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ZIP">
                    <Input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="32216" maxLength={5} inputMode="numeric" />
                  </Field>
                </div>
              </div>

              {/* Right col: scope */}
              <Field label="What do they need?" required>
                <div style={{ position: 'relative', height: '100%' }}>
                  <Textarea
                    value={need} onChange={e => setNeed(sanitize(e.target.value))}
                    placeholder={scopePlaceholder}
                    rows={5} maxLength={250}
                    style={{ height: '100%', minHeight: 120 }}
                  />
                  <span style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: need.length > 220 ? '#EF4444' : '#94A3B8' }}>{need.length}/250</span>
                </div>
              </Field>
            </div>
          </div>

          {/* Error */}
          {err && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', marginTop: 20 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{err}</span>
            </div>
          )}
        </div>

        {/* ── Fixed footer ──────────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #F1F5F9', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFBFC', flexShrink: 0 }}>
          {/* Left: selected source pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 100, background: activeSource.bg, border: `1px solid ${activeSource.color}30` }}>
              <SourceIcon value={source} size={13} />
              <span style={{ fontSize: 11, fontWeight: 700, color: activeSource.color }}>{activeSource.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>Encrypted & secure</span>
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '10px 22px', borderRadius: 10, background: '#fff', border: `1.5px solid ${BORDER}`, color: '#64748B', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={{
              padding: '10px 28px', borderRadius: 10,
              background: saving ? '#94A3B8' : `linear-gradient(135deg, ${TEAL}, ${TEAL_L})`,
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              boxShadow: saving ? 'none' : `0 4px 14px rgba(15,118,110,0.4)`,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}>
              {saving ? (
                <>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'pg-spin 0.7s linear infinite' }} />
                  Saving…
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Save Lead
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes pg-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
