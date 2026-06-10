'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Session } from '@/types'
import { initials, avatarColor } from '@/lib/utils'
import { useProSession } from '@/lib/hooks/useProSession'

const C = {
  teal:    '#0F766E',
  tealL:   '#14B8A6',
  navy:    '#0A1628',
  cream:   '#F7F6F3',
  border:  '#E2DDD6',
  muted:   '#7C8A96',
  text:    '#0A1628',
  error:   '#DC2626',
}

// ── Step progress bar ─────────────────────────────────────────────────────────
function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:36 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          height:4, width: i < step ? 40 : i === step - 1 ? 40 : 20,
          borderRadius:100,
          background: i < step ? C.teal : i === step - 1 ? C.teal : C.border,
          transition:'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      ))}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, photoUrl, size = 72 }: { name: string; photoUrl?: string; size?: number }) {
  const [bg, fg] = avatarColor(name)
  return photoUrl ? (
    <img src={photoUrl} alt={name}
      style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', border:`3px solid ${C.teal}`, boxShadow:`0 0 0 4px rgba(15,118,110,0.12)` }} />
  ) : (
    <div style={{
      width:size, height:size, borderRadius:'50%', background:bg, color:fg,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size * 0.3, fontWeight:700, letterSpacing:'-0.02em',
      border:`3px solid ${C.border}`,
    }}>
      {initials(name)}
    </div>
  )
}

