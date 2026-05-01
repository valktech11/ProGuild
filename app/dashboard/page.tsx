'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Lead, Review } from '@/types'
import { timeAgo } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'
import AddLeadModal from '@/components/ui/AddLeadModal'

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
function ActionCard({ iconPath, count, label, sub, iconBg, iconColor, ctaLabel, ctaHref, dk }: {
  iconPath: string; count: number | string; label: string; sub: string
  iconBg: string; iconColor: string; ctaLabel: string; ctaHref: string; dk: boolean
}) {
  const bg  = dk ? '#1E293B' : 'white'
  const bdr = dk ? '#334155' : '#F1F5F9'
  const txt = dk ? '#F1F5F9' : NAVY
  const sub_color = dk ? '#94A3B8' : '#6B7280'
  const cta_bg = dk ? '#1E293B' : 'white'
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ backgroundColor: bg, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: `1px solid ${bdr}` }}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}>
          <SvgIcon d={iconPath} s={24} sw={1.8} color={iconColor} />
        </div>
        <div className="min-w-0">
          <div className="text-[32px] font-bold leading-none mb-1" style={{ color: txt }}>{count}</div>
          <div className="text-[13px] font-semibold leading-tight" style={{ color: txt }}>{label}</div>
          <div className="text-[12px] mt-0.5" style={{ color: sub_color }}>{sub}</div>
        </div>
      </div>
      <Link href={ctaHref}
        className="w-full flex items-center justify-center py-2 rounded-xl text-[12px] font-semibold transition-all"
        style={{ border: `1px solid ${TEAL}`, color: TEAL, backgroundColor: cta_bg }}>
        {ctaLabel}
      </Link>
    </div>
  )
}

