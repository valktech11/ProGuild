// app/auth/callback/page.tsx
// Where Google/Apple send the user back after OAuth.
// The Supabase browser client auto-exchanges the code in the URL for a session.
// We then resolve their pro record and route:
//   - linked pro      → /dashboard
//   - authed, no pro  → /onboarding (they need to claim/create a profile)

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

function CallbackInner() {
  const router = useRouter()
  const [msg, setMsg] = useState('Signing you in…')

  useEffect(() => {
    let cancelled = false

    async function run() {
      const supabase = getSupabaseBrowser()

      // Give the SSR client a moment to process the OAuth code in the URL.
      // getSession() returns the established session once exchange completes.
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // Exchange may still be in flight; listen once for the sign-in event.
        const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
          if (s) {
            sub.subscription.unsubscribe()
            if (!cancelled) resolveAndRoute(s.access_token)
          }
        })
        // Safety timeout
        setTimeout(() => {
          if (!cancelled) {
            sub.subscription.unsubscribe()
            setMsg('Could not complete sign-in. Redirecting…')
            router.replace('/login')
          }
        }, 6000)
        return
      }

      resolveAndRoute(session.access_token)
    }

    async function resolveAndRoute(token: string) {
      try {
        const r = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const d = await r.json()
        if (cancelled) return
        if (r.ok && d.session) {
          router.replace('/dashboard')
        } else if (r.ok && d.needsProfile) {
          // Authenticated but no linked pro — new user → build their profile
          router.replace('/complete-profile')
        } else {
          router.replace('/login')
        }
      } catch {
        if (!cancelled) router.replace('/login')
      }
    }

    run()
    return () => { cancelled = true }
  }, [router])

  return (
    <div style={{ minHeight:'100vh', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ width:44, height:44, border:'3px solid #E2DDD6', borderTopColor:'#0F766E', borderRadius:'50%', animation:'pgspin 0.8s linear infinite' }} />
      <p style={{ color:'#7C8A96', fontSize:14, fontFamily:'system-ui' }}>{msg}</p>
      <style>{`@keyframes pgspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', background:'#fff' }} />}>
      <CallbackInner />
    </Suspense>
  )
}
