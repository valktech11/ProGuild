'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { theme, T } from '@/lib/tokens'
import { avatarColor, initials } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { useProSession } from '@/lib/hooks/useProSession'

// ── Types ──────────────────────────────────────────────────────────────────────
type TradeCategory = { id: string; category_name: string; slug: string }
type Equipment     = { id: string; name: string; certified: boolean }
type ProLicense    = { id: string; trade_name: string; license_number: string; license_expiry_date: string | null; license_status: string; is_primary: boolean }
type Membership    = { id: string; name: string; url?: string }
type Insurance     = { id: string; file_url: string; insurer_name: string | null; policy_number: string | null; coverage_type: string | null; expiry_date: string | null; insurance_status: string }

// ── Static data ────────────────────────────────────────────────────────────────
const US_STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
]

const FL_COUNTIES = ['Alachua','Baker','Bay','Bradford','Brevard','Broward','Calhoun','Charlotte','Citrus','Clay','Collier','Columbia','DeSoto','Dixie','Duval','Escambia','Flagler','Franklin','Gadsden','Gilchrist','Glades','Gulf','Hamilton','Hardee','Hendry','Hernando','Highlands','Hillsborough','Holmes','Indian River','Jackson','Jefferson','Lafayette','Lake','Lee','Leon','Levy','Liberty','Madison','Manatee','Marion','Martin','Miami-Dade','Monroe','Nassau','Okaloosa','Okeechobee','Orange','Osceola','Palm Beach','Pasco','Pinellas','Polk','Putnam','St. Johns','St. Lucie','Santa Rosa','Sarasota','Seminole','Sumter','Suwannee','Taylor','Union','Volusia','Wakulla','Walton','Washington']

const PRICING_OPTIONS = ['Free estimates','Free consultations','Starting at $75/hr','Starting at $150/hr','Starting at $500','Contact for pricing']

// ── Icon components (Lucide-compatible, inline SVG) ────────────────────────────
const Icon = ({ path, size = 16, sw = 2 }: { path: string; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: path }} />
)

const ICONS = {
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
  award:   '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>',
  sliders: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>',
  camera:  '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  pencil:  '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  check:   '<path d="M20 6L9 17l-5-5"/>',
  image:   '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  chevL:   '<path d="M15 18l-6-6 6-6"/>',
}

const TABS = [
  { key: 'basic'       as const, label: 'Basic info',   icon: ICONS.user    },
  { key: 'credentials' as const, label: 'Credentials',  icon: ICONS.award   },
  { key: 'preferences' as const, label: 'Preferences',  icon: ICONS.sliders },
]

