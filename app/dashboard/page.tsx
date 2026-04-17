'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Lead, Review } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, greetingText, isPaid, isElite, planLabel } from '@/lib/utils'

// ── Referral network lookup — complementary trades per trade slug ─────────────
const REFERRAL_NETWORK: Record<string, string[]> = {
  'painter':              ['general-contractor', 'drywall',           'flooring',           'tile-setter'],
  'drywall':              ['general-contractor', 'painter',           'carpenter',          'flooring'],
  'flooring':             ['general-contractor', 'painter',           'drywall',            'tile-setter'],
  'tile-setter':          ['general-contractor', 'flooring',          'drywall',            'painter'],
  'electrician':          ['general-contractor', 'hvac-technician',   'alarm-security'],
  'plumber':              ['general-contractor', 'hvac-technician',   'electrician'],
  'hvac-technician':      ['general-contractor', 'electrician',       'plumber'],
  'alarm-security':       ['electrician',        'general-contractor'],
  'roofer':               ['general-contractor', 'gutters',           'windows-doors'],
  'roofing':              ['general-contractor', 'gutters',           'windows-doors'],
  'gutters':              ['roofer',             'general-contractor','windows-doors'],
  'windows-doors':        ['general-contractor', 'carpenter',         'roofer'],
  'carpenter':            ['general-contractor', 'drywall',           'windows-doors',      'flooring'],
  'mason':                ['general-contractor', 'structural-contractor','carpenter'],
  'welder':               ['general-contractor', 'structural-contractor','industrial-facility'],
  'structural-contractor':['general-contractor', 'mason',             'welder'],
  'marine-contractor':    ['general-contractor', 'structural-contractor'],
  'industrial-facility':  ['general-contractor', 'electrician',       'plumber'],
  'landscaper':           ['irrigation',         'pool-spa',          'pest-control'],
  'pool-spa':             ['landscaper',         'irrigation',        'general-contractor'],
  'irrigation':           ['landscaper',         'pool-spa',          'pest-control'],
  'pest-control':         ['landscaper',         'general-contractor'],
  'glass-glazing':        ['general-contractor', 'windows-doors',     'carpenter'],
  'screening-sheet-metal':['general-contractor', 'roofer',            'windows-doors'],
  'solar-installer':      ['electrician',        'general-contractor','structural-contractor'],
  'solar-energy':         ['electrician',        'general-contractor','structural-contractor'],
  'handyman':             ['general-contractor', 'painter',           'flooring'],
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

const STATUS_STYLES: Record<string, string> = {
  New:       'bg-amber-50 text-amber-700 border border-amber-200',
  Contacted: 'bg-blue-50 text-blue-700 border border-blue-200',
  Converted: 'bg-teal-50 text-teal-700 border border-teal-200',
  Archived:  'bg-gray-100 text-gray-500 border border-gray-200',
}

const LEAD_STAGES = ['New', 'Contacted', 'Quoted', 'Won']

export default function DashboardPage() {
  const router = useRouter()
  const [session,        setSession]        = useState<Session | null>(null)
  const [leads,          setLeads]          = useState<Lead[]>([])
  const [reviews,        setReviews]        = useState<Review[]>([])
  const [proData,        setProData]        = useState<any>(null)
  const [loading,        setLoading]        = useState(true)
  const [tradeStats,     setTradeStats]     = useState<any[]>([])
  const [tradeTotal,     setTradeTotal]     = useState(0)
  const [statsLoading,   setStatsLoading]   = useState(true)
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState('')
  const [notifications,  setNotifications]  = useState<any[]>([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [showNotifs,     setShowNotifs]     = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [activeLeadStage, setActiveLeadStage] = useState('New')

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)

    Promise.all([
      fetch(`/api/pros/${s.id}`).then(r => r.json()),
      fetch(`/api/leads?pro_id=${s.id}`).then(r => r.json()),
      fetch(`/api/reviews?pro_id=${s.id}`).then(r => r.json()),
    ]).then(([pData, lData, rData]) => {
      setProData(pData.pro || null)
      setLeads(lData.leads || [])
      setReviews(rData.reviews || [])
    }).catch(e => console.error('Dashboard fetch error:', e))
      .finally(() => setLoading(false))

    fetch(`/api/notifications?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setNotifications(d.notifications || []); setUnreadCount(d.unread || 0) })

    fetch(`/api/messages?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => setUnreadMessages(d.unread || 0))

    const cachedStats = sessionStorage.getItem('tn_trade_stats')
    const cacheTime   = sessionStorage.getItem('tn_trade_stats_ts')
    const cacheAge    = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity
    const parsed      = cachedStats ? JSON.parse(cachedStats) : null
    const cacheValid  = parsed?.trades?.length > 0 && cacheAge < 5 * 60 * 1000
    if (cacheValid) {
      setTradeStats(parsed.trades); setTradeTotal(parsed.total || 0); setStatsLoading(false)
    } else {
      fetch('/api/stats/trades').then(r => r.json()).then(d => {
        setTradeStats(d.trades || []); setTradeTotal(d.total || 0)
        if ((d.trades || []).length > 0) {
          sessionStorage.setItem('tn_trade_stats', JSON.stringify(d))
          sessionStorage.setItem('tn_trade_stats_ts', String(Date.now()))
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

  async function updateLeadStatus(leadId: string, status: string) {
    await fetch(`/api/leads`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, lead_status: status }),
    })
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: status as any } : l))
  }

  function logout() { sessionStorage.removeItem('tn_pro'); router.push('/') }

  if (!session) return null

  const paid     = isPaid(session.plan)
  const elite    = isElite(session.plan)
  const [bg, fg] = avatarColor(session.name)
  const newLeads = leads.filter(l => l.lead_status === 'New').length
  const avgRating = proData?.avg_rating || 0

  // ── Referral network tiles ─────────────────────────────────────────────────
  const proTradeSlug = (session as any).trade_slug || ''
  const isGC = proTradeSlug === 'general-contractor'
  // Build slug→stats lookup
  const statsBySlug: Record<string, any> = {}
  for (const t of tradeStats) { statsBySlug[t.slug || t.category_name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')] = t }

  let referralSlugs: string[] = []
  if (isGC) {
    // GC sees top 4 complementary trades by volume
    referralSlugs = [...tradeStats]
      .filter(t => !['general-contractor'].includes(t.slug))
      .sort((a, b) => b.pro_count - a.pro_count)
      .slice(0, 4)
      .map(t => t.slug)
  } else {
    referralSlugs = (REFERRAL_NETWORK[proTradeSlug] || []).slice(0, 4)
  }

  // Profile completeness score
  const completenessItems = [
    { done: !!proData?.profile_photo_url,   label: 'Profile photo'    },
    { done: !!proData?.bio,                  label: 'Add a bio'        },
    { done: !!proData?.license_number || (proData?.license_count > 0), label: 'License verified' },
    { done: !!proData?.osha_card_type,       label: 'OSHA certificate' },
    { done: (proData?.portfolio_count || 0) > 0, label: 'Portfolio photo'  },
    { done: reviews.length > 0,              label: 'First review'     },
  ]
  const completenessScore = Math.round((completenessItems.filter(i => i.done).length / completenessItems.length) * 100)
  const nextStep = completenessItems.find(i => !i.done)

  // Pipeline leads
  const stageLeads = (stage: string) => leads.filter(l => l.lead_status === stage)
  const visibleLeads = paid ? stageLeads(activeLeadStage) : leads.slice(0, 2)
  const lockedCount  = paid ? 0 : Math.max(0, leads.length - 2)

  return (
    <div className="min-h-screen bg-stone-50">

      {/* NAV */}
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-6 h-[56px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
          <div className="hidden md:flex items-center gap-1">
            {[
              { href: '/dashboard',                          label: 'Dashboard'  },
              { href: '/community',                          label: 'Community'  },
              { href: `/community/profile/${session.id}`,   label: 'My profile' },
              { href: '/messages',                           label: 'Messages'   },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${l.href === '/dashboard' ? 'bg-stone-100 text-gray-700 font-medium' : 'text-gray-500 hover:bg-stone-100'}`}>
                {l.label}
                {l.href === '/messages' && unreadMessages > 0 && (
                  <span className="ml-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{unreadMessages}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full hidden sm:inline ${elite ? 'bg-purple-50 text-purple-700' : paid ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
            {planLabel(session.plan)}
          </span>
          <span className="text-sm font-medium text-gray-700 hidden md:block">{session.name}</span>
          <div className="relative">
            <button onClick={() => {
              setShowNotifs(s => !s)
              if (unreadCount > 0) {
                fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id }) })
                setUnreadCount(0)
              }
            }} className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-900">Notifications</span>
                  <button onClick={() => setShowNotifs(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0
                    ? <div className="text-center py-8 text-sm text-gray-400">No notifications yet</div>
                    : notifications.map(n => (
                      <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-gray-50 ${!n.is_read ? 'bg-teal-50/50' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-semibold text-teal-700 flex-shrink-0">
                          {n.actor?.full_name?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-700 leading-relaxed">{n.message}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden sm:block">Log out</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7">

        {/* GREETING — with public profile link inline */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-gray-900 mb-0.5">{greetingText(session.name)}</h1>
            <p className="text-gray-400 font-light text-sm">Here's what's happening with your profile today.</p>
          </div>
          <Link href={`/pro/${session.id}`}
            className="hidden sm:flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-all flex-shrink-0">
            View public profile →
          </Link>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total leads',  value: loading ? '—' : leads.length,      sub: 'All time'    },
            { label: 'New leads',    value: loading ? '—' : newLeads,           sub: 'Uncontacted', highlight: newLeads > 0 },
            { label: 'Reviews',      value: loading ? '—' : reviews.length,     sub: 'Approved'    },
            { label: 'Avg rating',   value: loading ? '—' : avgRating > 0 ? avgRating.toFixed(1) : '—', sub: 'Out of 5.0' },
          ].map(s => (
            <div key={s.label} className={`bg-white border rounded-2xl p-5 ${(s as any).highlight ? 'border-amber-300 bg-amber-50/30' : 'border-gray-100'}`}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{s.label}</div>
              <div className={`font-serif text-3xl ${(s as any).highlight ? 'text-amber-600' : 'text-teal-600'}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* PROFILE PERFORMANCE */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Profile performance</div>
            {proData?.profile_view_count === 0 && (
              <button onClick={() => {
                const url = `https://tradesnetwork.vercel.app/pro/${session.id}`
                navigator.clipboard?.writeText(url)
              }} className="text-xs text-teal-600 hover:underline">
                Share profile to get views →
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: 'Profile views',  value: loading ? '—' : (proData?.profile_view_count ?? 0), icon: '👁'  },
              { label: 'Leads',          value: loading ? '—' : leads.length,                        icon: '📥' },
              { label: 'Followers',      value: loading ? '—' : (proData?.follower_count ?? '—'),     icon: '👥' },
              { label: 'Endorsements',   value: loading ? '—' : (proData?.endorsement_count ?? '—'),  icon: '✊' },
              { label: 'Portfolio',      value: loading ? '—' : (proData?.portfolio_count ?? '—'),    icon: '🖼' },
            ].map(s => (
              <div key={s.label} className="text-center bg-stone-50 rounded-xl p-3">
                <div className="text-base mb-1">{s.icon}</div>
                <div className="text-xl font-semibold text-teal-600">{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT col-span-2 */}
          <div className="lg:col-span-2 space-y-5">

            {/* ── ACTIVE LEADS PIPELINE ── */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Active leads</span>
                  {newLeads > 0 && (
                    <span className="w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {newLeads > 9 ? '9+' : newLeads}
                    </span>
                  )}
                </div>
                <Link href="/messages" className="text-xs text-teal-600 hover:underline">View all →</Link>
              </div>

              {/* Pipeline stage tabs */}
              {!loading && leads.length > 0 && paid && (
                <div className="flex border-b border-gray-100">
                  {LEAD_STAGES.map((stage, i) => {
                    const count = stageLeads(stage).length
                    return (
                      <button key={stage} onClick={() => setActiveLeadStage(stage)}
                        className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-all relative ${
                          activeLeadStage === stage
                            ? 'text-teal-700 bg-teal-50'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-stone-50'
                        }`}>
                        {stage}
                        {count > 0 && (
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                            stage === 'New' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                          }`}>{count}</span>
                        )}
                        {i < LEAD_STAGES.length - 1 && (
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-200 text-sm">›</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {loading ? (
                <div className="p-4 space-y-3">
                  {[1,2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-50" />)}
                </div>
              ) : leads.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2 opacity-20">📬</div>
                  <div className="text-sm font-medium text-gray-600 mb-1">No leads yet</div>
                  <div className="text-xs">When someone contacts you, they'll appear here.</div>
                </div>
              ) : (
                <>
                  {visibleLeads.length === 0 && paid ? (
                    <div className="text-center py-10 text-sm text-gray-400">
                      No leads in <strong>{activeLeadStage}</strong> stage
                    </div>
                  ) : visibleLeads.map(lead => (
                    <div key={lead.id} className="flex items-start gap-4 px-5 py-4 border-b border-gray-50 hover:bg-stone-50/50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-sm font-semibold text-teal-700 flex-shrink-0 font-serif">
                        {initials(lead.contact_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{lead.contact_name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[lead.lead_status] || STATUS_STYLES.New}`}>
                            {lead.lead_status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mb-2 leading-relaxed line-clamp-2">{lead.message}</div>
                        <div className="text-xs text-gray-400">{timeAgo(lead.created_at)}</div>
                      </div>
                      {/* Inline CTAs */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {lead.contact_phone && (
                          <a href={`tel:${lead.contact_phone}`}
                            className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                            📞 Call
                          </a>
                        )}
                        <a href={`/messages`}
                          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:border-teal-300 hover:text-teal-600 transition-colors">
                          💬 Msg
                        </a>
                        {lead.lead_status === 'New' && (
                          <button onClick={() => updateLeadStatus(lead.id, 'Contacted')}
                            className="px-3 py-1.5 border border-dashed border-gray-200 text-gray-400 text-xs rounded-lg hover:border-teal-300 hover:text-teal-600 transition-colors">
                            Mark contacted
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {lockedCount > 0 && (
                    <div className="px-5 py-6 text-center bg-gradient-to-b from-white to-stone-50">
                      <div className="text-2xl mb-2">🔒</div>
                      <div className="text-sm font-semibold text-gray-700 mb-1">{lockedCount} more lead{lockedCount !== 1 ? 's' : ''} waiting</div>
                      <div className="text-xs text-gray-400 mb-4">Upgrade to Pro to unlock all your leads</div>
                      <Link href="/upgrade" className="inline-block px-5 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                        Upgrade to Pro
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── RECENT REVIEWS ── */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">Recent reviews</span>
                <Link href={`/pro/${session.id}#reviews`} className="text-xs text-teal-600 hover:underline">View all →</Link>
              </div>
              {reviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-3xl mb-2 opacity-20">⭐</div>
                  <div className="text-sm font-medium text-gray-600 mb-1">No reviews yet</div>
                  <div className="text-xs">Share your profile link to start getting reviews.</div>
                </div>
              ) : reviews.slice(0, 5).map(rev => (
                <div key={rev.id} className="flex items-start gap-4 px-5 py-4 border-b border-gray-50">
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-xs font-semibold text-amber-700 flex-shrink-0 font-serif">
                    {initials(rev.reviewer_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{rev.reviewer_name}</span>
                      <span className="text-amber-500 text-xs">{starsHtml(rev.rating)}</span>
                    </div>
                    {(rev.comment || (rev as any).review_text) && (
                      <div className="text-xs text-gray-500 line-clamp-2 mb-1">{rev.comment || (rev as any).review_text}</div>
                    )}
                    <div className="text-xs text-gray-400">{timeAgo(rev.reviewed_at)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── REFERRAL NETWORK ── */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Your referral network</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {session.city ? `Trades that send work to ${session.trade || 'your trade'} in ${session.city}` : `Complementary trades for ${session.trade || 'your work'}`}
                  </div>
                </div>
              </div>

              {statsLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-50" />)}
                </div>
              ) : referralSlugs.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">
                  Update your trade in your profile to see your referral network.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {referralSlugs.map(slug => {
                    const stat = tradeStats.find((t: any) =>
                      t.slug === slug ||
                      t.category_name?.toLowerCase().replace(/[\s&]+/g, '-').replace(/[^a-z0-9-]/g, '') === slug
                    )
                    const icon  = TRADE_ICONS[slug] || '🔧'
                    const name  = stat?.category_name || slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    const count = stat?.pro_count || 0
                    return (
                      <Link key={slug} href={`/?trade=${stat?.id || ''}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 transition-all group">
                        <div className="w-9 h-9 bg-stone-100 group-hover:bg-teal-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-colors">
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{name}</div>
                          <div className="text-xs text-gray-400">{count > 0 ? `${count.toLocaleString()} in FL` : 'Find on TradesNetwork'}</div>
                        </div>
                        <span className="text-gray-300 group-hover:text-teal-500 text-sm">→</span>
                      </Link>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                <Link href="/" className="text-xs text-teal-600 hover:underline">Browse all trades on TradesNetwork →</Link>
              </div>
            </div>
          </div>

          {/* RIGHT sidebar */}
          <div className="space-y-4">

            {/* Profile card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Your profile</div>
              <div className="text-center mb-4">
                <div className="relative w-16 h-16 mx-auto mb-3 group cursor-pointer"
                  onClick={() => document.getElementById('avatar-input')?.click()}>
                  {proData?.profile_photo_url
                    ? <img src={proData.profile_photo_url} alt={session.name} className="w-16 h-16 rounded-full object-cover" />
                    : <div className="w-16 h-16 rounded-full flex items-center justify-center font-serif text-xl"
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
                <div className="text-xs text-gray-400">{[session.city, session.state].filter(Boolean).join(', ') || '—'}</div>
              </div>

              {/* Profile completeness bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-gray-600">Profile strength</span>
                  <span className={`text-xs font-bold ${completenessScore === 100 ? 'text-green-600' : completenessScore >= 66 ? 'text-teal-600' : 'text-amber-600'}`}>
                    {completenessScore}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${completenessScore === 100 ? 'bg-green-500' : completenessScore >= 66 ? 'bg-teal-500' : 'bg-amber-500'}`}
                    style={{ width: `${completenessScore}%` }} />
                </div>
                {nextStep && (
                  <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                    <span>→</span>
                    <Link href="/edit-profile" className="text-teal-600 hover:underline">{nextStep.label}</Link>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-1.5 mb-3">
                {[
                  ['Plan',   planLabel(session.plan)],
                  ['Status', proData?.profile_status || 'Active'],
                  ['Rating', avgRating > 0 ? `${avgRating.toFixed(1)} ★` : 'No reviews yet'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-gray-400">{l}</span>
                    <span className="font-medium text-gray-700">{v}</span>
                  </div>
                ))}
              </div>

              <Link href="/edit-profile"
                className="block w-full py-2 text-center text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors mb-2">
                Edit profile
              </Link>
              <Link href={`/community/profile/${session.id}`}
                className="block w-full py-2 text-center text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:border-teal-300 hover:text-teal-600 transition-colors mb-4">
                Community profile →
              </Link>

              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Quick links</div>
                {[
                  { href: '/community',      icon: '🏠', label: 'Feed' },
                  { href: '/community/edit', icon: '📸', label: 'Portfolio' },
                  { href: '/messages',       icon: '💬', label: 'Messages', badge: unreadMessages },
                  { href: '/apprenticeship', icon: '📋', label: 'Apprenticeship' },
                ].map((item, i) => (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center justify-between py-2 text-sm text-gray-600 hover:text-teal-600 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <span className="flex items-center gap-2">
                      <span>{item.icon}</span> {item.label}
                    </span>
                    {(item.badge || 0) > 0 && (
                      <span className="w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {(item.badge || 0) > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* Digital Business Card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center text-base">📇</div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Digital Business Card</div>
                  <div className="text-xs text-gray-400">Share your profile via QR</div>
                </div>
              </div>
              <div className="flex flex-col items-center mb-4">
                <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(`https://tradesnetwork.vercel.app/card/${session.id}`)}&color=0f766e&bgcolor=ffffff&margin=6`}
                    alt="QR code" width={130} height={130} className="rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">Show to homeowners or paste the link</p>
              </div>
              <div className="space-y-2">
                <a href={`/card/${session.id}`} target="_blank" rel="noopener noreferrer"
                  className="block w-full py-2.5 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                  Preview my card →
                </a>
                <button onClick={() => {
                  const url = `https://tradesnetwork.vercel.app/card/${session.id}`
                  if (navigator.share) navigator.share({ title: `${session.name} — TradesNetwork`, url })
                  else navigator.clipboard.writeText(url)
                }} className="block w-full py-2.5 text-center border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                  🔗 Copy card link
                </button>
              </div>
            </div>

            {/* Upgrade card — free users only */}
            {!paid && (
              <div className="bg-teal-600 rounded-2xl p-5 text-white">
                <div className="text-xs font-semibold text-teal-200 uppercase tracking-widest mb-2">Pro status</div>
                <h3 className="font-serif text-lg mb-1">Upgrade to Pro</h3>
                <p className="text-sm opacity-80 mb-4 leading-relaxed">Unlock all leads, priority placement, and your Pro badge.</p>
                <ul className="space-y-1.5 mb-4">
                  {['Unlimited leads + contact details','Email lead notifications','Pro badge on profile','Priority search placement'].map(f => (
                    <li key={f} className="text-xs flex gap-2 opacity-90"><span>✓</span>{f}</li>
                  ))}
                </ul>
                <Link href="/upgrade" className="block w-full py-2.5 text-center text-sm font-semibold bg-white text-teal-700 rounded-xl hover:opacity-90 transition-opacity">
                  Upgrade — $29/month
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
