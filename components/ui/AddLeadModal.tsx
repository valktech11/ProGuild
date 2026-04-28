'use client'
import { useState } from 'react'

const SOURCES = [
  { value: 'Phone_Call', label: 'Phone call' },
  { value: 'Facebook',   label: 'Facebook' },
  { value: 'Instagram',  label: 'Instagram' },
  { value: 'Referral',   label: 'Referral' },
  { value: 'Website',    label: 'My website' },
  { value: 'Yard_Sign',  label: 'Yard sign' },
  { value: 'Walk_In',    label: 'Walk-in' },
  { value: 'Other',      label: 'Other' },
]

// Proper SVG icons for lead sources
function SourceIcon({ value }: { value: string }) {
  const cls = "w-4 h-4 flex-shrink-0"
  if (value === 'Facebook') return (
    <svg className={cls} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  )
  if (value === 'Instagram') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none"><defs><radialGradient id="ig1" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="5%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="5" fill="url(#ig1)"/><path d="M12 7a5 5 0 100 10A5 5 0 0012 7zm0 8.2A3.2 3.2 0 1112 8.8a3.2 3.2 0 010 6.4zM17.2 6.4a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" fill="white"/></svg>
  )
  if (value === 'Phone_Call') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
  )
  if (value === 'Referral') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  )
  if (value === 'Website') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
  )
  if (value === 'Yard_Sign') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="12" rx="2"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
  )
  if (value === 'Walk_In') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="4" r="2"/><path d="M12 6v6l-3 3M12 12l3 3M9 17l-1 4M15 17l1 4"/></svg>
  )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  )
}

interface AddLeadModalProps {
  proId: string
  onClose: () => void
  onAdded: (lead: any) => void
}

export default function AddLeadModal({ proId, onClose, onAdded }: AddLeadModalProps) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [email,   setEmail]   = useState('')
  const [need,    setNeed]    = useState('')
  const [source,  setSource]  = useState('Phone_Call')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function save() {
    if (!name.trim())        { setErr('Name is required'); return }
    if (!phone.trim() && !email.trim()) { setErr('Phone or email is required'); return }
    if (!need.trim())        { setErr('Describe what they need'); return }

    setSaving(true); setErr('')
    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id:        proId,
        contact_name:  name.trim(),
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        message:       need.trim(),
        lead_source:   source,
        is_manual:     true,
        lead_status:   'New',
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) { onAdded(d.lead); onClose() }
    else setErr(d.error || 'Failed to save lead')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-[#0A1628]">Add a lead</h2>
            <p className="text-sm text-gray-400 mt-0.5">Log a lead from any source</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Source selector */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Where did this lead come from?</p>
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map(s => (
                <button key={s.value} onClick={() => setSource(s.value)}
                  className="py-2.5 px-3 rounded-xl text-[12.5px] font-semibold border-2 text-left transition-all flex items-center gap-2"
                  style={source === s.value
                    ? { background: '#F0FDFA', borderColor: '#0F766E', color: '#0F766E' }
                    : { background: 'white', borderColor: '#E8E2D9', color: '#6B7280' }}>
                  <SourceIcon value={s.value} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact name */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Contact name *</p>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="John Smith"
              className="w-full px-4 py-3 text-sm border-2 border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
              onFocus={e => e.target.style.borderColor = '#0F766E'}
              onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
          </div>

          {/* Phone */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Phone number</p>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^\d\s\-\(\)\+]/g, ''))}
              placeholder="(555) 555-5555"
              type="tel"
              inputMode="numeric"
              maxLength={15}
              className="w-full px-4 py-3 text-sm border-2 border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
              onFocus={e => e.target.style.borderColor = '#0F766E'}
              onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
          </div>

          {/* Email */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Email (optional)</p>
            <input value={email} onChange={e => setEmail(e.target.value)}
              placeholder="john@example.com"
              type="email"
              className="w-full px-4 py-3 text-sm border-2 border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
              onFocus={e => e.target.style.borderColor = '#0F766E'}
              onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
          </div>

          {/* What they need */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">What do they need? *</p>
            <textarea value={need} onChange={e => setNeed(e.target.value)}
              placeholder="Full interior repaint, 3-bed house, wants it done before Christmas..."
              rows={3}
              className="w-full px-4 py-3 text-sm border-2 border-[#E8E2D9] rounded-xl outline-none resize-none text-[#0A1628]"
              onFocus={e => e.target.style.borderColor = '#0F766E'}
              onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
              {saving ? 'Saving...' : 'Add to pipeline →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
