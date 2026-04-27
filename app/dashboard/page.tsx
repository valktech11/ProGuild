'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Lead, Review } from '@/types'
import { timeAgo, planLabel } from '@/lib/utils'
import DashboardShell from '@/components/layout/DashboardShell'
import ActionAlert from '@/components/ui/ActionAlert'
import AddLeadModal from '@/components/ui/AddLeadModal'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const NAVY   = '#0A1628'
const AMBER  = '#B45309'
const CREAM  = '#F5F4F0'
const BORDER = '#E8E2D9'
const MUTED  = '#9CA3AF'
const BODY   = '#6B7280'

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24"
      fill={filled ? TEAL : 'none'} stroke={TEAL} strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating)
  return (
    <div className="flex gap-0.5">
      <Star filled={r >= 1} /><Star filled={r >= 2} /><Star filled={r >= 3} />
      <Star filled={r >= 4} /><Star filled={r >= 5} />
    </div>
  )
}

function StatCard({ label, value, sub, onClick }: {
  label: string; value: string | number; sub?: string; onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className="flex-1 min-w-0 rounded-xl p-3 text-left transition-all active:scale-95"
      style={{ backgroundColor: 'white', border: `1px solid ${BORDER}` }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: MUTED }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color: NAVY }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: MUTED }}>{sub}</div>}
    </button>
  )
}

