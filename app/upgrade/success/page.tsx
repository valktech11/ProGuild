'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function SuccessInner() {
  const params = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading'|'success'|'error'>('loading')

  useEffect(() => {
    const sessionId = params.get('session_id')
    if (!sessionId) { setStatus('error'); return }

    // Refresh session from DB — plan has been updated by webhook
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) {
      const s = JSON.parse(raw)
      fetch(`/api/pros/${s.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.pro) {
            const updated = { ...s, plan: d.pro.plan_tier }
            sessionStorage.setItem('tn_pro', JSON.stringify(updated))
            window.dispatchEvent(new Event('tn-session-changed'))
          }
          setStatus('success')
        })
        .catch(() => setStatus('success')) // show success anyway
    } else {
      setStatus('success')
    }
  }, [])

  if (status === 'loading') return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white border border-gray-100 rounded-3xl p-12 max-w-md w-full shadow-sm">
        <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
          ✓
        </div>
        <h1 className="font-serif text-3xl text-gray-900 mb-3">You're in!</h1>
        <p className="text-gray-500 mb-2 leading-relaxed">
          Welcome to ProGuild Pro. Your account has been upgraded and all features are now active.
        </p>
        <p className="text-gray-400 text-sm mb-8">
          A receipt has been sent to your email.
        </p>

        <div className="space-y-3">
          <Link href="/dashboard"
            className="block w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
            Go to dashboard →
          </Link>
          <Link href="/edit-profile"
            className="block w-full py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
            Complete your profile
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="font-serif text-sm text-gray-900">Trades<span className="text-teal-600">Network</span></div>
          <div className="text-xs text-gray-400 mt-1">Zero per-lead fees · Forever</div>
        </div>
      </div>
    </div>
  )
}

export default function UpgradeSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <SuccessInner />
    </Suspense>
  )
}
