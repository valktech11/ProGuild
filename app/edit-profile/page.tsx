'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { theme } from '@/lib/theme'
import { initials, avatarColor } from '@/lib/utils'
import { Session } from '@/types'

type TradeCategory = { id: string; category_name: string; slug: string }
type Equipment     = { id: string; name: string; certified: boolean }
type ProLicense    = { id: string; trade_name: string; license_number: string; license_expiry_date: string | null; license_status: string; is_primary: boolean }
type Membership    = { id: string; name: string; url?: string }
type Insurance     = { id: string; file_url: string; insurer_name: string | null; policy_number: string | null; coverage_type: string | null; expiry_date: string | null; insurance_status: string }

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

// Tab config — add trade-specific tabs here based on session.trade
const TABS = [
  { key: 'basic'       as const, label: 'Basic info',  d: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 3.6-7 8-7s8 3 8 7' },
  { key: 'credentials' as const, label: 'Credentials', d: 'M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z' },
  { key: 'preferences' as const, label: 'Preferences', d: 'M4 6h16M4 12h16M4 18h16' },
]

export default function EditProfilePage() {
  const router = useRouter()
  const [session,    setSession]    = useState<Session | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [activeTab,  setActiveTab]  = useState<'basic' | 'credentials' | 'preferences'>('basic')
  const [dk,         setDk]         = useState(false)

  const [fullName,      setFullName]      = useState('')
  const [businessName,  setBusinessName]  = useState('')
  const [phone,         setPhone]         = useState('')
  const [phoneCell,     setPhoneCell]     = useState('')
  const [phoneWork,     setPhoneWork]     = useState('')
  const [phoneCell2,    setPhoneCell2]    = useState('')
  const [trade,         setTrade]         = useState('')
  const [yrs,           setYrs]           = useState('')
  const [license,       setLicense]       = useState('')
  const [bio,           setBio]           = useState('')
  const [stateVal,      setStateVal]      = useState('')
  const [city,          setCity]          = useState('')
  const [otherCity,     setOtherCity]     = useState('')
  const [zip,           setZip]           = useState('')
  const [cities,        setCities]        = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [categories,    setCategories]    = useState<TradeCategory[]>([])
  const [photoUrl,      setPhotoUrl]      = useState('')
  const [coverUrl,      setCoverUrl]      = useState('')
  const [uploadingCover,setUploadingCover]= useState(false)
  const [uploading,     setUploading]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [licenseExpiry,    setLicenseExpiry]    = useState('')
  const [oshaType,         setOshaType]         = useState('')
  const [oshaNumber,       setOshaNumber]       = useState('')
  const [oshaExpiry,       setOshaExpiry]       = useState('')
  const [equipment,        setEquipment]        = useState<Equipment[]>([])
  const [newEquip,         setNewEquip]         = useState('')
  const [addingEquip,      setAddingEquip]      = useState(false)
  const [proLicenses,      setProLicenses]      = useState<ProLicense[]>([])
  const [newLicTrade,      setNewLicTrade]      = useState('')
  const [newLicNumber,     setNewLicNumber]     = useState('')
  const [newLicExpiry,     setNewLicExpiry]     = useState('')
  const [addingLic,        setAddingLic]        = useState(false)
  const [memberships,      setMemberships]      = useState<Membership[]>([])
  const [newMembership,    setNewMembership]    = useState('')
  const [addingMembership, setAddingMembership] = useState(false)
  const [insurance,        setInsurance]        = useState<Insurance[]>([])
  const [uploadingCOI,     setUploadingCOI]     = useState(false)
  const [coiError,         setCOIError]         = useState('')

  const [available,     setAvailable]     = useState(false)
  const [availableNote, setAvailableNote] = useState('')
  const [language,      setLanguage]      = useState('en')
  const [counties,      setCounties]      = useState<string[]>([])
  const [services,      setServices]      = useState<string[]>([])
  const [serviceInput,  setServiceInput]  = useState('')
  const [pricingNote,   setPricingNote]   = useState('')

  useEffect(() => {
    setDk(localStorage.getItem('pg_darkmode') === '1')
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.push('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    Promise.all([
      fetch(`/api/pros/${s.id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch(`/api/equipment?pro_id=${s.id}`).then(r => r.json()),
      fetch(`/api/pro-licenses?pro_id=${s.id}`).then(r => r.json()),
      fetch(`/api/memberships?pro_id=${s.id}`).then(r => r.json()),
      fetch(`/api/insurance?pro_id=${s.id}`).then(r => r.json()),
    ]).then(([pd, cd, ed, ld, md, ins]) => {
      const p = pd.pro
      if (p) {
        setFullName(p.full_name || ''); setBusinessName(p.business_name || '')
        setPhone(p.phone || ''); setPhoneCell(p.phone_cell || '')
        setPhoneWork(p.phone_work || ''); setPhoneCell2(p.phone_cell2 || '')
        setTrade(p.trade_category_id || ''); setYrs(p.years_experience?.toString() || '')
        setLicense(p.license_number || ''); setBio(p.bio || '')
        setStateVal(p.state || ''); setCity(p.city || ''); setZip(p.zip_code || '')
        setPhotoUrl(p.profile_photo_url || ''); setCoverUrl(p.cover_image_url || '')
        setLicenseExpiry(p.license_expiry_date || '')
        setOshaType(p.osha_card_type || ''); setOshaNumber(p.osha_card_number || ''); setOshaExpiry(p.osha_card_expiry || '')
        setAvailable(p.available_for_work || false); setAvailableNote(p.available_note || '')
        setLanguage(p.preferred_language || 'en'); setCounties(p.counties_served || [])
        setServices((p as any).services || []); setPricingNote((p as any).pricing_note || '')
      }
      setCategories(cd.categories || []); setEquipment(ed.equipment || [])
      setProLicenses(ld.licenses || []); setMemberships(md.memberships || [])
      setInsurance(ins.insurance || []); setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!stateVal) { setCities([]); return }
    setCitiesLoading(true)
    fetch(`/api/cities?state=${stateVal}`).then(r => r.json())
      .then(d => { setCities(d.cities || []); setCitiesLoading(false) })
      .catch(() => setCitiesLoading(false))
  }, [stateVal])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !session) return
    setUploading(true); setPhotoUrl(URL.createObjectURL(file))
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method: 'POST', body: form }); const d = await r.json()
    setUploading(false)
    if (r.ok) setPhotoUrl(d.url)
    else { setPhotoUrl(''); setErrors(p => ({ ...p, photo: d.error || 'Upload failed' })) }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !session) return
    setUploadingCover(true); setCoverUrl(URL.createObjectURL(file))
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'cover')
    const r = await fetch('/api/upload', { method: 'POST', body: form }); const d = await r.json()
    setUploadingCover(false)
    if (r.ok) { setCoverUrl(d.url); await fetch(`/api/pros/${session.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cover_image_url: d.url }) }) }
  }

  async function handleSave() {
    const errs: Record<string, string> = {}
    if (!fullName.trim()) errs.fullName = 'Name is required'
    if (phone && !/^\+?[\d\s\-().]{7,}$/.test(phone)) errs.phone = 'Enter a valid phone number'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const finalCity = city === '__other__' ? otherCity : city
    const r = await fetch(`/api/pros/${session!.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim(), business_name: businessName.trim() || null,
        phone: phone.trim() || null, phone_cell: phoneCell.trim() || null,
        phone_work: phoneWork.trim() || null, phone_cell2: phoneCell2.trim() || null,
        trade_category_id: trade || null, years_experience: yrs ? parseInt(yrs) : null,
        license_number: license.trim() || null, bio: bio.trim() || null,
        state: stateVal || null, city: finalCity || null, zip_code: zip || null,
        license_expiry_date: licenseExpiry || null,
        osha_card_type: oshaType || null, osha_card_number: oshaNumber || null, osha_card_expiry: oshaExpiry || null,
        available_for_work: available, available_note: availableNote || null,
        preferred_language: language, counties_served: counties.length ? counties : null,
        services: services.length ? services : null, pricing_note: pricingNote.trim() || null,
      }),
    })
    setSaving(false)
    if (r.ok) {
      sessionStorage.setItem('pg_pro', JSON.stringify({ ...session!, name: fullName.trim() }))
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } else { const d = await r.json(); setErrors({ submit: d.error || 'Could not save. Try again.' }) }
  }

  const t         = theme(dk)
  const TEAL      = '#0F766E'
  const TEAL_G    = 'linear-gradient(135deg, #0F766E, #0D9488)'
  const I_BDR     = dk ? '#3D4E60' : '#C8C0B8'
  const I_BG      = dk ? '#1A2130' : '#FFFFFF'
  const C_SHADOW  = dk ? 'none' : '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)'

  const inp = (err?: string): React.CSSProperties => ({
    width: '100%', padding: '11px 14px', minHeight: 46,
    border: `1.5px solid ${err ? '#FCA5A5' : I_BDR}`,
    borderRadius: 8, background: I_BG, color: t.textPri,
    fontSize: 15, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box', lineHeight: 1.4, WebkitAppearance: 'none',
  })
  const sel = (err?: string): React.CSSProperties => ({ ...inp(err), cursor: 'pointer' })
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: 6 }
  const hnt: React.CSSProperties = { fontSize: 12, color: t.textSubtle, marginTop: 4, lineHeight: 1.5 }
  const fld: React.CSSProperties = { marginBottom: 16 }
  const card: React.CSSProperties = { background: t.cardBg, borderRadius: 12, border: `1px solid ${dk ? t.cardBorder : '#E8E1DA'}`, padding: '20px', marginBottom: 16, boxShadow: C_SHADOW }
  const sec: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', borderLeft: `3px solid ${TEAL}`, paddingLeft: 9, marginBottom: 16 }
  const tealBtn = (full = false): React.CSSProperties => ({ background: TEAL_G, color: 'white', border: 'none', borderRadius: 8, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', width: full ? '100%' : 'auto', justifyContent: 'center' })
  const ghostBtn: React.CSSProperties = { background: 'none', border: `1.5px solid ${I_BDR}`, color: t.textBody, borderRadius: 8, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }

  function F({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
    return (
      <div style={fld}>
        <label style={lbl}>{label}</label>
        {children}
        {hint && !error && <p style={hnt}>{hint}</p>}
        {error && <p style={{ ...hnt, color: '#EF4444' }}>{error}</p>}
      </div>
    )
  }

  function Ico({ d, size = 16, sw = 2, color = 'currentColor' }: { d: string; size?: number; sw?: number; color?: string }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    )
  }

  const [avBg, avFg] = avatarColor(fullName || 'A')
  function Av({ size, border }: { size: number; border?: string }) {
    const st: React.CSSProperties = { width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: border || 'none', flexShrink: 0 }
    if (photoUrl) return <img src={photoUrl} alt={fullName} style={st} />
    return <div style={{ ...st, background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.32), fontWeight: 800 }}>{initials(fullName || 'A')}</div>
  }

  function Tag({ label, color = TEAL, onRemove }: { label: string; color?: string; onRemove: () => void }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, padding: '5px 11px', borderRadius: 20, background: color + '18', color, border: `1px solid ${color}30` }}>
        {label}
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 15, lineHeight: 1, padding: 0, opacity: 0.6 }}>x</button>
      </span>
    )
  }

  const tradeName = categories.find(c => c.id === trade)?.category_name || ''

  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `2.5px solid ${TEAL}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  function TabBar({ variant }: { variant: 'underline' | 'mobile' }) {
    if (variant === 'underline') return (
      <div style={{ display: 'flex', borderBottom: `2px solid ${t.cardBorder}`, marginBottom: 28 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px 10px 4px', border: 'none', borderBottom: `2px solid ${activeTab === tab.key ? TEAL : 'transparent'}`, background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? TEAL : t.textMuted, marginBottom: -2, transition: 'all 0.12s', marginRight: 4 }}>
            <Ico d={tab.d} size={15} sw={activeTab === tab.key ? 2.2 : 1.8} color={activeTab === tab.key ? TEAL : t.textMuted} />
            {tab.label}
          </button>
        ))}
      </div>
    )
    return (
      <div style={{ display: 'flex' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, padding: '10px 4px 12px', border: 'none', borderBottom: `3px solid ${activeTab === tab.key ? 'white' : 'transparent'}`, background: 'none', cursor: 'pointer', color: activeTab === tab.key ? 'white' : 'rgba(255,255,255,0.65)', fontWeight: activeTab === tab.key ? 700 : 400, transition: 'all 0.12s' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Ico d={tab.d} size={18} sw={2} color={activeTab === tab.key ? 'white' : 'rgba(255,255,255,0.65)'} />
              <span style={{ fontSize: 12 }}>{tab.label}</span>
            </div>
          </button>
        ))}
      </div>
    )
  }

  const TabContent = (
    <>
      {activeTab === 'basic' && <>
        <div style={card}>
          <div style={sec}>Profile photo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Av size={80} border={`3px solid ${t.cardBorder}`} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: TEAL, border: `2px solid ${t.cardBg}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ico d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" size={11} sw={2.5} color="white" />
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoUpload} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>{fullName || 'Your name'}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{tradeName || 'Trade not set'}</div>
              <button onClick={() => fileRef.current?.click()} style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: TEAL, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                {uploading ? 'Uploading...' : 'Change photo'}
              </button>
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Basic information</div>
          <F label="Full name" error={errors.fullName}>
            <input value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }} placeholder="Your full name" style={inp(errors.fullName)} />
          </F>
          <F label="Business name" hint="Your company or trading name (optional)">
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Johnson Electrical LLC" style={inp()} />
          </F>
          <F label="Phone (primary)" error={errors.phone} hint="Shown to Pro and Elite subscribers">
            <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })) }} placeholder="(555) 000-0000" style={inp(errors.phone)} />
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...fld }}>
            <div><label style={lbl}>Cell</label><input value={phoneCell} onChange={e => setPhoneCell(e.target.value)} placeholder="Cell" style={inp()} /></div>
            <div><label style={lbl}>Work / Office</label><input value={phoneWork} onChange={e => setPhoneWork(e.target.value)} placeholder="Work" style={inp()} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <F label="Trade">
              <select value={trade} onChange={e => setTrade(e.target.value)} style={sel()}>
                <option value="">Select...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </select>
            </F>
            <F label="Years experience">
              <input type="number" value={yrs} onChange={e => setYrs(e.target.value)} placeholder="e.g. 10" min="0" max="60" style={inp()} />
            </F>
          </div>
          <F label="License number" hint="Optional - adds a verified badge to your profile">
            <input value={license} onChange={e => setLicense(e.target.value)} placeholder="e.g. EC13004123" style={inp()} />
          </F>
        </div>
        <div style={card}>
          <div style={sec}>About you</div>
          <F label="Bio" hint="Tell homeowners about your experience and why they should hire you">
            <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="I've been a licensed electrician for 12 years..." rows={4} style={{ ...inp(), resize: 'vertical', lineHeight: 1.6, minHeight: 100 }} />
          </F>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...hnt, marginTop: -8 }}>
            <span>2-4 sentences works best</span>
            <span style={{ color: bio.length > 400 ? '#EF4444' : t.textSubtle }}>{bio.length} / 500</span>
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Location</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="State">
              <select value={stateVal} onChange={e => { setStateVal(e.target.value); setCity('') }} style={sel()}>
                <option value="">State...</option>
                {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}
              </select>
            </F>
            <F label="City">
              <select value={city} onChange={e => setCity(e.target.value)} disabled={!stateVal} style={sel()}>
                <option value="">{!stateVal ? 'Pick state first' : citiesLoading ? 'Loading...' : 'City...'}</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__other__">Other...</option>
              </select>
              {city === '__other__' && <input value={otherCity} onChange={e => setOtherCity(e.target.value)} placeholder="Type your city..." style={{ ...inp(), marginTop: 8 }} />}
            </F>
          </div>
          <F label="Zip code" hint="Helps homeowners find you in searches">
            <input value={zip} onChange={e => setZip(e.target.value)} placeholder="33101" style={{ ...inp(), maxWidth: 160 }} />
          </F>
        </div>
        <div style={card}>
          <div style={sec}>Cover photo</div>
          <div style={{ width: '100%', height: 90, borderRadius: 10, overflow: 'hidden', background: t.cardBgAlt, border: `2px dashed ${coverUrl ? 'transparent' : t.cardBorder}`, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {coverUrl ? <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', color: t.textSubtle }}><div style={{ fontSize: 24, marginBottom: 4 }}>+</div><div style={{ fontSize: 12 }}>No cover photo</div></div>}
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} id="cover-upload" onChange={handleCoverUpload} />
          <label htmlFor="cover-upload" style={{ display: 'block', padding: '10px', textAlign: 'center', border: `1.5px solid ${t.cardBorder}`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: t.textBody, cursor: 'pointer', background: t.cardBgAlt }}>
            {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover photo' : 'Upload cover photo'}
          </label>
          <p style={{ ...hnt, textAlign: 'center', marginTop: 6 }}>Shows behind your name on your public profile</p>
        </div>
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2 }}>Current plan</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.textPri }}>{session?.plan || 'Free'}</div>
          </div>
          <a href="/upgrade" style={{ ...tealBtn(), textDecoration: 'none', fontSize: 13 }}>Upgrade</a>
        </div>
      </>}

      {activeTab === 'credentials' && <>
        <div style={card}>
          <div style={sec}>License expiry</div>
          <F label="License expiry date" hint="We'll alert you before it expires">
            <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} style={inp()} />
          </F>
          {licenseExpiry && <div style={{ fontSize: 13, color: t.textMuted }}>Expires: <strong style={{ color: t.textPri }}>{new Date(licenseExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>}
        </div>
        <div style={card}>
          <div style={sec}>OSHA certification</div>
          <F label="OSHA card type">
            <select value={oshaType} onChange={e => setOshaType(e.target.value)} style={sel()}>
              <option value="">None / not certified</option>
              {['OSHA-10','OSHA-30','OSHA-500','OSHA-510'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </F>
          {oshaType && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Card number" hint="Optional"><input value={oshaNumber} onChange={e => setOshaNumber(e.target.value)} placeholder="e.g. 12345678" style={inp()} /></F>
            <F label="Expiry date"><input type="date" value={oshaExpiry} onChange={e => setOshaExpiry(e.target.value)} style={inp()} /></F>
          </div>}
        </div>
        <div style={card}>
          <div style={sec}>Licenses</div>
          {proLicenses.map(lic => (
            <div key={lic.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: t.cardBgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: lic.license_status === 'active' ? '#22C55E' : lic.license_status === 'expiring_soon' ? '#F59E0B' : '#EF4444' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{lic.trade_name}</div>
                  <div style={{ fontSize: 12, color: t.textSubtle }}>{lic.license_number}{lic.license_expiry_date ? ` exp ${new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}</div>
                </div>
                {lic.is_primary && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: TEAL + '18', color: TEAL }}>Primary</span>}
              </div>
              <button onClick={async () => { if (!session) return; await fetch('/api/pro-licenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: lic.id }) }); setProLicenses(p => p.filter(l => l.id !== lic.id)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 18, padding: 0 }}>x</button>
            </div>
          ))}
          <div style={{ padding: 14, background: t.cardBgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Add a license</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Trade / service</label><input value={newLicTrade} onChange={e => setNewLicTrade(e.target.value)} placeholder="e.g. Air conditioning" style={inp()} /></div>
              <div><label style={lbl}>License number</label><input value={newLicNumber} onChange={e => setNewLicNumber(e.target.value)} placeholder="e.g. CAC1817585" style={inp()} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Expiry date (optional)</label><input type="date" value={newLicExpiry} onChange={e => setNewLicExpiry(e.target.value)} style={{ ...inp(), maxWidth: 180 }} /></div>
            <button disabled={addingLic || !newLicTrade.trim() || !newLicNumber.trim()}
              onClick={async () => { if (!session) return; setAddingLic(true); const r = await fetch('/api/pro-licenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, trade_name: newLicTrade.trim(), license_number: newLicNumber.trim(), license_expiry_date: newLicExpiry || null, is_primary: proLicenses.length === 0 }) }); const d = await r.json(); if (r.ok) { setProLicenses(p => [...p, d.license]); setNewLicTrade(''); setNewLicNumber(''); setNewLicExpiry('') } setAddingLic(false) }}
              style={{ ...tealBtn(), opacity: (addingLic || !newLicTrade.trim() || !newLicNumber.trim()) ? 0.5 : 1 }}>
              {addingLic ? 'Adding...' : '+ Add license'}
            </button>
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Equipment and tools</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={newEquip} onChange={e => setNewEquip(e.target.value)} onKeyDown={async e => { if (e.key === 'Enter' && newEquip.trim() && session) { e.preventDefault(); setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) } }} placeholder="e.g. Nail gun, Laser level..." style={{ ...inp(), flex: 1 }} />
            <button onClick={async () => { if (!newEquip.trim() || !session) return; setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) }} disabled={addingEquip || !newEquip.trim()} style={{ ...tealBtn(), opacity: (!newEquip.trim() || addingEquip) ? 0.5 : 1 }}>Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {equipment.map(eq => <Tag key={eq.id} label={eq.name} onRemove={async () => { if (!session) return; await fetch('/api/equipment', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: eq.id }) }); setEquipment(p => p.filter(e => e.id !== eq.id)) }} />)}
            {equipment.length === 0 && <p style={{ ...hnt, fontStyle: 'italic' }}>No equipment added yet.</p>}
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Associations and memberships</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={newMembership} onChange={e => setNewMembership(e.target.value)} placeholder="e.g. Florida Roofing Assoc., NARI..." style={{ ...inp(), flex: 1 }} />
            <button onClick={async () => { if (!newMembership.trim() || !session) return; setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) }} disabled={addingMembership || !newMembership.trim()} style={{ ...tealBtn(), opacity: (!newMembership.trim() || addingMembership) ? 0.5 : 1 }}>Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {memberships.map(m => <Tag key={m.id} label={m.name} color="#1D4ED8" onRemove={async () => { if (!session) return; await fetch('/api/memberships', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: m.id }) }); setMemberships(p => p.filter(x => x.id !== m.id)) }} />)}
            {memberships.length === 0 && <p style={{ ...hnt, fontStyle: 'italic' }}>No memberships added yet.</p>}
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Certificate of Insurance</div>
          <p style={{ ...hnt, marginBottom: 14 }}>AI extracts the expiry date and adds a verified badge to your profile.</p>
          {coiError && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', color: '#DC2626', fontSize: 13, borderRadius: 8 }}>{coiError}</div>}
          {insurance.map(ins => {
            const expStr = ins.expiry_date ? new Date(ins.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
            const c = ins.insurance_status === 'active' ? TEAL : ins.insurance_status === 'expiring_soon' ? '#B45309' : '#DC2626'
            return (
              <div key={ins.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 12px', background: c + '10', border: `1px solid ${c}30`, borderRadius: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{ins.insurer_name || 'Insurance document'}</div>
                  <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>{ins.coverage_type && `${ins.coverage_type} `}{expStr ? `Expires ${expStr}` : 'Expiry unknown'}</div>
                </div>
                <button onClick={async () => { if (!session) return; await fetch('/api/insurance', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: ins.id }) }); setInsurance(p => p.filter(x => x.id !== ins.id)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 18, padding: 0, marginLeft: 8 }}>x</button>
              </div>
            )
          })}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 16px', border: `2px dashed ${uploadingCOI ? TEAL : t.cardBorder}`, borderRadius: 10, cursor: 'pointer', background: uploadingCOI ? TEAL + '08' : 'transparent', transition: 'all 0.15s' }}>
            <input type="file" style={{ display: 'none' }} accept="image/*,.pdf" onChange={async e => {
              const file = e.target.files?.[0]; if (!file || !session) return
              setUploadingCOI(true); setCOIError('')
              const form = new FormData(); form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'insurance')
              const up = await fetch('/api/upload', { method: 'POST', body: form }); const upd = await up.json()
              if (!up.ok) { setCOIError(upd.error || 'Upload failed'); setUploadingCOI(false); return }
              const ins2 = await fetch('/api/insurance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, file_url: upd.url }) }); const insd = await ins2.json()
              if (ins2.ok) setInsurance(p => [insd.insurance, ...p]); else setCOIError(insd.error || 'Could not process document')
              setUploadingCOI(false)
            }} />
            {uploadingCOI
              ? <><div style={{ width: 16, height: 16, border: `2px solid ${TEAL}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><span style={{ fontSize: 14, color: TEAL }}>Uploading and extracting...</span></>
              : <span style={{ fontSize: 14, color: t.textMuted }}>Upload COI (PDF or image)</span>}
          </label>
        </div>
      </>}

      {activeTab === 'preferences' && <>
        <div style={card}>
          <div style={sec}>Availability</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>Available for new work</div>
              <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 3 }}>Shows a green badge on your profile and in search</div>
            </div>
            <button onClick={() => setAvailable(a => !a)} style={{ position: 'relative', width: 48, height: 26, borderRadius: 13, border: 'none', background: available ? TEAL : t.filterTrackOff, cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 3, left: available ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
            </button>
          </div>
          {available && <div style={{ marginTop: 14 }}><F label="Availability note" hint="Optional - shown on your profile"><input value={availableNote} onChange={e => setAvailableNote(e.target.value)} placeholder="e.g. Available weekends, small jobs..." style={inp()} /></F></div>}
        </div>
        <div style={card}>
          <div style={sec}>Preferred language</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['en','English'],['es','Spanish']].map(([val, label]) => (
              <button key={val} onClick={() => setLanguage(val)} style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${language === val ? TEAL : t.cardBorder}`, background: language === val ? TEAL + '12' : t.cardBgAlt, fontSize: 14, fontWeight: language === val ? 700 : 500, color: language === val ? TEAL : t.textBody, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Services offered</div>
          <p style={{ ...hnt, marginBottom: 12 }}>Shown as tags on your public profile.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {services.map(svc => <Tag key={svc} label={svc} onRemove={() => setServices(p => p.filter(s => s !== svc))} />)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={serviceInput} onChange={e => setServiceInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && serviceInput.trim()) { e.preventDefault(); if (!services.includes(serviceInput.trim())) setServices(p => [...p, serviceInput.trim()]); setServiceInput('') } }} placeholder='e.g. "Panel upgrades"' style={{ ...inp(), flex: 1 }} />
            <button onClick={() => { if (serviceInput.trim() && !services.includes(serviceInput.trim())) { setServices(p => [...p, serviceInput.trim()]); setServiceInput('') } }} style={tealBtn()}>Add</button>
          </div>
        </div>
        <div style={card}>
          <div style={sec}>Pricing signal</div>
          <p style={{ ...hnt, marginBottom: 12 }}>Sets expectations and increases contact rate.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {['Free estimates','Free consultations','Starting at $75/hr','Starting at $150/hr','Starting at $500','Contact for pricing'].map(opt => (
              <button key={opt} onClick={() => setPricingNote(opt)} style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${pricingNote === opt ? TEAL : t.cardBorder}`, background: pricingNote === opt ? TEAL + '12' : t.cardBgAlt, fontSize: 13, fontWeight: pricingNote === opt ? 700 : 400, color: pricingNote === opt ? TEAL : t.textBody, cursor: 'pointer', textAlign: 'left' as const }}>
                {opt}
              </button>
            ))}
          </div>
          <input value={pricingNote} onChange={e => setPricingNote(e.target.value)} placeholder="Or type your own pricing note..." style={inp()} />
        </div>
        <div style={card}>
          <div style={sec}>Counties served (Florida)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {FL_COUNTIES.map(county => {
              const isSel = counties.includes(county)
              return <button key={county} onClick={() => setCounties(p => isSel ? p.filter(c => c !== county) : [...p, county])} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 20, border: `1.5px solid ${isSel ? TEAL : t.cardBorder}`, background: isSel ? TEAL : t.cardBgAlt, color: isSel ? 'white' : t.textBody, cursor: 'pointer', fontWeight: isSel ? 700 : 400 }}>{county}</button>
            })}
          </div>
          {counties.length > 0 && <p style={{ ...hnt, color: TEAL, fontWeight: 600, marginTop: 8 }}>{counties.length} count{counties.length === 1 ? 'y' : 'ies'} selected</p>}
        </div>
      </>}
    </>
  )

  const SaveBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 20, borderTop: `1px solid ${t.cardBorder}`, marginTop: 4 }}>
      <a href="/dashboard" style={{ ...ghostBtn, textDecoration: 'none' }}>Cancel</a>
      <button onClick={handleSave} disabled={saving} style={{ ...tealBtn(), minWidth: 140, opacity: saving ? 0.7 : 1 }}>
        {saving ? <><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Saving...</> : 'Save changes'}
      </button>
    </div>
  )

  // DESKTOP — inside DashboardShell. Shell handles logo, sidebar, topnav.
  const Desktop = (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0, letterSpacing: '-0.3px' }}>Edit profile</h1>
          <p style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>Keep your profile up to date to attract more homeowners</p>
        </div>
        <a href={`/pro/${session?.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: TEAL, textDecoration: 'none', padding: '8px 14px', border: `1.5px solid ${TEAL}60`, borderRadius: 8, background: TEAL + '08' }}>
          View public profile
        </a>
      </div>
      {saved && <div style={{ marginBottom: 16, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: '#15803D' }}>Profile saved successfully</div>}
      {errors.submit && <div style={{ marginBottom: 16, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 14, color: '#DC2626' }}>{errors.submit}</div>}
      <TabBar variant="underline" />
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 28, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Av size={120} border={`3px solid ${t.cardBorder}`} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ position: 'absolute', bottom: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: TEAL, border: `2px solid ${t.cardBg}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
                  <Ico d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" size={13} sw={2.5} color="white" />
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.textPri, marginTop: 12 }}>{fullName || 'Your name'}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{tradeName || 'Trade not set'}</div>
            </div>
            <div style={{ borderTop: `1px solid ${t.cardBorder}`, paddingTop: 14, marginBottom: 14 }}>
              {[['Plan', session?.plan || 'Free'], ['Member since', '2026']].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: t.textMuted }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{value}</span>
                </div>
              ))}
            </div>
            <a href="/upgrade" style={{ ...tealBtn(true), textDecoration: 'none', marginBottom: 16, fontSize: 13 }}>Upgrade plan</a>
            <div style={{ borderTop: `1px solid ${t.cardBorder}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Cover photo</div>
              <div style={{ width: '100%', height: 72, borderRadius: 8, overflow: 'hidden', background: t.cardBgAlt, border: `2px dashed ${coverUrl ? 'transparent' : t.cardBorder}`, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {coverUrl ? <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, color: t.textSubtle }}>No cover photo</span>}
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} id="cover-desk" onChange={handleCoverUpload} />
              <label htmlFor="cover-desk" style={{ display: 'block', padding: '8px', textAlign: 'center', border: `1px solid ${t.cardBorder}`, borderRadius: 7, fontSize: 12, fontWeight: 600, color: t.textBody, cursor: 'pointer', background: t.cardBgAlt }}>
                {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover' : 'Upload cover'}
              </label>
            </div>
          </div>
        </div>
        <div>{TabContent}{SaveBar}</div>
      </div>
    </div>
  )

  // MOBILE — also inside DashboardShell (gets bottom nav for free)
  const Mobile = (
    <div style={{ minHeight: '100vh', background: t.pageBg, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <div style={{ background: TEAL }}>
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 14 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Av size={68} border="3px solid rgba(255,255,255,0.3)" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
                <Ico d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" size={11} sw={2.5} color={TEAL} />
              </button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName || 'Your name'}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>{tradeName || 'Set your trade in Basic info'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.20)', color: 'white' }}>{session?.plan || 'Free'}</span>
                {license && <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.80)' }}>Licensed</span>}
              </div>
            </div>
            <a href={`/pro/${session?.id}`} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '6px 10px', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 8 }}>View</a>
          </div>
          <TabBar variant="mobile" />
        </div>
      </div>
      {saved && <div style={{ margin: '12px 12px 0', padding: '11px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#15803D' }}>Saved</div>}
      {errors.submit && <div style={{ margin: '12px 12px 0', padding: '11px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 14, color: '#DC2626' }}>{errors.submit}</div>}
      <div style={{ padding: '12px 12px 0' }}>{TabContent}</div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: t.cardBg, borderTop: `1px solid ${t.cardBorder}`, padding: '10px 12px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
        <a href="/dashboard" style={{ ...ghostBtn, textDecoration: 'none', textAlign: 'center' as const }}>Cancel</a>
        <button onClick={handleSave} disabled={saving} style={{ ...tealBtn(true), flex: 1, opacity: saving ? 0.7 : 1 }}>
          {saving ? <><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Saving...</> : 'Save changes'}
        </button>
      </div>
    </div>
  )

  return (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}
    >
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      <div className="md:hidden">{Mobile}</div>
      <div className="hidden md:block">{Desktop}</div>
    </DashboardShell>
  )
}
