'use client'
// lib/trades/hvac/components/AddLeadModal.tsx
// HVAC-flavoured Add Lead modal.
// Same structural pattern as lib/trades/roofing/components/AddLeadModal.tsx.
// Adds three HVAC-specific selectors (system_type, issue_type, refrigerant_type)
// that feed hvac_job_data on the POST side.

import { useState, useRef } from 'react'
import type { ReactElement } from 'react'
import { usePlacesAutocomplete } from '@/lib/hooks/usePlacesAutocomplete'
import { apiFetch } from '@/lib/api-fetch'

// ── Lead source icons ─────────────────────────────────────────────────────────
function PhoneIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a ? 'white' : BLUE} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
}
function RefIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a ? 'white' : '#7C3AED'} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
}
function FbIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill={a ? 'white' : '#1877F2'}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
}
function IgIcon({ a }: { a: boolean }) {
  if (a) return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/></svg>
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><defs><radialGradient id="igr2" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="5" fill="url(#igr2)"/><path d="M12 7a5 5 0 100 10A5 5 0 0012 7zm0 8.2A3.2 3.2 0 1112 8.8a3.2 3.2 0 010 6.4zM17.2 6.4a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" fill="white"/></svg>
}
function WebIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a ? 'white' : '#0891B2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
}
function GoogleIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a ? 'white' : '#DB4437'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function YardIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a ? 'white' : '#B45309'} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="12" rx="2"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
}
function OtherIcon({ a }: { a: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a ? 'white' : '#6B7280'} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}

const BLUE = '#0EA5E9'

const SRC_ICON: Record<string, (p: { a: boolean }) => ReactElement> = {
  Phone_Call: PhoneIcon,
  Referral:   RefIcon,
  Facebook:   FbIcon,
  Instagram:  IgIcon,
  Website:    WebIcon,
  Google:     GoogleIcon,
  Yard_Sign:  YardIcon,
  Other:      OtherIcon,
}

const SOURCES = [
  { v: 'Phone_Call', l: 'Phone Call' },
  { v: 'Referral',   l: 'Referral'   },
  { v: 'Facebook',   l: 'Facebook'   },
  { v: 'Instagram',  l: 'Instagram'  },
  { v: 'Website',    l: 'Website'    },
  { v: 'Google',     l: 'Google'     },
  { v: 'Yard_Sign',  l: 'Yard Sign'  },
  { v: 'Other',      l: 'Other'      },
].map(s => ({ ...s, I: SRC_ICON[s.v] ?? OtherIcon }))

// ── HVAC-specific option sets (match hvac_job_data column enums in schema) ───
const SYSTEM_TYPES = [
  { v: 'split_ac',      l: 'Split AC'      },
  { v: 'heat_pump',     l: 'Heat Pump'     },
  { v: 'furnace',       l: 'Furnace'       },
  { v: 'mini_split',    l: 'Mini-Split'    },
  { v: 'package_unit',  l: 'Package Unit'  },
]

const ISSUE_TYPES = [
  { v: 'repair',       l: 'Repair'        },
  { v: 'maintenance',  l: 'Maintenance'   },
  { v: 'replacement',  l: 'Replacement'   },
  { v: 'new_install',  l: 'New Install'   },
]

const REFRIGERANT_TYPES = [
  { v: 'R-410A', l: 'R-410A' },
  { v: 'R-454B', l: 'R-454B (A2L)' },
  { v: 'R-32',   l: 'R-32 (A2L)'   },
  { v: 'R-22',   l: 'R-22 (legacy)'},
  { v: 'R-407C', l: 'R-407C'       },
  { v: 'Other',  l: 'Other / Unknown' },
]

