'use client'

// TrialBanner — shown inside DashboardShell above page content.
// Visible only when trial_ends_at is within 14 days and plan is not paid.
// Dismissed per-session (localStorage key) so it doesn't re-appear on every
// page navigation within the same session.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const PAID_PLANS = new Set(['Pro', 'Elite', 'Pro_Founding', 'Elite_Founding', 'Pro_Annual', 'Elite_Annual'])

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function TrialBanner({ session }: { session: { plan?: string | null; trial_ends_at?: string | null } | null }) {
  const router  = useRouter()
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash

  useEffect(() => {
    const key = `pg-trial-banner-dismissed-${new Date().toDateString()}`
    const wasDismissed = sessionStorage.getItem(key) === '1'
    setDismissed(wasDismissed)
  }, [])

  if (!session) return null

  const plan        = session.plan ?? 'Free'
  const isPaid      = PAID_PLANS.has(plan)
  const trialEndsAt = (session as any).trial_ends_at as string | null

  if (isPaid) return null
  if (!trialEndsAt) return null

  const days    = daysRemaining(trialEndsAt)
  const show    = days > 0 && days <= 14
  if (!show || dismissed) return null

  const isUrgent  = days <= 7
  const isExpiring = days <= 3

  const bg     = isExpiring ? '#DC2626' : isUrgent ? '#D97706' : '#0F766E'
  const bgLight = isExpiring ? '#FEF2F2' : isUrgent ? '#FFFBEB' : '#F0FDFA'
  const text   = isExpiring ? '#991B1B' : isUrgent ? '#92400E' : '#064E3B'
  const border = isExpiring ? '#FECACA' : isUrgent ? '#FDE68A' : '#99F6E4'

  const copy = isExpiring
    ? `⚠️ Your free trial ends in ${days} day${days === 1 ? '' : 's'} — subscribe now to keep access.`
    : isUrgent
    ? `⏳ ${days} days left in your free trial — subscribe to keep your CRM, leads, and invoices.`
    : `🎉 Your free trial ends in ${days} days. Subscribe to continue after your trial.`

  function dismiss() {
    const key = `pg-trial-banner-dismissed-${new Date().toDateString()}`
    sessionStorage.setItem(key, '1')
    setDismissed(true)
  }

  return (
    <div style={{
      background: bgLight,
      borderBottom: `1px solid ${border}`,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: bg, flexShrink: 0,
        }} />
        <p style={{ fontSize: 13.5, color: text, fontWeight: 500, margin: 0, lineHeight: 1.4 }}>
          {copy}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => router.push('/subscribe')}
          style={{
            fontSize: 12.5, fontWeight: 700, color: 'white',
            background: bg, border: 'none', borderRadius: 8,
            padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          Subscribe →
        </button>
        <button
          onClick={dismiss}
          style={{
            fontSize: 16, color: text, background: 'none',
            border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            opacity: 0.6,
          }}
          aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}
