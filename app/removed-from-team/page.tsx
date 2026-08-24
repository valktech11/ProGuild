'use client'
// /removed-from-team
// Shown when a user's company membership has been revoked.
// They still have a ProGuild account — they can sign up as a solo contractor
// or wait to be re-invited to a team.

import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function RemovedFromTeamPage() {
  const router = useRouter()

  async function handleSignOut() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/login')
  }

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
    padding: '48px 40px',
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🔒</div>

        <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
          You've been removed from the team
        </div>

        <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7, marginBottom: 32 }}>
          Your access to this company's jobs and data has been revoked by the owner.
          Your ProGuild account is still active.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: '#F0FDF9', border: '1px solid #99F6E4',
            borderRadius: 8, padding: '14px 16px',
            fontSize: 13, color: '#0F766E', textAlign: 'left', lineHeight: 1.6,
          }}>
            <strong>What you can do:</strong><br />
            Ask the team owner to re-invite you, or contact{' '}
            <a href="mailto:support@proguild.ai" style={{ color: '#0d9488' }}>
              support@proguild.ai
            </a>{' '}
            if you think this was a mistake.
          </div>

          <button
            onClick={handleSignOut}
            style={{
              padding: '12px 0', background: '#0d9488', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
              cursor: 'pointer', width: '100%',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