function formatPhone(r: string) {
  const d = r.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}-${d.slice(3)}`
  return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
}
function san(v: string) {
  return v.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '').trimStart()
}

interface Props { proId: string; onClose: () => void; onAdded: (lead: any) => void; dk?: boolean }

export default function HVACAddLeadModal({ proId, onClose, onAdded, dk = false }: Props) {
  const [name,        setName]        = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [street,      setStreet]      = useState('')
  const [city,        setCity]        = useState('')
  const [addrState,   setAddrState]   = useState('')
  const [zip,         setZip]         = useState('')
  const [scope,       setScope]       = useState('')
  const [source,      setSource]      = useState('Phone_Call')
  const [systemType,  setSystemType]  = useState('')
  const [issueType,   setIssueType]   = useState('')
  const [refrigerant, setRefrigerant] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')
  const [focus,       setFocus]       = useState<Record<string, boolean>>({})

  const streetRef = useRef<HTMLInputElement>(null)
  usePlacesAutocomplete(streetRef, (formatted: string) => {
    const parts = formatted.replace(', USA', '').split(', ')
    const zipMatch   = formatted.match(/\b(\d{5})\b/)
    const stateMatch = formatted.match(/,\s*([A-Z]{2})\s+\d{5}/)
    if (zipMatch)   setZip(zipMatch[1])
    if (stateMatch) setAddrState(stateMatch[1])
    if (parts.length >= 3) setCity(parts[parts.length - 3] || '')
    if (parts.length >= 1) setStreet(parts[0] || '')
  })

  const fo = (k: string) => setFocus(f => ({ ...f, [k]: true }))
  const fb = (k: string) => setFocus(f => ({ ...f, [k]: false }))

  async function save() {
    if (!name.trim())                   { setErr('Customer name is required'); return }
    if (!phone.trim() && !email.trim()) { setErr('Phone or email is required'); return }
    if (!scope.trim())                  { setErr('Describe the issue or scope'); return }
    setSaving(true); setErr('')
    const r = await apiFetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id:           proId,
        contact_name:     name.trim(),
        contact_phone:    phone.trim()  || null,
        contact_email:    email.trim()  || null,
        property_address: street.trim() || null,
        contact_city:     city.trim()   || null,
        contact_state:    addrState.trim() || null,
        contact_zip:      zip.trim()    || null,
        message:          scope.trim(),
        lead_source:      source,
        is_manual:        true,
        // HVAC-specific — populate hvac_job_data on POST side
        system_type:      systemType  || null,
        issue_type:       issueType   || null,
        refrigerant_type: refrigerant || null,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) { onAdded(d.lead); onClose() }
    else setErr(d.error || 'Failed to save lead')
  }

  function iStyle(k: string): React.CSSProperties {
    const active = focus[k]
    return {
      width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8,
      border: `1.5px solid ${active ? BLUE : (dk ? '#2D3748' : '#D1D5DB')}`,
      background: dk ? '#0F172A' : 'white',
      color: dk ? '#F1F5F9' : '#111827',
      outline: 'none', transition: 'border-color 200ms, box-shadow 200ms',
      boxShadow: active ? '0 0 0 3px rgba(14,165,233,0.12)' : 'none',
      boxSizing: 'border-box' as const, fontFamily: 'inherit',
    }
  }

  // Pill-style selector used for system_type and issue_type
  function PillGroup({ options, value, onChange }: {
    options: { v: string; l: string }[]
    value: string
    onChange: (v: string) => void
  }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const active = value === o.v
          return (
            <button key={o.v} onClick={() => onChange(active ? '' : o.v)} style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 150ms ease',
              border: `1.5px solid ${active ? BLUE : (dk ? '#2D3748' : '#D1D5DB')}`,
              background: active ? BLUE : (dk ? '#0F172A' : '#F9FAFB'),
              color: active ? 'white' : (dk ? '#CBD5E1' : '#374151'),
            }}>
              {o.l}
            </button>
          )
        })}
      </div>
    )
  }

  const bg  = dk ? '#1E293B' : 'white'
  const sep = dk ? '#1E293B' : '#F3F4F6'
  const labelColor = dk ? '#CBD5E1' : '#374151'

  function Lbl({ text, req, opt }: { text: string; req?: boolean; opt?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: labelColor }}>{text}</span>
        {req && <span style={{ color: '#EF4444', fontSize: 13 }}>*</span>}
        {opt && <span style={{ fontSize: 11, fontWeight: 500, color: dk ? '#475569' : '#9CA3AF',
          background: dk ? '#0F172A' : '#F9FAFB', padding: '1px 8px', borderRadius: 20,
          border: `1px solid ${sep}` }}>optional</span>}
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '16px', background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 640, background: bg, borderRadius: 20,
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.30)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ height: 8, flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 24px 14px', flexShrink: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: '#E0F2FE',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1010 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: dk ? '#F1F5F9' : '#0A1628', letterSpacing: '-0.025em' }}>
              Add a service call
            </div>
            <div style={{ fontSize: 13, color: dk ? '#475569' : '#9CA3AF', marginTop: 1 }}>
              Log a new HVAC job from any source
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: dk ? '#0F172A' : '#F3F4F6', color: dk ? '#64748B' : '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            fontSize: 17, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 24px 8px' }}>

          {/* Lead source */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: dk ? '#94A3B8' : '#6B7280',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Lead source
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {SOURCES.map(({ v, l, I }) => {
                const active = source === v
                return (
                  <button key={v} onClick={() => setSource(v)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '8px 6px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${active ? BLUE : (dk ? '#2D3748' : '#E5E7EB')}`,
                    background: active ? BLUE : (dk ? '#0F172A' : '#FAFAFA'),
                    transition: 'all 160ms ease',
                  }}>
                    <I a={active} />
                    <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' as const,
                      color: active ? 'white' : (dk ? '#CBD5E1' : '#374151'), lineHeight: 1.2 }}>
                      {l}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ height: 1, background: sep, marginBottom: 16 }} />

          {/* HVAC-specific selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>

            <div>
              <Lbl text="System type" opt />
              <PillGroup options={SYSTEM_TYPES} value={systemType} onChange={setSystemType} />
            </div>

            <div>
              <Lbl text="Issue type" opt />
              <PillGroup options={ISSUE_TYPES} value={issueType} onChange={setIssueType} />
            </div>

            <div>
              <Lbl text="Refrigerant" opt />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {REFRIGERANT_TYPES.map(o => {
                  const active = refrigerant === o.v
                  return (
                    <button key={o.v} onClick={() => setRefrigerant(active ? '' : o.v)} style={{
                      padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 150ms ease',
                      border: `1.5px solid ${active ? BLUE : (dk ? '#2D3748' : '#D1D5DB')}`,
                      background: active ? BLUE : (dk ? '#0F172A' : '#F9FAFB'),
                      color: active ? 'white' : (dk ? '#CBD5E1' : '#374151'),
                    }}>
                      {o.l}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: sep, marginBottom: 16 }} />

          {/* Contact form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Lbl text="Customer name" req />
                <input value={name} onChange={e => setName(san(e.target.value))}
                  placeholder="Maria Santos" style={iStyle('name')}
                  onFocus={() => fo('name')} onBlur={() => fb('name')} />
              </div>
              <div>
                <Lbl text="Phone number" req />
                <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="813-555-0192" type="tel" inputMode="numeric" maxLength={12}
                  style={iStyle('phone')}
                  onFocus={() => fo('phone')} onBlur={() => fb('phone')} />
              </div>
            </div>

            <div>
              <Lbl text="Street address" opt />
              <input ref={streetRef} value={street} onChange={e => setStreet(san(e.target.value))}
                placeholder="3919 Highgate Dr"
                style={iStyle('street')} autoComplete="off"
                onFocus={() => fo('street')} onBlur={() => fb('street')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 10 }}>
              <div>
                <Lbl text="City" opt />
                <input value={city} onChange={e => setCity(san(e.target.value))}
                  placeholder="Tampa" style={iStyle('city')} autoComplete="address-level2"
                  onFocus={() => fo('city')} onBlur={() => fb('city')} />
              </div>
              <div>
                <Lbl text="State" opt />
                <select value={addrState} onChange={e => setAddrState(e.target.value)}
                  style={{ ...iStyle('addrState'), paddingRight: 8 }}
                  onFocus={() => fo('addrState')} onBlur={() => fb('addrState')}>
                  <option value="">—</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <Lbl text="Zip" opt />
                <input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))}
                  placeholder="33614" maxLength={5} inputMode="numeric"
                  style={iStyle('zip')} autoComplete="postal-code"
                  onFocus={() => fo('zip')} onBlur={() => fb('zip')} />
              </div>
            </div>

            <div>
              <Lbl text="Email" opt />
              <input value={email} onChange={e => setEmail(san(e.target.value))}
                placeholder="maria@example.com" type="email"
                style={iStyle('email')}
                onFocus={() => fo('email')}
                onBlur={() => { setEmail(v => v.trim().toLowerCase()); fb('email') }} />
            </div>

            <div>
              <Lbl text="Describe the issue / scope" req />
              <div style={{ position: 'relative' }}>
                <textarea value={scope} onChange={e => setScope(san(e.target.value))}
                  placeholder="AC not cooling, unit is 12 years old, needs inspection and possible replacement..."
                  rows={3} maxLength={250}
                  style={{ ...iStyle('scope'), resize: 'none' as const, lineHeight: 1.65, paddingBottom: 28 }}
                  onFocus={() => fo('scope')} onBlur={() => fb('scope')} />
                <span style={{ position: 'absolute', bottom: 10, right: 12,
                  fontSize: 11, color: dk ? '#334155' : '#CBD5E1' }}>
                  {scope.length} / 250
                </span>
              </div>
            </div>

            {err && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 14px', borderRadius: 10,
                background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#B91C1C' }}>{err}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '16px 24px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          borderTop: `1px solid ${sep}`, background: bg }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              border: `1.5px solid ${dk ? '#2D3748' : '#E5E7EB'}`,
              background: 'transparent', color: dk ? '#64748B' : '#9CA3AF', cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{
              flex: 2, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              border: 'none', color: 'white', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? '#94A3B8' : `linear-gradient(135deg, ${BLUE}, #0369A1)`,
              boxShadow: saving ? 'none' : '0 4px 16px rgba(14,165,233,0.28)',
              transition: 'all 200ms ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {saving ? 'Saving...' : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Save call
                </>
              )}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            fontSize: 11, color: dk ? '#334155' : '#D1D5DB' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Your customer information is secure and private.
          </div>
        </div>
      </div>
    </div>
  )
}
