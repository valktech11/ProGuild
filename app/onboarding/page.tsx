'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session } from '@/types'
import { initials, avatarColor } from '@/lib/utils'

export default function OnboardingPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [session, setSession]     = useState<Session | null>(null)
  const [step, setStep]           = useState(1) // 1=photo, 2=bio+license, 3=done
  const [photoUrl, setPhotoUrl]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [bio, setBio]             = useState('')
  const [license, setLicense]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    // If already onboarded, skip to dashboard
    if (sessionStorage.getItem('pg_onboarded')) { router.replace('/dashboard'); return }
    setSession(s)
  }, [])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true); setUploadError('')
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) { setPhotoUrl(d.url); setStep(2) }
    else setUploadError(d.error || 'Upload failed. Try again.')
  }

  async function handleFinish() {
    if (!session) return
    setSaving(true)
    const updates: Record<string, any> = {}
    if (bio.trim())     updates.bio            = bio.trim()
    if (license.trim()) updates.license_number = license.trim()

    if (Object.keys(updates).length > 0) {
      await fetch(`/api/pros/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    }
    sessionStorage.setItem('pg_onboarded', '1')
    setSaving(false)
    setStep(3)
    setTimeout(() => router.push('/dashboard'), 1400)
  }

  function skip() {
    sessionStorage.setItem('pg_onboarded', '1')
    router.push('/dashboard')
  }

  if (!session) return null

  const [bg, fg] = avatarColor(session.name)
  const firstName = session.name.split(' ')[0]

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <button onClick={skip} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Skip for now →
        </button>
      </nav>

      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-lg">

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-10">
            {[1, 2].map(n => (
              <div key={n} className={`h-1.5 rounded-full transition-all ${
                step > n ? 'w-8 bg-teal-600' :
                step === n ? 'w-8 bg-teal-600' : 'w-4 bg-gray-200'
              }`} />
            ))}
          </div>

          {/* ── STEP 1 — Photo ─────────────────────────────── */}
          {step === 1 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
              <div className="text-3xl mb-1">👋</div>
              <h1 className="font-serif text-2xl text-gray-900 mb-2">Welcome, {firstName}!</h1>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">
                Let's set up your profile. Pros with photos get <span className="font-semibold text-gray-600">3× more leads</span> than those without.
              </p>

              {/* Avatar preview */}
              <div className="relative w-24 h-24 mx-auto mb-6">
                {photoUrl ? (
                  <img src={photoUrl} alt="Your photo" className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="w-24 h-24 rounded-full flex items-center justify-center font-serif text-3xl"
                    style={{ background: bg, color: fg }}>
                    {initials(session.name)}
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />

              {uploadError && <p className="text-xs text-red-500 mb-4">{uploadError}</p>}

              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 mb-3">
                {uploading ? 'Uploading...' : '📷 Upload a profile photo'}
              </button>

              <button onClick={() => setStep(2)}
                className="w-full py-3 border border-gray-200 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                Skip photo for now
              </button>

              <p className="text-xs text-gray-400 mt-4">JPG, PNG or WebP · Max 5MB</p>
            </div>
          )}

          {/* ── STEP 2 — Bio + License ─────────────────────── */}
          {step === 2 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-8">
              <div className="text-center mb-7">
                {/* Show uploaded photo or initials */}
                {photoUrl ? (
                  <img src={photoUrl} alt="Your photo" className="w-16 h-16 rounded-full object-cover mx-auto mb-3" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center font-serif text-xl mx-auto mb-3"
                    style={{ background: bg, color: fg }}>
                    {initials(session.name)}
                  </div>
                )}
                <h2 className="font-serif text-2xl text-gray-900 mb-1">Tell homeowners about yourself</h2>
                <p className="text-sm text-gray-400">A good bio builds trust and wins more jobs.</p>
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Your bio <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={4}
                  placeholder={`Hi, I'm ${firstName}! I've been a licensed trade professional for X years, specialising in...`}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>2–4 sentences works best</span>
                  <span>{bio.length} chars</span>
                </div>
              </div>

              <div className="mb-7">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  License number <span className="text-gray-300 font-normal normal-case tracking-normal">(optional — adds verified badge)</span>
                </label>
                <input
                  type="text"
                  value={license}
                  onChange={e => setLicense(e.target.value)}
                  placeholder="e.g. EC13004123"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors"
                />
              </div>

              <button onClick={handleFinish} disabled={saving}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 mb-3 flex items-center justify-center gap-2">
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : (
                  'Complete my profile →'
                )}
              </button>

              <button onClick={skip} className="w-full py-3 border border-gray-200 text-gray-400 text-sm rounded-xl hover:bg-gray-50 transition-colors">
                Skip and go to dashboard
              </button>
            </div>
          )}

          {/* ── STEP 3 — Done ──────────────────────────────── */}
          {step === 3 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">✓</div>
              <h2 className="font-serif text-2xl text-gray-900 mb-2">You're all set, {firstName}!</h2>
              <p className="text-sm text-gray-400 mb-1">Taking you to your dashboard...</p>
            </div>
          )}

          {/* Step indicator text */}
          {step < 3 && (
            <p className="text-center text-xs text-gray-400 mt-5">
              Step {step} of 2 — you can always update these later in your profile settings
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
