'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, TradeCategory } from '@/types'
import { US_STATES, getCities, initials, avatarColor } from '@/lib/utils'

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

const inp = (error?: string) =>
  `w-full px-4 py-2.5 border rounded-lg text-sm text-gray-900 bg-stone-50 focus:outline-none focus:bg-white transition-colors ${
    error ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-teal-400'
  }`

export default function EditProfilePage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [categories, setCategories] = useState<TradeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form fields
  const [fullName, setFullName]   = useState('')
  const [phone, setPhone]         = useState('')
  const [bio, setBio]             = useState('')
  const [trade, setTrade]         = useState('')
  const [state, setState]         = useState('')
  const [city, setCity]           = useState('')
  const [otherCity, setOtherCity] = useState('')
  const [zip, setZip]             = useState('')
  const [yrs, setYrs]             = useState('')
  const [license, setLicense]     = useState('')
  const [photoUrl, setPhotoUrl]     = useState('')
  const [available, setAvailable]   = useState(false)
  const [availableNote, setAvailableNote] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)

    Promise.all([
      fetch(`/api/pros/${s.id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([proData, catsData]) => {
      const p = proData.pro
      setCategories(catsData.categories || [])
      setFullName(p.full_name || '')
      setPhone(p.phone || '')
      setBio(p.bio || '')
      setTrade(p.trade_category_id || '')
      setState(p.state || '')
      setCity(p.city || '')
      setZip(p.zip_code || '')
      setYrs(p.years_experience?.toString() || '')
      setLicense(p.license_number || '')
      setPhotoUrl(p.profile_photo_url || '')
      setAvailable(p.available_for_work || false)
      setAvailableNote(p.available_note || '')
      setLoading(false)
    })
  }, [])

  const [cities, setCities] = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) setPhotoUrl(d.url)
    else setErrors(p => ({ ...p, photo: d.error || 'Upload failed' }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fullName.trim()) e.fullName = 'Name is required'
    if (!phone.trim()) e.phone = 'Phone is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate() || !session) return
    setSaving(true)
    const finalCity = city === '__other__' ? otherCity : city

    const r = await fetch(`/api/pros/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:          fullName.trim(),
        phone:              phone.trim(),
        available_for_work: available,
        available_note:     availableNote.trim() || null,
        bio:              bio.trim() || null,
        trade_category_id: trade || null,
        state:            state || null,
        city:             finalCity || null,
        zip_code:         zip.trim() || null,
        years_experience: yrs ? parseInt(yrs) : null,
        license_number:   license.trim() || null,
      }),
    })
    const d = await r.json()
    setSaving(false)

    if (!r.ok) {
      setErrors({ submit: d.error || 'Could not save changes' })
      return
    }

    // Update session with new name and trade
    const updatedSession = {
      ...session,
      name:  d.pro.full_name,
      trade: categories.find(c => c.id === trade)?.category_name || session.trade,
      city:  finalCity || session.city,
      state: state || session.state,
    }
    sessionStorage.setItem('tn_pro', JSON.stringify(updatedSession))
    setSession(updatedSession)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )

  const [bg, fg] = avatarColor(fullName || 'A')

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Dashboard</Link>
          <Link href={`/pro/${session?.id}`} className="text-sm text-gray-400 hover:text-teal-600 transition-colors">View profile →</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-gray-900 mb-1">Edit profile</h1>
          <p className="text-gray-400 font-light">Keep your profile up to date to attract more homeowners.</p>
        </div>

        {/* Success toast */}
        {saved && (
          <div className="mb-6 flex items-center gap-3 bg-teal-50 border border-teal-200 text-teal-800 text-sm font-medium px-4 py-3 rounded-xl">
            <span className="text-teal-600">✓</span> Profile saved successfully
          </div>
        )}

        {errors.submit && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {errors.submit}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* LEFT — Photo */}
          <div>
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Profile photo</div>

              {/* Avatar */}
              <div className="relative w-24 h-24 mx-auto mb-4">
                {photoUrl ? (
                  <img src={photoUrl} alt={fullName} className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="w-24 h-24 rounded-full flex items-center justify-center font-serif text-3xl"
                    style={{ background: bg, color: fg }}>
                    {initials(fullName || 'A')}
                  </div>
                )}
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

              {/* Quick stats */}
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

              <Link href="/upgrade"
                className="mt-4 block w-full py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors text-center">
                Upgrade plan
              </Link>
            </div>
          </div>

          {/* RIGHT — Form */}
          <div className="lg:col-span-2 space-y-5">

            {/* Basic info */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                Basic information
              </div>

              <Field label="Full name" error={errors.fullName}>
                <input value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
                  placeholder="James Harrington" className={inp(errors.fullName)} />
              </Field>

              <Field label="Phone" error={errors.phone} hint="Shown to Pro and Elite plan subscribers">
                <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })) }}
                  placeholder="(555) 000-0000" className={inp(errors.phone)} />
              </Field>

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

              <Field label="License number" hint="Optional — adds a verified license badge to your profile">
                <input value={license} onChange={e => setLicense(e.target.value)}
                  placeholder="e.g. EC13004123" className={inp()} />
              </Field>
            </div>

            {/* Bio */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                About you
              </div>
              <Field label="Bio" hint="Tell homeowners about your experience, specialties, and why they should hire you">
                <textarea value={bio} onChange={e => setBio(e.target.value)}
                  placeholder="I've been a licensed electrician for 12 years, specializing in residential panel upgrades, EV charger installation, and smart home wiring..."
                  rows={5} className={inp() + ' resize-none'} />
              </Field>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>A good bio is 2–4 sentences</span>
                <span>{bio.length} chars</span>
              </div>
            </div>

            {/* Location */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                Location
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="State">
                  <select value={state} onChange={e => { setState(e.target.value); setCity('') }} className={inp()}>
                    <option value="">Select state...</option>
                    {US_STATES.map(([code, name]) => (
                      <option key={code} value={code}>{code} — {name}</option>
                    ))}
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
                <input value={zip} onChange={e => setZip(e.target.value)}
                  placeholder="33101" className={inp() + ' max-w-xs'} />
              </Field>
            </div>

            {/* Save button */}
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                Cancel
              </Link>
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