export default function OnboardingPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [session, setSession]       = useState<Session | null>(null)
  const [step, setStep]             = useState(1)
  const [photoUrl, setPhotoUrl]     = useState('')
  const [uploading, setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [bio, setBio]               = useState('')
  const [license, setLicense]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [bioFocused, setBioFocused] = useState(false)
  const [licFocused, setLicFocused] = useState(false)

  const { session: authedSession, loading: sessionLoading, needsProfile } = useProSession()

  useEffect(() => {
    if (sessionLoading) return
    // No auth at all → login
    if (!authedSession && !needsProfile) { router.replace('/login'); return }
    // Authenticated but no linked pro record → send home to find & claim their profile
    if (needsProfile) { router.replace('/?claim=1'); return }
    if (!authedSession) return

    // Only skip onboarding if previously onboarded AND this is NOT a fresh signup
    const justSignedUp = sessionStorage.getItem('pg_just_signed_up')
    if (justSignedUp) {
      sessionStorage.removeItem('pg_just_signed_up')
      sessionStorage.removeItem('pg_onboarded') // reset so they see it
    } else if (sessionStorage.getItem('pg_onboarded')) {
      router.replace('/dashboard'); return
    }
    setSession(authedSession)
  }, [authedSession, sessionLoading, needsProfile, router])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true); setUploadError('')
    const localPreview = URL.createObjectURL(file)
    setPhotoUrl(localPreview)
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method:'POST', body:form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) { setPhotoUrl(d.url); setStep(2) }
    else { setPhotoUrl(''); setUploadError(d.error || 'Upload failed. Try again.') }
  }

  async function handleFinish() {
    if (!session) return
    setSaving(true)
    const updates: Record<string, any> = {}
    if (bio.trim())     updates.bio            = bio.trim()
    if (license.trim()) updates.license_number = license.trim()
    if (Object.keys(updates).length > 0) {
      await fetch(`/api/pros/${session.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updates),
      })
    }
    sessionStorage.setItem('pg_onboarded', '1')
    setSaving(false)
    setStep(3)
    setTimeout(() => router.push('/dashboard'), 1600)
  }

  function skip() {
    sessionStorage.setItem('pg_onboarded', '1')
    router.push('/dashboard')
  }

  if (sessionLoading || !session) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
        <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTopColor:C.teal, borderRadius:'50%', animation:'pgspin 0.8s linear infinite' }} />
        <style>{`@keyframes pgspin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }
  const firstName = session.name.split(' ')[0]

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(15,118,110,0.07) 0%, transparent 70%), ${C.cream}`,
      fontFamily:'system-ui, -apple-system, sans-serif',
    }}>

      {/* Top logo bar */}
      <div style={{ padding:'24px 32px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px rgba(15,118,110,0.3)` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <span style={{ fontWeight:700, fontSize:17, color:C.navy, letterSpacing:'-0.02em' }}>ProGuild.ai</span>
      </div>

      <main style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px 60px' }}>
        <div style={{ width:'100%', maxWidth:460 }}>

          <StepBar step={step} total={2} />

          {/* ── STEP 1 — Photo ─────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{
              background:'#fff', borderRadius:20, padding:'44px 40px',
              boxShadow:'0 4px 40px rgba(10,22,40,0.08), 0 1px 3px rgba(10,22,40,0.04)',
              border:`1px solid rgba(226,221,214,0.6)`,
            }}>
              {/* Header */}
              <div style={{ textAlign:'center', marginBottom:36 }}>
                <div style={{ fontSize:36, marginBottom:12, lineHeight:1 }}>👋</div>
                <h1 style={{ fontSize:26, fontWeight:800, color:C.navy, margin:'0 0 8px', letterSpacing:'-0.03em' }}>
                  Welcome, {firstName}!
                </h1>
                <p style={{ color:C.muted, fontSize:14, lineHeight:1.7, margin:0 }}>
                  Pros with a profile photo get{' '}
                  <strong style={{ color:C.teal }}>3× more leads</strong>{' '}
                  than those without.
                </p>
              </div>

              {/* Avatar — clickable */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
                <div
                  onClick={() => !uploading && fileRef.current?.click()}
                  style={{ position:'relative', cursor: uploading ? 'wait' : 'pointer' }}>
                  <Avatar name={session.name} photoUrl={photoUrl} size={96} />
                  {/* Camera overlay */}
                  {!uploading && (
                    <div style={{
                      position:'absolute', bottom:0, right:0,
                      width:30, height:30, borderRadius:'50%',
                      background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
                      border:'2.5px solid #fff',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      boxShadow:'0 2px 8px rgba(15,118,110,0.4)',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                  )}
                  {uploading && (
                    <div style={{
                      position:'absolute', inset:0, borderRadius:'50%',
                      background:'rgba(10,22,40,0.5)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      <div style={{ width:24, height:24, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', animation:'pg-spin 0.7s linear infinite' }} />
                    </div>
                  )}
                </div>
              </div>

              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handlePhotoUpload} />

              {uploadError && (
                <p style={{ color:C.error, fontSize:12, textAlign:'center', marginBottom:16, padding:'10px 14px', background:'#FEF2F2', borderRadius:8 }}>
                  {uploadError}
                </p>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  width:'100%', padding:'14px', marginBottom:10,
                  background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
                  color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700,
                  cursor: uploading ? 'wait' : 'pointer',
                  boxShadow:`0 4px 16px rgba(15,118,110,0.35)`,
                  opacity: uploading ? 0.7 : 1,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  letterSpacing:'-0.01em',
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                {uploading ? 'Uploading…' : 'Upload a profile photo'}
              </button>

              <button
                onClick={() => setStep(2)}
                style={{
                  width:'100%', padding:'13px',
                  background:'transparent', border:`1.5px solid ${C.border}`,
                  color:C.muted, borderRadius:12, fontSize:14, fontWeight:600,
                  cursor:'pointer',
                }}>
                Skip photo for now
              </button>

              <p style={{ textAlign:'center', fontSize:12, color:C.muted, marginTop:16, opacity:0.7 }}>
                JPG, PNG or WebP · Max 5MB
              </p>
            </div>
          )}

          {/* ── STEP 2 — Bio + License ─────────────────────────────────── */}
          {step === 2 && (
            <div style={{
              background:'#fff', borderRadius:20, padding:'40px',
              boxShadow:'0 4px 40px rgba(10,22,40,0.08), 0 1px 3px rgba(10,22,40,0.04)',
              border:`1px solid rgba(226,221,214,0.6)`,
            }}>
              {/* Header */}
              <div style={{ textAlign:'center', marginBottom:32 }}>
                <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
                  <Avatar name={session.name} photoUrl={photoUrl} size={64} />
                </div>
                <h2 style={{ fontSize:24, fontWeight:800, color:C.navy, margin:'0 0 6px', letterSpacing:'-0.03em' }}>
                  Tell homeowners about yourself
                </h2>
                <p style={{ color:C.muted, fontSize:13, margin:0, lineHeight:1.6 }}>
                  A strong bio builds trust and wins more jobs.
                </p>
              </div>

              {/* Bio */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:7 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    Your bio
                  </label>
                  <span style={{ fontSize:11, color: bio.length > 400 ? C.error : C.muted }}>{bio.length} / 500</span>
                </div>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value.slice(0, 500))}
                  onFocus={() => setBioFocused(true)}
                  onBlur={() => setBioFocused(false)}
                  rows={4}
                  placeholder={`Hi, I'm ${firstName}! I've been a licensed roofer for X years in the Tampa area, specialising in storm damage and insurance claims...`}
                  style={{
                    width:'100%', padding:'12px 16px', boxSizing:'border-box',
                    border:`2px solid ${bioFocused ? C.teal : C.border}`,
                    borderRadius:10, fontSize:14, lineHeight:1.6, resize:'none',
                    background: bioFocused ? '#fff' : C.cream,
                    color:C.text, outline:'none',
                    boxShadow: bioFocused ? `0 0 0 4px rgba(15,118,110,0.08)` : 'none',
                    transition:'all 0.15s',
                  }}
                />
                <p style={{ fontSize:11, color:C.muted, marginTop:5 }}>2–4 sentences works best</p>
              </div>

              {/* License */}
              <div style={{ marginBottom:32 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    License number
                  </label>
                  <span style={{ fontSize:10, color:C.teal, background:'rgba(15,118,110,0.08)', border:'1px solid rgba(15,118,110,0.15)', borderRadius:100, padding:'2px 8px', fontWeight:600 }}>
                    Adds verified badge
                  </span>
                </div>
                <input
                  type="text"
                  value={license}
                  onChange={e => setLicense(e.target.value)}
                  onFocus={() => setLicFocused(true)}
                  onBlur={() => setLicFocused(false)}
                  placeholder="e.g. CCC1335678"
                  style={{
                    width:'100%', padding:'12px 16px', boxSizing:'border-box',
                    border:`2px solid ${licFocused ? C.teal : C.border}`,
                    borderRadius:10, fontSize:14, background: licFocused ? '#fff' : C.cream,
                    color:C.text, outline:'none',
                    boxShadow: licFocused ? `0 0 0 4px rgba(15,118,110,0.08)` : 'none',
                    transition:'all 0.15s',
                  }}
                />
              </div>

              {/* Optional tip */}
              <div style={{ background:'rgba(15,118,110,0.05)', border:'1px solid rgba(15,118,110,0.12)', borderRadius:10, padding:'12px 14px', marginBottom:24, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:16, flexShrink:0 }}>💡</span>
                <p style={{ fontSize:12, color:C.teal, margin:0, lineHeight:1.6 }}>
                  Both fields are optional. You can always update your profile from Settings later.
                </p>
              </div>

              <button
                onClick={handleFinish}
                disabled={saving}
                style={{
                  width:'100%', padding:'14px', marginBottom:10,
                  background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
                  color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700,
                  cursor: saving ? 'wait' : 'pointer',
                  boxShadow:`0 4px 16px rgba(15,118,110,0.35)`,
                  opacity: saving ? 0.7 : 1,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  letterSpacing:'-0.01em',
                }}>
                {saving ? (
                  <>
                    <div style={{ width:16, height:16, borderRadius:'50%', border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', animation:'pg-spin 0.7s linear infinite' }} />
                    Saving…
                  </>
                ) : 'Complete my profile →'}
              </button>

              <button
                onClick={skip}
                style={{
                  width:'100%', padding:'13px',
                  background:'transparent', border:`1.5px solid ${C.border}`,
                  color:C.muted, borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer',
                }}>
                Skip and go to dashboard
              </button>
            </div>
          )}

          {/* ── STEP 3 — Done ──────────────────────────────────────────── */}
          {step === 3 && (
            <div style={{
              background:'#fff', borderRadius:20, padding:'56px 40px',
              boxShadow:'0 4px 40px rgba(10,22,40,0.08), 0 1px 3px rgba(10,22,40,0.04)',
              border:`1px solid rgba(226,221,214,0.6)`,
              textAlign:'center',
            }}>
              <div style={{
                width:64, height:64, borderRadius:'50%', margin:'0 auto 20px',
                background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:`0 8px 24px rgba(15,118,110,0.4)`,
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 style={{ fontSize:26, fontWeight:800, color:C.navy, margin:'0 0 8px', letterSpacing:'-0.03em' }}>
                You're all set, {firstName}!
              </h2>
              <p style={{ color:C.muted, fontSize:14 }}>Taking you to your dashboard…</p>
            </div>
          )}

          {/* Step footer */}
          {step < 3 && (
            <p style={{ textAlign:'center', fontSize:12, color:C.muted, marginTop:20, opacity:0.75 }}>
              Step {step} of 2 · you can update everything later in Settings
            </p>
          )}

        </div>
      </main>

      <style>{`@keyframes pg-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
