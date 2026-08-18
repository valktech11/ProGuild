'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { apiFetch } from '@/lib/api-fetch'

// App version shown to the user — bump alongside meaningful web releases.
// (Mobile has its own pubspec.yaml version; this is web's own marker, not shared.)
const APP_VERSION = '1.0.0'

export default function SettingsPage() {
  const router = useRouter()
  const { session, loading: _authLoading, signOut } = useProSession()
  const [dk, setDk] = useState<boolean>(() => typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  const toggleDark = () => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }

  const [resetMsg, setResetMsg]   = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalErr, setPortalErr]   = useState('')
  const [delBusy, setDelBusy]     = useState(false)
  const [delDone, setDelDone]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)

  // Stripe Connect state
  type ConnectStatus = { stripe_account_id: string | null; stripe_charges_enabled: boolean; stripe_onboarding_status: string }
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null)
  const [connectBusy, setConnectBusy]     = useState(false)
  const [connectErr, setConnectErr]       = useState('')

  // Check search params for stripe_connect return/refresh
  const stripeConnectReturn = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('stripe_connect')
    : null

  useEffect(() => {
    if (!session?.id) return
    if (process.env.NEXT_PUBLIC_STRIPE_CONNECT_ENABLED !== 'true') return
    // Fetch Connect status on mount + on return from Stripe onboarding
    apiFetch('/api/stripe/connect/status')
      .then(r => r.json())
      .then(d => setConnectStatus(d))
      .catch(() => {})
  }, [session?.id, stripeConnectReturn])

  async function handleConnectStripe() {
    if (!session?.id) return
    setConnectBusy(true); setConnectErr('')
    try {
      const res  = await apiFetch('/api/stripe/connect/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id }),
      })
      const data = await res.json()
      if (!res.ok) { setConnectErr(data.error || 'Could not start onboarding'); setConnectBusy(false); return }
      window.location.href = data.url
    } catch {
      setConnectErr('Could not start onboarding'); setConnectBusy(false)
    }
  }

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
  }, [_authLoading, session, router])

  async function handleResetPassword() {
    if (!session?.email) return
    setResetBusy(true); setResetMsg('')
    const supabase = getSupabaseBrowser()
    const { error } = await supabase.auth.resetPasswordForEmail(
      session.email, { redirectTo: `${window.location.origin}/auth/reset` })
    setResetBusy(false)
    setResetMsg(error ? error.message : 'Check your email for a password reset link.')
  }

  async function handleLogout() {
    await signOut()
    router.replace('/login')
  }

  async function handleManageBilling() {
    if (!session?.id) return
    setPortalBusy(true); setPortalErr('')
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id }),
      })
      const data = await res.json()
      if (!res.ok) { setPortalErr(data.error || 'Could not open billing portal'); setPortalBusy(false); return }
      window.location.href = data.url
    } catch {
      setPortalErr('Could not open billing portal'); setPortalBusy(false)
    }
  }

  async function handleDeleteRequest() {
    if (!session?.id) return
    setDelBusy(true)
    try {
      const res = await fetch('/api/account/delete-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id }),
      })
      if (res.ok) setDelDone(true)
    } finally {
      setDelBusy(false)
    }
  }

  const t = theme(dk)
  const card: React.CSSProperties = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '20px 22px' }
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: t.textSubtle, marginBottom: 14 }
  const rowLabel: React.CSSProperties = { fontSize: 14.5, fontWeight: 600, color: t.textPri }
  const rowSub: React.CSSProperties = { fontSize: 12.5, color: t.textSubtle, marginTop: 2 }
  const linkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: `1px solid ${t.cardBorder}` }

  return (
    <DashboardShell session={session} newLeads={0} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '8px 4px 60px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: t.textPri, marginBottom: 4, letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ fontSize: 13.5, color: t.textSubtle, marginBottom: 28 }}>About ProGuild and how to reach support.</p>

        <div style={{ ...card, marginBottom: 18 }}>
          <div style={sectionLabel}>ABOUT</div>
          <div style={linkRow}>
            <div>
              <div style={rowLabel}>App version</div>
              <div style={rowSub}>ProGuild.ai web</div>
            </div>
            <span style={{ fontSize: 13.5, color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>v{APP_VERSION}</span>
          </div>
          <div style={{ ...linkRow, borderBottom: 'none' }}>
            <div>
              <div style={rowLabel}>Operated by</div>
              <div style={rowSub}>ProGuild LLC</div>
            </div>
          </div>
        </div>

        <div style={{ ...card, marginBottom: 18 }}>
          <div style={sectionLabel}>SUPPORT</div>
          <a href="mailto:contact@proguild.ai" style={{ ...linkRow, textDecoration: 'none' }}>
            <div>
              <div style={rowLabel}>Contact support</div>
              <div style={rowSub}>contact@proguild.ai</div>
            </div>
            <span style={{ fontSize: 13.5, color: '#2DD4BF', fontWeight: 600 }}>Email →</span>
          </a>
          <Link href="/terms" style={{ ...linkRow, textDecoration: 'none' }}>
            <div style={rowLabel}>Terms of Service</div>
            <span style={{ fontSize: 13.5, color: t.textSubtle }}>→</span>
          </Link>
          <Link href="/privacy" style={{ ...linkRow, borderBottom: 'none', textDecoration: 'none' }}>
            <div style={rowLabel}>Privacy Policy</div>
            <span style={{ fontSize: 13.5, color: t.textSubtle }}>→</span>
          </Link>
        </div>

        <div style={{ ...card, marginBottom: 18 }}>
          <div style={sectionLabel}>SECURITY</div>
          <div style={linkRow}>
            <div>
              <div style={rowLabel}>Password</div>
              <div style={rowSub}>{resetMsg || 'Send yourself a reset link by email'}</div>
            </div>
            <button onClick={handleResetPassword} disabled={resetBusy}
              style={{ fontSize: 13.5, color: '#2DD4BF', fontWeight: 600, background: 'none', border: 'none', cursor: resetBusy ? 'default' : 'pointer', opacity: resetBusy ? 0.6 : 1 }}>
              {resetBusy ? 'Sending…' : 'Reset →'}
            </button>
          </div>
          <div style={{ ...linkRow, borderBottom: 'none' }}>
            <div style={rowLabel}>Log out</div>
            <button onClick={handleLogout}
              style={{ fontSize: 13.5, color: '#DC2626', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              Log out →
            </button>
          </div>
        </div>

        {/* ── Stripe Connect card — hidden unless STRIPE_CONNECT_ENABLED=true ── */}
        {process.env.NEXT_PUBLIC_STRIPE_CONNECT_ENABLED === 'true' && (
        <div style={{ ...card, marginBottom: 18 }}>
          <div style={sectionLabel}>CARD PAYMENTS</div>
          {connectStatus?.stripe_onboarding_status === 'active' ? (
            // Active — charges enabled
            <div style={{ ...linkRow, borderBottom: 'none' }}>
              <div>
                <div style={{ ...rowLabel, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Card Payments
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 20, padding: '2px 8px' }}>Active</span>
                </div>
                <div style={rowSub}>Homeowners can pay invoices by card. Stripe deposits directly to your account.</div>
              </div>
            </div>
          ) : connectStatus?.stripe_onboarding_status === 'pending' || connectStatus?.stripe_onboarding_status === 'restricted' ? (
            // Pending — account created but onboarding incomplete
            <div style={{ ...linkRow, borderBottom: 'none' }}>
              <div>
                <div style={{ ...rowLabel, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Card Payments
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 20, padding: '2px 8px' }}>Pending</span>
                </div>
                <div style={rowSub}>Stripe onboarding is incomplete. Finish setup to accept card payments.</div>
              </div>
              <button onClick={handleConnectStripe} disabled={connectBusy}
                style={{ fontSize: 13.5, color: '#2DD4BF', fontWeight: 600, background: 'none', border: 'none', cursor: connectBusy ? 'default' : 'pointer', opacity: connectBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {connectBusy ? 'Opening…' : 'Resume →'}
              </button>
            </div>
          ) : (
            // Not started — show disclosure + connect button
            <div>
              <div style={{ background: dk ? '#1E293B' : '#F8FAFC', border: `1px solid ${dk ? '#334155' : '#E2E8F0'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPri, marginBottom: 6 }}>Accept card payments from homeowners</div>
                <div style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.6 }}>
                  Connect your Stripe account so homeowners can pay invoices by card. Funds deposit directly to your bank — ProGuild never holds your money.
                </div>
                <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600, marginTop: 10, padding: '8px 12px', background: dk ? '#292524' : '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                  Stripe charges 2.9% + 30¢ per transaction, deducted from each payout to you. ProGuild does not charge an additional fee.
                </div>
              </div>
              {connectErr && <p style={{ fontSize: 12.5, color: '#DC2626', marginBottom: 10 }}>{connectErr}</p>}
              <button onClick={handleConnectStripe} disabled={connectBusy}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: connectBusy ? '#CBD5E1' : 'linear-gradient(135deg,#0F766E,#0D9488)', color: 'white', fontSize: 14, fontWeight: 700, cursor: connectBusy ? 'default' : 'pointer' }}>
                {connectBusy ? 'Redirecting to Stripe…' : 'I understand — connect my Stripe account →'}
              </button>
            </div>
          )}
        </div>
        )}

        <div style={{ ...card, marginBottom: 18 }}>
          <div style={sectionLabel}>BILLING & PLAN</div>
          <div style={{ ...linkRow, borderBottom: 'none' }}>
            <div>
              <div style={rowLabel}>Current plan</div>
              <div style={rowSub}>{portalErr || (session?.plan ? session.plan.replace(/_/g, ' ') : '—')}</div>
            </div>
            <button onClick={handleManageBilling} disabled={portalBusy}
              style={{ fontSize: 13.5, color: '#2DD4BF', fontWeight: 600, background: 'none', border: 'none', cursor: portalBusy ? 'default' : 'pointer', opacity: portalBusy ? 0.6 : 1 }}>
              {portalBusy ? 'Opening…' : 'Manage billing →'}
            </button>
          </div>
        </div>

        <div style={{ ...card, marginBottom: 18, borderColor: '#FECACA' }}>
          <div style={sectionLabel}>ACCOUNT</div>
          {delDone ? (
            <p style={{ fontSize: 13.5, color: t.textSubtle }}>
              Request sent. We&apos;ll follow up by email once it&apos;s processed.
            </p>
          ) : !delConfirm ? (
            <div style={{ ...linkRow, borderBottom: 'none' }}>
              <div>
                <div style={rowLabel}>Delete account</div>
                <div style={rowSub}>Request permanent deletion of your account</div>
              </div>
              <button onClick={() => setDelConfirm(true)}
                style={{ fontSize: 13.5, color: '#DC2626', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                Request →
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13.5, color: t.textPri, marginBottom: 12 }}>
                This sends a deletion request to ProGuild support. It is not instant — we&apos;ll confirm by email before removing any data.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleDeleteRequest} disabled={delBusy}
                  style={{ fontSize: 13.5, fontWeight: 700, color: 'white', background: '#DC2626', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: delBusy ? 'default' : 'pointer', opacity: delBusy ? 0.6 : 1 }}>
                  {delBusy ? 'Sending…' : 'Confirm request'}
                </button>
                <button onClick={() => setDelConfirm(false)}
                  style={{ fontSize: 13.5, fontWeight: 600, color: t.textSubtle, background: 'none', border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: t.textSubtle, textAlign: 'center', marginTop: 24 }}>
          &copy; 2026 ProGuild LLC &mdash; Your Craft. Your Guild.
        </p>
      </div>
    </DashboardShell>
  )
}
