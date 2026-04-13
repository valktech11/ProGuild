'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'

function AdminLoginInner() {
  const router  = useRouter()
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // If already logged in as admin, go straight to admin panel
    const raw = sessionStorage.getItem('tn_pro')
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      if (s?.id) {
        fetch('/api/admin?section=dashboard', { headers: { 'x-pro-id': s.id } })
          .then(r => { if (r.ok) router.replace('/admin') })
      }
    } catch {}
  }, [])

  async function handleLogin() {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    setError('')

    // Step 1 — authenticate
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const d = await r.json()

    if (!r.ok) {
      setLoading(false)
      setError(d.error || 'No account found with that email.')
      return
    }

    // Step 2 — verify admin role
    const adminCheck = await fetch('/api/admin?section=dashboard', {
      headers: { 'x-pro-id': d.session.id },
    })

    if (!adminCheck.ok) {
      setLoading(false)
      setError('This account does not have admin access.')
      return
    }

    // Authenticated + admin confirmed
    sessionStorage.setItem('tn_pro', JSON.stringify(d.session))
    window.dispatchEvent(new Event('tn-session-changed'))
    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/admin'), 800)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">

      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="font-serif text-2xl text-white mb-1">
          Trades<span className="text-teal-500">Network</span>
        </div>
        <div className="text-xs text-gray-500 uppercase tracking-widest">Admin Access</div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8">

        {success ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-4">✓</div>
            <div className="text-white font-semibold mb-1">Access granted</div>
            <div className="text-gray-400 text-sm">Redirecting to admin panel...</div>
          </div>
        ) : (
          <>
            <h1 className="text-white font-semibold text-lg mb-1">Admin login</h1>
            <p className="text-gray-500 text-sm mb-6">
              Enter your admin email address to access the control panel.
            </p>

            {error && (
              <div className="mb-4 px-3 py-2.5 bg-red-900/40 border border-red-800 text-red-400 text-sm rounded-xl">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="admin@tradesnetwork.com"
                autoFocus
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white text-sm rounded-xl
                  placeholder-gray-600 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loading || !email.trim()}
              className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl
                hover:bg-teal-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verifying...</>
              ) : 'Access admin panel →'}
            </button>

            <div className="mt-6 pt-5 border-t border-gray-800 text-center">
              <a href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                ← Back to TradesNetwork
              </a>
            </div>
          </>
        )}
      </div>

      {/* Security note */}
      <p className="text-gray-700 text-xs mt-6 text-center max-w-xs">
        This page is for platform administrators only.<br/>
        <a href="/login" className="hover:text-gray-500 transition-colors">Pro login is here →</a>
      </p>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminLoginInner />
    </Suspense>
  )
}