// ── Reusable Field wrapper ────────────────────────────────────────────────────
function Field({ label, hint, error, children, half }: {
  label: string; hint?: string; error?: string; children: React.ReactNode; half?: boolean
}) {
  return (
    <div style={{ marginBottom: 18, ...(half ? {} : {}) }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint  && !error && <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
      {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({ title, dk }: { title: string; dk: boolean }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#64748B' : '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.08em', borderLeft: '3px solid #0F766E', paddingLeft: 10, marginBottom: 20 }}>
      {title}
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, dk, style }: { children: React.ReactNode; dk: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: dk ? '#181E2A' : '#FFFFFF',
      border: `1px solid ${dk ? '#1E293B' : '#E5E0D9'}`,
      borderRadius: 12,
      padding: '20px 20px',
      marginBottom: 12,
      boxShadow: dk ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EditProfilePage() {
  const router = useRouter()

  // ── Auth + dark mode ──────────────────────────────────────────────────────
  const { session, loading: _authLoading, refresh: _refreshSession } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  // ── Page state ────────────────────────────────────────────────────────────
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [saved,   setSaved]     = useState(false)
  const [errors,  setErrors]    = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'basic' | 'credentials' | 'preferences'>('basic')

  // ── Form fields — Basic ───────────────────────────────────────────────────
  const [fullName,     setFullName]     = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone,        setPhone]        = useState('')
  const [phoneCell,    setPhoneCell]    = useState('')
  const [phoneWork,    setPhoneWork]    = useState('')
  const [phoneCell2,   setPhoneCell2]   = useState('')
  const [trade,        setTrade]        = useState('')
  const [yrs,          setYrs]          = useState('')
  const [license,      setLicense]      = useState('')
  const [bio,          setBio]          = useState('')
  const [state,        setState]        = useState('')
  const [city,         setCity]         = useState('')
  const [otherCity,    setOtherCity]    = useState('')
  const [zip,          setZip]          = useState('')
  const [photoUrl,     setPhotoUrl]     = useState('')
  const [coverUrl,     setCoverUrl]     = useState('')
  const [uploading,    setUploading]    = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Form fields — Credentials ─────────────────────────────────────────────
  const [licenseExpiry,   setLicenseExpiry]   = useState('')
  const [oshaType,        setOshaType]        = useState('')
  const [oshaNumber,      setOshaNumber]      = useState('')
  const [oshaExpiry,      setOshaExpiry]      = useState('')
  const [equipment,       setEquipment]       = useState<Equipment[]>([])
  const [newEquip,        setNewEquip]        = useState('')
  const [addingEquip,     setAddingEquip]     = useState(false)
  const [proLicenses,     setProLicenses]     = useState<ProLicense[]>([])
  const [newLicTrade,     setNewLicTrade]     = useState('')
  const [newLicNumber,    setNewLicNumber]    = useState('')
  const [newLicExpiry,    setNewLicExpiry]    = useState('')
  const [addingLic,       setAddingLic]       = useState(false)
  const [memberships,     setMemberships]     = useState<Membership[]>([])
  const [newMembership,   setNewMembership]   = useState('')
  const [addingMembership,setAddingMembership]= useState(false)
  const [insurance,       setInsurance]       = useState<Insurance[]>([])
  const [uploadingCOI,    setUploadingCOI]    = useState(false)
  const [coiError,        setCOIError]        = useState('')

  // ── Form fields — Preferences ─────────────────────────────────────────────
  const [available,    setAvailable]    = useState(false)
  const [availableNote,setAvailableNote]= useState('')
  const [language,     setLanguage]     = useState('en')
  const [counties,     setCounties]     = useState<string[]>([])
  const [services,     setServices]     = useState<string[]>([])
  const [serviceInput, setServiceInput] = useState('')
  const [pricingNote,  setPricingNote]  = useState('')

  // ── Reference data ────────────────────────────────────────────────────────
  const [categories,    setCategories]    = useState<TradeCategory[]>([])
  const [cities,        setCities]        = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.push('/login'); return }

    Promise.all([
      fetch(`/api/pros/${session.id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch(`/api/equipment?pro_id=${session.id}`).then(r => r.json()),
      fetch(`/api/pro-licenses?pro_id=${session.id}`).then(r => r.json()),
      fetch(`/api/memberships?pro_id=${session.id}`).then(r => r.json()),
      fetch(`/api/insurance?pro_id=${session.id}`).then(r => r.json()),
    ]).then(([proData, catData, eqData, licData, memData, insData]) => {
      const p = proData.pro
      if (p) {
        setFullName(p.full_name || '')
        setBusinessName(p.business_name || '')
        setPhone(p.phone || '')
        setPhoneCell(p.phone_cell || '')
        setPhoneWork(p.phone_work || '')
        setPhoneCell2(p.phone_cell2 || '')
        setTrade(p.trade_category_id || '')
        setYrs(p.years_experience?.toString() || '')
        setLicense(p.license_number || '')
        setBio(p.bio || '')
        setState(p.state || '')
        setCity(p.city || '')
        setZip(p.zip_code || '')
        setPhotoUrl(p.profile_photo_url || '')
        setCoverUrl(p.cover_image_url || '')
        setLicenseExpiry(p.license_expiry_date || '')
        setOshaType(p.osha_card_type || '')
        setOshaNumber(p.osha_card_number || '')
        setOshaExpiry(p.osha_card_expiry || '')
        setAvailable(p.available_for_work || false)
        setAvailableNote(p.available_note || '')
        setLanguage(p.preferred_language || 'en')
        setCounties(p.counties_served || [])
        setServices((p as any).services || [])
        setPricingNote((p as any).pricing_note || '')
      }
      setCategories(catData.categories || [])
      setEquipment(eqData.equipment || [])
      setProLicenses(licData.licenses || [])
      setMemberships(memData.memberships || [])
      setInsurance(insData.insurance || [])
      setLoading(false)
    })
  }, [session, _authLoading])

  useEffect(() => {
    if (!state) { setCities([]); return }
    setCitiesLoading(true)
    fetch(`/api/cities?state=${state}`)
      .then(r => r.json())
      .then(d => { setCities(d.cities || []); setCitiesLoading(false) })
      .catch(() => setCitiesLoading(false))
  }, [state])

  // ── Upload handlers ───────────────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true)
    setPhotoUrl(URL.createObjectURL(file))
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) setPhotoUrl(d.url)
    else { setPhotoUrl(''); setErrors(p => ({ ...p, photo: d.error || 'Upload failed' })) }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploadingCover(true)
    setCoverUrl(URL.createObjectURL(file))
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'cover')
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploadingCover(false)
    if (r.ok) {
      setCoverUrl(d.url)
      await fetch(`/api/pros/${session.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cover_image_url: d.url }) })
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const errs: Record<string, string> = {}
    if (!fullName.trim()) errs.fullName = 'Name is required'
    if (phone && !/^\+?[\d\s\-().]{7,}$/.test(phone)) errs.phone = 'Enter a valid phone number'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const finalCity = city === '__other__' ? otherCity : city
    const r = await fetch(`/api/pros/${session!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim(), business_name: businessName.trim() || null,
        phone: phone.trim() || null, phone_cell: phoneCell.trim() || null,
        phone_work: phoneWork.trim() || null, phone_cell2: phoneCell2.trim() || null,
        trade_category_id: trade || null, years_experience: yrs ? parseInt(yrs) : null,
        license_number: license.trim() || null, bio: bio.trim() || null,
        state: state || null, city: finalCity || null, zip_code: zip || null,
        license_expiry_date: licenseExpiry || null,
        osha_card_type: oshaType || null, osha_card_number: oshaNumber || null, osha_card_expiry: oshaExpiry || null,
        available_for_work: available, available_note: availableNote || null,
        preferred_language: language, counties_served: counties.length ? counties : null,
        services: services.length ? services : null, pricing_note: pricingNote.trim() || null,
      }),
    })
    setSaving(false)
    if (r.ok) {
      await _refreshSession()   // re-fetch session from DB (now has updated name)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } else {
      const d = await r.json()
      setErrors({ submit: d.error || 'Could not save. Try again.' })
    }
  }

  // ── Style tokens ──────────────────────────────────────────────────────────
  const t = theme(dk)
  const BORDER  = dk ? '#334155' : '#D1C9C0'
  const BG      = dk ? '#1A2130' : '#FFFFFF'

  const inp = (err?: string): React.CSSProperties => ({
    width: '100%', padding: '11px 14px', minHeight: 48,
    border: `1.5px solid ${err ? '#FCA5A5' : BORDER}`,
    borderRadius: 8, background: BG, color: t.textPri,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', WebkitAppearance: 'none', lineHeight: 1.4,
  })
  const sel = (err?: string): React.CSSProperties => ({ ...inp(err), cursor: 'pointer' })
  const tealBtnSt: React.CSSProperties = {
    background: '#0F766E', color: 'white', border: 'none',
    borderRadius: 8, padding: '11px 20px', fontSize: 14,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex',
    alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
  }
  const ghostBtnSt: React.CSSProperties = {
    background: 'none', border: `1.5px solid ${BORDER}`,
    color: t.textBody, borderRadius: 8, padding: '10px 20px',
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
  }
  const [bg, fg] = avatarColor(fullName || 'A')

  // ── Avatar widget — shared between mobile and desktop ─────────────────────
  const AvatarWidget = (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {photoUrl
        ? <img src={photoUrl} alt={fullName}
            style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', display: 'block', border: `3px solid ${dk ? '#334155' : '#E5E0D9'}` }} />
        : <div style={{ width: 120, height: 120, borderRadius: '50%', background: bg, color: fg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, fontWeight: 800, border: `3px solid ${dk ? '#334155' : '#E5E0D9'}` }}>
            {initials(fullName || 'A')}
          </div>
      }
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{ position: 'absolute', bottom: 4, right: 4, width: 30, height: 30, borderRadius: '50%',
          background: '#0F766E', border: '2.5px solid white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
        <Icon path={ICONS.pencil} size={12} sw={2.5} />
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }} onChange={handlePhotoUpload} />
    </div>
  )

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const TabBar = ({ variant }: { variant: 'underline' | 'pill' }) => (
    <div style={variant === 'underline'
      ? { display: 'flex', borderBottom: `1px solid ${dk ? '#1E293B' : '#E5E0D9'}`, marginBottom: 24 }
      : { display: 'flex', gap: 4, background: dk ? '#1A2130' : '#F3F0EC', borderRadius: 10, padding: 4, marginBottom: 20 }
    }>
      {TABS.map(tab => {
        const active = activeTab === tab.key
        return (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={variant === 'underline' ? {
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
              border: 'none', borderBottom: active ? '2px solid #0F766E' : '2px solid transparent',
              background: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: active ? 600 : 400, color: active ? '#0F766E' : t.textMuted,
              marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap',
            } : {
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 12px', border: 'none', borderRadius: 7, cursor: 'pointer',
              fontSize: 13, fontWeight: active ? 600 : 400,
              background: active ? '#0F766E' : 'transparent',
              color: active ? 'white' : t.textMuted, transition: 'all 0.15s',
            }}>
            <Icon path={tab.icon} size={15} />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )

  // ── Tab content ───────────────────────────────────────────────────────────
  const TabContent = (
    <>
      {/* ── BASIC ── */}
      {activeTab === 'basic' && (<>
        <Card dk={dk}>
          <SectionHead title="Basic information" dk={dk} />
          <Field label="Full name" error={errors.fullName}>
            <input value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
              placeholder="Your full name" style={inp(errors.fullName)} />
          </Field>
          <Field label="Business name" hint="Optional — your company or trading name">
            <input value={businessName} onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Johnson Electrical LLC" style={inp()} />
          </Field>
          <Field label="Phone (primary)" error={errors.phone} hint="Shown to Pro and Elite plan subscribers">
            <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })) }}
              placeholder="(555) 000-0000" style={inp(errors.phone)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[['Cell', phoneCell, setPhoneCell], ['Work', phoneWork, setPhoneWork], ['Cell 2', phoneCell2, setPhoneCell2]].map(([lbl, val, set]) => (
              <div key={lbl as string}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{lbl as string}</label>
                <input value={val as string} onChange={e => (set as any)(e.target.value)} placeholder={lbl as string} style={{ ...inp(), fontSize: 13 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Trade">
              <select value={trade} onChange={e => setTrade(e.target.value)} style={sel()}>
                <option value="">Select trade...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </select>
            </Field>
            <Field label="Years of experience">
              <input type="number" value={yrs} onChange={e => setYrs(e.target.value)}
                placeholder="e.g. 10" min="0" max="60" style={inp()} />
            </Field>
          </div>
          <Field label="License number" hint="Optional — adds a verified badge to your profile">
            <input value={license} onChange={e => setLicense(e.target.value)}
              placeholder="e.g. EC13004123" style={inp()} />
          </Field>
        </Card>

        <Card dk={dk}>
          <SectionHead title="Bio" dk={dk} />
          <Field label="About you" hint="Tell homeowners about your experience and why they should hire you">
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="I've been a licensed electrician for 12 years, specializing in panel upgrades..."
              rows={4} style={{ ...inp(), resize: 'vertical', lineHeight: 1.6, minHeight: 110 }} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textSubtle, marginTop: -10 }}>
            <span>2–4 sentences works best</span>
            <span style={{ color: bio.length > 400 ? '#EF4444' : t.textSubtle }}>{bio.length}/500</span>
          </div>
        </Card>

        <Card dk={dk}>
          <SectionHead title="Location" dk={dk} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="State">
              <select value={state} onChange={e => { setState(e.target.value); setCity('') }} style={sel()}>
                <option value="">State...</option>
                {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
              </select>
            </Field>
            <Field label="City">
              <select value={city} onChange={e => setCity(e.target.value)} disabled={!state} style={sel()}>
                <option value="">{!state ? 'Select state first' : citiesLoading ? 'Loading...' : 'Select city...'}</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__other__">Other...</option>
              </select>
              {city === '__other__' && (
                <input value={otherCity} onChange={e => setOtherCity(e.target.value)}
                  placeholder="Type your city..." style={{ ...inp(), marginTop: 8 }} />
              )}
            </Field>
          </div>
          <Field label="Zip code" hint="Helps homeowners find you in local search">
            <input value={zip} onChange={e => setZip(e.target.value)} placeholder="33101"
              style={{ ...inp(), maxWidth: 160 }} />
          </Field>
        </Card>

        <Card dk={dk}>
          <SectionHead title="Cover photo" dk={dk} />
          <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 10, overflow: 'hidden',
            background: dk ? '#1E293B' : '#F3F0EC',
            border: `2px dashed ${coverUrl ? 'transparent' : dk ? '#334155' : '#D1C9C0'}`,
            marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {coverUrl
              ? <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ textAlign: 'center', color: t.textSubtle }}>
                  <Icon path={ICONS.image} size={24} sw={1.5} />
                  <div style={{ fontSize: 12, marginTop: 4 }}>No cover photo</div>
                </div>
            }
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} id="cover-upload" onChange={handleCoverUpload} />
          <label htmlFor="cover-upload" style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'center', border: `1.5px solid ${dk ? '#334155' : '#D1C9C0'}`, borderRadius: 8, fontSize: 13, fontWeight: 500, color: t.textBody, cursor: 'pointer', background: 'transparent', boxSizing: 'border-box' }}>
            {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover photo' : 'Upload cover photo'}
          </label>
          <p style={{ fontSize: 12, color: t.textSubtle, textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>Shows behind your name on your public profile page</p>
        </Card>
      </>)}

      {/* ── CREDENTIALS ── */}
      {activeTab === 'credentials' && (<>
        <Card dk={dk}>
          <SectionHead title="License" dk={dk} />
          <Field label="License expiry date" hint="We'll notify you before it expires">
            <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} style={inp()} />
          </Field>
          {licenseExpiry && (
            <div style={{ fontSize: 13, color: t.textMuted }}>
              Expires: <strong style={{ color: t.textPri }}>{new Date(licenseExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
            </div>
          )}
        </Card>

        <Card dk={dk}>
          <SectionHead title="OSHA certification" dk={dk} />
          <Field label="OSHA card type">
            <select value={oshaType} onChange={e => setOshaType(e.target.value)} style={sel()}>
              <option value="">None / not certified</option>
              {['OSHA-10','OSHA-30','OSHA-500','OSHA-510'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          {oshaType && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Card number" hint="Optional">
                <input value={oshaNumber} onChange={e => setOshaNumber(e.target.value)} placeholder="e.g. 12345678" style={inp()} />
              </Field>
              <Field label="Expiry date">
                <input type="date" value={oshaExpiry} onChange={e => setOshaExpiry(e.target.value)} style={inp()} />
              </Field>
            </div>
          )}
        </Card>

        <Card dk={dk}>
          <SectionHead title="Trade licenses" dk={dk} />
          {proLicenses.length > 0 && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {proLicenses.map(lic => (
                <div key={lic.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: dk ? '#1E293B' : '#F8F6F3', border: `1px solid ${dk ? '#334155' : '#E5E0D9'}`, borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: lic.license_status === 'active' ? '#22C55E' : lic.license_status === 'expiring_soon' ? '#F59E0B' : '#EF4444' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>{lic.trade_name}</div>
                      <div style={{ fontSize: 12, color: t.textSubtle }}>{lic.license_number}{lic.license_expiry_date ? ` · exp ${new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}</div>
                    </div>
                    {lic.is_primary && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(15,118,110,0.1)', color: '#0F766E' }}>Primary</span>}
                  </div>
                  <button onClick={async () => { if (!session) return; await fetch('/api/pro-licenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: lic.id }) }); setProLicenses(prev => prev.filter(l => l.id !== lic.id)) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: 16, background: dk ? '#1E293B' : '#F8F6F3', border: `1px solid ${dk ? '#334155' : '#E5E0D9'}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 14 }}>Add a license</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Trade / service</label>
                <input value={newLicTrade} onChange={e => setNewLicTrade(e.target.value)} placeholder="e.g. Air conditioning" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>License number</label>
                <input value={newLicNumber} onChange={e => setNewLicNumber(e.target.value)} placeholder="e.g. CAC1817585" style={inp()} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Expiry date (optional)</label>
              <input type="date" value={newLicExpiry} onChange={e => setNewLicExpiry(e.target.value)} style={{ ...inp(), maxWidth: 200 }} />
            </div>
            <button disabled={addingLic || !newLicTrade.trim() || !newLicNumber.trim()}
              onClick={async () => { if (!session) return; setAddingLic(true); const r = await fetch('/api/pro-licenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, trade_name: newLicTrade.trim(), license_number: newLicNumber.trim(), license_expiry_date: newLicExpiry || null, is_primary: proLicenses.length === 0 }) }); const d = await r.json(); if (r.ok) { setProLicenses(prev => [...prev, d.license]); setNewLicTrade(''); setNewLicNumber(''); setNewLicExpiry('') } setAddingLic(false) }}
              style={{ ...tealBtnSt, opacity: (addingLic || !newLicTrade.trim() || !newLicNumber.trim()) ? 0.45 : 1 }}>
              {addingLic ? 'Adding...' : '+ Add license'}
            </button>
          </div>
        </Card>

        <Card dk={dk}>
          <SectionHead title="Equipment & tools" dk={dk} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input type="text" value={newEquip} onChange={e => setNewEquip(e.target.value)}
              onKeyDown={async e => { if (e.key !== 'Enter' || !newEquip.trim() || !session) return; e.preventDefault(); setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) }}
              placeholder="e.g. Nail gun, Laser level..." style={{ ...inp(), flex: 1 }} />
            <button onClick={async () => { if (!newEquip.trim() || !session) return; setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) }}
              disabled={addingEquip || !newEquip.trim()} style={{ ...tealBtnSt, opacity: (addingEquip || !newEquip.trim()) ? 0.45 : 1 }}>Add</button>
          </div>
          {equipment.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {equipment.map(eq => (
                  <span key={eq.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 12px', borderRadius: 20, background: dk ? '#1E293B' : '#F3F0EC', color: t.textBody, border: `1px solid ${dk ? '#334155' : '#E5E0D9'}` }}>
                    {eq.name}
                    <button onClick={async () => { if (!session) return; await fetch('/api/equipment', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: eq.id }) }); setEquipment(prev => prev.filter(e => e.id !== eq.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            : <p style={{ fontSize: 13, color: t.textSubtle, fontStyle: 'italic' }}>No equipment added yet.</p>
          }
        </Card>

        <Card dk={dk}>
          <SectionHead title="Associations & memberships" dk={dk} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input type="text" value={newMembership} onChange={e => setNewMembership(e.target.value)}
              onKeyDown={async e => { if (e.key !== 'Enter' || !newMembership.trim() || !session) return; e.preventDefault(); setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) }}
              placeholder="e.g. Florida Roofing Assoc., NARI..." style={{ ...inp(), flex: 1 }} />
            <button onClick={async () => { if (!newMembership.trim() || !session) return; setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) }}
              disabled={addingMembership || !newMembership.trim()} style={{ ...tealBtnSt, opacity: (addingMembership || !newMembership.trim()) ? 0.45 : 1 }}>Add</button>
          </div>
          {memberships.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {memberships.map(m => (
                  <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 12px', borderRadius: 20, background: 'rgba(29,78,216,0.07)', color: '#1D4ED8', border: '1px solid rgba(29,78,216,0.15)' }}>
                    {m.name}
                    <button onClick={async () => { if (!session) return; await fetch('/api/memberships', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: m.id }) }); setMemberships(prev => prev.filter(x => x.id !== m.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93C5FD', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            : <p style={{ fontSize: 13, color: t.textSubtle, fontStyle: 'italic' }}>No memberships added yet.</p>
          }
        </Card>

        <Card dk={dk}>
          <SectionHead title="Certificate of insurance" dk={dk} />
          <p style={{ fontSize: 13, color: t.textSubtle, marginBottom: 14, lineHeight: 1.5 }}>AI extracts the expiry date and adds a verified insurance badge to your public profile.</p>
          {coiError && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', color: '#DC2626', fontSize: 13, borderRadius: 8 }}>{coiError}</div>}
          {insurance.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insurance.map(ins => {
                const expStr = ins.expiry_date ? new Date(ins.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                const color  = ins.insurance_status === 'active' ? '#0F766E' : ins.insurance_status === 'expiring_soon' ? '#B45309' : '#DC2626'
                return (
                  <div key={ins.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px', background: dk ? '#1E293B' : '#F8F6F3', border: `1px solid ${color}40`, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>{ins.insurer_name || 'Insurance document'}</div>
                      <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>{ins.coverage_type && `${ins.coverage_type} · `}{expStr ? `Expires ${expStr}` : 'Expiry unknown'}</div>
                    </div>
                    <button onClick={async () => { if (!session) return; await fetch('/api/insurance', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: ins.id }) }); setInsurance(prev => prev.filter(x => x.id !== ins.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 18, lineHeight: 1, padding: '0 4px', marginLeft: 8 }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '18px', border: `2px dashed ${uploadingCOI ? '#0F766E' : dk ? '#334155' : '#D1C9C0'}`, borderRadius: 10, cursor: 'pointer', background: uploadingCOI ? 'rgba(15,118,110,0.05)' : 'transparent', boxSizing: 'border-box' }}>
            <input type="file" style={{ display: 'none' }} accept="image/*,.pdf" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file || !session) return
              setUploadingCOI(true); setCOIError('')
              const form = new FormData(); form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'insurance')
              const upRes = await fetch('/api/upload', { method: 'POST', body: form }); const upData = await upRes.json()
              if (!upRes.ok) { setCOIError(upData.error || 'Upload failed'); setUploadingCOI(false); return }
              const insRes = await fetch('/api/insurance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, file_url: upData.url }) }); const insData = await insRes.json()
              if (insRes.ok) setInsurance(prev => [insData.insurance, ...prev]); else setCOIError(insData.error || 'Could not process document')
              setUploadingCOI(false)
            }} />
            {uploadingCOI
              ? <><div style={{ width: 16, height: 16, border: '2px solid #0F766E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/><span style={{ fontSize: 14, color: '#0F766E' }}>Uploading & extracting...</span></>
              : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span style={{ fontSize: 14, color: t.textMuted }}>Upload COI (PDF or image)</span></>}
          </label>
        </Card>
      </>)}

      {/* ── PREFERENCES ── */}
      {activeTab === 'preferences' && (<>
        <Card dk={dk}>
          <SectionHead title="Availability" dk={dk} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: t.textPri }}>Available for new work</div>
              <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 3, lineHeight: 1.5 }}>Shows a green badge on your profile and in search results</div>
            </div>
            <button onClick={() => setAvailable(a => !a)}
              style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', background: available ? '#0F766E' : (dk ? '#334155' : '#D1C9C0'), cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 2, left: available ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left 0.2s' }} />
            </button>
          </div>
          {available && (
            <div style={{ marginTop: 16 }}>
              <Field label="Availability note" hint="Optional — shown on your profile">
                <input value={availableNote} onChange={e => setAvailableNote(e.target.value)}
                  placeholder="e.g. Available weekends, free for small jobs..." style={inp()} />
              </Field>
            </div>
          )}
        </Card>

        <Card dk={dk}>
          <SectionHead title="Services offered" dk={dk} />
          <p style={{ fontSize: 13, color: t.textSubtle, marginBottom: 14, lineHeight: 1.5 }}>Shown as tags on your public profile page.</p>
          {services.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {services.map(svc => (
                <span key={svc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 20, background: 'rgba(15,118,110,0.08)', color: '#0C5F57', border: '1px solid rgba(15,118,110,0.2)' }}>
                  {svc}
                  <button onClick={() => setServices(prev => prev.filter(s => s !== svc))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F766E', fontSize: 15, lineHeight: 1, padding: 0, opacity: 0.6 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={serviceInput} onChange={e => setServiceInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && serviceInput.trim()) { e.preventDefault(); if (!services.includes(serviceInput.trim())) setServices(prev => [...prev, serviceInput.trim()]); setServiceInput('') } }}
              placeholder='e.g. Panel upgrades, Outlet installation...' style={{ ...inp(), flex: 1 }} />
            <button onClick={() => { if (serviceInput.trim() && !services.includes(serviceInput.trim())) { setServices(prev => [...prev, serviceInput.trim()]); setServiceInput('') } }}
              style={tealBtnSt}>Add</button>
          </div>
        </Card>

        <Card dk={dk}>
          <SectionHead title="Pricing signal" dk={dk} />
          <p style={{ fontSize: 13, color: t.textSubtle, marginBottom: 14, lineHeight: 1.5 }}>Sets expectations upfront and increases your contact rate.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {PRICING_OPTIONS.map(opt => (
              <button key={opt} onClick={() => setPricingNote(opt)}
                style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${pricingNote === opt ? '#0F766E' : dk ? '#334155' : '#E5E0D9'}`, background: pricingNote === opt ? 'rgba(15,118,110,0.08)' : 'transparent', fontSize: 13, fontWeight: pricingNote === opt ? 600 : 400, color: pricingNote === opt ? '#0F766E' : t.textBody, cursor: 'pointer', textAlign: 'left' as const }}>
                {opt}
              </button>
            ))}
          </div>
          <input value={pricingNote} onChange={e => setPricingNote(e.target.value)}
            placeholder="Or describe your own pricing..." style={inp()} />
        </Card>

        <Card dk={dk}>
          <SectionHead title="Preferred language" dk={dk} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['en','🇺🇸 English'],['es','🇪🇸 Spanish']].map(([val, lbl]) => (
              <button key={val} onClick={() => setLanguage(val)}
                style={{ padding: '14px 12px', borderRadius: 10, border: `1.5px solid ${language === val ? '#0F766E' : dk ? '#334155' : '#E5E0D9'}`, background: language === val ? 'rgba(15,118,110,0.08)' : 'transparent', fontSize: 14, fontWeight: language === val ? 600 : 400, color: language === val ? '#0F766E' : t.textBody, cursor: 'pointer' }}>
                {lbl}
              </button>
            ))}
          </div>
        </Card>

        <Card dk={dk}>
          <SectionHead title="Counties served (Florida)" dk={dk} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {FL_COUNTIES.map(county => {
              const sel2 = counties.includes(county)
              return (
                <button key={county} onClick={() => setCounties(prev => sel2 ? prev.filter(c => c !== county) : [...prev, county])}
                  style={{ fontSize: 12, padding: '5px 11px', borderRadius: 20, border: `1.5px solid ${sel2 ? '#0F766E' : dk ? '#334155' : '#E5E0D9'}`, background: sel2 ? '#0F766E' : 'transparent', color: sel2 ? 'white' : t.textBody, cursor: 'pointer', fontWeight: sel2 ? 600 : 400 }}>
                  {county}
                </button>
              )
            })}
          </div>
          {counties.length > 0 && <p style={{ fontSize: 13, color: '#0F766E', fontWeight: 600, marginTop: 10 }}>{counties.length} {counties.length === 1 ? 'county' : 'counties'} selected</p>}
        </Card>
      </>)}
    </>
  )

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading || !session) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.pageBg }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #0F766E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )

  // ── Notifications ─────────────────────────────────────────────────────────
  const Notices = (
    <>
      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, marginBottom: 20, fontSize: 14, fontWeight: 500, color: '#15803D' }}>
          <Icon path={ICONS.check} size={16} sw={2.5} />
          Profile saved successfully
        </div>
      )}
      {errors.submit && (
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, marginBottom: 20, fontSize: 14, color: '#DC2626' }}>{errors.submit}</div>
      )}
    </>
  )

  // ── Save button ───────────────────────────────────────────────────────────
  const SaveBtn = (
    <button onClick={handleSave} disabled={saving} style={{ ...tealBtnSt, opacity: saving ? 0.7 : 1, minWidth: 140, justifyContent: 'center' }}>
      {saving
        ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Saving...</>
        : 'Save changes'}
    </button>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // DESKTOP — inside DashboardShell (same as every other page in the app)
  // Layout: full-width page header + underline tabs + 2-col (avatar card + form)
  // ─────────────────────────────────────────────────────────────────────────
  const DesktopPage = (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={toggleDark}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 32px 60px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPri, margin: 0, letterSpacing: '-0.3px' }}>Edit profile</h1>
            <p style={{ fontSize: 13, color: t.textSubtle, marginTop: 4 }}>Keep your profile up to date to attract more homeowners</p>
          </div>
          <a href={`/pro/${session.id}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0F766E', textDecoration: 'none', padding: '8px 16px', border: '1.5px solid #0F766E', borderRadius: 8 }}>
            View public profile
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
          </a>
        </div>

        {Notices}

        {/* Underline tab bar */}
        <TabBar variant="underline" />

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 28, alignItems: 'start' }}>

          {/* Left — sticky profile card */}
          <div style={{ position: 'sticky', top: 24 }}>
            <Card dk={dk} style={{ textAlign: 'center' as const }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                {AvatarWidget}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.textPri, marginBottom: 2 }}>{fullName || 'Your name'}</div>
              <div style={{ fontSize: 13, color: t.textSubtle, marginBottom: 16 }}>
                {trade ? categories.find(c => c.id === trade)?.category_name || 'Painter' : 'Set your trade'}
              </div>

              {/* Plan row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${dk ? '#1E293B' : '#F0EDE8'}` }}>
                <span style={{ fontSize: 13, color: t.textSubtle }}>Plan</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{session.plan || 'Free'}</span>
              </div>

              {/* Upgrade button */}
              <a href="/upgrade" style={{ display: 'block', marginTop: 8, padding: '10px 16px', textAlign: 'center' as const, background: '#0F766E', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                Upgrade plan →
              </a>

              {/* Cover photo */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${dk ? '#1E293B' : '#F0EDE8'}`, textAlign: 'left' as const }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Cover photo</div>
                <div style={{ width: '100%', height: 70, borderRadius: 8, overflow: 'hidden', background: dk ? '#1E293B' : '#F3F0EC', border: `2px dashed ${coverUrl ? 'transparent' : dk ? '#334155' : '#D1C9C0'}`, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {coverUrl ? <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, color: t.textSubtle }}>No cover photo</span>}
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} id="cover-upload-desk" onChange={handleCoverUpload} />
                <label htmlFor="cover-upload-desk" style={{ display: 'block', width: '100%', padding: '8px', textAlign: 'center' as const, border: `1px solid ${dk ? '#334155' : '#D1C9C0'}`, borderRadius: 7, fontSize: 12, fontWeight: 500, color: t.textBody, cursor: 'pointer', background: 'transparent', boxSizing: 'border-box' as const }}>
                  {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover' : 'Upload cover'}
                </label>
              </div>
            </Card>
          </div>

          {/* Right — form content */}
          <div>
            {TabContent}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: `1px solid ${dk ? '#1E293B' : '#E5E0D9'}`, marginTop: 8 }}>
              <a href="/dashboard" style={{ ...ghostBtnSt, textDecoration: 'none' }}>Cancel</a>
              {SaveBtn}
            </div>
          </div>
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </DashboardShell>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE — inside DashboardShell (uses mobile bottom nav automatically)
  // Layout: standard page header + pill tabs + single-column form + sticky save
  // ─────────────────────────────────────────────────────────────────────────
  const MobilePage = (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={toggleDark}
    >
      <div style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom))' }}>

        {/* Page header */}
        <div style={{ background: t.cardBg, borderBottom: `1px solid ${dk ? '#1E293B' : '#E5E0D9'}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, color: t.textBody, textDecoration: 'none' }}>
            <Icon path={ICONS.chevL} size={16} sw={2.5} />
            Dashboard
          </a>
          <span style={{ fontSize: 16, fontWeight: 700, color: t.textPri }}>Edit profile</span>
          <a href={`/pro/${session.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#0F766E', textDecoration: 'none' }}>Preview</a>
        </div>

        {/* Avatar + identity — top of Basic tab or persistent */}
        <div style={{ background: dk ? '#181E2A' : '#FFFFFF', padding: '20px 16px 0', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${dk ? '#1E293B' : '#F0EDE8'}` }}>
          {AvatarWidget}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: t.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName || 'Your name'}</div>
            <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 2 }}>
              {trade ? categories.find(c => c.id === trade)?.category_name || 'Painter' : 'Set your trade'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(15,118,110,0.1)', color: '#0F766E' }}>{session.plan || 'Free'}</span>
              {license && <span style={{ fontSize: 11, color: '#0F766E', fontWeight: 600 }}>✓ Licensed</span>}
            </div>
          </div>
        </div>

        {/* Pill tabs */}
        <div style={{ padding: '12px 16px 0', background: t.cardBg }}>
          <TabBar variant="pill" />
        </div>

        {/* Notices */}
        {(saved || errors.submit) && (
          <div style={{ padding: '0 16px', marginTop: 12 }}>{Notices}</div>
        )}

        {/* Form content */}
        <div style={{ padding: '12px 16px 0' }}>
          {TabContent}
        </div>

        {/* Sticky save footer */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: t.cardBg, borderTop: `1px solid ${dk ? '#1E293B' : '#E5E0D9'}`, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
          <a href="/dashboard" style={{ ...ghostBtnSt, textDecoration: 'none', padding: '11px 20px' }}>Cancel</a>
          <div style={{ flex: 1, display: 'flex' }}>
            <button onClick={handleSave} disabled={saving} style={{ ...tealBtnSt, flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
              {saving ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Saving...</> : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </DashboardShell>
  )

  return (
    <>
      <div className="hidden md:block">{DesktopPage}</div>
      <div className="md:hidden">{MobilePage}</div>
    </>
  )
}
