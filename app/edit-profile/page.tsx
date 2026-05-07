'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { theme } from '@/lib/theme'

type Session = { id: string; name: string; email: string; plan: string }
type TradeCategory = { id: string; category_name: string; slug: string }
type Equipment = { id: string; name: string; certified: boolean }
type ProLicense = { id: string; trade_name: string; license_number: string; license_expiry_date: string | null; license_status: string; is_primary: boolean }
type Membership = { id: string; name: string; url?: string }
type Insurance = { id: string; file_url: string; insurer_name: string | null; policy_number: string | null; coverage_type: string | null; expiry_date: string | null; insurance_status: string }

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

const inp = (err?: string) =>
  `w-full px-3 py-2.5 border rounded-xl text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-all ${err ? 'border-red-300' : 'border-gray-200'}`

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
const COLORS = [['#0F766E','#FFFFFF'],['#1E40AF','#FFFFFF'],['#7C3AED','#FFFFFF'],['#B45309','#FFFFFF'],['#047857','#FFFFFF']]

const FL_COUNTIES = ['Alachua','Baker','Bay','Bradford','Brevard','Broward','Calhoun','Charlotte','Citrus','Clay','Collier','Columbia','DeSoto','Dixie','Duval','Escambia','Flagler','Franklin','Gadsden','Gilchrist','Glades','Gulf','Hamilton','Hardee','Hendry','Hernando','Highlands','Hillsborough','Holmes','Indian River','Jackson','Jefferson','Lafayette','Lake','Lee','Leon','Levy','Liberty','Madison','Manatee','Marion','Martin','Miami-Dade','Monroe','Nassau','Okaloosa','Okeechobee','Orange','Osceola','Palm Beach','Pasco','Pinellas','Polk','Putnam','St. Johns','St. Lucie','Santa Rosa','Sarasota','Seminole','Sumter','Suwannee','Taylor','Union','Volusia','Wakulla','Walton','Washington']

