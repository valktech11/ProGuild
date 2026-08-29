'use client'

// /join/[token]
// Three flows:
//   A. Not logged in → show company name + "Create account" CTA + "Sign in" link
//   B. Logged in, NOT in this company → "Join [Company]" button → accept → dashboard
//   C. Logged in, already in a company → show clear message (owner or already member)

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

type InviteInfo = {
  valid: boolean
  company_name?: string
  company_id?: string
  expires_at?: string
  error?: string
}

type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'member_same_company' }
  | { status: 'member_other_company'; company_name: string }
  | { status: 'solo_owner'; company_name: string }  // solo owner with no members — can dissolve and join
  | { status: 'ready_to_join'; session_email: string }

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [err, setErr] = useState('')

  // Step 1: validate invite token
  useEffect(() => {
    fetch(`/api/join/validate?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => setInvite(d))
      .catch(() => setInvite({ valid: false, error: 'Could not load invite' }))
  }, [token])

  // Step 2: check auth state + company membership
  useEffect(() => {
    if (!invite?.valid) return

    async function checkAuth() {
      const supabase = getSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setAuth({ status: 'guest' })
        return
      }

      // Logged in — check their company context
      try {
        const r = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
        const d = await r.json()
        const sess = d?.session

        if (!sess?.company_id) {
          // Logged in but no company → can join
          setAuth({ status: 'ready_to_join', session_email: sess?.email ?? session.user.email ?? '' })
          return
        }

        // Has a company — check if it's THIS company
        if (sess.company_id === invite?.company_id) {
          setAuth({ status: 'member_same_company' })
        } else if (sess.role === 'owner') {
          // Check if they're a solo owner (only themselves in company)
          // If so, allow them to dissolve their solo company and join
          try {
            const mr = await fetch(`/api/company/members`, {
              headers: { Authorization: `Bearer ${session.access_token}` }
            })
            const md = await mr.json()
            const memberCount = md?.members?.length ?? 2
            if (memberCount <= 1) {
              // Solo owner — can dissolve and join
              setAuth({ status: 'solo_owner', company_name: sess.company_name ?? 'your company' })
            } else {
              setAuth({ status: 'member_other_company', company_name: sess.company_name ?? 'another company' })
            }
          } catch {
            setAuth({ status: 'member_other_company', company_name: sess.company_name ?? 'another company' })
          }
        } else {
          setAuth({ status: 'member_other_company', company_name: sess.company_name ?? 'another company' })
        }
      } catch {
        setAuth({ status: 'guest' })
      }
    }

    checkAuth()
  }, [invite, token])

  async function handleJoin() {
    if (auth.status !== 'ready_to_join' && auth.status !== 'solo_owner') return
    setJoining(true)
    setErr('')

    try {
      const supabase = getSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErr('Not logged in'); setJoining(false); return }

      const r = await fetch('/api/join/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      })
      const d = await r.json()

      if (d?.ok || d?.already_member) {
        setJoined(true)
        setTimeout(() => router.push('/dashboard'), 1800)
      } else {
        setErr(d?.error ?? 'Could not join. The invite may have expired.')
      }
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const wrap: React.CSSProperties = {
    minHeight: '100vh',
    background: '#F4F3EF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }
  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E8E2D9',
    borderRadius: 16,
    padding: '44px 40px',
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
  }
  const logo: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: '#0d9488', marginBottom: 32 }
  const heading: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 10 }
  const sub: React.CSSProperties = { fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 28 }
  const primaryBtn = (disabled = false): React.CSSProperties => ({
    display: 'block', width: '100%', padding: '14px 0',
    background: disabled ? '#6B7280' : '#0d9488', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', marginTop: 4,
    textDecoration: 'none',
  })
  const errBox: React.CSSProperties = {
    background: '#FEF2F2', border: '1px solid #FCA5A5',
    borderRadius: 8, padding: '10px 14px',
    fontSize: 13, color: '#DC2626', marginBottom: 14, textAlign: 'left',
  }
  const infoBox: React.CSSProperties = {
    background: '#F0FDF9', border: '1px solid #99F6E4',
    borderRadius: 8, padding: '12px 14px',
    fontSize: 13, color: '#0F766E', marginBottom: 20, textAlign: 'left',
  }

  // Loading invite
  if (!invite) {
    return <div style={wrap}><div style={card}>
      <div style={logo}>ProGuild.ai</div>
      <div style={{ color: '#9CA3AF', fontSize: 14 }}>Validating invite…</div>
    </div></div>
  }

  // Invalid invite
  if (!invite.valid) {
    return <div style={wrap}><div style={card}>
      <div style={logo}>ProGuild.ai</div>
      <div style={heading}>Link expired or invalid</div>
      <div style={sub}>{invite.error ?? 'This invite link is no longer valid. Ask your team owner to generate a new one.'}</div>
      <Link href="/login" style={{ ...primaryBtn(), display: 'inline-block', width: 'auto', padding: '10px 28px' }}>
        Go to ProGuild.ai
      </Link>
    </div></div>
  }

  const companyName = invite.company_name ?? 'this team'
  const expiryStr = invite.expires_at
    ? `Expires ${new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
    : ''

  // Joined successfully
  if (joined) {
    return <div style={wrap}><div style={card}>
      <div style={logo}>ProGuild.ai</div>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
      <div style={heading}>You're in!</div>
      <div style={sub}>Welcome to <strong>{companyName}</strong>. Taking you to your dashboard…</div>
    </div></div>
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={logo}>ProGuild.ai</div>
        <div style={heading}>Join {companyName}</div>
        <div style={sub}>
          You've been invited to join this team on ProGuild.ai. {expiryStr}
        </div>

        {/* Auth loading */}
        {auth.status === 'loading' && (
          <div style={{ color: '#9CA3AF', fontSize: 13 }}>Checking your account…</div>
        )}

        {/* Guest — not logged in */}
        {auth.status === 'guest' && (
          <>
            <Link href={`/login?tab=signup&invite=${token}`} style={primaryBtn()}>
              Create account &amp; join team
            </Link>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 16 }}>
              Already have a ProGuild account?{' '}
              <Link href={`/login?redirect=/join/${token}`} style={{ color: '#0d9488', fontWeight: 600 }}>
                Sign in to join →
              </Link>
            </div>
          </>
        )}

        {/* Logged in, ready to join */}
        {auth.status === 'ready_to_join' && (
          <>
            <div style={infoBox}>
              Signed in as <strong>{(auth as any).session_email}</strong>
            </div>
            {err && <div style={errBox}>{err}</div>}
            <button onClick={handleJoin} disabled={joining} style={primaryBtn(joining)}>
              {joining ? 'Joining…' : `Join ${companyName}`}
            </button>
          </>
        )}

        {/* Already a member of this company */}
        {auth.status === 'member_same_company' && (
          <>
            <div style={infoBox}>You're already a member of {companyName}.</div>
            <Link href="/dashboard" style={primaryBtn()}>
              Go to dashboard →
            </Link>
          </>
        )}

        {/* Already in a different company */}
        {auth.status === 'solo_owner' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
              You currently own <strong>{(auth as any).company_name}</strong> with no other members.<br />
              Joining this team will dissolve your solo company.
            </div>
            <button onClick={handleJoin} disabled={joining} style={{ ...primaryBtn(), opacity: joining ? 0.6 : 1 }}>
              {joining ? 'Joining…' : `Join ${invite?.company_name ?? 'team'} →`}
            </button>
          </div>
        )}

        {auth.status === 'member_other_company' && (
          <>
            <div style={errBox}>
              You're already a member of <strong>{(auth as any).company_name}</strong>.
              A ProGuild account can only belong to one company. Contact support to switch.
            </div>
            <Link href="/dashboard" style={{ ...primaryBtn(), background: '#6B7280' }}>
              Go to my dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
