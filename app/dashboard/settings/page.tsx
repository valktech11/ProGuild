'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'

// App version shown to the user — bump alongside meaningful web releases.
// (Mobile has its own pubspec.yaml version; this is web's own marker, not shared.)
const APP_VERSION = '1.0.0'

export default function SettingsPage() {
  const router = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  const toggleDark = () => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
  }, [_authLoading, session, router])

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

        <p style={{ fontSize: 12, color: t.textSubtle, textAlign: 'center', marginTop: 24 }}>
          &copy; 2026 ProGuild LLC &mdash; Your Craft. Your Guild.
        </p>
      </div>
    </DashboardShell>
  )
}
