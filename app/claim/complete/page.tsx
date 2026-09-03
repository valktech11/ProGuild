'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const C = { bg: '#0a0f0f', teal: '#14B8A6', muted: '#94A3B8' }

export default function ClaimCompletePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const proId        = searchParams.get('pro_id')
  const token        = searchParams.get('token')
  const [status, setStatus] = useState<'working'|'done'|'error'>('working')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!proId || !token) { setErrMsg('Missing parameters.'); setStatus('error'); return }

    // Wait briefly for Supabase to hydrate the session from the magic link hash
    const timer = setTimeout(async () => {
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setErrMsg('Session not found — please try the claim link again.')
        setStatus('error')
        return
      }

      const r = await fetch('/api/claim/complete', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pro_id: proId, token }),
      })
      const d = await r.json()

      if (d.ok) {
        setStatus('done')
        setTimeout(() => router.replace('/dashboard'), 1800)
      } else {
        setErrMsg(d.error || 'Could not complete claim.')
        setStatus('error')
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [proId, token, router])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        {status === 'working' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Setting up your profile…</div>
            <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>Just a moment.</div>
          </>
        )}
        {status === 'done' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Profile claimed!</div>
            <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>Taking you to your dashboard…</div>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Something went wrong</div>
            <div style={{ color: C.muted, fontSize: 14, marginTop: 8, marginBottom: 20 }}>{errMsg}</div>
            <a href="mailto:support@proguild.ai" style={{ color: C.teal, fontSize: 14 }}>Contact support →</a>
          </>
        )}
      </div>
    </div>
  )
}