// Pipeline summary chip
function StageChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <Link href="/dashboard/pipeline"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:opacity-80"
      style={{ backgroundColor: color + '18', color: color, border: `1px solid ${color}30` }}>
      <span className="font-bold">{count}</span>
      <span style={{ color: BODY }}>{label}</span>
    </Link>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const router = useRouter()

  // Read session synchronously so first render already has it — no flicker
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem('pg_pro')
    return stored ? JSON.parse(stored) : null
  })

  const [leads,       setLeads]      = useState<Lead[]>([])
  const [reviews,     setReviews]    = useState<Review[]>([])
  const [dataLoading, setDataLoading]= useState(true)
  const [showAddLead, setShowAddLead]= useState(false)

  // ── Redirect if no session ────────────────────────────────────────────────
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

  // ── Derived data ──────────────────────────────────────────────────────────
  const activeLeads   = leads.filter(l => !['Paid','Lost','Archived','Converted'].includes(l.lead_status))
  const newLeads      = leads.filter(l => l.lead_status === 'New')
  const paidLeads     = leads.filter(l => l.lead_status === 'Paid')
  const contactedLeads= leads.filter(l => l.lead_status === 'Contacted')
  const quotedLeads   = leads.filter(l => l.lead_status === 'Quoted')
  const scheduledLeads= leads.filter(l => l.lead_status === 'Scheduled')

  const revenue = paidLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null

  // Overdue = New leads older than 3 days
  const overdue = activeLeads.filter(l => {
    const days = (Date.now() - new Date(l.created_at).getTime()) / 86400000
    return days >= 3 && l.lead_status === 'New'
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = session?.name?.split(' ')[0] || ''

  if (!session || dataLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: '#F5F4F0' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: '#0F766E', borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium" style={{ color: '#9CA3AF' }}>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <DashboardShell session={session} newLeads={newLeads.length} onAddLead={() => setShowAddLead(true)}>
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold" style={{ color: NAVY }}>
              {greeting}, {firstName}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={() => setShowAddLead(true)}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
              transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: TEAL, color: 'white' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Lead
          </button>
        </div>

        {/* ── Action alerts ─────────────────────────────────────────────── */}
        {overdue.length > 0 && (
          <div className="mb-5">
            <ActionAlert
              leads={overdue.slice(0, 2)}
              onRespond={() => { window.location.href = '/dashboard/pipeline' }}
            />
            {overdue.length > 2 && (
              <Link href="/dashboard/pipeline"
                className="block text-center text-sm font-medium py-2 rounded-lg mt-2"
                style={{ color: AMBER, backgroundColor: '#FEF3C7' }}>
                +{overdue.length - 2} more leads need attention →
              </Link>
            )}
          </div>
        )}

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="flex gap-3 mb-5 overflow-x-auto pb-1">
          <StatCard
            label="Leads"
            value={leads.length}
            sub={`${activeLeads.length} active`}
          />
          <StatCard
            label="New"
            value={newLeads.length}
            sub="awaiting response"
          />
          <StatCard
            label="Revenue"
            value={revenue > 0 ? `$${revenue.toLocaleString()}` : '—'}
            sub={paidLeads.length > 0 ? `${paidLeads.length} paid jobs` : 'no paid jobs yet'}
          />
          <StatCard
            label="Rating"
            value={avgRating || '—'}
            sub={reviews.length > 0 ? `${reviews.length} reviews` : 'no reviews yet'}
          />
        </div>

        {/* ── Pipeline summary ───────────────────────────────────────────── */}
        <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: MUTED }}>
              Pipeline
            </h2>
            <Link href="/dashboard/pipeline"
              className="text-sm font-medium" style={{ color: TEAL }}>
              View all →
            </Link>
          </div>
          {leads.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm mb-3" style={{ color: MUTED }}>No leads yet. Add your first lead to get started.</p>
              <button onClick={() => setShowAddLead(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: TEAL, color: 'white' }}>
                Add Lead
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {newLeads.length > 0      && <StageChip label="New"       count={newLeads.length}       color="#B45309" />}
              {contactedLeads.length > 0 && <StageChip label="Contacted" count={contactedLeads.length} color="#2563EB" />}
              {quotedLeads.length > 0   && <StageChip label="Quoted"    count={quotedLeads.length}    color="#7C3AED" />}
              {scheduledLeads.length > 0 && <StageChip label="Scheduled" count={scheduledLeads.length} color={TEAL} />}
              {paidLeads.length > 0     && <StageChip label="Paid"      count={paidLeads.length}      color="#16A34A" />}
              {leads.length > 0 && newLeads.length === 0 && contactedLeads.length === 0 &&
                quotedLeads.length === 0 && scheduledLeads.length === 0 && paidLeads.length === 0 && (
                <p className="text-sm" style={{ color: MUTED }}>All leads closed.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Revenue snapshot ───────────────────────────────────────────── */}
        {revenue > 0 && (
          <div className="rounded-xl p-4 mb-5"
            style={{ backgroundColor: NAVY, border: `1px solid ${NAVY}` }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Revenue This Month
              </h2>
              <Link href="/dashboard/revenue"
                className="text-sm font-medium" style={{ color: TEAL }}>
                Details →
              </Link>
            </div>
            <div className="text-3xl font-bold" style={{ color: '#14B8A6' }}>
              ${revenue.toLocaleString()}
            </div>
            <div className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              from {paidLeads.length} completed job{paidLeads.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* ── Recent reviews ─────────────────────────────────────────────── */}
        {reviews.length > 0 && (
          <div className="rounded-xl p-4" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                Recent Reviews
              </h2>
              <div className="flex items-center gap-2">
                {avgRating && (
                  <span className="text-sm font-bold" style={{ color: NAVY }}>{avgRating} ★</span>
                )}
                <Link href="/dashboard/reviews"
                  className="text-sm font-medium" style={{ color: TEAL }}>
                  View all →
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              {reviews.slice(0, 2).map(review => (
                <div key={review.id} className="pb-3 last:pb-0 last:border-0 border-b"
                  style={{ borderColor: BORDER }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: NAVY }}>
                      {review.reviewer_name}
                    </span>
                    <Stars rating={review.rating} />
                  </div>
                  {review.comment && (
                    <p className="text-sm line-clamp-2" style={{ color: BODY }}>
                      {review.comment}
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: MUTED }}>
                    {timeAgo(review.reviewed_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {leads.length === 0 && reviews.length === 0 && (
          <div className="rounded-xl p-8 text-center" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}` }}>
            <div className="text-4xl mb-3">🏗️</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Welcome to ProGuild</h3>
            <p className="text-sm mb-4" style={{ color: MUTED }}>
              Add your first lead to start tracking your pipeline.
            </p>
            <button onClick={() => setShowAddLead(true)}
              className="px-6 py-3 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: TEAL, color: 'white' }}>
              Add First Lead
            </button>
          </div>
        )}
      </div>

      {/* ── Add Lead Modal ─────────────────────────────────────────────── */}
      {showAddLead && session && (
        <AddLeadModal
          proId={session.id}
          onClose={() => setShowAddLead(false)}
          onAdded={() => {
            setShowAddLead(false)
            window.location.reload()
          }}
        />
      )}
    </DashboardShell>
  )
}
