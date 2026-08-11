// components/auth/OAuthButtons.tsx
// Google + Apple sign-in buttons. Used on both login and signup views.
// Apple is rendered but disabled until the paid Apple Developer account is active
// (set NEXT_PUBLIC_APPLE_ENABLED=true to turn it on).

'use client'

import { useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const APPLE_ENABLED = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true'

export default function OAuthButtons({ mode }: { mode: 'login' | 'signup' }) {
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null)
  const [error, setError] = useState('')

  async function signInWithProvider(provider: 'google' | 'apple') {
    setBusy(provider)
    setError('')
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // After OAuth, return to a callback page that resolves the pro session
          // and routes to dashboard / claim / onboarding.
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setBusy(null)
      }
      // On success the browser redirects away; no further code runs here.
    } catch (e: any) {
      setError(e?.message || 'Sign-in failed. Please try again.')
      setBusy(null)
    }
  }

  const verb = mode === 'login' ? 'Sign in' : 'Sign up'

  return (
    <div>
      {error && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'11px 16px', marginBottom:16, color:'#DC2626', fontSize:13, fontWeight:500 }}>
          {error}
        </div>
      )}

      {/* Google */}
      <button
        onClick={() => signInWithProvider('google')}
        disabled={busy !== null}
        style={{
          width:'100%', padding:'12px', background:'#fff', color:'#1F1F1F',
          border:'2px solid #E2DDD6', borderRadius:10, fontSize:14, fontWeight:600,
          cursor: busy ? 'wait' : 'pointer', display:'flex', alignItems:'center',
          justifyContent:'center', gap:10, fontFamily:'system-ui',
          opacity: busy && busy !== 'google' ? 0.5 : 1, transition:'all 0.15s',
        }}>
        <GoogleG />
        {busy === 'google' ? 'Connecting…' : `${verb} with Google`}
      </button>

      {/* Apple */}
      {APPLE_ENABLED && (
        <button
          onClick={() => signInWithProvider('apple')}
          disabled={busy !== null}
          style={{
            width:'100%', padding:'12px', background:'#000', color:'#fff',
            border:'2px solid #000', borderRadius:10, fontSize:14, fontWeight:600,
            cursor: busy ? 'wait' : 'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', gap:8, marginTop:10, fontFamily:'system-ui',
            opacity: busy && busy !== 'apple' ? 0.5 : 1, transition:'all 0.15s',
          }}>
          <AppleLogo />
          {busy === 'apple' ? 'Connecting…' : `${verb} with Apple`}
        </button>
      )}

      {/* Divider */}
      <div style={{ display:'flex', alignItems:'center', gap:12, margin:'22px 0' }}>
        <div style={{ flex:1, height:1, background:'#E2DDD6' }} />
        <span style={{ fontSize:12, color:'#7C8A96', fontWeight:600 }}>or</span>
        <div style={{ flex:1, height:1, background:'#E2DDD6' }} />
      </div>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

function AppleLogo() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" fill="#fff">
      <path d="M17.05 12.04c-.03-2.5 2.04-3.7 2.13-3.76-1.16-1.7-2.97-1.93-3.61-1.96-1.54-.16-3 .9-3.78.9-.77 0-1.97-.88-3.24-.86-1.67.03-3.21.97-4.07 2.46-1.73 3.01-.44 7.46 1.24 9.9.82 1.2 1.8 2.54 3.08 2.49 1.24-.05 1.7-.8 3.2-.8 1.49 0 1.91.8 3.21.78 1.33-.02 2.17-1.22 2.98-2.42.94-1.38 1.33-2.72 1.35-2.79-.03-.01-2.59-.99-2.62-3.94zM14.6 4.59c.68-.83 1.14-1.97 1.01-3.12-.98.04-2.17.65-2.88 1.47-.63.73-1.18 1.9-1.03 3.02 1.09.08 2.21-.55 2.9-1.37z"/>
    </svg>
  )
}
