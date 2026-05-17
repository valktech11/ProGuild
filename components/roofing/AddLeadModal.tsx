'use client'
// components/roofing/AddLeadModal.tsx
// Roofing-specific Add Lead modal.
// Different from the generic modal in:
//   - "Homeowner name" not "Contact name"
//   - Property address field (optional — phone calls may not have it yet)
//   - "Describe the damage / scope" not "What do they need?"
//   - Roofing-relevant placeholder copy
//   - Storm canvassing source added
// Never import the generic AddLeadModal here — zero crossover by design.

import { theme } from '@/lib/tokens'
import { useState } from 'react'

// ── Lead sources — roofing specific ───────────────────────────────────────────
// Storm canvassing replaces "Walk-in" as it's the FL-specific equivalent
const SOURCES = [
  { value: 'Phone_Call',    label: 'Phone call' },
  { value: 'Facebook',      label: 'Facebook' },
  { value: 'Instagram',     label: 'Instagram' },
  { value: 'Referral',      label: 'Referral' },
  { value: 'Insurance',     label: 'Insurance' },
  { value: 'Yard_Sign',     label: 'Yard sign' },
  { value: 'Canvassing',    label: 'Canvassing' },
  { value: 'Other',         label: 'Other' },
]

function SourceIcon({ value }: { value: string }) {
  const s = 20
  if (value === 'Facebook') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  )
  if (value === 'Instagram') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><defs><radialGradient id="ig2" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="5" fill="url(#ig2)"/><path d="M12 7a5 5 0 100 10A5 5 0 0012 7zm0 8.2A3.2 3.2 0 1112 8.8a3.2 3.2 0 010 6.4zM17.2 6.4a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" fill="white"/></svg>
  )
  if (value === 'Phone_Call') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
  )
  if (value === 'Referral') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  )
  if (value === 'Insurance') return (
    // Shield icon — insurance claim
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  )
  if (value === 'Yard_Sign') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="12" rx="2"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
  )
  if (value === 'Canvassing') return (
    // Door-to-door / storm canvassing icon
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  )
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  )
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

function sanitize(val: string): string {
  return val.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '').trimStart()
}

interface Props {
  proId: string
  onClose: () => void
  onAdded: (lead: any) => void
  dk?: boolean
}

const TEAL = '#0F766E'
const NAVY = '#0A1628'