export default function EditProfilePage() {
  const router = useRouter()
  const [session, setSession]   = useState<Session | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'basic' | 'credentials' | 'preferences'>('basic')
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  // Basic
  const [fullName, setFullName]         = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone]               = useState('')
  const [phoneCell, setPhoneCell]       = useState('')
  const [phoneWork, setPhoneWork]       = useState('')
  const [phoneCell2, setPhoneCell2]     = useState('')
  const [trade, setTrade]               = useState('')
  const [yrs, setYrs]                   = useState('')
  const [license, setLicense]           = useState('')
  const [bio, setBio]                   = useState('')
  const [state, setState]               = useState('')
  const [city, setCity]                 = useState('')
  const [otherCity, setOtherCity]       = useState('')
  const [zip, setZip]                   = useState('')
  const [cities, setCities]             = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [categories, setCategories]     = useState<TradeCategory[]>([])
  const [photoUrl, setPhotoUrl]         = useState('')
  const [coverUrl, setCoverUrl]         = useState('')
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Credentials
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [oshaType, setOshaType]     = useState('')
  const [oshaNumber, setOshaNumber] = useState('')
  const [oshaExpiry, setOshaExpiry] = useState('')
  const [equipment, setEquipment]   = useState<Equipment[]>([])
  const [newEquip, setNewEquip]     = useState('')
  const [addingEquip, setAddingEquip] = useState(false)
  const [proLicenses, setProLicenses] = useState<ProLicense[]>([])
  const [newLicTrade, setNewLicTrade]   = useState('')
  const [newLicNumber, setNewLicNumber] = useState('')
  const [newLicExpiry, setNewLicExpiry] = useState('')
  const [addingLic, setAddingLic]       = useState(false)
  const [memberships, setMemberships]   = useState<Membership[]>([])
  const [newMembership, setNewMembership] = useState('')
  const [addingMembership, setAddingMembership] = useState(false)
  const [insurance, setInsurance]       = useState<Insurance[]>([])
  const [uploadingCOI, setUploadingCOI] = useState(false)
  const [coiError, setCOIError]         = useState('')

  // Preferences
  const [available, setAvailable]       = useState(false)
  const [availableNote, setAvailableNote] = useState('')
  const [language, setLanguage]         = useState('en')
  const [counties, setCounties]         = useState<string[]>([])
  const [services, setServices]         = useState<string[]>([])
  const [serviceInput, setServiceInput] = useState('')
  const [pricingNote, setPricingNote]   = useState('')

  const [bg, fg] = COLORS[fullName.charCodeAt(0) % COLORS.length] || COLORS[0]

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (!state) { setCities([]); return }
    setCitiesLoading(true)
    fetch(`/api/cities?state=${state}`)
      .then(r => r.json())
      .then(d => { setCities(d.cities || []); setCitiesLoading(false) })
      .catch(() => setCitiesLoading(false))
  }, [state])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true)
    // Show preview immediately
    const localPreview = URL.createObjectURL(file)
    setPhotoUrl(localPreview)
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) setPhotoUrl(d.url)  // replace with permanent R2 URL
    else { setPhotoUrl(''); setErrors(p => ({ ...p, photo: d.error || 'Upload failed' })) }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploadingCover(true)
    const localPreview = URL.createObjectURL(file)
    setCoverUrl(localPreview)
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
        trade_category_id: trade || null,
        years_experience: yrs ? parseInt(yrs) : null,
        license_number: license.trim() || null, bio: bio.trim() || null,
        state: state || null, city: finalCity || null, zip_code: zip || null,
        license_expiry_date: licenseExpiry || null,
        osha_card_type: oshaType || null, osha_card_number: oshaNumber || null, osha_card_expiry: oshaExpiry || null,
        available_for_work: available, available_note: availableNote || null,
        preferred_language: language, counties_served: counties.length ? counties : null,
        services: services.length ? services : null,
        pricing_note: pricingNote.trim() || null,
      }),
    })
    setSaving(false)
    if (r.ok) {
      const updated = { ...session!, name: fullName.trim() }
      sessionStorage.setItem('pg_pro', JSON.stringify(updated))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const d = await r.json()
      setErrors({ submit: d.error || 'Could not save. Try again.' })
    }
  }

  const t = theme(dk)

  // ── Shared style helpers — all use t.* tokens, zero Tailwind ──────────────
  const inputSt = (err?: string): React.CSSProperties => ({
    width: '100%', padding: '11px 14px',
    border: `1.5px solid ${err ? '#FCA5A5' : t.inputBorder}`,
    borderRadius: 10, background: t.inputBg,
    color: t.textPri, fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
    WebkitAppearance: 'none',
  })
  const selectSt = (err?: string): React.CSSProperties => ({
    ...inputSt(err), cursor: 'pointer',
  })
  const labelSt: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: t.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.07em',
    display: 'block', marginBottom: 6,
  }
  const sectionTitleSt: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: t.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    borderLeft: '3px solid #0F766E', paddingLeft: 10,
    marginBottom: 20,
  }
  const hintSt: React.CSSProperties = {
    fontSize: 12, color: t.textSubtle, marginTop: 5, lineHeight: 1.4,
  }
  const fieldSt: React.CSSProperties = { marginBottom: 20 }
  const cardSt: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
    borderRadius: 16, padding: '20px 16px', marginBottom: 12,
  }
  const tealBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg,#0F766E,#0D9488)',
    color: 'white', border: 'none', borderRadius: 10,
    padding: '12px 20px', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: 8, whiteSpace: 'nowrap',
  }
  const ghostBtn: React.CSSProperties = {
    background: 'none', border: `1.5px solid ${t.cardBorder}`,
    color: t.textBody, borderRadius: 10, padding: '11px 20px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }

  function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
    return (
      <div style={fieldSt}>
        <label style={labelSt}>{label}</label>
        {children}
        {hint && !error && <p style={hintSt}>{hint}</p>}
        {error && <p style={{ ...hintSt, color: '#EF4444' }}>{error}</p>}
      </div>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #0F766E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const tabs = [
    { key: 'basic' as const,       icon: '📋', label: 'Basic' },
    { key: 'credentials' as const, icon: '🏅', label: 'Credentials' },
    { key: 'preferences' as const, icon: '⚙️', label: 'Preferences' },
  ]

  const TabContent = (
    <>
{/* ══════════ BASIC ══════════ */}
        {activeTab === 'basic' && (<>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Basic information</div>
            <Field label="Full name" error={errors.fullName}>
              <input value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
                placeholder="Your full name" style={inputSt(errors.fullName)} />
            </Field>
            <Field label="Business name" hint="Your company or trading name (optional)">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Johnson Electrical LLC" style={inputSt()} />
            </Field>
            <Field label="Phone (primary)" error={errors.phone} hint="Shown to Pro and Elite plan subscribers">
              <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })) }}
                placeholder="(555) 000-0000" style={inputSt(errors.phone)} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
              {([['Cell', phoneCell, setPhoneCell], ['Work', phoneWork, setPhoneWork], ['Cell 2', phoneCell2, setPhoneCell2]] as const).map(([lbl, val, setter]) => (
                <div key={lbl}>
                  <label style={labelSt}>{lbl}</label>
                  <input value={val} onChange={e => (setter as any)(e.target.value)} placeholder={lbl}
                    style={{ ...inputSt(), padding: '10px 10px', fontSize: 13 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Trade" hint="Primary category">
                <select value={trade} onChange={e => setTrade(e.target.value)} style={selectSt()}>
                  <option value="">Select trade...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                </select>
              </Field>
              <Field label="Years experience">
                <input type="number" value={yrs} onChange={e => setYrs(e.target.value)}
                  placeholder="e.g. 10" min="0" max="60" style={inputSt()} />
              </Field>
            </div>
            <Field label="License number" hint="Optional — adds a verified badge to your profile">
              <input value={license} onChange={e => setLicense(e.target.value)}
                placeholder="e.g. EC13004123" style={inputSt()} />
            </Field>
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>About you</div>
            <Field label="Bio" hint="Tell homeowners about your experience and why they should hire you">
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                placeholder="I've been a licensed electrician for 12 years, specializing in panel upgrades..."
                rows={4} style={{ ...inputSt(), resize: 'vertical', lineHeight: 1.6, minHeight: 100 }} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textSubtle, marginTop: -12, marginBottom: 4 }}>
              <span>2–4 sentences works best</span>
              <span style={{ color: bio.length > 400 ? '#EF4444' : t.textSubtle }}>{bio.length} chars</span>
            </div>
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Location</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="State">
                <select value={state} onChange={e => { setState(e.target.value); setCity('') }} style={selectSt()}>
                  <option value="">State...</option>
                  {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                </select>
              </Field>
              <Field label="City">
                <select value={city} onChange={e => setCity(e.target.value)} disabled={!state} style={selectSt()}>
                  <option value="">{!state ? 'State first' : citiesLoading ? 'Loading...' : 'City...'}</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__other__">Other...</option>
                </select>
                {city === '__other__' && (
                  <input value={otherCity} onChange={e => setOtherCity(e.target.value)}
                    placeholder="Type your city..." style={{ ...inputSt(), marginTop: 8 }} />
                )}
              </Field>
            </div>
            <Field label="Zip code" hint="Helps homeowners find you in searches">
              <input value={zip} onChange={e => setZip(e.target.value)} placeholder="33101"
                style={{ ...inputSt(), maxWidth: 160 }} />
            </Field>
          </div>

          {/* Cover photo — in Basic tab, more discoverable */}
          <div style={cardSt}>
            <div style={sectionTitleSt}>Cover photo</div>
            <div style={{ position: 'relative', width: '100%', height: 100, borderRadius: 12, overflow: 'hidden', background: t.cardBgAlt, border: `2px dashed ${coverUrl ? 'transparent' : t.cardBorder}`, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {coverUrl
                ? <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ textAlign: 'center', color: t.textSubtle }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 4px', display: 'block' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    <div style={{ fontSize: 12 }}>No cover photo</div>
                  </div>
              }
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} id="cover-upload" onChange={handleCoverUpload} />
            <label htmlFor="cover-upload" style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'center', border: `1.5px solid ${t.cardBorder}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: t.textBody, cursor: 'pointer', background: t.cardBgAlt, boxSizing: 'border-box' }}>
              {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover photo' : 'Upload cover photo'}
            </label>
            <p style={{ ...hintSt, textAlign: 'center', marginTop: 6 }}>Shows behind your name on your public profile</p>
          </div>

          {/* Plan card */}
          <div style={{ ...cardSt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 2 }}>Current plan</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.textPri }}>{session?.plan || 'Free'}</div>
            </div>
            <a href="/upgrade" style={{ ...tealBtn, textDecoration: 'none', fontSize: 13, padding: '10px 16px' }}>
              Upgrade →
            </a>
          </div>

        </>)}

        {/* ══════════ CREDENTIALS ══════════ */}
        {activeTab === 'credentials' && (<>

          <div style={cardSt}>
            <div style={sectionTitleSt}>License expiry</div>
            <Field label="License expiry date" hint="We'll alert you before it expires">
              <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} style={inputSt()} />
            </Field>
            {licenseExpiry && (
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: -12 }}>
                Expires: <span style={{ fontWeight: 600, color: t.textPri }}>{new Date(licenseExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            )}
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>OSHA certification</div>
            <Field label="OSHA card type">
              <select value={oshaType} onChange={e => setOshaType(e.target.value)} style={selectSt()}>
                <option value="">None / not certified</option>
                {['OSHA-10','OSHA-30','OSHA-500','OSHA-510'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            {oshaType && (<>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Card number" hint="Optional">
                  <input value={oshaNumber} onChange={e => setOshaNumber(e.target.value)} placeholder="e.g. 12345678" style={inputSt()} />
                </Field>
                <Field label="Expiry date">
                  <input type="date" value={oshaExpiry} onChange={e => setOshaExpiry(e.target.value)} style={inputSt()} />
                </Field>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(29,78,216,0.08)', border: '1px solid rgba(29,78,216,0.2)', borderRadius: 20, padding: '6px 14px' }}>
                <span>🦺</span><span style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8' }}>{oshaType} certified</span>
              </div>
            </>)}
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Equipment &amp; tools</div>
            <p style={{ ...hintSt, marginBottom: 12 }}>Add equipment and tools you're proficient with.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="text" value={newEquip} onChange={e => setNewEquip(e.target.value)}
                onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); if (!newEquip.trim() || !session) return; setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) } }}
                placeholder="e.g. Nail gun, Laser level..." style={{ ...inputSt(), flex: 1 }} />
              <button onClick={async () => { if (!newEquip.trim() || !session) return; setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) }}
                disabled={addingEquip || !newEquip.trim()} style={{ ...tealBtn, padding: '11px 16px', opacity: (addingEquip || !newEquip.trim()) ? 0.5 : 1 }}>+ Add</button>
            </div>
            {equipment.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {equipment.map(eq => (
                  <span key={eq.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px', borderRadius: 20, background: t.cardBgAlt, color: t.textBody, border: `1px solid ${t.cardBorder}` }}>
                    {eq.name}
                    <button onClick={async () => { if (!session) return; await fetch('/api/equipment', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: eq.id }) }); setEquipment(prev => prev.filter(e => e.id !== eq.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 16, lineHeight: 1, padding: 0, fontWeight: 700 }}>×</button>
                  </span>
                ))}
              </div>
            ) : <p style={{ ...hintSt, fontStyle: 'italic' }}>No equipment added yet.</p>}
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Licenses</div>
            {proLicenses.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proLicenses.map(lic => (
                  <div key={lic.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: t.cardBgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: lic.license_status === 'active' ? '#22C55E' : lic.license_status === 'expiring_soon' ? '#F59E0B' : '#EF4444' }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>{lic.trade_name}</div>
                        <div style={{ fontSize: 12, color: t.textSubtle }}>{lic.license_number}{lic.license_expiry_date ? ` · exp ${new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}</div>
                      </div>
                      {lic.is_primary && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(15,118,110,0.1)', color: '#0F766E' }}>Primary</span>}
                    </div>
                    <button onClick={async () => { if (!session) return; await fetch('/api/pro-licenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: lic.id }) }); setProLicenses(prev => prev.filter(l => l.id !== lic.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '14px', background: t.cardBgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: 12 }}>
              <div style={{ ...labelSt, marginBottom: 12 }}>Add a license</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelSt}>Trade / service</label>
                  <input value={newLicTrade} onChange={e => setNewLicTrade(e.target.value)} placeholder="e.g. Air conditioning" style={inputSt()} />
                </div>
                <div>
                  <label style={labelSt}>License number</label>
                  <input value={newLicNumber} onChange={e => setNewLicNumber(e.target.value)} placeholder="e.g. CAC1817585" style={inputSt()} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSt}>Expiry date (optional)</label>
                <input type="date" value={newLicExpiry} onChange={e => setNewLicExpiry(e.target.value)} style={{ ...inputSt(), maxWidth: 180 }} />
              </div>
              <button disabled={addingLic || !newLicTrade.trim() || !newLicNumber.trim()}
                onClick={async () => { if (!session) return; setAddingLic(true); const r = await fetch('/api/pro-licenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, trade_name: newLicTrade.trim(), license_number: newLicNumber.trim(), license_expiry_date: newLicExpiry || null, is_primary: proLicenses.length === 0 }) }); const d = await r.json(); if (r.ok) { setProLicenses(prev => [...prev, d.license]); setNewLicTrade(''); setNewLicNumber(''); setNewLicExpiry('') } setAddingLic(false) }}
                style={{ ...tealBtn, opacity: (addingLic || !newLicTrade.trim() || !newLicNumber.trim()) ? 0.5 : 1 }}>
                {addingLic ? 'Adding...' : '+ Add license'}
              </button>
            </div>
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Associations &amp; memberships</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={newMembership} onChange={e => setNewMembership(e.target.value)}
                onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); if (!newMembership.trim() || !session) return; setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) } }}
                placeholder="e.g. Florida Roofing Assoc., NARI..." style={{ ...inputSt(), flex: 1 }} />
              <button onClick={async () => { if (!newMembership.trim() || !session) return; setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) }}
                disabled={addingMembership || !newMembership.trim()} style={{ ...tealBtn, padding: '11px 14px', opacity: (addingMembership || !newMembership.trim()) ? 0.5 : 1 }}>+ Add</button>
            </div>
            {memberships.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {memberships.map(m => (
                  <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px', borderRadius: 20, background: 'rgba(29,78,216,0.08)', color: '#1D4ED8', border: '1px solid rgba(29,78,216,0.15)' }}>
                    🏛️ {m.name}
                    <button onClick={async () => { if (!session) return; await fetch('/api/memberships', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: m.id }) }); setMemberships(prev => prev.filter(x => x.id !== m.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93C5FD', fontSize: 16, lineHeight: 1, padding: 0, fontWeight: 700 }}>×</button>
                  </span>
                ))}
              </div>
            ) : <p style={{ ...hintSt, fontStyle: 'italic' }}>No memberships added yet.</p>}
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Certificate of Insurance</div>
            <p style={{ ...hintSt, marginBottom: 14 }}>Upload your COI. AI extracts the expiry date and adds a 🛡️ verified badge to your profile.</p>
            {coiError && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', color: '#DC2626', fontSize: 13, borderRadius: 10 }}>{coiError}</div>}
            {insurance.length > 0 && (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {insurance.map(ins => {
                  const expiryStr = ins.expiry_date ? new Date(ins.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                  const stBg = ins.insurance_status === 'active' ? 'rgba(15,118,110,0.08)' : ins.insurance_status === 'expiring_soon' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'
                  const stColor = ins.insurance_status === 'active' ? '#0F766E' : ins.insurance_status === 'expiring_soon' ? '#B45309' : '#DC2626'
                  return (
                    <div key={ins.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px', background: stBg, border: `1px solid ${stColor}33`, borderRadius: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>{ins.insurer_name || 'Insurance document'}</div>
                        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>
                          {ins.coverage_type && <span>{ins.coverage_type} · </span>}
                          {expiryStr ? <span>Expires {expiryStr}</span> : <span>Expiry unknown</span>}
                        </div>
                      </div>
                      <button onClick={async () => { if (!session) return; await fetch('/api/insurance', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: ins.id }) }); setInsurance(prev => prev.filter(x => x.id !== ins.id)) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 20, lineHeight: 1, padding: 0, marginLeft: 8 }}>×</button>
                    </div>
                  )
                })}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '16px', border: `2px dashed ${uploadingCOI ? '#0F766E' : t.cardBorder}`, borderRadius: 12, cursor: 'pointer', background: uploadingCOI ? 'rgba(15,118,110,0.05)' : 'transparent', boxSizing: 'border-box', transition: 'all 0.15s' }}>
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
                ? <><div style={{ width: 16, height: 16, border: '2px solid #0F766E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/><span style={{ fontSize: 14, color: '#0F766E' }}>Uploading &amp; extracting...</span></>
                : <><span>🛡️</span><span style={{ fontSize: 14, color: t.textMuted }}>Upload COI (PDF or image)</span></>}
            </label>
          </div>

        </>)}

        {/* ══════════ PREFERENCES ══════════ */}
        {activeTab === 'preferences' && (<>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Availability</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: available ? 16 : 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>Available for new work</div>
                <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 3, lineHeight: 1.4 }}>Shows a green badge on your profile and in search</div>
              </div>
              <button onClick={() => setAvailable(a => !a)}
                style={{ position: 'relative', width: 48, height: 26, borderRadius: 13, border: 'none', background: available ? '#0F766E' : t.filterTrackOff, cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 3, left: available ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
              </button>
            </div>
            {available && (<>
              <Field label="Availability note" hint="Optional — shown on your profile">
                <input value={availableNote} onChange={e => setAvailableNote(e.target.value)}
                  placeholder="e.g. Available weekends, free for small jobs..." style={inputSt()} />
              </Field>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 20, padding: '6px 14px' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#15803D' }}>Available for work</span>
                {availableNote && <span style={{ fontSize: 12, color: '#16A34A' }}>· {availableNote}</span>}
              </div>
            </>)}
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Preferred language</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['en','🇺🇸 English'],['es','🇪🇸 Spanish']].map(([val, label]) => (
                <button key={val} onClick={() => setLanguage(val)}
                  style={{ padding: '14px 12px', borderRadius: 12, border: `1.5px solid ${language === val ? '#0F766E' : t.cardBorder}`, background: language === val ? 'rgba(15,118,110,0.08)' : t.cardBgAlt, fontSize: 14, fontWeight: language === val ? 700 : 500, color: language === val ? '#0F766E' : t.textBody, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={cardSt}>
            <div style={sectionTitleSt}>Services offered</div>
            <p style={{ ...hintSt, marginBottom: 12 }}>Add specific services — shown as tags on your profile.</p>
            {services.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {services.map(svc => (
                  <span key={svc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 20, background: 'rgba(15,118,110,0.08)', color: '#0C5F57', border: '1px solid rgba(15,118,110,0.2)' }}>
                    ✓ {svc}
                    <button onClick={() => setServices(prev => prev.filter(s => s !== svc))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F766E', fontSize: 15, lineHeight: 1, padding: 0, opacity: 0.6 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input value={serviceInput} onChange={e => setServiceInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && serviceInput.trim()) { e.preventDefault(); if (!services.includes(serviceInput.trim())) setServices(prev => [...prev, serviceInput.trim()]); setServiceInput('') } }}
                placeholder='e.g. "Panel upgrades"' style={{ ...inputSt(), flex: 1 }} />
              <button onClick={() => { if (serviceInput.trim() && !services.includes(serviceInput.trim())) { setServices(prev => [...prev, serviceInput.trim()]); setServiceInput('') } }}
                style={{ ...tealBtn, padding: '11px 14px' }}>Add</button>
            </div>

            <div style={sectionTitleSt}>Pricing signal</div>
            <p style={{ ...hintSt, marginBottom: 12 }}>Sets expectations and increases contact rate.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {['Free estimates','Free consultations','Starting at $75/hr','Starting at $150/hr','Starting at $500','Contact for pricing'].map(opt => (
                <button key={opt} onClick={() => setPricingNote(opt)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${pricingNote === opt ? '#0F766E' : t.cardBorder}`, background: pricingNote === opt ? 'rgba(15,118,110,0.08)' : t.cardBgAlt, fontSize: 13, fontWeight: pricingNote === opt ? 700 : 400, color: pricingNote === opt ? '#0F766E' : t.textBody, cursor: 'pointer', textAlign: 'left' as const }}>
                  {opt}
                </button>
              ))}
            </div>
            <input value={pricingNote} onChange={e => setPricingNote(e.target.value)}
              placeholder='Or type your own pricing note...' style={{ ...inputSt(), marginBottom: 20 }} />

            <div style={sectionTitleSt}>Counties served (Florida)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 2 }}>
              {FL_COUNTIES.map(county => {
                const selected = counties.includes(county)
                return (
                  <button key={county} onClick={() => setCounties(prev => selected ? prev.filter(c => c !== county) : [...prev, county])}
                    style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${selected ? '#0F766E' : t.cardBorder}`, background: selected ? '#0F766E' : t.cardBgAlt, color: selected ? 'white' : t.textBody, cursor: 'pointer', fontWeight: selected ? 700 : 400 }}>
                    {county}
                  </button>
                )
              })}
            </div>
            {counties.length > 0 && <p style={{ ...hintSt, color: '#0F766E', fontWeight: 600, marginTop: 8 }}>{counties.length} count{counties.length === 1 ? 'y' : 'ies'} selected</p>}
          </div>

        </>)}
    </>
  )

  // Mobile layout — single column, teal hero header, sticky footer
  const MobileLayout = (
    <div style={{ minHeight: '100vh', background: t.pageBg, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* Teal hero header */}
      <div style={{ background: '#0F766E', padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            Dashboard
          </a>
          <a href={`/pro/${session?.id}`} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>View profile →</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {photoUrl
              ? <img src={photoUrl} alt={fullName} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.3)' }} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, border: '3px solid rgba(255,255,255,0.3)' }}>{initials(fullName || 'A')}</div>
            }
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName || 'Your Name'}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{trade ? categories.find(c => c.id === trade)?.category_name || 'Trade not set' : 'Tap to set your trade'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: 'white' }}>{session?.plan || 'Free'}</span>
              {license && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>✓ Licensed</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500, background: 'transparent', color: activeTab === tab.key ? 'white' : 'rgba(255,255,255,0.6)', borderBottom: activeTab === tab.key ? '2.5px solid white' : '2.5px solid transparent', transition: 'all 0.15s' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {saved && <div style={{ margin: '12px 16px 0', padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: '#15803D' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>Profile saved</div>}
      {errors.submit && <div style={{ margin: '12px 16px 0', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, fontSize: 14, color: '#DC2626' }}>{errors.submit}</div>}

      <div style={{ padding: '16px 16px 0' }}>{TabContent}</div>

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: t.cardBg, borderTop: `1px solid ${t.cardBorder}`, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
        <a href="/dashboard" style={{ ...ghostBtn, textDecoration: 'none', textAlign: 'center' as const, padding: '12px 20px' }}>Cancel</a>
        <button onClick={handleSave} disabled={saving} style={{ ...tealBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
          {saving ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/> Saving...</>) : 'Save changes'}
        </button>
      </div>
    </div>
  )

  // Desktop layout — sidebar + main content
  const DesktopLayout = (
    <div style={{ minHeight: '100vh', background: t.pageBg }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: t.textPri, margin: 0 }}>Edit profile</h1>
            <p style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>Keep your profile up to date to attract more homeowners.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <a href="/dashboard" style={{ fontSize: 14, color: t.textMuted, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</a>
            <a href={`/pro/${session?.id}`} style={{ fontSize: 14, color: '#0F766E', textDecoration: 'none', fontWeight: 600 }}>View profile →</a>
          </div>
        </div>

        {saved && <div style={{ marginBottom: 20, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: '#15803D' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>Profile saved successfully</div>}
        {errors.submit && <div style={{ marginBottom: 20, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, fontSize: 14, color: '#DC2626' }}>{errors.submit}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Sticky sidebar */}
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ ...cardSt }}>
              <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 16px' }}>
                {photoUrl
                  ? <img src={photoUrl} alt={fullName} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 80, height: 80, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>{initials(fullName || 'A')}</div>
                }
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#0F766E', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              </div>
              <div style={{ textAlign: 'center' as const, marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.textPri }}>{fullName || 'Your Name'}</div>
                <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 3 }}>{trade ? categories.find(c => c.id === trade)?.category_name || '' : 'Trade not set'}</div>
              </div>
              <div style={{ borderTop: `1px solid ${t.cardBorder}`, paddingTop: 12, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: t.textMuted }}>Plan</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{session?.plan || 'Free'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: t.textMuted }}>Member since</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>2026</span>
                </div>
              </div>
              <a href="/upgrade" style={{ display: 'block', marginTop: 14, padding: '10px', textAlign: 'center' as const, background: 'linear-gradient(135deg,#0F766E,#0D9488)', color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Upgrade plan →</a>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8 }}>Cover photo</div>
                <div style={{ width: '100%', height: 64, borderRadius: 10, overflow: 'hidden', background: t.cardBgAlt, border: `2px dashed ${coverUrl ? 'transparent' : t.cardBorder}`, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {coverUrl ? <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12, color: t.textSubtle }}>No cover photo</span>}
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} id="cover-upload-desk" onChange={handleCoverUpload} />
                <label htmlFor="cover-upload-desk" style={{ display: 'block', width: '100%', padding: '8px', textAlign: 'center' as const, border: `1px solid ${t.cardBorder}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: t.textBody, cursor: 'pointer', background: t.cardBgAlt, boxSizing: 'border-box' as const }}>
                  {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover' : 'Upload cover'}
                </label>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div>
            <div style={{ display: 'flex', gap: 4, background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: 4, marginBottom: 20 }}>
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{ flex: 1, padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500, background: activeTab === tab.key ? '#0F766E' : 'transparent', color: activeTab === tab.key ? 'white' : t.textMuted, transition: 'all 0.15s' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
            {TabContent}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: `1px solid ${t.cardBorder}`, marginTop: 8 }}>
              <a href="/dashboard" style={{ fontSize: 14, color: t.textMuted, textDecoration: 'none', fontWeight: 500 }}>Cancel</a>
              <button onClick={handleSave} disabled={saving} style={{ ...tealBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/> Saving...</>) : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )

  return (
    <>
      <div className="md:hidden">{MobileLayout}</div>
      <div className="hidden md:block">{DesktopLayout}</div>
    </>
  )
}
