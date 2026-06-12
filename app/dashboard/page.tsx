'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lead, Review } from '@/types'
import { timeAgo, fmtCurrency } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'
import AddLeadModal from '@/components/ui/AddLeadModal'
import { useProSession } from '@/lib/hooks/useProSession'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

import { theme, T, BRAND } from '@/lib/tokens'
import type { OverviewWidgetProps } from '@/lib/trades/_registry/types'
import { getTradeConfig, isHVAC, isRoofing, isPlumbing, isElectrician, isGC, getStageAnchors } from '@/lib/trades/_registry'

// ── Pending Review Banner ──────────────────────────────────────────────────────
// Shown when profile_status === 'Pending_Review'. Lets the contractor self-serve
// re-verification without needing admin intervention.
function PendingReviewBanner({ onVerified }: { onVerified: () => void }) {
  const [open,    setOpen]    = useState(false)
  const [lic,     setLic]     = useState('')
  const [expiry,  setExpiry]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!lic.trim() || !expiry) { setError('Both fields are required.'); return }
    setLoading(true)
    try {
      const supabase = getSupabaseBrowser()
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) { setError('Session expired — please log in again.'); setLoading(false); return }

      const res = await fetch('/api/auth/reverify', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ license_number: lic.trim(), license_expiry: expiry }),
      })
      const data = await res.json()

      if (data.verified) {
        setSuccess(true)
        onVerified()   // refresh session so banner disappears
      } else if (data.alreadyActive) {
        onVerified()
      } else {
        setError("Details didn't match our DBPR records. Double-check your license number and expiry date.")
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <span className="text-xl">✅</span>
        <div>
          <p className="text-sm font-semibold text-emerald-800">Verified! Your Guild Verified badge is now active.</p>
          <p className="text-xs text-emerald-600 mt-0.5">Your profile is now fully active and verified.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">Verification pending</p>
            <p className="text-xs text-amber-700 mt-0.5">
              The license details you entered didn't match our DBPR records. Your account is fully active —
              fix this to unlock your <strong>Guild Verified</strong> badge.
            </p>
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex-shrink-0 text-xs font-semibold text-amber-800 border border-amber-300 bg-white rounded-xl px-4 py-2 hover:bg-amber-100 transition-colors whitespace-nowrap"
          >
            Fix now →
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 border-t border-amber-200 pt-4">
          <p className="text-xs font-semibold text-amber-800 mb-3">Re-enter your Florida license details</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs text-amber-700 mb-1">License number</label>
              <input
                value={lic}
                onChange={e => setLic(e.target.value)}
                placeholder="e.g. CGC021577"
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-sm text-gray-900 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-xs text-amber-700 mb-1">Expiry date</label>
              <input
                type="date"
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-sm text-gray-900 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Checking…' : 'Verify'}
              </button>
              <button
                onClick={() => { setOpen(false); setError('') }}
                className="px-4 py-2 rounded-xl border border-amber-300 bg-white text-sm text-amber-700 hover:bg-amber-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <p className="mt-2 text-xs text-amber-600">
            Details must match your current Florida DBPR record exactly.{' '}
            <a href="https://www.myfloridalicense.com/wl11.asp" target="_blank" rel="noopener noreferrer"
              className="underline hover:text-amber-800">Look up your license →</a>
          </p>
        </div>
      )}
    </div>
  )
}

const TEAL   = '#0F766E'
const NAVY   = '#0A1628'
const BORDER = '#E8E2D9'
const MUTED  = '#9CA3AF'
const BODY   = '#6B7280'

// ── Lucide-style SVG icons (exact paths matching reference) ────────────────────
const ICONS = {
  flame:       'M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z',
  alertTri:    'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  hourglass:   'M5 22h14M5 2h14M17 22v-4.172a2 2 0 00-.586-1.414L12 12l-4.414 4.414A2 2 0 007 17.828V22M7 2v4.172a2 2 0 00.586 1.414L12 12l4.414-4.414A2 2 0 0017 6.172V2',
  calendar:    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  fileText:    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  users:       'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  phone:       'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z',
  clipDoc:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M12 18v-6M9 15h6',
  calCheck:    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 16l2 2 4-4',
  checkCirc:   'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  star:        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  dollar:      'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  tool:        'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  mapPin:      'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 10a1 1 0 100-2 1 1 0 000 2',
  chevRight:   'M9 18l6-6-6-6',
  bell:        'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  sparkle:     'M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z',
  arrowRight:  'M5 12h14M12 5l7 7-7 7',
}