export default function RoofingAddLeadModal({ proId, onClose, onAdded, dk = false }: Props) {
  const t = theme(dk)
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [email,   setEmail]   = useState('')
  const [address, setAddress] = useState('')
  const [scope,   setScope]   = useState('')
  const [source,  setSource]  = useState('Phone_Call')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function save() {
    if (!name.trim())  { setErr('Homeowner name is required'); return }
    if (!phone.trim() && !email.trim()) { setErr('Phone or email is required'); return }
    if (!scope.trim()) { setErr('Describe the damage or scope'); return }
    setSaving(true); setErr('')

    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id:           proId,
        contact_name:     name.trim(),
        contact_phone:    phone.trim() || null,
        contact_email:    email.trim() || null,
        property_address: address.trim() || null,
        message:          scope.trim(),
        lead_source:      source,
        is_manual:        true,
        // lead_status intentionally omitted — API sets lead_in from trade config
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) { onAdded(d.lead); onClose() }
    else setErr(d.error || 'Failed to save lead')
  }

  const inputCls = `w-full pl-10 pr-4 py-3 text-[14px] rounded-xl outline-none transition-all bg-white text-gray-900 placeholder-gray-400`
  const inputStyle = { border: '2px solid #CBD5E1' }
  const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = TEAL }
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = '#CBD5E1' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column', background: t.cardBg, color: t.textPri }}>

        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-6 py-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#F0FDFA' }}>
            {/* Roof icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-[18px] font-bold" style={{ color: NAVY }}>Add a roofing lead</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">Log a lead from any source</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl transition-colors">
            ×
          </button>
        </div>

        <div className="border-t border-gray-100" />

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Source picker */}
          <div>
            <p className="text-[14px] font-bold mb-3" style={{ color: NAVY }}>Where did this lead come from?</p>
            <div className="grid grid-cols-3 gap-2">
              {SOURCES.map(s => (
                <button key={s.value} onClick={() => setSource(s.value)}
                  className="relative flex items-center gap-2 px-3 py-3 rounded-xl border transition-all text-left"
                  style={source === s.value
                    ? { background: '#F0FDFA', borderColor: TEAL, borderWidth: 2 }
                    : { background: 'white', borderColor: '#E5E7EB', borderWidth: 1.5 }}>
                  <SourceIcon value={s.value} />
                  <span className="text-[11px] font-semibold leading-tight"
                    style={{ color: source === s.value ? TEAL : '#374151' }}>
                    {s.label}
                  </span>
                  {source === s.value && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: TEAL }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Lead details */}
          <div className="rounded-2xl p-4" style={{ background: dk ? '#0F172A' : '#F8FAFC', border: '1.5px solid #E2E8F0' }}>
            <p className="text-[13px] font-bold mb-4 flex items-center gap-2" style={{ color: NAVY }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
              Job details
            </p>

            {/* Homeowner name + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  Homeowner name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input value={name} onChange={e => setName(sanitize(e.target.value))}
                    placeholder="Jane Rodriguez"
                    className={inputCls} style={inputStyle}
                    onFocus={focusOn} onBlur={focusOff} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">
                  Phone number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                  <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                    placeholder="813-555-0192" type="tel" inputMode="numeric" maxLength={12}
                    className={inputCls} style={inputStyle}
                    onFocus={focusOn} onBlur={focusOff} />
                </div>
              </div>
            </div>

            {/* Property address — roofing specific */}
            <div className="mb-3">
              <label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">
                Property address
                <span className="ml-1.5 text-[10px] font-normal text-gray-400 normal-case tracking-normal">(optional — add later if unknown)</span>
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <input value={address} onChange={e => setAddress(sanitize(e.target.value))}
                  placeholder="3919 Highgate Dr, Tampa, FL 33614"
                  className={inputCls} style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff} />
              </div>
            </div>

            {/* Email */}
            <div className="mb-3">
              <label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">Email (optional)</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <input value={email} onChange={e => setEmail(sanitize(e.target.value))}
                  placeholder="jane@example.com" type="email"
                  className={inputCls} style={inputStyle}
                  onFocus={focusOn}
                  onBlur={e => { setEmail(e.target.value.trim().toLowerCase()); e.target.style.borderColor = '#CBD5E1' }} />
              </div>
            </div>

            {/* Damage / scope — roofing specific */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wide">
                Describe the damage / scope <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-3.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                  <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
                </svg>
                <textarea value={scope} onChange={e => setScope(sanitize(e.target.value))}
                  placeholder="Storm damage to 3 sections, missing shingles, possible leak over garage. Insurance claim. Hail from May 12 storm."
                  rows={3} maxLength={250}
                  className="w-full pl-10 pr-4 py-3 text-[14px] rounded-xl outline-none text-gray-900 placeholder-gray-400 transition-all bg-white resize-none"
                  style={{ border: '2px solid #CBD5E1' }}
                  onFocus={focusOn} onBlur={focusOff} />
                <span className="absolute bottom-2.5 right-3 text-[11px] text-gray-400">{scope.length} / 250</span>
              </div>
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="text-[13px] text-red-600 font-medium">{err}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl text-[14px] font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-3.5 rounded-2xl text-[14px] font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${TEAL}, #0C5F57)` }}>
              {saving ? 'Saving...' : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Save lead
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 pb-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <span className="text-[12px] text-gray-400">Your lead information is secure and private.</span>
          </div>

        </div>
      </div>
    </div>
  )
}
