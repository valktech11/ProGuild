'use client'
import { useState } from 'react'

const SOURCES = [
  { value: 'Phone_Call', label: '📞 Phone call' },
  { value: 'Facebook',   label: '👥 Facebook' },
  { value: 'Instagram',  label: '📸 Instagram' },
  { value: 'Referral',   label: '🤝 Referral' },
  { value: 'Website',    label: '🌐 My website' },
  { value: 'Yard_Sign',  label: '🪧 Yard sign' },
  { value: 'Walk_In',    label: '🚶 Walk-in' },
  { value: 'Other',      label: '📋 Other' },
]

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
                  className="py-2.5 px-3 rounded-xl text-sm font-semibold border-2 text-left transition-all"
                  style={source === s.value
                    ? { background: '#F0FDFA', borderColor: '#0F766E', color: '#0F766E' }
                    : { background: 'white', borderColor: '#E8E2D9', color: '#6B7280' }}>
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
