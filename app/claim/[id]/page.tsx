'use client'
import Navbar from '@/components/layout/Navbar'
import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { initials, avatarColor } from '@/lib/utils'

export default function ClaimProfilePage() {
  const { id }       = useParams<{ id: string }>()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const licenseFromUrl = searchParams.get('license') || ''

  const [pro, setPro]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep]     = useState<'verify' | 'create' | 'done'>('verify')

  // Verify step
  const [license, setLicense] = useState(licenseFromUrl)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // Create account step
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [phone, setPhone]   = useState('')
  const [password, setPassword] = useState('') // stored as hash via API
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    fetch(`/api/pros/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.pro) {
          setPro(d.pro)
          setName(d.pro.full_name || '')
          if (d.pro.is_claimed) {
            // Already claimed — redirect to login
            router.replace('/login')
          }
        }
        setLoading(false)
      })
  }, [id])

  async function handleVerify() {
    if (!license.trim()) { setVerifyError('Please enter your license number'); return }
    setVerifying(true); setVerifyError('')

    // Check license matches the profile
    if (license.trim().toUpperCase() !== (pro?.license_number || '').toUpperCase()) {
      setVerifyError('License number does not match this profile. Please check and try again.')
      setVerifying(false)
      return
    }
    setVerifying(false)
    setStep('create')
  }

  async function handleCreate() {
    if (!email.trim() || !name.trim()) { setCreateError('Name and email are required'); return }
    setCreating(true); setCreateError('')

    // Check email not already taken
    const checkR = await fetch(`/api/pros?email=${encodeURIComponent(email)}`)
    const checkD = await checkR.json()
    if ((checkD.pros || []).length > 0 && checkD.pros[0].id !== id) {
      setCreateError('This email is already registered. Please log in instead.')
      setCreating(false)
      return
    }

    // Update the unclaimed profile to claimed
    const r = await fetch(`/api/pros/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:  name.trim(),
        email:      email.trim().toLowerCase(),
        phone:      phone.trim() || null,
        is_claimed: true,
        claimed_at: new Date().toISOString(),
      }),
    })
    const d = await r.json()
    setCreating(false)

    if (!r.ok) { setCreateError(d.error || 'Could not claim profile'); return }

    // Create session
    const session = {
      id:    d.pro.id,
      name:  d.pro.full_name,
      email: d.pro.email,
      plan:  d.pro.plan_tier,
      trade: pro?.trade_category?.category_name || '',
      city:  d.pro.city || '',
      state: d.pro.state || '',
    }
    sessionStorage.setItem('pg_pro', JSON.stringify(session))
    setStep('done')
    setTimeout(() => router.push('/onboarding'), 1800)
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
                <div className="text-xs text-teal-600 font-medium mt-0.5">✓ License {pro.license_number} — verified</div>
              )}
            </div>
          </div>

          {/* Step 1 — Verify */}
          {step === 'verify' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-8">
              <h1 className="font-serif text-2xl text-gray-900 mb-2">Claim your profile</h1>
              <p className="text-sm text-gray-400 mb-7 leading-relaxed">
                We found your license in the Florida DBPR database and created this profile for you.
                Enter your license number to verify it's you.
              </p>

              {verifyError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{verifyError}</div>
              )}

              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Your license number
              </label>
              <input value={license} onChange={e => setLicense(e.target.value)}
                placeholder="e.g. EC13004123"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors mb-5" />

              <button onClick={handleVerify} disabled={verifying}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {verifying ? 'Verifying...' : 'Verify license →'}
              </button>

              <p className="text-xs text-gray-400 text-center mt-4">
                Not your profile? <Link href="/" className="text-teal-600">Browse ProGuild</Link>
              </p>
            </div>
          )}

          {/* Step 2 — Create account */}
          {step === 'create' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>
                <span className="text-sm font-medium text-teal-700">License verified</span>
              </div>

              <h2 className="font-serif text-2xl text-gray-900 mb-2">Create your account</h2>
              <p className="text-sm text-gray-400 mb-6">Set up your login details to manage your profile.</p>

              {createError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{createError}</div>
              )}

              {[
                { label: 'Full name',     value: name,  set: setName,  placeholder: 'James Harrington', type: 'text'  },
                { label: 'Email address', value: email, set: setEmail, placeholder: 'james@example.com', type: 'email' },
                { label: 'Phone',         value: phone, set: setPhone, placeholder: '(555) 000-0000',    type: 'tel'   },
              ].map(f => (
                <div key={f.label} className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors" />
                </div>
              ))}

              <button onClick={handleCreate} disabled={creating}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors mt-2">
                {creating ? 'Claiming...' : 'Claim my profile →'}
              </button>
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 'done' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">🎉</div>
              <h2 className="font-serif text-2xl text-gray-900 mb-2">Profile claimed!</h2>
              <p className="text-sm text-gray-400">Taking you to complete your profile...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