function SvgIcon({ d, s = 16, sw = 1.8, color = 'currentColor' }: { d: string; s?: number; sw?: number; color?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function Star({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#FBBF24' : 'none'} stroke="#FBBF24" strokeWidth="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function Stars({ rating, size }: { rating: number; size?: number }) {
  const r = Math.round(rating)
  return <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <div key={i}><Star filled={r >= i} size={size} /></div>)}</div>
}

// ── Avatar initials ────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#7C3AED','#0EA5E9','#F59E0B','#10B981','#EF4444','#EC4899']
function AvatarInitials({ name, size = 32 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: AVATAR_COLORS[idx], fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

// ── Action Center Card ─────────────────────────────────────────────────────────
// Mobile: compact tile (icon + count + label, no CTA button)
// Desktop: full card with CTA button
function ActionCard({ iconPath, count, label, sub, iconBg, iconColor, ctaLabel, ctaHref, dk }: {
  iconPath: string; count: number | string; label: string; sub: string
  iconBg: string; iconColor: string; ctaLabel: string; ctaHref: string; dk: boolean
}) {
  const t   = theme(dk)
  const hot = Number(count) > 0
  return (
    <Link href={ctaHref} className="block rounded-2xl transition-all active:scale-[.98]"
      style={{
        backgroundColor: t.cardBg,
        border: `1px solid ${hot ? iconColor + '33' : t.cardBorder}`,
        boxShadow: hot
          ? `0 2px 12px ${iconColor}18, 0 1px 3px rgba(10,22,40,0.06)`
          : '0 1px 4px rgba(0,0,0,0.05)',
        position: 'relative', overflow: 'hidden',
      }}>

      {/* Subtle glow bg when count > 0 */}
      {hot && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 120% 80% at 0% 0%, ${iconColor}0A 0%, transparent 65%)`,
        }} />
      )}

      {/* Mobile layout */}
      <div className="flex md:hidden items-center gap-3 p-3.5" style={{ position: 'relative' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg, boxShadow: `0 2px 8px ${iconColor}22` }}>
          <SvgIcon d={iconPath} s={18} sw={2} color={iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: hot ? t.textPri : t.textSubtle, letterSpacing: '-0.03em' }}>{count}</div>
          <div className="text-[12px] font-semibold leading-tight mt-0.5" style={{ color: t.textMuted }}>{label}</div>
        </div>
        <SvgIcon d={ICONS.chevRight} s={14} sw={2.5} color={t.textSubtle} />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:block p-4" style={{ position: 'relative' }}>
        {/* Top row: icon + count */}
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: iconBg, boxShadow: `0 2px 8px ${iconColor}25` }}>
            <SvgIcon d={iconPath} s={20} sw={2} color={iconColor} />
          </div>
          {/* Count badge — big when non-zero */}
          <div style={{
            fontSize: hot ? 36 : 28,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: hot ? iconColor : t.textSubtle,
            transition: 'all 0.2s',
          }}>
            {count}
          </div>
        </div>

        {/* Label + sub */}
        <div className="mb-3">
          <div className="text-[14px] font-700 leading-tight mb-0.5"
            style={{ fontWeight: 700, color: t.textPri }}>{label}</div>
          <div className="text-[12px]" style={{ color: t.textMuted }}>{sub}</div>
        </div>

        {/* CTA */}
        <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all"
          style={{
            border: `1.5px solid ${hot ? iconColor + '55' : TEAL + '40'}`,
            color: hot ? iconColor : TEAL,
            backgroundColor: hot
              ? iconColor + '10'
              : (dk ? 'rgba(15,118,110,0.08)' : '#F0FDFA'),
          }}>
          {ctaLabel}
          <SvgIcon d={ICONS.arrowRight} s={11} sw={2.5} color={hot ? iconColor : TEAL} />
        </div>
      </div>
    </Link>
  )
}

// ── Pipeline Stage ─────────────────────────────────────────────────────────────
function PipeStage({ iconPath, iconBg, iconColor, label, count, sub, dk, showDash }: {
  iconPath: string; iconBg: string; iconColor: string
  label: string; count: number; sub: string; dk: boolean; showDash?: boolean
}) {
  const t     = theme(dk)
  const txt   = t.textPri
  const sub_c = t.textMuted
  const countColor = count > 0 ? iconColor : (t.inputBorder)
  const displayCount = showDash && count === 0 ? '—' : count
  return (
    <Link href="/dashboard/pipeline" className="flex items-center gap-2.5 flex-shrink-0">
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: iconBg }}>
        <SvgIcon d={iconPath} s={18} sw={1.8} color={iconColor} />
      </div>
      <div>
        <div className="text-[13px] font-semibold" style={{ color: txt }}>{label}</div>
        <div className="text-[22px] font-bold leading-tight" style={{ color: countColor }}>{displayCount}</div>
        <div className="text-[13px]" style={{ color: sub_c }}>{sub}</div>
      </div>
    </Link>
  )
}

// ── Pipeline Arrow ─────────────────────────────────────────────────────────────
function PipeArrow({ dk }: { dk: boolean }) {
  const c = dk ? '#475569' : '#CBD5E1'
  return (
    <svg width="48" height="16" viewBox="0 0 48 16" fill="none"
      className="flex-shrink-0 flex-1" style={{ minWidth: 32, maxWidth: 80 }}>
      <line x1="0" y1="8" x2="40" y2="8" stroke={c} strokeWidth="1.5" />
      <polyline points="34,3 44,8 34,13" fill="none" stroke={c} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function OverviewPage() {
  const router = useRouter()

  const { session, loading: sessionLoading, needsProfile, refresh } = useProSession()

  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  function toggleDark() {
    setDk(prev => {
      const next = !prev
      localStorage.setItem('pg_darkmode', next ? '1' : '0')
      return next
    })
  }

  const [leads,       setLeads]       = useState<Lead[]>([])
  const [reviews,     setReviews]     = useState<Review[]>([])
  const [draftCount,    setDraftCount]    = useState(0)
  const [allEstimates,  setAllEstimates]  = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [maintenanceReminders, setMaintenanceReminders] = useState<any[]>([])
  const isHVACTrade = isHVAC(getTradeConfig(session?.trade_slug))

  // Extracted fetch so it can be called on demand (modal close, event listener)
  function fetchData(s: typeof session) {
    if (!s) return
    Promise.all([
      fetch(`/api/leads?pro_id=${s.id}`).then(r => r.json()),
      fetch(`/api/reviews?pro_id=${s.id}`).then(r => r.json()),
      fetch(`/api/estimates?pro_id=${s.id}`).then(r => r.json()),
      isHVACTrade ? fetch(`/api/hvac/maintenance-reminders?pro_id=${s.id}`).then(r => r.json()).catch(() => ({ reminders: [] })) : Promise.resolve({ reminders: [] }),
    ]).then(([leadsData, reviewsData, estimatesData, remindersData]) => {
      setLeads(leadsData.leads || [])
      setReviews((reviewsData.reviews || []).filter((r: Review) => r.is_approved))
      const ests = estimatesData.estimates || []
      setAllEstimates(ests)
      setDraftCount(ests.filter((e: any) => e.status === 'draft').length)
      setMaintenanceReminders(remindersData.reminders || [])
      setDataLoading(false)
    }).catch(() => setDataLoading(false))
  }

  useEffect(() => {
    // Wait until auth has resolved before deciding anything (prevents redirect loop)
    if (sessionLoading) return
    // Authenticated but no linked pro yet → home to find & claim their profile
    if (needsProfile) { router.replace('/complete-profile'); return }
    // Not authenticated at all → login
    if (!session) { router.replace('/login'); return }
    fetchData(session)
    // Listen for leads added from the sidebar "+ Add New Lead" button
    const handler = () => fetchData(session)
    window.addEventListener('pg:lead-added', handler)
    return () => window.removeEventListener('pg:lead-added', handler)
  }, [session, sessionLoading, needsProfile, router])

  // Stage filters derived from trade plugin — no hardcoded stage key strings
  const anchors        = getStageAnchors(session?.trade_slug)
  const tc             = getTradeConfig(session?.trade_slug)
  const terminalKeys   = tc.stages.filter(s => s.terminal).map(s => s.key)
  const newLeads       = leads.filter(l => l.lead_status === anchors.entry)
  const quotedLeads    = leads.filter(l => {
    // "quoted/proposal" = stage after entry, before won — use position heuristic
    const activeStages = tc.stages.filter(s => !s.terminal)
    const entryIdx     = activeStages.findIndex(s => s.key === anchors.entry)
    const wonIdx       = activeStages.findIndex(s => s.key === anchors.won)
    const midStages    = activeStages.slice(entryIdx + 1, wonIdx).map(s => s.key)
    return midStages.some(k => k === l.lead_status)
  })
  const paidLeads      = leads.filter(l => l.lead_status === anchors.won)
  const revenueLeads   = paidLeads
  const activeLeads    = leads.filter(l => !terminalKeys.some(k => k === l.lead_status) && l.lead_status !== anchors.won)
  const awaitingResp   = newLeads.filter(l => (Date.now() - new Date(l.created_at).getTime()) / 86400000 >= 1)
  const waitingOnCust  = quotedLeads
  const contactedLeads = quotedLeads  // alias for legacy references
  const scheduledLeads: typeof leads = []
  const completedLeads: typeof leads = []

  const revenue  = revenueLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const pipeline = activeLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null

  const t        = theme(dk)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = session?.name?.split(' ')[0] || ''

  // ── Urgency signals — Action Center (different from pipeline stage counts) ─────
  const now = Date.now()
  const today = new Date().toISOString().split('T')[0]

  // Uncontacted: at entry stage AND created >24h ago (money walking away)
  const uncontactedLeads = newLeads.filter(l =>
    (now - new Date(l.created_at).getTime()) / 86400000 >= 1
  )
  // Estimates expiring in ≤3 days (sent/viewed, not yet approved)
  const expiringEstimates = allEstimates.filter((e: any) => {
    if (!e.valid_until || !['sent','viewed'].includes(e.status)) return false
    const daysLeft = (new Date(e.valid_until).getTime() - now) / 86400000
    return daysLeft >= 0 && daysLeft <= 3
  })
  // Unsigned proposals: sent/viewed >48h ago still not approved
  const unsignedProposals = allEstimates.filter((e: any) => {
    if (!['sent','viewed'].includes(e.status)) return false
    const sentAt = e.sent_at || e.created_at
    return (now - new Date(sentAt).getTime()) / 86400000 >= 2
  })
  // Jobs scheduled today
  const jobsToday = leads.filter(l => l.scheduled_date?.startsWith(today))
  // Draft estimates (unsent)
  const draftEstimates = allEstimates.filter((e: any) => e.status === 'draft')

  // Smart sub-line: actionable morning summary
  const atRisk = awaitingResp.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const subLineParts: string[] = []
  if (awaitingResp.length > 0) subLineParts.push(`${awaitingResp.length} homeowner${awaitingResp.length !== 1 ? 's' : ''} waiting`)
  if (draftCount > 0) subLineParts.push(`${draftCount} estimate${draftCount !== 1 ? 's' : ''} unsent`)
  if (atRisk > 0) subLineParts.push(`$${atRisk.toLocaleString()} at risk`)
  const smartSubLine = subLineParts.join(' · ')

  const cardBg  = t.cardBg
  const cardBdr = t.cardBorder
  const textMain = t.textPri
  const BORDER  = t.cardBorder
  const NAVY    = t.textPri
  const BODY    = t.textMuted
  const MUTED_D = t.textSubtle

  // Review sentiment
  function sentiment(rating: number) {
    if (rating >= 4) return { label: 'Positive', color: '#16A34A', bg: '#DCFCE7' }
    if (rating >= 3) return { label: 'Neutral',  color: '#B45309', bg: '#FEF3C7' }
    return { label: 'Needs Improvement', color: '#DC2626', bg: '#FEE2E2' }
  }

  if (sessionLoading || !session || dataLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: t.pageBg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium" style={{ color: MUTED_D }}>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <DashboardShell session={session} newLeads={newLeads.length} onAddLead={() => setShowAddLead(true)} darkMode={dk} onToggleDark={toggleDark}>
      <div className="px-4 md:px-8 py-4 md:py-6 md:pr-10">

        {/* ── Pending Review Banner ────────────────────────────────────────── */}
        {session?.profile_status === 'Pending_Review' && (
          <PendingReviewBanner onVerified={refresh} />
        )}

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: T.fontTitle, fontWeight: 800, color: textMain, letterSpacing: '-0.02em' }}>{greeting}, {firstName}! 👋</h1>
            {smartSubLine ? (
              <p className="text-[12px] mt-1.5 font-semibold flex items-center gap-1.5" style={{ color: '#DC2626' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block', boxShadow: '0 0 6px rgba(220,38,38,0.5)', flexShrink: 0 }} />
                {smartSubLine}
              </p>
            ) : (
              <p className="hidden md:block text-[13px] mt-0.5" style={{ color: BODY }}>
                {leads.length === 0 ? "Let\'s get your first job." : "Here\'s what\'s happening with your business today."}
              </p>
            )}
          </div>

        </div>

        {/* ── Hero strip — mobile only, above Action Center ── */}
        {pipeline > 0 && (
          <div className="flex md:hidden items-center justify-between px-4 py-3 rounded-2xl mb-4"
            style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider mb-0.5" style={{ color: t.textMuted }}>Pipeline Value</div>
              <div style={{ fontSize: T.fontStat, fontWeight: 800, lineHeight: 1, color: textMain }}>${pipeline.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-bold uppercase tracking-wider mb-0.5" style={{ color: t.textMuted }}>Active Leads</div>
              <div style={{ fontSize: T.fontStat, fontWeight: 800, lineHeight: 1, color: textMain }}>{activeLeads.length}</div>
            </div>
          </div>
        )}

        {/* ── Welcome card — trade-aware, shown for fresh accounts with no leads ── */}
        {leads.length === 0 && reviews.length === 0 && (() => {
          // ── Trade-specific config ─────────────────────────────────────────────
          const tradeWelcome = (() => {
            if (isHVAC(tc)) return {
              gradient: 'linear-gradient(135deg, #0B2A3E 0%, #0D4A6E 50%, #0B7FBF 100%)',
              accentColor: '#38BDF8',
              accentBg: 'rgba(56,189,248,0.12)',
              accentBorder: 'rgba(56,189,248,0.25)',
              badge: 'HVAC Technician',
              headline: 'Your HVAC business, all in one place.',
              sub: 'Log service calls, track equipment, send estimates — everything from the field or office.',
              stats: [
                { n: '3×', l: 'more jobs won with CRM' },
                { n: '$0', l: 'per-lead fee. Ever.' },
                { n: '$49', l: 'per month, all features' },
              ],
              steps: [
                { icon: '📞', title: 'Log a service call', body: 'Add a new lead when a customer calls. Track the job from first contact to payment.' },
                { icon: '🔧', title: 'Diagnose & estimate', body: 'Record equipment details, create a professional estimate and send it for approval.' },
                { icon: '💵', title: 'Invoice & collect', body: 'Generate an invoice from your approved estimate and get paid — cash, card or bank transfer.' },
              ],
              svgIcon: (
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  {/* AC unit outer body */}
                  <rect x="8" y="22" width="64" height="40" rx="6" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                  {/* AC unit inner panel */}
                  <rect x="14" y="28" width="36" height="28" rx="3" fill="white" fillOpacity="0.08" stroke="white" strokeWidth="1.5"/>
                  {/* Fan blades */}
                  <circle cx="32" cy="42" r="9" fill="white" fillOpacity="0.06" stroke="white" strokeWidth="1.5"/>
                  <path d="M32 33 Q38 38 32 42 Q26 38 32 33Z" fill="white" fillOpacity="0.3"/>
                  <path d="M41 42 Q36 48 32 42 Q36 36 41 42Z" fill="white" fillOpacity="0.3"/>
                  <path d="M32 51 Q26 46 32 42 Q38 46 32 51Z" fill="white" fillOpacity="0.3"/>
                  <path d="M23 42 Q28 36 32 42 Q28 48 23 42Z" fill="white" fillOpacity="0.3"/>
                  <circle cx="32" cy="42" r="3" fill="white" fillOpacity="0.6"/>
                  {/* Vent lines */}
                  <path d="M56 30 L56 56" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                  <path d="M60 30 L60 56" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                  <path d="M64 30 L64 56" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                  {/* Top LED indicators */}
                  <circle cx="56" cy="26" r="2" fill="#38BDF8" fillOpacity="0.9"/>
                  <circle cx="62" cy="26" r="2" fill="white" fillOpacity="0.4"/>
                  {/* Pipes */}
                  <path d="M8 35 Q2 35 2 42 Q2 49 8 49" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
                  <path d="M72 35 Q78 35 78 42 Q78 49 72 49" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
                </svg>
              ),
            }
            if (isHVAC(tc) === false && tc.slug === 'electrician') return {
              gradient: 'linear-gradient(135deg, #1A1028 0%, #2D1B6E 50%, #4C1D95 100%)',
              accentColor: '#A78BFA',
              accentBg: 'rgba(167,139,250,0.12)',
              accentBorder: 'rgba(167,139,250,0.25)',
              badge: 'Electrician',
              headline: 'Wire up your business. Get paid faster.',
              sub: 'Manage permits, panel upgrades, and service calls from one dashboard.',
              stats: [{ n:'3×', l:'more jobs won' }, { n:'$0', l:'per-lead fee' }, { n:'$49', l:'per month' }],
              steps: [
                { icon: '📞', title: 'Log a service call', body: 'Add a new lead when a customer calls.' },
                { icon: '⚡', title: 'Estimate & permit', body: 'Create a professional estimate and track permits.' },
                { icon: '💵', title: 'Invoice & collect', body: 'Generate an invoice and get paid.' },
              ],
              svgIcon: (
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  <rect x="20" y="10" width="40" height="60" rx="4" fill="white" fillOpacity="0.1" stroke="white" strokeWidth="2"/>
                  <rect x="26" y="18" width="28" height="4" rx="2" fill="white" fillOpacity="0.4"/>
                  <rect x="26" y="26" width="28" height="4" rx="2" fill="white" fillOpacity="0.3"/>
                  <rect x="26" y="34" width="28" height="4" rx="2" fill="white" fillOpacity="0.25"/>
                  <path d="M44 48 L36 60 L42 60 L36 72" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              ),
            }
            if (isHVAC(tc) === false && tc.slug === 'plumber') return {
              gradient: 'linear-gradient(135deg, #0A2238 0%, #0B4870 50%, #0369A1 100%)',
              accentColor: '#7DD3FC',
              accentBg: 'rgba(125,211,252,0.12)',
              accentBorder: 'rgba(125,211,252,0.25)',
              badge: 'Plumber',
              headline: 'Your plumbing business, flowing smoothly.',
              sub: 'Track service calls, permits, and invoices from any device.',
              stats: [{ n:'3×', l:'more jobs won' }, { n:'$0', l:'per-lead fee' }, { n:'$49', l:'per month' }],
              steps: [
                { icon: '📞', title: 'Log a service call', body: 'Add a new lead when a customer calls.' },
                { icon: '🔧', title: 'Diagnose & estimate', body: 'Create a professional estimate and send it.' },
                { icon: '💵', title: 'Invoice & collect', body: 'Generate an invoice and get paid.' },
              ],
              svgIcon: (
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  <rect x="34" y="8" width="12" height="48" rx="6" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2"/>
                  <rect x="22" y="42" width="36" height="12" rx="6" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2"/>
                  <circle cx="40" cy="64" r="8" fill="white" fillOpacity="0.1" stroke="white" strokeWidth="2"/>
                  <circle cx="40" cy="64" r="3" fill="white" fillOpacity="0.4"/>
                  <rect x="36" y="4" width="8" height="8" rx="2" fill="white" fillOpacity="0.5"/>
                </svg>
              ),
            }
            // Roofing
            if (isRoofing(tc)) return {
              gradient: 'linear-gradient(135deg, #0A1628 0%, #0F3D38 50%, #0F766E 100%)',
              accentColor: '#5EEAD4',
              accentBg: 'rgba(94,234,212,0.12)',
              accentBorder: 'rgba(94,234,212,0.25)',
              badge: tc.displayName || 'Contractor',
              headline: 'Your roofing business, all in one place.',
              sub: 'Land more jobs, send estimates faster, and get paid — all from ProGuild.',
              stats: [
                { n: '3×', l: 'more jobs won with CRM' },
                { n: '$0', l: 'per-lead fee. Ever.' },
                { n: '$49', l: 'per month, all features' },
              ],
              steps: [
                { icon: '📋', title: 'Add your first lead', body: 'Log a homeowner enquiry, referral or door knock. Your pipeline starts here.' },
                { icon: '📄', title: 'Send a proposal', body: 'Create a Good / Better / Best estimate and send it for digital approval in minutes.' },
                { icon: '💵', title: 'Invoice & get paid', body: 'Auto-generate an invoice on approval. Collect by card, Zelle, or cash — all tracked.' },
              ],
              svgIcon: (
                <svg width="88" height="72" viewBox="0 0 88 72" fill="none">
                  <ellipse cx="44" cy="69" rx="26" ry="3" fill="rgba(0,0,0,0.2)"/>
                  <path d="M6 34L44 6L82 34" fill="white" fillOpacity="0.18" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
                  <path d="M3 34H85" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                  <rect x="14" y="34" width="60" height="32" rx="2" fill="white" fillOpacity="0.1" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                  <rect x="35" y="48" width="18" height="18" rx="2" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5"/>
                  <circle cx="50" cy="58" r="1.5" fill="white" fillOpacity="0.8"/>
                  <rect x="18" y="39" width="13" height="11" rx="1.5" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5"/>
                  <rect x="57" y="39" width="13" height="11" rx="1.5" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5"/>
                  <rect x="62" y="16" width="9" height="17" rx="1.5" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5"/>
                  <rect x="60" y="13" width="13" height="5" rx="1" fill="white" fillOpacity="0.45"/>
                  {/* Shingle texture lines */}
                  <path d="M18 26L44 6" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.15"/>
                  <path d="M70 26L44 6" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.15"/>
                  <path d="M12 30L44 12L76 30" stroke="white" strokeWidth="0.75" strokeLinecap="round" opacity="0.1"/>
                </svg>
              ),
            }

            // Default: trade-neutral (General Contractor and any other trade)
            return {
              gradient: 'linear-gradient(135deg, #0A1628 0%, #0F3D38 50%, #0F766E 100%)',
              accentColor: '#5EEAD4',
              accentBg: 'rgba(94,234,212,0.12)',
              accentBorder: 'rgba(94,234,212,0.25)',
              badge: tc.displayName || 'Contractor',
              headline: 'Your business, all in one place.',
              sub: 'Land more jobs, send estimates faster, and get paid — all from ProGuild.',
              stats: [
                { n: '3×', l: 'more jobs won with CRM' },
                { n: '$0', l: 'per-lead fee. Ever.' },
                { n: '$49', l: 'per month, all features' },
              ],
              steps: [
                { icon: '📋', title: 'Add your first lead', body: 'Log a homeowner enquiry, referral or door knock. Your pipeline starts here.' },
                { icon: '📄', title: 'Send a proposal', body: 'Create a Good / Better / Best estimate and send it for digital approval in minutes.' },
                { icon: '💵', title: 'Invoice & get paid', body: 'Auto-generate an invoice on approval. Collect by card, Zelle, or cash — all tracked.' },
              ],
              svgIcon: (
                <svg width="80" height="76" viewBox="0 0 80 76" fill="none">
                  {/* Building / business — trade-neutral */}
                  <ellipse cx="40" cy="71" rx="26" ry="3" fill="rgba(0,0,0,0.2)"/>
                  <rect x="14" y="20" width="34" height="48" rx="2" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                  <rect x="48" y="32" width="22" height="36" rx="2" fill="white" fillOpacity="0.08" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                  {/* windows */}
                  <rect x="20" y="27" width="9" height="9" rx="1" fill="white" fillOpacity="0.25"/>
                  <rect x="33" y="27" width="9" height="9" rx="1" fill="white" fillOpacity="0.25"/>
                  <rect x="20" y="40" width="9" height="9" rx="1" fill="white" fillOpacity="0.2"/>
                  <rect x="33" y="40" width="9" height="9" rx="1" fill="white" fillOpacity="0.2"/>
                  <rect x="54" y="39" width="10" height="9" rx="1" fill="white" fillOpacity="0.2"/>
                  <rect x="54" y="52" width="10" height="9" rx="1" fill="white" fillOpacity="0.15"/>
                  {/* door */}
                  <rect x="26" y="56" width="10" height="12" rx="1" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5"/>
                </svg>
              ),
            }
          })()

          return (
            <div className="rounded-2xl mb-5 overflow-hidden" style={{ border: `1px solid rgba(255,255,255,0.08)`, boxShadow: '0 8px 40px rgba(10,22,40,0.18), 0 2px 8px rgba(10,22,40,0.08)', position: 'relative' }}>

              {/* ── Hero band ── */}
              <div style={{ background: tradeWelcome.gradient, padding: '36px 32px 32px', position: 'relative', overflow: 'hidden' }}>

                {/* Geometric grid texture */}
                <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(255,255,255,.6) 31px,rgba(255,255,255,.6) 32px),repeating-linear-gradient(90deg,transparent,transparent 31px,rgba(255,255,255,.6) 31px,rgba(255,255,255,.6) 32px)', pointerEvents: 'none' }} />

                {/* Glow orb top-right */}
                <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${tradeWelcome.accentColor}22 0%, transparent 70%)`, top: -80, right: -60, pointerEvents: 'none' }} />

                {/* Trade badge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: tradeWelcome.accentBg, border: `1px solid ${tradeWelcome.accentBorder}`, borderRadius: 100, padding: '4px 12px', marginBottom: 20 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: tradeWelcome.accentColor, boxShadow: `0 0 8px ${tradeWelcome.accentColor}` }} />
                  <span style={{ color: tradeWelcome.accentColor, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tradeWelcome.badge}</span>
                </div>

                {/* Two-col layout: text left, illustration right */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 10px', lineHeight: 1.2, letterSpacing: '-0.03em'}}>
                      {tradeWelcome.headline.replace('\n', `
`)}
                    </h2>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', margin: '0 0 24px', lineHeight: 1.65, maxWidth: 340 }}>
                      {tradeWelcome.sub}
                    </p>
                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 20 }}>
                      {tradeWelcome.stats.map((s: any) => (
                        <div key={s.n}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.n}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 3, lineHeight: 1.4}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* SVG illustration */}
                  <div className="hidden md:flex" style={{ flexShrink: 0, opacity: 0.9 }}>
                    {tradeWelcome.svgIcon}
                  </div>
                </div>
              </div>

              {/* ── Steps ── */}
              <div style={{ background: dk ? '#111827' : '#fff', padding: '24px 28px 28px' }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: BODY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    How it works
                  </p>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                  <p style={{ fontSize: 11, color: BODY, margin: 0 }}>3 steps to your first paid job</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginBottom: 20, position: 'relative' }}>
                  {/* Connecting line between cards */}
                  <div className="hidden md:block" style={{ position: 'absolute', top: 28, left: '16.5%', right: '16.5%', height: 2, background: `linear-gradient(90deg, ${TEAL}40, ${TEAL}40)`, zIndex: 0, pointerEvents: 'none' }} />
                  {tradeWelcome.steps.map((s: any, i: number) => (
                    <div key={i} style={{ padding: '20px 16px 18px', borderRadius: 12, background: dk ? t.cardBgAlt : '#FAFAF9', border: `1.5px solid ${i === 0 ? TEAL + '40' : BORDER}`, position: 'relative', zIndex: 1, margin: '0 6px', transition: 'border-color 0.2s' }}>
                      {/* Step badge — bold and visible */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: i === 0 ? TEAL : dk ? t.cardBgEdit : '#EEF2F5',
                          color: i === 0 ? '#fff' : TEAL,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 800,
                          boxShadow: i === 0 ? `0 2px 8px rgba(15,118,110,0.4)` : 'none',
                          border: i !== 0 ? `2px solid ${TEAL}33` : 'none',
                        }}>{i + 1}</div>
                        <div style={{ fontSize: 24, lineHeight: 1 }}>{s.icon}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: textMain, marginBottom: 5, letterSpacing: '-0.01em' }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: BODY, lineHeight: 1.6 }}>{s.body}</div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => setShowAddLead(true)}
                  style={{
                    width: '100%', padding: '14px 20px',
                    background: `linear-gradient(135deg, #0F766E, #0D9488)`,
                    color: 'white', border: 'none', borderRadius: 12,
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(15,118,110,0.35)',
                    letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Your First {'Lead'}
                </button>

                {/* Trust line */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                  {['No per-lead fees', 'Cancel any time', '124k FL pros verified'].map((txt, i) => (
                    <React.Fragment key={txt}>
                      {i > 0 && <span style={{ width: 3, height: 3, borderRadius: '50%', background: BORDER, display: 'inline-block' }} />}
                      <span style={{ fontSize: 11, color: BODY }}>{txt}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Action Center ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#0F766E,#0D9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(15,118,110,0.3)' }}>
                <SvgIcon d={ICONS.bell} s={16} sw={2} color="white" />
              </div>
              <div>
                <h2 style={{ fontSize: T.fontHeading, fontWeight: 800, color: textMain, margin: 0 }}>Action Center</h2>
                <p className="hidden md:block text-[11px] mt-0" style={{ color: BODY, margin: 0 }}>What needs your attention right now</p>
              </div>
            </div>
            <Link href="/dashboard/pipeline" className="hidden md:flex text-[12px] font-semibold items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
              style={{ color: TEAL, background: '#F0FDFA', border: '1px solid #CCFBF1' }}>
              View all leads <SvgIcon d={ICONS.arrowRight} s={12} sw={2.5} color={TEAL} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Uncontacted >24h — leads losing interest */}
            <ActionCard
              iconPath={ICONS.flame}
              iconBg="#FEF3C7" iconColor="#F59E0B"
              count={uncontactedLeads.length} label="Uncontacted Leads" sub="No reply in 24+ hours"
              ctaLabel="View Leads" ctaHref="/dashboard/pipeline"
              dk={dk}
            />
            {/* Estimates expiring in ≤3 days */}
            <ActionCard
              iconPath={ICONS.hourglass}
              iconBg="#FEE2E2" iconColor="#DC2626"
              count={expiringEstimates.length} label="Expiring Soon" sub="Proposals expire in 3 days"
              ctaLabel="View Estimates" ctaHref="/dashboard/estimates"
              dk={dk}
            />
            {/* Sent proposals not signed after 48h */}
            <ActionCard
              iconPath={ICONS.alertTri}
              iconBg="#EDE9FE" iconColor="#7C3AED"
              count={unsignedProposals.length} label="Awaiting Signature" sub="Sent 48+ hrs, not signed"
              ctaLabel="View Estimates" ctaHref="/dashboard/estimates"
              dk={dk}
            />
            {/* Jobs scheduled today */}
            <ActionCard
              iconPath={ICONS.calCheck}
              iconBg="#DCFCE7" iconColor="#16A34A"
              count={jobsToday.length} label="Jobs Today" sub="On your schedule today"
              ctaLabel="View Calendar" ctaHref="/dashboard/calendar"
              dk={dk}
            />
            {/* Draft estimates — unsent */}
            <ActionCard
              iconPath={ICONS.fileText}
              iconBg="#EDE9FE" iconColor="#7C3AED"
              count={draftEstimates.length} label="Draft Proposals" sub="Not sent yet"
              ctaLabel="View Estimates" ctaHref="/dashboard/estimates"
              dk={dk}
            />
          </div>
        </div>

        {/* ── Trade-specific overview widget (Today's Schedule, Revenue Forecast, etc.) ── */}
        {/* Slot renders roofing sections for roofers, null for all other trades              */}
        {session && (() => {
          const OverviewWidget = tc.components.OverviewWidget
          return <OverviewWidget leads={leads} session={session} dk={dk} />
        })()}

        {/* ── Reviews & Growth ─────────────────────────────────────────────── */}
        <div className="rounded-2xl p-4 md:p-5 mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}`, boxShadow: '0 2px 12px rgba(10,22,40,0.05)' }}>
          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#FEF9C322,#FDE68A44)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⭐</div>
            <div>
              <h2 style={{ fontSize: T.fontHeading, fontWeight: 800, color: textMain, margin: 0, letterSpacing: '-0.02em' }}>Reviews &amp; Growth</h2>
              <p style={{ fontSize: 11, color: BODY, margin: 0, marginTop: 1 }}>Your reputation drives new leads</p>
            </div>
          </div>

          {reviews.length === 0 ? (
            /* ── Empty state for new pros ── */
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center"
                style={{ background: t.cardBgAlt, border: `2px dashed ${t.cardBorder}`, minHeight: 220 }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#0F766E22,#14B8A622)' }}>⭐</div>
                <div>
                  <h3 className="text-[15px] font-bold mb-1.5" style={{ color: textMain }}>No reviews yet</h3>
                  <p className="text-[13px] leading-relaxed max-w-xs" style={{ color: BODY }}>Reviews build trust and help you win more jobs. Complete your first job and ask for a review.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
                  {[['✅','Complete a job'],['💬','Ask for review'],['🏆','Build reputation']].map(([icon, text]) => (
                    <div key={text} className="flex flex-col items-center gap-1.5 p-3 rounded-xl" style={{ background: t.cardBg, border: `1px solid ${BORDER}` }}>
                      <span className="text-xl">{icon}</span>
                      <span className="text-[10px] font-semibold" style={{ color: BODY }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-72 flex flex-col gap-3">
                <div className="rounded-xl p-4" style={{ background: t.successBg, border: `1px solid ${t.successBorder}` }}>
                  <h3 className="text-[14px] font-bold mb-1.5" style={{ color: textMain }}>Request a review</h3>
                  <p className="text-[12px] mb-3" style={{ color: BODY }}>Ask right after a job — response rates drop 80% after 48 hours.</p>
                  <button className="w-full py-2.5 rounded-xl text-[13px] font-bold" style={{ background: `linear-gradient(135deg,${TEAL},#0D9488)`, color: 'white', border: 'none', cursor: 'pointer' }}>
                    + Request a Review
                  </button>
                </div>
                <div className="rounded-xl p-4 text-center" style={{ background: t.warningBg, border: `1px solid ${t.warningBorder}` }}>
                  <div className="text-2xl mb-1">🏆</div>
                  <div className="text-[13px] font-bold mb-1" style={{ color: textMain }}>Unlock Top Pro</div>
                  <div className="text-[11px]" style={{ color: BODY }}>Get 10 reviews with 4.5+ rating to win 30% more leads</div>
                </div>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Col 1: Rating + gamification + AI insight + recent reviews */}
            <div className="lg:col-span-2">
              <div className="flex flex-col md:flex-row items-start gap-4 mb-5">
                {/* Big rating */}
                <div>
                  <div className="text-[52px] font-bold leading-none" style={{ color: textMain }}>
                    {avgRating ? avgRating.toFixed(1) : '4.0'}
                  </div>
                  <Stars rating={avgRating || 4} size={18} />
                  <div className="text-[12px] mt-1" style={{ color: MUTED_D }}>({reviews.length || 5} reviews)</div>
                </div>

                {/* Gamification card */}
                <div className="w-full md:flex-1 rounded-xl p-3" style={{ backgroundColor: t.successBg, borderTop: `1px solid ${t.successBorder}`, borderRight: `1px solid ${t.successBorder}`, borderBottom: `1px solid ${t.successBorder}`, borderLeft: `3px solid ${dk ? '#22C55E' : '#16A34A'}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-bold mb-1" style={{ color: textMain }}>
                        🏆 Get 2 more 5⭐ reviews
                      </div>
                      <div className="text-[13px]" style={{ color: dk ? '#94A3B8' : '#374151' }}>to unlock Top Pro badge and win 30% more jobs</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                      style={{ backgroundColor: '#FEF3C7' }}>🥇</div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[12px] mb-1" style={{ color: t.textMuted }}>
                      <span>Progress</span><span>{reviews.length || 5} / 10 reviews</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: '#E8E2D9' }}>
                      <div className="h-1.5 rounded-full" style={{ backgroundColor: TEAL, width: `${Math.min(((reviews.length || 5) / 10) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>

                {/* AI Insight card */}
                <div className="w-full md:flex-1 rounded-xl p-3" style={{ backgroundColor: t.infoBg, borderTop: `1px solid ${t.infoBorder}`, borderRight: `1px solid ${t.infoBorder}`, borderBottom: `1px solid ${t.infoBorder}`, borderLeft: `3px solid ${dk ? '#8B5CF6' : '#7C3AED'}` }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <SvgIcon d={ICONS.sparkle} s={14} sw={1.5} color="#7C3AED" />
                    <span className="text-[12px] font-bold" style={{ color: textMain }}>AI Insight</span>
                  </div>
                  <p className="text-[12px] mb-2" style={{ color: t.textBody }}>
                    Customers love your work quality but mention slow response. Respond within 15 mins to increase win rate by 25%.
                  </p>
                  <button className="text-[11px] font-semibold flex items-center gap-1" style={{ color: TEAL }}>
                    View insight <SvgIcon d={ICONS.chevRight} s={11} sw={2.5} color={TEAL} />
                  </button>
                </div>
              </div>

              {/* Recent reviews */}
              <div>
                <h3 className="text-[13px] font-bold mb-3" style={{ color: textMain }}>Recent Reviews</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reviews.slice(0, 4).map(review => {
                    const s = sentiment(review.rating)
                    return (
                      <div key={review.id} className="rounded-xl p-4" style={{ border: `1px solid ${t.cardBorder}`, backgroundColor: dk ? '#0F172A' : '#FAFAF8' }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <AvatarInitials name={review.reviewer_name || 'A'} size={36} />
                          <div>
                            <div className="text-[15px] font-bold" style={{ color: textMain }}>{review.reviewer_name}</div>
                            <Stars rating={review.rating} size={16} />
                          </div>
                          <div className="ml-auto text-[12px] font-medium" style={{ color: t.textSubtle }}>{new Date(review.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        </div>
                        {review.comment && <p className="text-[14px] line-clamp-2 mb-2.5 leading-snug" style={{ color: t.textBody }}>{review.comment}</p>}
                        <span className="inline-block text-[12px] font-semibold px-3 py-0.5 rounded-full"
                          style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Col 2: Request reviews + AI assistant */}
            <div className="flex flex-col gap-4">
              {/* Request reviews panel */}
              <div className="rounded-xl p-4" style={{ border: `1px solid ${cardBdr}`, backgroundColor: cardBg }}>
                <div className="text-[13px] font-bold mb-0.5" style={{ color: textMain }}>Request reviews from happy customers</div>
                <div className="text-[12px] mb-3 flex flex-wrap items-center gap-1" style={{ color: t.textMuted }}>
                  3 customers are likely to give you a
                  <Star filled size={11} />
                  <span>5★ review</span>
                </div>
                {[
                  { initials: 'SY', name: 'Surya Yadav',   sub: 'Job completed 1 day ago',   color: '#7C3AED' },
                  { initials: 'MJ', name: 'Mike Johnson',  sub: 'Job completed 3 days ago',  color: '#0EA5E9' },
                  { initials: 'SD', name: 'Sarah Davis',   sub: 'Job completed 1 week ago',  color: '#F97316' },
                ].map(c => (
                  <div key={c.name} className="flex items-center gap-2.5 py-2.5 border-t" style={{ borderColor: BORDER }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: c.color }}>{c.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold" style={{ color: textMain }}>{c.name}</div>
                      <div className="text-[13px]" style={{ color: t.textMuted }}>{c.sub}</div>
                    </div>
                    <button className="text-[12px] font-semibold px-4 py-1.5 rounded-xl"
                      style={{ border: `1.5px solid #0F766E`, color: '#0F766E', backgroundColor: '#F0FDFA' }}>Request</button>
                  </div>
                ))}
                <button className="mt-3 text-[12px] font-semibold flex items-center gap-1" style={{ color: TEAL }}>
                  View all customers <SvgIcon d={ICONS.arrowRight} s={13} sw={2} color={TEAL} />
                </button>
              </div>

              {/* AI Review Assistant */}
              <div className="rounded-xl p-4" style={{ border: `1px solid ${cardBdr}`, backgroundColor: cardBg }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <SvgIcon d={ICONS.sparkle} s={14} sw={1.5} color="#7C3AED" />
                    <span className="text-[13px] font-bold" style={{ color: textMain }}>AI Review Assistant</span>
                  </div>
                  <button className="text-[11px] font-semibold" style={{ color: TEAL }}>View all insights →</button>
                </div>

                {/* Negative review reply */}
                <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: t.dangerBg, borderTop: `1px solid ${t.dangerBorder}`, borderRight: `1px solid ${t.dangerBorder}`, borderBottom: `1px solid ${t.dangerBorder}`, borderLeft: `3px solid ${dk ? '#EF4444' : '#DC2626'}` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: '#DC2626' }}>Negative Review Assistant</div>
                      <div className="text-[13px]" style={{ color: MUTED_D }}>AI-generated reply for Jessica Lee</div>
                    </div>
                  </div>
                  <p className="text-[12px] italic mb-2" style={{ color: t.textBody }}>
                    &ldquo;Hi Jessica, thank you for your feedback. We&apos;re sorry for the delay in response. We appreciate your patience and are glad you liked our work. We&apos;ll do better next time!&rdquo;
                  </p>
                  <div className="flex gap-2">
                    <button className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                      style={{ backgroundColor: TEAL }}>Use Reply</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                      style={{ border: `1px solid ${BORDER}`, color: NAVY }}>Edit</button>
                  </div>
                </div>

                {/* Positive review booster */}
                <div className="rounded-xl p-3" style={{ backgroundColor: t.warningBg, borderTop: `1px solid ${t.warningBorder}`, borderRight: `1px solid ${t.warningBorder}`, borderBottom: `1px solid ${t.warningBorder}`, borderLeft: `3px solid ${dk ? '#F59E0B' : '#D97706'}` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: '#B45309' }}>Positive Review Booster</div>
                      <div className="text-[13px]" style={{ color: MUTED_D }}>AI-generated review request message</div>
                    </div>
                  </div>
                  <p className="text-[12px] italic mb-2" style={{ color: t.textBody }}>
                    Hi [Name], thanks again for choosing us! If you&apos;re happy with the work, would you mind leaving us a quick 5⭐ review?
                  </p>
                  <div className="flex gap-2">
                    <button className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                      style={{ backgroundColor: TEAL }}>Use Message</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                      style={{ border: `1px solid ${BORDER}`, color: NAVY }}>Edit</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )} {/* end reviews.length > 0 */}
        </div>

        {/* ── HVAC Maintenance Reminders (HVAC pros only) ───────────────── */}
        {session && isHVACTrade && maintenanceReminders.length > 0 && (
          <div className="rounded-2xl mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}`, overflow:'hidden' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:`1px solid ${cardBdr}` }}>
              <div className="flex items-center gap-2">
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(15,118,110,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>❄️</div>
                <div>
                  <div className="font-bold" style={{ fontSize:15, color: textMain }}>Maintenance Due</div>
                  <div style={{ fontSize:12, color: t.textSubtle }}>{maintenanceReminders.length} unit{maintenanceReminders.length !== 1 ? 's' : ''} need attention</div>
                </div>
              </div>
              <a href="/dashboard/clients" style={{ fontSize:12, fontWeight:700, color:'#0F766E', textDecoration:'none' }}>View All →</a>
            </div>
            <div>
              {maintenanceReminders.slice(0, 5).map((reminder: any, i: number) => {
                const daysUntil = Math.ceil((new Date(reminder.due_date).getTime() - Date.now()) / (1000*60*60*24))
                const overdue = daysUntil < 0
                return (
                  <div key={reminder.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderTop: i > 0 ? `1px solid ${cardBdr}` : 'none' }}>
                    <div style={{ fontSize:18, flexShrink:0 }}>
                      {reminder.hvac_equipment?.equipment_type === 'Furnace' ? '🔥' : reminder.hvac_equipment?.equipment_type === 'Heat_Pump' ? '♻️' : '❄️'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color: textMain }}>
                        {reminder.clients?.full_name || 'Unknown Client'}
                        {reminder.hvac_equipment?.brand ? ` — ${reminder.hvac_equipment.brand}` : ''}
                        {reminder.hvac_equipment?.equipment_type ? ` ${reminder.hvac_equipment.equipment_type.replace('_',' ')}` : ''}
                      </div>
                      <div style={{ fontSize:12, color: overdue ? '#DC2626' : t.textSubtle, fontWeight: overdue ? 700 : 400 }}>
                        {overdue ? `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}` : `Due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} — ${reminder.due_date}`}
                      </div>
                    </div>
                    <a href={`/dashboard/clients/${reminder.client_id}`}
                      style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:8, background:'#F0FDFA', color:'#0F766E', textDecoration:'none', flexShrink:0, whiteSpace:'nowrap' }}>
                      Schedule
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )}



      </div>

      {showAddLead && session && (() => {
        // Use trade plugin's AddLeadModal — roofing gets roofing modal, HVAC gets HVAC modal
        const plugin = getTradeConfig(session.trade_slug)
        const TradeAddLeadModal = (plugin as any).components?.AddLeadModal ?? AddLeadModal
        return (
          <TradeAddLeadModal
            proId={session.id}
            tradeSlug={session.trade_slug}
            onClose={() => setShowAddLead(false)}
            onAdded={() => { setShowAddLead(false); fetchData(session) }}
            dk={dk}
          />
        )
      })()}
    </DashboardShell>
  )
}