// ── Pipeline Stage ─────────────────────────────────────────────────────────────
function PipeStage({ iconPath, iconBg, iconColor, label, count, sub, isLast, dk, showDash }: {
  iconPath: string; iconBg: string; iconColor: string
  label: string; count: number; sub: string; isLast?: boolean; dk: boolean; showDash?: boolean
}) {
  const txt = dk ? '#F1F5F9' : NAVY
  const sub_c = dk ? '#94A3B8' : '#6B7280'
  const arr_c = dk ? '#475569' : '#CBD5E1'
  const displayCount = showDash && count === 0 ? '—' : count
  return (
    <div className="flex items-center min-w-0">
      <Link href="/dashboard/pipeline" className="flex items-center gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}>
          <SvgIcon d={iconPath} s={18} sw={1.8} color={iconColor} />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: txt }}>{label}</div>
          <div className="text-[22px] font-bold leading-tight" style={{ color: count > 0 ? txt : (dk ? '#475569' : '#D1D5DB') }}>{displayCount}</div>
          <div className="text-[11px]" style={{ color: sub_c }}>{sub}</div>
        </div>
      </Link>
      {!isLast && (
        <span className="flex-shrink-0 mx-3 text-[16px] font-light" style={{ color: arr_c }}>→</span>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem('pg_pro')
    return stored ? JSON.parse(stored) : null
  })

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
  const [dataLoading, setDataLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    Promise.all([
      fetch(`/api/leads?pro_id=${session.id}`).then(r => r.json()),
      fetch(`/api/reviews?pro_id=${session.id}`).then(r => r.json()),
    ]).then(([leadsData, reviewsData]) => {
      setLeads(leadsData.leads || [])
      setReviews((reviewsData.reviews || []).filter((r: Review) => r.is_approved))
      setDataLoading(false)
    }).catch(() => setDataLoading(false))
  }, [session, router])

  const newLeads       = leads.filter(l => l.lead_status === 'New')
  const contactedLeads = leads.filter(l => l.lead_status === 'Contacted')
  const quotedLeads    = leads.filter(l => l.lead_status === 'Quoted')
  const scheduledLeads = leads.filter(l => l.lead_status === 'Scheduled')
  const completedLeads = leads.filter(l => l.lead_status === 'Completed')
  const paidLeads      = leads.filter(l => l.lead_status === 'Paid')
  const revenueLeads   = leads.filter(l => ['Paid','Completed'].includes(l.lead_status))
  const activeLeads    = leads.filter(l => !['Paid','Lost','Archived','Converted','Completed'].includes(l.lead_status))
  const awaitingResp   = contactedLeads.filter(l => (Date.now() - new Date(l.created_at).getTime()) / 86400000 >= 1)
  const waitingOnCust  = quotedLeads

  const revenue  = revenueLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const pipeline = activeLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = session?.name?.split(' ')[0] || ''

  const cardBg  = dk ? '#1E293B' : 'white'
  const cardBdr = dk ? '#334155' : BORDER
  const textMain = dk ? '#F1F5F9' : NAVY

  // Review sentiment
  function sentiment(rating: number) {
    if (rating >= 4) return { label: 'Positive', color: '#16A34A', bg: '#DCFCE7' }
    if (rating >= 3) return { label: 'Neutral',  color: '#B45309', bg: '#FEF3C7' }
    return { label: 'Needs Improvement', color: '#DC2626', bg: '#FEE2E2' }
  }

  if (!session || dataLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: '#ECEAE5' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium" style={{ color: MUTED }}>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <DashboardShell session={session} newLeads={newLeads.length} onAddLead={() => setShowAddLead(true)} darkMode={dk} onToggleDark={toggleDark}>
      <div className="px-8 py-6 pr-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: textMain }}>{greeting}, {firstName}! 👋</h1>
            <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>Here&apos;s what&apos;s happening with your business today.</p>
          </div>

        </div>

        {/* ── Action Center ────────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: textMain }}>Action Center</h2>
              <p className="text-[12px]" style={{ color: MUTED }}>Top items that need your attention</p>
            </div>
            <Link href="/dashboard/pipeline" className="text-[13px] font-semibold flex items-center gap-1" style={{ color: TEAL }}>
              View all leads <SvgIcon d={ICONS.chevRight} s={14} sw={2.5} color={TEAL} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ActionCard
              iconPath={ICONS.flame}
              iconBg="#FEF3C7" iconColor="#F59E0B"
              count={newLeads.length} label="New Leads" sub="Received in last 2 hours"
              ctaLabel="View Leads" ctaHref="/dashboard/pipeline"
              dk={dk}
            />
            <ActionCard
              iconPath={ICONS.alertTri}
              iconBg="#EDE9FE" iconColor="#7C3AED"
              count={awaitingResp.length} label="Awaiting Your Response" sub="Customers messaged you"
              ctaLabel="View Leads" ctaHref="/dashboard/pipeline"
              dk={dk}
            />
            <ActionCard
              iconPath={ICONS.hourglass}
              iconBg="#E0F2FE" iconColor="#0EA5E9"
              count={waitingOnCust.length} label="Waiting on Customer" sub="You replied, waiting for them"
              ctaLabel="View Leads" ctaHref="/dashboard/pipeline"
              dk={dk}
            />
            <ActionCard
              iconPath={ICONS.calCheck}
              iconBg="#DCFCE7" iconColor="#16A34A"
              count={scheduledLeads.length} label="Jobs Scheduled" sub="This week"
              ctaLabel="View Calendar" ctaHref="/dashboard/pipeline"
              dk={dk}
            />
            {/* Draft Estimates — v75 placeholder */}
            <div className="flex-shrink-0 rounded-2xl p-5 flex flex-col gap-4 relative opacity-70"
              style={{ backgroundColor: dk ? '#1E293B' : 'white', border: `1px solid ${cardBdr}` }}>
              <span className="absolute top-3 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}>v75</span>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#EDE9FE' }}>
                  <SvgIcon d={ICONS.fileText} s={22} sw={1.8} color="#7C3AED" />
                </div>
                <div>
                  <div className="text-[28px] font-bold leading-none mb-1" style={{ color: textMain }}>0</div>
                  <div className="text-[13px] font-semibold" style={{ color: textMain }}>Draft Estimates</div>
                  <div className="text-[12px] mt-0.5" style={{ color: dk ? '#94A3B8' : MUTED }}>Need your review</div>
                </div>
              </div>
              <div className="w-full flex items-center justify-center py-2 rounded-xl text-[12px] font-semibold cursor-not-allowed"
                style={{ border: `1px solid ${TEAL}`, color: TEAL, backgroundColor: 'white' }}>
                View Estimates
              </div>
            </div>
          </div>
        </div>

        {/* ── Pipeline ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold inline mr-2" style={{ color: textMain }}>Pipeline</h2>
              <span className="text-[12px]" style={{ color: MUTED }}>Track your leads at every stage</span>
            </div>
            <Link href="/dashboard/pipeline" className="text-[13px] font-semibold flex items-center gap-1" style={{ color: TEAL }}>
              Open Full Pipeline <SvgIcon d={ICONS.chevRight} s={14} sw={2.5} color={TEAL} />
            </Link>
          </div>
          {leads.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: MUTED }}>No leads yet — add your first lead to get started.</p>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-wrap gap-2">
                <PipeStage iconPath={ICONS.users}     iconBg="#EFF6FF" iconColor="#3B82F6" label="New"       count={newLeads.length}       sub="New leads"       dk={dk} />
                <PipeStage iconPath={ICONS.phone}     iconBg="#DCFCE7" iconColor="#16A34A" label="Contacted" count={contactedLeads.length}  sub="You contacted"   dk={dk} />
                <PipeStage iconPath={ICONS.fileText}  iconBg="#EDE9FE" iconColor="#7C3AED" label="Quoted"    count={quotedLeads.length}     sub="Estimate sent"   dk={dk} />
                <PipeStage iconPath={ICONS.calendar}  iconBg="#FFF7ED" iconColor="#F97316" label="Scheduled" count={scheduledLeads.length}  sub="Job scheduled"   dk={dk} />
                <PipeStage iconPath={ICONS.checkCirc} iconBg="#DCFCE7" iconColor="#16A34A" label="Job Won"   count={completedLeads.length + paidLeads.length} sub="Converted" isLast dk={dk} showDash />
              </div>
              {pipeline > 0 && (
                <div className="flex-shrink-0 text-right border-l pl-6" style={{ borderColor: cardBdr }}>
                  <div className="text-[11px] font-medium mb-0.5" style={{ color: MUTED }}>Total Pipeline Value</div>
                  <div className="text-[28px] font-bold" style={{ color: textMain }}>${pipeline.toLocaleString()}</div>
                  <div className="text-[11px]" style={{ color: MUTED }}>Potential Revenue</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Reviews & Growth ─────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-lg">⭐</span>
            <h2 className="text-[16px] font-bold" style={{ color: textMain }}>Reviews &amp; Growth</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Col 1: Rating + gamification + AI insight + recent reviews */}
            <div className="lg:col-span-2">
              <div className="flex items-start gap-6 mb-5">
                {/* Big rating */}
                <div>
                  <div className="text-[52px] font-bold leading-none" style={{ color: textMain }}>
                    {avgRating ? avgRating.toFixed(1) : '4.0'}
                  </div>
                  <Stars rating={avgRating || 4} size={18} />
                  <div className="text-[12px] mt-1" style={{ color: MUTED }}>({reviews.length || 5} reviews)</div>
                </div>

                {/* Gamification card */}
                <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: dk ? '#1E293B' : '#F0FDF4', borderTop: `1px solid ${dk ? '#334155' : '#BBF7D0'}`, borderRight: `1px solid ${dk ? '#334155' : '#BBF7D0'}`, borderBottom: `1px solid ${dk ? '#334155' : '#BBF7D0'}`, borderLeft: `3px solid ${dk ? '#22C55E' : '#16A34A'}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-bold mb-1" style={{ color: textMain }}>
                        🏆 Get 2 more 5⭐ reviews
                      </div>
                      <div className="text-[11px]" style={{ color: dk ? '#94A3B8' : '#374151' }}>to unlock Top Pro badge and win 30% more jobs</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                      style={{ backgroundColor: '#FEF3C7' }}>🥇</div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] mb-1" style={{ color: dk ? '#94A3B8' : MUTED }}>
                      <span>Progress</span><span>{reviews.length || 5} / 10 reviews</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: '#E8E2D9' }}>
                      <div className="h-1.5 rounded-full" style={{ backgroundColor: TEAL, width: `${Math.min(((reviews.length || 5) / 10) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>

                {/* AI Insight card */}
                <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: dk ? '#1E293B' : '#F5F3FF', borderTop: `1px solid ${dk ? '#334155' : '#DDD6FE'}`, borderRight: `1px solid ${dk ? '#334155' : '#DDD6FE'}`, borderBottom: `1px solid ${dk ? '#334155' : '#DDD6FE'}`, borderLeft: `3px solid ${dk ? '#8B5CF6' : '#7C3AED'}` }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <SvgIcon d={ICONS.sparkle} s={14} sw={1.5} color="#7C3AED" />
                    <span className="text-[12px] font-bold" style={{ color: textMain }}>AI Insight</span>
                  </div>
                  <p className="text-[12px] mb-2" style={{ color: dk ? '#CBD5E1' : '#374151' }}>
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
                <div className="grid grid-cols-2 gap-3">
                  {reviews.slice(0, 4).map(review => {
                    const s = sentiment(review.rating)
                    return (
                      <div key={review.id} className="rounded-xl p-3" style={{ border: `1px solid ${cardBdr}`, backgroundColor: cardBg }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <AvatarInitials name={review.reviewer_name || 'A'} size={30} />
                          <div>
                            <div className="text-[13px] font-semibold" style={{ color: NAVY }}>{review.reviewer_name}</div>
                            <Stars rating={review.rating} size={13} />
                          </div>
                          <div className="ml-auto text-[11px]" style={{ color: '#9CA3AF' }}>{timeAgo(review.reviewed_at)}</div>
                        </div>
                        {review.comment && <p className="text-[13px] line-clamp-2 mb-2 leading-snug" style={{ color: '#374151' }}>{review.comment}</p>}
                        <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
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
                <div className="text-[12px] mb-3 flex items-center gap-1" style={{ color: dk ? '#94A3B8' : '#6B7280' }}>
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
                      <div className="text-[10px]" style={{ color: dk ? '#94A3B8' : MUTED }}>{c.sub}</div>
                    </div>
                    <button className="text-[11px] font-semibold px-3 py-1 rounded-lg"
                      style={{ border: `1px solid ${cardBdr}`, color: textMain, backgroundColor: cardBg }}>Request</button>
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
                <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: dk ? '#1E293B' : '#FEF2F2', borderTop: `1px solid ${dk ? '#334155' : '#FECACA'}`, borderRight: `1px solid ${dk ? '#334155' : '#FECACA'}`, borderBottom: `1px solid ${dk ? '#334155' : '#FECACA'}`, borderLeft: `3px solid ${dk ? '#EF4444' : '#DC2626'}` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: '#DC2626' }}>Negative Review Assistant</div>
                      <div className="text-[10px]" style={{ color: MUTED }}>AI-generated reply for Jessica Lee</div>
                    </div>
                  </div>
                  <p className="text-[12px] italic mb-2" style={{ color: dk ? '#CBD5E1' : '#374151' }}>
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
                <div className="rounded-xl p-3" style={{ backgroundColor: dk ? '#1E293B' : '#FFFBEB', borderTop: `1px solid ${dk ? '#334155' : '#FDE68A'}`, borderRight: `1px solid ${dk ? '#334155' : '#FDE68A'}`, borderBottom: `1px solid ${dk ? '#334155' : '#FDE68A'}`, borderLeft: `3px solid ${dk ? '#F59E0B' : '#D97706'}` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: '#B45309' }}>Positive Review Booster</div>
                      <div className="text-[10px]" style={{ color: MUTED }}>AI-generated review request message</div>
                    </div>
                  </div>
                  <p className="text-[12px] italic mb-2" style={{ color: dk ? '#CBD5E1' : '#374151' }}>
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
        </div>

        {/* ── Community Insights ───────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 mb-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] font-bold" style={{ color: textMain }}>Community Insights</h2>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: '#CCFBF1', color: TEAL }}>
                Trending in {session?.city || 'your area'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/community" className="text-[12px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
                style={{ border: `1px solid ${cardBdr}`, color: textMain, backgroundColor: cardBg }}>
                View Community <SvgIcon d={ICONS.arrowRight} s={13} sw={2} color={textMain} />
              </Link>
              <Link href="/community" className="text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1"
                style={{ backgroundColor: TEAL }}>
                <SvgIcon d={ICONS.sparkle} s={13} sw={1.5} color="white" />
                Ask a Question
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: ICONS.dollar, iconBg: '#DCFCE7', iconColor: '#16A34A',
                q: 'What\'s fair price for 2BHK painting in Miami?',
                price: '$1,500 – $2,200', sub: 'Avg. price from 12 pros', answers: 12, label: 'answers',
              },
              {
                icon: ICONS.tool, iconBg: '#E0F2FE', iconColor: '#0EA5E9',
                q: 'Best AC brand for Florida humidity?',
                price: null, sub: '8 pros shared their experience', answers: 8, label: 'answers',
              },
              {
                icon: ICONS.mapPin, iconBg: '#FEE2E2', iconColor: '#EF4444',
                q: 'Looking for electrician in Tampa',
                price: null, sub: null, answers: 6, label: 'replies',
              },
            ].map((item, i) => (
              <Link key={i} href="/community" className="rounded-xl p-4 flex gap-3 transition-all hover:shadow-sm"
                style={{ border: `1px solid ${cardBdr}`, backgroundColor: cardBg }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: item.iconBg }}>
                  <SvgIcon d={item.icon} s={18} sw={1.8} color={item.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold mb-1 leading-snug" style={{ color: textMain }}>{item.q}</p>
                  {item.price && <p className="text-[13px] font-bold mb-0.5" style={{ color: TEAL }}>{item.price}</p>}
                  {item.sub && <p className="text-[11px]" style={{ color: MUTED }}>{item.sub}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex -space-x-1">
                      {['#7C3AED','#0EA5E9','#F97316','#16A34A'].map((c, j) => (
                        <div key={j} className="w-5 h-5 rounded-full border-2 border-white" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <span className="text-[11px]" style={{ color: MUTED }}>{item.answers} {item.label}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {leads.length === 0 && reviews.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: cardBg, border: `1px solid ${cardBdr}` }}>
            <div className="text-5xl mb-4">🏗️</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: textMain }}>Welcome to ProGuild</h3>
            <p className="text-sm mb-5" style={{ color: MUTED }}>Add your first lead to start tracking your pipeline.</p>
            <button onClick={() => setShowAddLead(true)}
              className="hidden md:inline-flex px-6 py-3 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: TEAL, color: 'white' }}>
              Add First Lead
            </button>
          </div>
        )}

      </div>

      {showAddLead && session && (
        <AddLeadModal
          proId={session.id}
          onClose={() => setShowAddLead(false)}
          onAdded={() => { setShowAddLead(false); window.location.reload() }}
        />
      )}
    </DashboardShell>
  )
}
