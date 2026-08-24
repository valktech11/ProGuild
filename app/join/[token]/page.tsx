'use client'

// /join/[token]
// Public invite acceptance page. Three flows:
//   1. Visitor not logged in → shows company name + "Create account" CTA
//      → routes to /auth/signup?invite=<token> so signup flow auto-joins after account creation
//   2. Visitor already logged in, NOT in a company → auto-joins immediately, redirects to dashboard
//   3. Visitor already logged in, already in a company → shows conflict message

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { apiFetch } from '@/lib/api-fetch'
import { theme } from '@/lib/tokens'

type InviteInfo = {
  valid: boolean
  company_name?: string
  company_id?: string
  expires_at?: string
  error?: string
}

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [invite, setInvite]   = useState<InviteInfo | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [alreadyInCompany, setAlreadyInCompany] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined]   = useState(false)
  const [err, setErr]         = useState('')

  const dk = typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  const t = theme(dk)

  // 1. Validate the invite token
  useEffect(() => {
    fetch(`/api/join/validate?token=${token}`)
      .then(r => r.json())
      .then(d => setInvite(d))
      .catch(() => setInvite({ valid: false, error: 'Could not load invite' }))
  }, [token])

  // 2. Check auth state
  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session)
    })
  }, [])

  // 3. Check if already in a company (for logged-in users)
  useEffect(() => {
    if (!loggedIn) return
    apiFetch('/api/auth/me').then((d: any) => {
      if (d?.session?.company_id) setAlreadyInCompany(true)
    }).catch(() => {})
  }, [loggedIn])

  async function handleJoin() {
    setJoining(true)
    setErr('')
    try {
      const res = await apiFetch('/api/join/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }) as any
      if (res?.ok) {
        setJoined(true)
        setTimeout(() => router.push('/dashboard'), 1800)
      } else {
        setErr(res?.error ?? 'Could not join. The invite may have expired.')
      }
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  // ── Render states ────────────────────────────────────────────────────────
  const container: React.CSSProperties = {
    minHeight: '100vh',
    background: t.pageBg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }

  const card: React.CSSProperties = {
    background: t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: 16,
    padding: '40px 36px',
    maxWidth: 440,
    width: '100%',
    textAlign: 'center',
  }

  const logo: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: '#0d9488',
    marginBottom: 28,
  }

  const btn: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '13px 0',
    background: '#0d9488',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: joining ? 'not-allowed' : 'pointer',
    opacity: joining ? 0.7 : 1,
    marginTop: 24,
    textDecoration: 'none',
  }

  if (!invite) {
    return (
      <div style={container}>
        <div style={card}>
          <div style={logo}>ProGuild.ai</div>
          <div style={{ color: t.textMuted, fontSize: 14 }}>Validating invite…</div>
        </div>
      </div>
    )
  }

  if (!invite.valid) {
    return (
      <div style={container}>
        <div style={card}>
          <div style={logo}>ProGuild.ai</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.textPri, marginBottom: 10 }}>
            Invalid or expired invite
          </div>
          <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
            {invite.error ?? 'This invite link is no longer valid. Ask your team owner to send a new one.'}
          </div>
          <Link href="/" style={{ ...btn, display: 'inline-block', width: 'auto', padding: '10px 24px' }}>
            Go to ProGuild.ai
          </Link>
        </div>
      </div>
    )
  }

  if (joined) {
    return (
      <div style={container}>
        <div style={card}>
          <div style={logo}>ProGuild.ai</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0d9488', marginBottom: 10 }}>
            You're in! 🎉
          </div>
          <div style={{ fontSize: 14, color: t.textMuted }}>
            Welcome to <strong>{invite.company_name}</strong>. Redirecting to your dashboard…
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={container}>
      <div style={card}>
        <div style={logo}>ProGuild.ai</div>

        <div style={{ fontSize: 20, fontWeight: 700, color: t.textPri, marginBottom: 8 }}>
          Join {invite.company_name}
        </div>
        <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, marginBottom: 28 }}>
          You've been invited to join this team on ProGuild.ai.
          {invite.expires_at && (
            <span> Expires {new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</span>
          )}
        </div>

        {/* Already in a different company */}
        {loggedIn && alreadyInCompany && (
          <div style={{
            background: dk ? '#2D1B1B' : '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 13,
            color: '#DC2626',
            marginBottom: 16,
            textAlign: 'left',
          }}>
            You're already a member of a company. Contact support if you need to switch.
          </div>
        )}

        {/* Not logged in → create account or sign in */}
        {loggedIn === false && (
          <>
            <Link
              href={`/login?tab=signup&invite=${token}`}
              style={{ ...btn, display: 'block' }}
            >
              Create account &amp; join team
            </Link>
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 14 }}>
              Already have an account?{' '}
              <Link href={`/login?redirect=/join/${token}`} style={{ color: '#0d9488' }}>
                Sign in
              </Link>
            </div>
          </>
        )}

        {/* Logged in, no company → auto-join button */}
        {loggedIn && !alreadyInCompany && (
          <>
            {err && (
              <div style={{
                background: dk ? '#2D1B1B' : '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: '#DC2626',
                marginBottom: 12,
              }}>
                {err}
              </div>
            )}
            <button onClick={handleJoin} disabled={joining} style={btn}>
              {joining ? 'Joining…' : `Join ${invite.company_name}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
