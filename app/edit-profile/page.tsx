'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) setPhotoUrl(d.url)
    else setErrors(p => ({ ...p, photo: d.error || 'Upload failed' }))
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploadingCover(true)
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'avatars'); form.append('folder', `covers/${session.id}`)
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

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const tabs = [
    { key: 'basic' as const,       label: '📋 Basic info' },
    { key: 'credentials' as const, label: '🏅 Credentials' },
    { key: 'preferences' as const, label: '⚙️ Preferences' },
  ]

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-gray-900">Edit profile</h1>
            <p className="text-gray-400 text-sm mt-1">Keep your profile up to date to attract more homeowners.</p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-700">← Dashboard</Link>
            <Link href={`/pro/${session?.id}`} className="text-teal-600 hover:text-teal-700">View profile →</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-6">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.key ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {saved && (
          <div className="mb-6 flex items-center gap-3 bg-teal-50 border border-teal-200 text-teal-800 text-sm font-medium px-4 py-3 rounded-xl">
            <span>✓</span> Profile saved successfully
          </div>
        )}
        {errors.submit && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{errors.submit}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* LEFT — Photo (always visible) */}
          <div>
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Profile photo</div>
              <div className="relative w-24 h-24 mx-auto mb-4">
                {photoUrl
                  ? <img src={photoUrl} alt={fullName} className="w-24 h-24 rounded-full object-cover" />
                  : <div className="w-24 h-24 rounded-full flex items-center justify-center font-serif text-3xl" style={{ background: bg, color: fg }}>{initials(fullName || 'A')}</div>
                }
                {uploading && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors disabled:opacity-50">
                {uploading ? 'Uploading...' : photoUrl ? 'Change photo' : 'Upload photo'}
              </button>
              {errors.photo && <p className="text-xs text-red-500 mt-2">{errors.photo}</p>}
              <p className="text-xs text-gray-400 mt-2">JPG, PNG or WebP · Max 5MB</p>
              <div className="border-t border-gray-100 mt-5 pt-5 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Plan</span>
                  <span className="font-medium text-gray-700">{session?.plan || 'Free'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Member since</span>
                  <span className="font-medium text-gray-700">2026</span>
                </div>
              </div>
              <Link href="/upgrade" className="mt-4 block w-full py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors text-center">
                Upgrade plan
              </Link>
              <div className="border-t border-gray-100 mt-5 pt-5">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Cover photo</div>
                <div className="relative w-full h-20 rounded-xl overflow-hidden bg-[#152a23] mb-2">
                  {coverUrl && <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />}
                  {!coverUrl && <div className="absolute inset-0 flex items-center justify-center text-xs text-teal-400/50">No cover photo</div>}
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" id="cover-upload"
                  onChange={handleCoverUpload} />
                <label htmlFor="cover-upload"
                  className="block w-full py-1.5 text-center border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors cursor-pointer">
                  {uploadingCover ? 'Uploading...' : coverUrl ? 'Change cover' : 'Upload cover'}
                </label>
                <p className="text-xs text-gray-400 mt-1.5 text-center">Shows behind your name on your profile</p>
              </div>
            </div>
          </div>

          {/* RIGHT — Tab content */}
          <div className="lg:col-span-2 space-y-5">

            {/* ══════════ BASIC TAB ══════════ */}
            {activeTab === 'basic' && (<>

              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Basic information</div>
                <Field label="Full name" error={errors.fullName}>
                  <input value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
                    placeholder="James Harrington" className={inp(errors.fullName)} />
                </Field>
                <Field label="Business name" hint="Your company or trading name (optional)">
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g. Johnson Electrical LLC" className={inp()} />
                </Field>
                <Field label="Phone (primary)" error={errors.phone} hint="Shown to Pro and Elite plan subscribers">
                  <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })) }}
                    placeholder="(555) 000-0000" className={inp(errors.phone)} />
                </Field>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[['Cell', phoneCell, setPhoneCell], ['Work / Office', phoneWork, setPhoneWork], ['Cell 2', phoneCell2, setPhoneCell2]].map(([lbl, val, setter]) => (
                    <div key={lbl as string}>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{lbl as string}</label>
                      <input value={val as string} onChange={e => (setter as any)(e.target.value)} placeholder={`${lbl} number`} className={inp()} />
                    </div>
                  ))}
                </div>
                <Field label="Trade" hint="Your primary trade category">
                  <select value={trade} onChange={e => setTrade(e.target.value)} className={inp()}>
                    <option value="">Select your trade...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                  </select>
                </Field>
                <Field label="Years of experience">
                  <input type="number" value={yrs} onChange={e => setYrs(e.target.value)}
                    placeholder="e.g. 10" min="0" max="60" className={inp() + ' max-w-xs'} />
                </Field>
                <Field label="License number" hint="Optional — adds a verified badge to your profile">
                  <input value={license} onChange={e => setLicense(e.target.value)}
                    placeholder="e.g. EC13004123" className={inp()} />
                </Field>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">About you</div>
                <Field label="Bio" hint="Tell homeowners about your experience and why they should hire you">
                  <textarea value={bio} onChange={e => setBio(e.target.value)}
                    placeholder="I've been a licensed electrician for 12 years, specializing in panel upgrades..."
                    rows={5} className={inp() + ' resize-none'} />
                </Field>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>A good bio is 2–4 sentences</span><span>{bio.length} chars</span>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Location</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="State">
                    <select value={state} onChange={e => { setState(e.target.value); setCity('') }} className={inp()}>
                      <option value="">Select state...</option>
                      {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                    </select>
                  </Field>
                  <Field label="City">
                    <select value={city} onChange={e => setCity(e.target.value)} disabled={!state} className={inp()}>
                      <option value="">{!state ? 'Select state first' : citiesLoading ? 'Loading cities...' : 'Select city...'}</option>
                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__other__">Other (type below)</option>
                    </select>
                    {city === '__other__' && (
                      <input value={otherCity} onChange={e => setOtherCity(e.target.value)}
                        placeholder="Type your city..." className={inp() + ' mt-2'} />
                    )}
                  </Field>
                </div>
                <Field label="Zip code" hint="Helps homeowners find you in searches">
                  <input value={zip} onChange={e => setZip(e.target.value)} placeholder="33101" className={inp() + ' max-w-xs'} />
                </Field>
              </div>

            </>)}

            {/* ══════════ CREDENTIALS TAB ══════════ */}
            {activeTab === 'credentials' && (<>

              {/* License expiry */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">License expiry</div>
                <Field label="License expiry date" hint="We'll alert you before it expires">
                  <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} className={inp()} />
                </Field>
                {licenseExpiry && (
                  <div className="mt-3 text-xs text-gray-400">
                    Expires: <span className="font-semibold text-gray-700">{new Date(licenseExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {/* OSHA */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">OSHA certification (self-reported)</div>
                <Field label="OSHA card type">
                  <select value={oshaType} onChange={e => setOshaType(e.target.value)} className={inp()}>
                    <option value="">None / not certified</option>
                    {['OSHA-10','OSHA-30','OSHA-500','OSHA-510'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                {oshaType && (<>
                  <Field label="Card number" hint="Optional — for your records">
                    <input value={oshaNumber} onChange={e => setOshaNumber(e.target.value)} placeholder="e.g. 12345678" className={inp()} />
                  </Field>
                  <Field label="Expiry date">
                    <input type="date" value={oshaExpiry} onChange={e => setOshaExpiry(e.target.value)} className={inp()} />
                  </Field>
                  <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 w-fit">
                    <span>🦺</span><span className="text-sm font-semibold text-blue-700">{oshaType} certified</span>
                  </div>
                </>)}
              </div>

              {/* Equipment */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Equipment &amp; tool proficiency</div>
                <p className="text-xs text-gray-400 mb-4">Add equipment and tools you're proficient with.</p>
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newEquip} onChange={e => setNewEquip(e.target.value)}
                    onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); if (!newEquip.trim() || !session) return; setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) } }}
                    placeholder="e.g. Nail gun, Laser level..." className={inp() + ' flex-1'} />
                  <button onClick={async () => { if (!newEquip.trim() || !session) return; setAddingEquip(true); const r = await fetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newEquip.trim(), certified: false }) }); const d = await r.json(); if (r.ok) { setEquipment(eq => [...eq, d.item]); setNewEquip('') } setAddingEquip(false) }}
                    disabled={addingEquip || !newEquip.trim()}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">{addingEquip ? '...' : '+ Add'}</button>
                </div>
                {equipment.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {equipment.map(eq => (
                      <span key={eq.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border bg-stone-50 text-gray-700 border-gray-200">
                        {eq.name}
                        <button onClick={async () => { if (!session) return; await fetch('/api/equipment', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: eq.id }) }); setEquipment(prev => prev.filter(e => e.id !== eq.id)) }} className="text-gray-400 hover:text-red-500 transition-colors text-xs font-bold">×</button>
                      </span>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-300">No equipment added yet.</p>}
              </div>

              {/* Multiple licenses */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Licenses</div>
                <p className="text-xs text-gray-400 mb-4">Add all your DBPR licenses. Each appears with its own badge on your profile.</p>
                {proLicenses.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {proLicenses.map(lic => (
                      <div key={lic.id} className="flex items-center justify-between p-3 bg-stone-50 border border-gray-100 rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${lic.license_status === 'active' ? 'bg-green-500' : lic.license_status === 'expiring_soon' ? 'bg-amber-400' : 'bg-red-500'}`} />
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{lic.trade_name}</div>
                            <div className="text-sm text-gray-400">{lic.license_number}{lic.license_expiry_date ? ` · exp ${new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</div>
                          </div>
                          {lic.is_primary && <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-semibold">Primary</span>}
                        </div>
                        <button onClick={async () => { if (!session) return; await fetch('/api/pro-licenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: lic.id }) }); setProLicenses(prev => prev.filter(l => l.id !== lic.id)) }} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-3 p-4 bg-stone-50 border border-gray-100 rounded-xl">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add a license</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500 block mb-1">Trade / service</label><input value={newLicTrade} onChange={e => setNewLicTrade(e.target.value)} placeholder="e.g. Air conditioning" className={inp()} /></div>
                    <div><label className="text-xs text-gray-500 block mb-1">License number</label><input value={newLicNumber} onChange={e => setNewLicNumber(e.target.value)} placeholder="e.g. CAC1817585" className={inp()} /></div>
                  </div>
                  <div><label className="text-xs text-gray-500 block mb-1">Expiry date (optional)</label><input type="date" value={newLicExpiry} onChange={e => setNewLicExpiry(e.target.value)} className={inp() + ' max-w-xs'} /></div>
                  <button disabled={addingLic || !newLicTrade.trim() || !newLicNumber.trim()}
                    onClick={async () => { if (!session) return; setAddingLic(true); const r = await fetch('/api/pro-licenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, trade_name: newLicTrade.trim(), license_number: newLicNumber.trim(), license_expiry_date: newLicExpiry || null, is_primary: proLicenses.length === 0 }) }); const d = await r.json(); if (r.ok) { setProLicenses(prev => [...prev, d.license]); setNewLicTrade(''); setNewLicNumber(''); setNewLicExpiry('') } setAddingLic(false) }}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">{addingLic ? 'Adding...' : '+ Add license'}</button>
                </div>
              </div>

              {/* Memberships */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Associations &amp; memberships</div>
                <p className="text-xs text-gray-400 mb-4">List trade associations you belong to.</p>
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newMembership} onChange={e => setNewMembership(e.target.value)}
                    onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); if (!newMembership.trim() || !session) return; setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) } }}
                    placeholder="e.g. Florida Roofing & Sheet Metal Assoc., NARI..." className={inp() + ' flex-1'} />
                  <button onClick={async () => { if (!newMembership.trim() || !session) return; setAddingMembership(true); const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, name: newMembership.trim() }) }); const d = await r.json(); if (r.ok) { setMemberships(m => [...m, d.membership]); setNewMembership('') } setAddingMembership(false) }}
                    disabled={addingMembership || !newMembership.trim()}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors whitespace-nowrap">{addingMembership ? '...' : '+ Add'}</button>
                </div>
                {memberships.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {memberships.map(m => (
                      <span key={m.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                        🏛️ {m.name}
                        <button onClick={async () => { if (!session) return; await fetch('/api/memberships', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: m.id }) }); setMemberships(prev => prev.filter(x => x.id !== m.id)) }} className="text-blue-400 hover:text-red-500 transition-colors text-xs font-bold">×</button>
                      </span>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-300">No memberships added yet.</p>}
              </div>

              {/* COI Insurance */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Certificate of Insurance (COI)</div>
                <p className="text-xs text-gray-400 mb-4">Upload your insurance certificate. AI extracts the expiry date automatically and shows a 🛡️ verified badge on your profile.</p>

                {coiError && <div className="mb-3 p-2.5 bg-red-50 text-red-600 text-xs rounded-lg">{coiError}</div>}


                {insurance.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {insurance.map(ins => {
                      const expiryStr = ins.expiry_date ? new Date(ins.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                      const statusColor = ins.insurance_status === 'active' ? 'bg-teal-50 text-teal-700 border-teal-200'
                        : ins.insurance_status === 'expiring_soon' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : ins.insurance_status === 'expired' ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                      return (
                        <div key={ins.id} className={`flex items-start justify-between p-3 rounded-xl border ${statusColor}`}>
                          <div>
                            <div className="text-sm font-semibold">{ins.insurer_name || 'Insurance document'}</div>
                            <div className="text-xs opacity-70 mt-0.5">
                              {ins.coverage_type && <span>{ins.coverage_type} · </span>}
                              {ins.policy_number && <span>#{ins.policy_number} · </span>}
                              {expiryStr ? <span>Expires {expiryStr}</span> : <span>Expiry unknown</span>}
                            </div>
                          </div>
                          <button onClick={async () => { if (!session) return; await fetch('/api/insurance', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id: ins.id }) }); setInsurance(prev => prev.filter(x => x.id !== ins.id)) }} className="text-current opacity-40 hover:opacity-80 text-lg leading-none ml-2">×</button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <label className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingCOI ? 'border-teal-300 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50'}`}>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !session) return
                    setUploadingCOI(true); setCOIError('')
                    const form = new FormData()
                    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'insurance')
                    const upRes = await fetch('/api/upload', { method: 'POST', body: form })
                    const upData = await upRes.json()
                    if (!upRes.ok) { setCOIError(upData.error || 'Upload failed'); setUploadingCOI(false); return }
                    const insRes = await fetch('/api/insurance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, file_url: upData.url }) })
                    const insData = await insRes.json()
                    if (insRes.ok) setInsurance(prev => [insData.insurance, ...prev])
                    else setCOIError(insData.error || 'Could not process document')
                    setUploadingCOI(false)
                  }} />
                  {uploadingCOI
                    ? <><div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-teal-600">Uploading &amp; extracting...</span></>
                    : <><span>🛡️</span><span className="text-sm text-gray-500">Upload COI (PDF or image)</span></>}
                </label>
              </div>

            </>)}

            {/* ══════════ PREFERENCES TAB ══════════ */}
            {activeTab === 'preferences' && (<>

              {/* Availability */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Availability</div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Available for new work</div>
                    <div className="text-sm text-gray-400 mt-0.5">Shows a green badge on your profile and in search results</div>
                  </div>
                  <button onClick={() => setAvailable(a => !a)} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${available ? 'bg-teal-600' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${available ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>
                {available && (<>
                  <Field label="Availability note" hint="Optional">
                    <input value={availableNote} onChange={e => setAvailableNote(e.target.value)}
                      placeholder="e.g. Available weekends, free for small jobs this month..." className={inp()} />
                  </Field>
                  <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 w-fit">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm font-semibold text-green-700">Available for work</span>
                    {availableNote && <span className="text-xs text-green-600">· {availableNote}</span>}
                  </div>
                </>)}
              </div>

              {/* Preferred language */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Preferred language</div>
                <div className="flex gap-3">
                  {[['en','🇺🇸 English'],['es','🇪🇸 Spanish']].map(([val, label]) => (
                    <button key={val} onClick={() => setLanguage(val)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${language === val ? 'bg-teal-50 border-teal-400 text-teal-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Counties served */}
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Counties served</div>
                <p className="text-xs text-gray-400 mb-4">Select all Florida counties you serve. Shown on your public profile.</p>
                <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                  {FL_COUNTIES.map(county => {
                    const selected = counties.includes(county)
                    return (
                      <button key={county} onClick={() => setCounties(prev => selected ? prev.filter(c => c !== county) : [...prev, county])}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-500 hover:border-teal-300 hover:bg-teal-50'}`}>
                        {county}
                      </button>
                    )
                  })}
                </div>
                {counties.length > 0 && <p className="text-xs text-teal-600 mt-3 font-medium">{counties.length} count{counties.length === 1 ? 'y' : 'ies'} selected</p>}
              </div>

            </>)}

            {/* Save — always visible */}
            <div className="flex items-center justify-between pt-2">
              <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">Cancel</Link>
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>) : 'Save changes'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
