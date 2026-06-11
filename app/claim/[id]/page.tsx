'use client'
import Navbar from '@/components/layout/Navbar'
import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { initials, avatarColor } from '@/lib/utils'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Claim flow: an existing DBPR profile (unclaimed) is claimed by its real owner.
// Principle: NEVER block enrollment. License # + expiry are a SOFT check — a match
// grants the verified badge immediately; a mismatch still claims the profile
// (unverified, queued for manual review). Real Supabase auth account is created.

export default function ClaimProfilePage() {
  const { id }       = useParams<{ id: string }>()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const licenseFromUrl = searchParams.get('license') || ''

  const [pro, setPro]         = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep]       = useState<'form' | 'done'>('form')

  // Form fields
  const [license, setLicense] = useState(licenseFromUrl)
  const [expiry, setExpiry]   = useState('')
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [password, setPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState('')
  const [wasVerified, setWasVerified] = useState(false)

  useEffect(() => {
    fetch(`/api/pros/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.pro) {
          setPro(d.pro)
          setName(d.pro.full_name || '')
          if (d.pro.is_claimed) router.replace('/login')  // already claimed
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  function formatPhone(val: string) {
    const dd = val.replace(/\D/g, '').slice(0, 10)
    if (dd.length <= 3) return dd
    if (dd.length <= 6) return `(${dd.slice(0,3)}) ${dd.slice(3)}`
    return `(${dd.slice(0,3)}) ${dd.slice(3,6)}-${dd.slice(6)}`
  }

  async function handleClaim() {
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSubmitting(true); setError('')

    // Create real auth account + claim the profile. The server does the soft
    // license/expiry match and sets is_verified — we never block on it here.
    const r = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        full_name: name.trim(),
        phone: phone.trim() || null,
        claim_pro_id: id,
        claim_license: license.trim() || null,
        claim_license_expiry: expiry || null,
      }),
    })
    const d = await r.json()

    if (!r.ok) {
      setSubmitting(false)
      setError(d.error || 'Could not claim profile')
      return
    }

    // Sign the new user in so the session resolves app-wide
    try {
      const supabase = getSupabaseBrowser()
      await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    } catch { /* non-fatal — they can log in manually */ }

    setWasVerified(!!d.verified)
    setSubmitting(false)
    setStep('done')
    setTimeout(() => router.push('/dashboard'), 2200)
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )

  if (!pro) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center text-center px-6">
      <div>
        <div className="text-4xl mb-4 opacity-20">👤</div>
        <h2 className="font-serif text-2xl text-gray-900 mb-3">Profile not found</h2>
        <Link href="/" className="text-teal-600 text-sm">← Back to home</Link>
      </div>
    </div>
  )

  const [bg, fg] = avatarColor(pro.full_name)
  const trade = pro.trade_category?.category_name || 'Trade professional'

  const inputCls = "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors"

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-md">

          {/* Profile preview card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-xl flex-shrink-0"
              style={{ background: bg, color: fg }}>{initials(pro.full_name)}</div>
            <div>
              <div className="font-semibold text-gray-900">{pro.full_name}</div>
              <div className="text-sm text-teal-700">{trade}</div>
              <div className="text-sm text-gray-400">{[pro.city, pro.state].filter(Boolean).join(', ')}</div>
              {pro.license_number && (
                <div className="text-xs text-gray-400 font-medium mt-0.5">DBPR License on file</div>
              )}
            </div>
          </div>

          {step === 'form' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-8">
              <h1 className="font-serif text-2xl text-gray-900 mb-2">Claim your profile</h1>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                We built this profile from the Florida DBPR database. Verify your license
                to get your verified badge — then set up your login. You can claim now and
                verify later if needed.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">License #</label>
                  <input value={license} onChange={e => setLicense(e.target.value)} placeholder="EC13004123" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Expiry date</label>
                  <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="border-t border-gray-100 my-5" />

              {[
                { label: 'Full name',     value: name,  set: setName,  ph: 'James Harrington', type: 'text'  },
                { label: 'Email address', value: email, set: setEmail, ph: 'james@example.com', type: 'email' },
              ].map(f => (
                <div key={f.label} className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} className={inputCls} />
                </div>
              ))}

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(555) 000-0000" className={inputCls} />
              </div>

              <div className="mb-6">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Create a password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputCls} />
              </div>

              <button onClick={handleClaim} disabled={submitting}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Claiming...' : 'Claim my profile →'}
              </button>

              <p className="text-xs text-gray-400 text-center mt-4">
                Already have an account? <Link href="/login" className="text-teal-600">Log in</Link>
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">🎉</div>
              <h2 className="font-serif text-2xl text-gray-900 mb-2">Profile claimed!</h2>
              <p className="text-sm text-gray-400">
                {wasVerified
                  ? 'Your license matched — your verified badge is active. Taking you to your dashboard...'
                  : "You're all set. We'll verify your license shortly — taking you to your dashboard..."}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
