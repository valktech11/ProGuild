// app/auth/reset/page.tsx
// Where the Supabase password-reset email link lands.
// Supabase establishes a temporary recovery session from the link; the user
// then sets a new password here via supabase.auth.updateUser.

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const C = {
  teal: '#0F766E', tealL: '#14B8A6', navy: '#0A1628',
  border: '#E2DDD6', muted: '#7C8A96', text: '#0A1628',
  error: '#DC2626', errorBg: '#FEF2F2',
}

function ResetInner() {
  const router = useRouter()
  const [ready, setReady]       = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  useEffect(() => {
    // The reset link gives us a recovery session. Confirm we have one.
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      else {
        // Listen briefly in case the recovery exchange is still processing
        const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
          if (s) { setReady(true); sub.subscription.unsubscribe() }
        })
        setTimeout(() => sub.subscription.unsubscribe(), 5000)
      }
    })
  }, [])

  async function handleReset() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')

    const supabase = getSupabaseBrowser()
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updErr) { setError(updErr.message); return }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1600)
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'12px 16px', border:`2px solid ${C.border}`,
    borderRadius:10, background:'#fff', color:C.text, fontSize:14,
    outline:'none', boxSizing:'border-box',
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff', padding:'40px 24px', fontFamily:'system-ui' }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <h1 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 8px', letterSpacing:'-0.02em' }}>Set a new password</h1>

        {done ? (
          <div style={{ background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:10, padding:'14px 16px', color:'#047857', fontSize:14, fontWeight:500, marginTop:16 }}>
            Password updated. Taking you to your dashboard…
          </div>
        ) : !ready ? (
          <p style={{ color:C.muted, fontSize:14, marginTop:8 }}>Verifying your reset link…</p>
        ) : (
          <>
            <p style={{ color:C.muted, fontSize:14, margin:'0 0 24px', lineHeight:1.6 }}>Choose a strong password you haven't used before.</p>

            {error && (
              <div style={{ background:C.errorBg, border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:20, color:C.error, fontSize:13, fontWeight:500 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:7 }}>New password</label>
              <div style={{ position:'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  style={{ ...inputStyle, paddingRight:44 }} />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:12, fontWeight:600 }}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:7 }}>Confirm password</label>
              <input type={showPw ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                placeholder="Re-enter password"
                style={inputStyle} />
            </div>

            <button onClick={handleReset} disabled={loading} style={{
              width:'100%', padding:'14px', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
              color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Updating…' : 'Update password →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', background:'#fff' }} />}>
      <ResetInner />
    </Suspense>
  )
}
