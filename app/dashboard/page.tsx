'use client'
import Navbar from '@/components/layout/Navbar'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Lead, Review } from '@/types'
import { initials, avatarColor, timeAgo, isPaid, isElite, planLabel } from '@/lib/utils'
import LeadPipeline from '@/components/ui/LeadPipeline'
import ActionAlert from '@/components/ui/ActionAlert'
import StatStrip from '@/components/ui/StatStrip'
import ReviewCard from '@/components/ui/ReviewCard'
import UpgradeNudge from '@/components/ui/UpgradeNudge'
import BusinessCardModal from '@/components/ui/BusinessCardModal'
import AddLeadModal from '@/components/ui/AddLeadModal'

// Referral network map — unchanged from v70
const REFERRAL_NETWORK: Record<string, string[]> = {
  'painter':              ['general-contractor','drywall','flooring','tile-setter'],
  'drywall':              ['general-contractor','painter','carpenter','flooring'],
  'flooring':             ['general-contractor','painter','drywall','tile-setter'],
  'tile-setter':          ['general-contractor','flooring','drywall','painter'],
  'electrician':          ['general-contractor','hvac-technician','alarm-security'],
  'plumber':              ['general-contractor','hvac-technician','electrician'],
  'hvac-technician':      ['general-contractor','electrician','plumber'],
  'alarm-security':       ['electrician','general-contractor'],
  'roofer':               ['general-contractor','gutters','windows-doors'],
  'roofing':              ['general-contractor','gutters','windows-doors'],
  'gutters':              ['roofer','general-contractor','windows-doors'],
  'windows-doors':        ['general-contractor','carpenter','roofer'],
  'carpenter':            ['general-contractor','drywall','windows-doors','flooring'],
  'mason':                ['general-contractor','structural-contractor','carpenter'],
  'welder':               ['general-contractor','structural-contractor','industrial-facility'],
  'structural-contractor':['general-contractor','mason','welder'],
  'marine-contractor':    ['general-contractor','structural-contractor'],
  'industrial-facility':  ['general-contractor','electrician','plumber'],
  'landscaper':           ['irrigation','pool-spa','pest-control'],
  'pool-spa':             ['landscaper','irrigation','general-contractor'],
  'irrigation':           ['landscaper','pool-spa','pest-control'],
  'pest-control':         ['landscaper','general-contractor'],
  'glass-glazing':        ['general-contractor','windows-doors','carpenter'],
  'screening-sheet-metal':['general-contractor','roofer','windows-doors'],
  'solar-installer':      ['electrician','general-contractor','structural-contractor'],
  'solar-energy':         ['electrician','general-contractor','structural-contractor'],
  'handyman':             ['general-contractor','painter','flooring'],
  'other-trades':         ['general-contractor'],
}

const TRADE_ICONS: Record<string, string> = {
  'general-contractor':'🏗','carpenter':'🪚','drywall':'🧰','flooring':'🪵',
  'tile-setter':'🔲','painter':'🎨','electrician':'⚡','plumber':'🪠',
  'hvac-technician':'❄️','alarm-security':'🔐','roofer':'🏠','roofing':'🏠',
  'gutters':'🌧️','windows-doors':'🪟','mason':'🧱','welder':'🔩',
  'structural-contractor':'⚙️','marine-contractor':'⚓','industrial-facility':'🏭',
  'landscaper':'🌿','pool-spa':'🏊','irrigation':'💧','pest-control':'🪲',
  'glass-glazing':'🔍','screening-sheet-metal':'🔩','solar-installer':'☀️',
  'solar-energy':'☀️','handyman':'🔨','other-trades':'🛠️',
}

function slugify(s: string) {
  return s.toLowerCase().split(' ').join('-').split('&').join('').split('--').join('-')
}

export default function DashboardPage() {
  const router = useRouter()
  const [session,       setSession]       = useState<Session | null>(null)
  const [leads,         setLeads]         = useState<Lead[]>([])
  const [reviews,       setReviews]       = useState<Review[]>([])
  const [proData,       setProData]       = useState<any>(null)
  const [loading,       setLoading]       = useState(true)
  const [tradeStats,    setTradeStats]    = useState<any[]>([])
  const [statsLoading,  setStatsLoading]  = useState(true)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const [showBizCard,   setShowBizCard]   = useState(false)
  const [showAddLead,  setShowAddLead]  = useState(false)

  // Refs for scroll-to
  const pipelineRef = useRef<HTMLDivElement>(null)
  const reviewsRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)

    Promise.all([
      fetch('/api/pros/' + s.id).then(r => r.json()),
      fetch('/api/leads?pro_id=' + s.id).then(r => r.json()),
      fetch('/api/reviews?pro_id=' + s.id).then(r => r.json()),
    ]).then(([pData, lData, rData]) => {
      setProData(pData.pro || null)
      setLeads(lData.leads || [])
      setReviews(rData.reviews || [])
    }).finally(() => setLoading(false))

    // Trade stats for referral network (cached)
    const cached   = sessionStorage.getItem('pg_trade_stats')
    const cachedTs = sessionStorage.getItem('pg_trade_stats_ts')
    const age      = cachedTs ? Date.now() - parseInt(cachedTs) : Infinity
    const parsed   = cached ? JSON.parse(cached) : null
    if (parsed?.trades?.length > 0 && age < 300000) {
      setTradeStats(parsed.trades); setStatsLoading(false)
    } else {
      fetch('/api/stats/trades').then(r => r.json()).then(d => {
        setTradeStats(d.trades || [])
        if ((d.trades || []).length > 0) {
          sessionStorage.setItem('pg_trade_stats', JSON.stringify(d))
          sessionStorage.setItem('pg_trade_stats_ts', String(Date.now()))
        }
      }).finally(() => setStatsLoading(false))
    }
  }, [])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true); setUploadError('')
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id); form.append('bucket', 'avatars')
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) setProData((prev: any) => ({ ...prev, profile_photo_url: d.url }))
    else setUploadError(d.error || 'Upload failed')
  }

  function handleLeadAdded(lead: any) {
    setLeads(prev => [lead, ...prev])
  }

  async function updateLeadStatus(leadId: string, status: string) {
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, lead_status: status }),
    })
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: status as any } : l))
  }

  async function updateLead(leadId: string, fields: Partial<Lead>) {
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, ...fields }),
    })
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...fields } : l))
  }

  if (!session) return null

  const proSlug   = (session as any).slug || session.id
  const proUrl    = `/pro/${proSlug}`
  const paid      = isPaid(session.plan)
  const [bg, fg]  = avatarColor(session.name)
  const newLeads  = leads.filter(l => l.lead_status === 'New').length
  const avgRating = proData?.avg_rating || 0

  // Pipeline value — sum of quoted_amount on non-closed leads
  const pipelineValue = leads
    .filter(l => l.quoted_amount && !['Lost','Archived','Paid'].includes(l.lead_status))
    .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)

  // Profile completeness — same logic as v70
  const completenessItems = [
    { done: !!proData?.profile_photo_url, label: 'Profile photo' },
    { done: !!proData?.bio,               label: 'Add a bio' },
    { done: !!proData?.license_number || (proData?.license_count > 0), label: 'License verified' },
    { done: !!proData?.osha_card_type,    label: 'OSHA certificate' },
    { done: (proData?.portfolio_count || 0) > 0, label: 'Portfolio photo' },
    { done: reviews.length > 0,           label: 'First review' },
  ]
  const completenessScore = Math.round(completenessItems.filter(i => i.done).length / completenessItems.length * 100)
  const nextStep = completenessItems.find(i => !i.done)

  // Referral network
  const tradeSlug    = (session as any).trade_slug || ''
  const isGC         = tradeSlug === 'general-contractor'
  let referralSlugs: string[] = []
  if (isGC) {
    referralSlugs = [...tradeStats].sort((a, b) => b.pro_count - a.pro_count)
      .filter(t => t.slug !== 'general-contractor').slice(0, 4).map(t => t.slug)
  } else {
    referralSlugs = (REFERRAL_NETWORK[tradeSlug] || []).slice(0, 4)
  }

  // Revenue snapshot from pipeline data
  const paidLeads = leads.filter(l => l.lead_status === 'Paid' && l.quoted_amount)
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const paidThisMonth = paidLeads
    .filter(l => new Date(l.created_at) >= startOfMonth)
    .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
  const closedLeads = leads.filter(l => ['Paid','Lost'].includes(l.lead_status))
  const winRate = closedLeads.length >= 5
    ? Math.round((paidLeads.length / closedLeads.length) * 100)
    : null
  const avgJobValue = paidLeads.length > 0
    ? Math.round(paidLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0) / paidLeads.length)
    : 0

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans',sans-serif" }}>
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7">

        {/* ── GREETING ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-gray-900 mb-0.5">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {session.name.split(' ')[0]}!
            </h1>
            <p className="text-gray-400 font-light text-sm">
              {leads.some(l => !['Paid','Lost','Archived'].includes(l.lead_status) && Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000) >= 3)
                ? 'You have leads that need your attention.'
                : "Here's what's happening with your profile today."
              }
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => setShowAddLead(true)}
              className="flex items-center gap-2 px-4 py-2 border border-[#E8E2D9] bg-white text-[#0A1628] rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors flex-shrink-0">
              + Add lead
            </button>
            <Link href={proUrl}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors flex-shrink-0">
              View public profile →
            </Link>
          </div>
        </div>

        {/* ── ACTION ALERTS — urgent leads strip ───────────────────────── */}
        {!loading && <ActionAlert leads={leads} onRespond={() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth' })} />}

        {/* ── STAT STRIP — replaces the 4 KPI cards ────────────────────── */}
        <StatStrip
          totalLeads={leads.length}
          newLeads={newLeads}
          avgRating={avgRating}
          reviewCount={reviews.length}
          pipelineValue={pipelineValue}
          loading={loading}
          onLeadsClick={() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth' })}
          onRatingClick={() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth' })}
        />

        {/* ── MAIN GRID ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT — col-span-2 */}
          <div className="lg:col-span-2 space-y-5">

            {/* LEAD PIPELINE */}
            <div ref={pipelineRef} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-50" />)}
                </div>
              ) : (
                <LeadPipeline
                  leads={leads}
                  onStatusChange={updateLeadStatus}
                  onUpdate={updateLead}
                  isPaid={paid}
                />
              )}
            </div>

            {/* Pipeline → Clients link */}
            <div className="flex items-center justify-between px-1 -mt-2 mb-2">
              <Link href="/dashboard/clients"
                className="text-xs font-semibold text-gray-400 hover:text-teal-600 transition-colors">
                👥 View client address book →
              </Link>
            </div>

            {/* REVENUE SNAPSHOT — only shows as full card when there's real data */}
            {paidLeads.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm text-gray-400">
                <span>💰</span>
                <span>Revenue tracking starts when you mark a job </span>
                <span className="font-semibold text-teal-600">Paid</span>
                <span> in your pipeline.</span>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-gray-900">Revenue</span>
                  <span className="text-xs text-gray-400">from pipeline data</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">This month</div>
                    <div className="font-serif text-2xl text-teal-600">${paidThisMonth.toLocaleString()}</div>
                  </div>
                  {winRate !== null && (
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Win rate</div>
                      <div className="font-serif text-2xl text-teal-600">{winRate}%</div>
                    </div>
                  )}
                  {avgJobValue > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Avg job</div>
                      <div className="font-serif text-2xl text-teal-600">${avgJobValue.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* REVIEWS */}
            <div ref={reviewsRef} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Recent reviews</span>
                  {avgRating > 0 && (
                    <span className="text-xs text-gray-400">{avgRating.toFixed(1)} avg · {reviews.length} total</span>
                  )}
                </div>
                <Link href={proUrl} className="text-xs font-semibold text-teal-600 hover:underline">
                  View all →
                </Link>
              </div>

              {/* Low rating tip */}
              {avgRating > 0 && avgRating < 3 && (
                <div className="mx-5 mt-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <p className="text-xs text-amber-800">
                    Your rating is below 3.0. Responding to reviews and asking happy customers to leave feedback can help.
                  </p>
                </div>
              )}

              {reviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-3xl mb-2 opacity-20">⭐</div>
                  <div className="text-sm font-medium text-gray-600 mb-1">No reviews yet</div>
                  <div className="text-xs">Share your profile link to start getting reviews.</div>
                </div>
              ) : (
                reviews.slice(0, 5).map(rev => (
                  <ReviewCard key={rev.id} review={rev} proId={session.id} />
                ))
              )}
            </div>

            {/* REFERRAL NETWORK — unchanged from v70 */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="mb-4">
                <div className="text-sm font-semibold text-gray-900">Your referral network</div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {session.city
                    ? 'Trades that send work to ' + (session.trade || 'your trade') + ' in ' + session.city
                    : 'Complementary trades for ' + (session.trade || 'your work')
                  }
                </div>
              </div>
              {statsLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-50" />)}
                </div>
              ) : referralSlugs.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">
                  <Link href="/edit-profile" className="text-teal-600 hover:underline">Update your trade in your profile</Link> to see your referral network.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {referralSlugs.map(slug => {
                    const stat  = tradeStats.find(t => t.slug === slug || slugify(t.category_name || '') === slug)
                    const icon  = TRADE_ICONS[slug] || '🔧'
                    const name  = stat?.category_name || slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                    const count = stat?.pro_count || 0
                    return (
                      <Link key={slug} href={'/?trade=' + (stat?.id || '')}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 transition-all group">
                        <div className="w-9 h-9 bg-stone-100 group-hover:bg-teal-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-colors">{icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{name}</div>
                          <div className="text-sm text-gray-400">{count > 0 ? count.toLocaleString() + ' in FL' : 'Verified pros available'}</div>
                        </div>
                        <span className="text-gray-300 group-hover:text-teal-500 text-sm">→</span>
                      </Link>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                <Link href="/search" className="text-xs text-teal-600 hover:underline">Browse all trades →</Link>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="space-y-4">

            {/* Profile card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Your profile</div>

              {/* Avatar */}
              <div className="text-center mb-4">
                <div className="relative w-24 h-24 mx-auto mb-3 group cursor-pointer"
                  onClick={() => document.getElementById('avatar-input')?.click()}>
                  {proData?.profile_photo_url
                    ? <img src={proData.profile_photo_url} alt={session.name} className="w-24 h-24 rounded-full object-cover" />
                    : <div className="w-24 h-24 rounded-full flex items-center justify-center font-serif text-2xl"
                        style={{ background: bg, color: fg }}>{initials(session.name)}</div>
                  }
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-medium">{uploading ? '...' : 'Edit'}</span>
                  </div>
                </div>
                <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                {uploadError && <div className="text-xs text-red-500 mb-2">{uploadError}</div>}
                <div className="font-semibold text-gray-900">{session.name}</div>
                <div className="text-sm text-teal-700 font-medium">{session.trade || '—'}</div>
                <div className="text-sm text-gray-400">{[session.city, session.state].filter(Boolean).join(', ') || '—'}</div>
              </div>

              {/* Completeness bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-gray-600">Profile strength</span>
                  <span className={'text-xs font-bold ' + (completenessScore === 100 ? 'text-green-600' : completenessScore >= 66 ? 'text-teal-600' : 'text-amber-600')}>
                    {completenessScore}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className={'h-2 rounded-full transition-all ' + (completenessScore === 100 ? 'bg-green-500' : completenessScore >= 66 ? 'bg-teal-500' : 'bg-amber-500')}
                    style={{ width: completenessScore + '%' }} />
                </div>
                {nextStep && (
                  <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                    <span>→</span>
                    <Link href="/edit-profile" className="text-teal-600 hover:underline">{nextStep.label}</Link>
                  </div>
                )}
              </div>

              {/* Plan / Status / Rating */}
              <div className="border-t border-gray-100 pt-3 space-y-1.5 mb-3">
                {[
                  ['Plan',   planLabel(session.plan)],
                  ['Status', proData?.profile_status || 'Active'],
                  ['Rating', avgRating > 0 ? avgRating.toFixed(1) + ' ★' : 'No reviews yet'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-gray-400">{l}</span>
                    <span className="font-medium text-gray-700">{v}</span>
                  </div>
                ))}
              </div>

              {/* Performance — 4 meaningful stats only */}
              <div className="border-t border-gray-100 pt-3 mb-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Performance</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Views',   value: proData?.profile_view_count ?? 0 },
                    { label: 'Leads',   value: leads.length, sub: 'total' },
                    { label: 'Rating',  value: avgRating > 0 ? avgRating.toFixed(1) : '—' },
                    { label: 'Reviews', value: reviews.length },
                  ].map(s => (
                    <div key={s.label} className="bg-stone-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-bold text-teal-600">{loading ? '—' : s.value}</div>
                      <div className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Edit profile */}
              <Link href="/edit-profile"
                className="block w-full py-2 text-center text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors mb-3">
                Edit profile
              </Link>

              {/* Share card */}
              <button
                onClick={() => setShowBizCard(true)}
                className="block w-full py-2 text-center text-sm font-semibold border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
                📇 Share card
              </button>
            </div>

            {/* Upgrade nudge — free plan only, compact, dismissible 30 days */}
            <UpgradeNudge plan={session.plan} />

            {/* Clients widget — CRM quick access */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">My Clients</div>
                  <div className="text-xs text-gray-400 mt-0.5">People you've worked with</div>
                </div>
                <Link href="/dashboard/clients"
                  className="text-sm font-semibold text-teal-600 hover:underline flex-shrink-0">
                  View all →
                </Link>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50">
                <Link href="/dashboard/clients"
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-teal-600 transition-colors">
                  <span className="text-base">👥</span>
                  <span>Address book + job history</span>
                </Link>
                <button
                  onClick={() => setShowAddLead(true)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-teal-600 transition-colors mt-2">
                  <span className="text-base">➕</span>
                  <span>Add a lead from any source</span>
                </button>
              </div>
            </div>

            {/* License badge — trust signal, always visible */}
            {proData?.license_number && (
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center text-base flex-shrink-0">🛡️</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">DBPR Verified</div>
                    <div className="text-xs text-gray-400 truncate">License: {proData.license_number}</div>
                  </div>
                  <a href={`https://www.myfloridalicense.com/wl11.asp?mode=2&search=LicNbr&SID=&brd=&typ=&LicNbr=${proData.license_number}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-teal-600 hover:underline flex-shrink-0">
                    Verify →
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Mobile FAB — + Add lead, always visible on mobile */}
      <button
        onClick={() => setShowAddLead(true)}
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl font-bold transition-transform active:scale-95"
        style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}
        aria-label="Add lead"
      >
        +
      </button>

      {/* Add lead modal */}
      {showAddLead && session && (
        <AddLeadModal
          proId={session.id}
          onClose={() => setShowAddLead(false)}
          onAdded={handleLeadAdded}
        />
      )}

      {/* Business card modal */}
      {showBizCard && session && (
        <BusinessCardModal
          session={session}
          proData={proData}
          onClose={() => setShowBizCard(false)}
        />
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'
