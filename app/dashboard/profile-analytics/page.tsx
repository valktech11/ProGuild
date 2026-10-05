'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { initials, avatarColor, isPaid } from '@/lib/utils'

type ViewStats = {
  total: number
  unique: number
  anon: number
  by_type: Record<string, number>
  sparkline: number[]
  actions: { follows: number; messages: number }
  viewers: {
    id: string
    full_name: string | null
    slug: string | null
    city: string | null
    state: string | null
    profile_photo_url: string | null
    trade_category: { category_name: string | null; slug: string | null } | null
    viewed_at: string
  }[]
}

function SmallAvatar({ name, photoUrl }: { name: string | null; photoUrl: string | null }) {
  const [bg, fg] = avatarColor(name || 'A')
  if (photoUrl)
    return <img src={photoUrl} alt={name || ''} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
      style={{ background: bg, color: fg }}>
      {initials(name || 'A')}
    </div>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ProfileAnalyticsPage() {
  const router = useRouter()
  const { session, loading: authLoading } = useProSession()
  const [days, setDays] = useState<7 | 30>(7)
  const [stats, setStats] = useState<ViewStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!session) { router.replace('/login'); return }
    const load = async () => {
      setLoading(true)
      try {
        const { getSupabaseBrowser } = await import('@/lib/supabase-browser')
        const { data } = await getSupabaseBrowser().auth.getSession()
        const token = data.session?.access_token
        if (!token) { setLoading(false); return }
        const r = await fetch(`/api/profile-views?pro_id=${session.id}&days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (r.ok) setStats(await r.json())
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [session, authLoading, days, router])

  const paid = session ? isPaid(session as any) : false

  // 30-day bar chart (when days=30) or 7-day sparkline bars (days=7)
  const chartBars = stats?.sparkline ?? []
  const chartMax = Math.max(...chartBars, 1)

  const tradeEntries = Object.entries(stats?.by_type ?? {})
    .filter(([k]) => k !== 'Anonymous')
    .sort((a, b) => b[1] - a[1])

  const totalIdentified = tradeEntries.reduce((s, [, n]) => s + n, 0)

  return (
    <DashboardShell session={session} newLeads={0} noSidebar>
      <div className="min-h-screen" style={{ backgroundColor: '#F4F2EC' }}>
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* Back + header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/guild"
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-teal-700 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              The Guild
            </Link>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-[22px] font-extrabold" style={{ color: '#0A1628', letterSpacing: '-0.02em' }}>
                Profile Analytics
              </h1>
              <p className="text-[13px] text-gray-500 mt-0.5">Who's viewing your professional profile</p>
            </div>
            {/* Time range toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-gray-200">
              {([7, 30] as const).map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className="px-3 py-1 rounded-lg text-[12px] font-semibold transition-all"
                  style={days === d
                    ? { background: '#0F766E', color: '#fff' }
                    : { color: '#6B7280' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-200 h-28 animate-pulse" />
              ))}
            </div>
          ) : !stats ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500 text-[14px]">Could not load analytics. Try again later.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Stat tiles ── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Profile views', value: stats.total },
                  { label: 'Unique viewers', value: stats.unique },
                  { label: 'Anonymous', value: stats.anon },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
                    <div className="text-[24px] font-extrabold" style={{ color: '#0A1628', letterSpacing: '-0.02em' }}>{value}</div>
                    <div className="text-[11.5px] text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* ── Bar chart ── */}
              {stats.total > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mb-3" style={{ color: '#3B4452' }}>
                    Daily views · last {days} days
                  </div>
                  <div className="flex items-end gap-1" style={{ height: 60 }}>
                    {chartBars.map((v, i) => {
                      const h = Math.max(2, Math.round((v / chartMax) * 60))
                      const isToday = i === chartBars.length - 1
                      return (
                        <div key={i} className="flex-1 rounded-sm transition-all"
                          title={`${v} view${v !== 1 ? 's' : ''}`}
                          style={{ height: h, background: isToday ? '#0F766E' : '#CCECE9', alignSelf: 'flex-end' }} />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Viewer mix ── */}
              {tradeEntries.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mb-3" style={{ color: '#3B4452' }}>
                    Viewer mix
                  </div>
                  <div className="space-y-2">
                    {tradeEntries.map(([trade, count]) => {
                      const pct = Math.round((count / totalIdentified) * 100)
                      return (
                        <div key={trade}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[12.5px] font-semibold text-gray-800">{trade}</span>
                            <span className="text-[12px] text-gray-500">{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#0F766E' }} />
                          </div>
                        </div>
                      )
                    })}
                    {stats.anon > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12.5px] font-semibold text-gray-500">Anonymous visitors</span>
                          <span className="text-[12px] text-gray-400">{stats.anon}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.round((stats.anon / stats.total) * 100)}%`, background: '#D1D5DB' }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Action metrics ── */}
              {(stats.actions.follows > 0 || stats.actions.messages > 0) && (
                <div className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mb-3" style={{ color: '#3B4452' }}>
                    Viewer actions · last 30 days
                  </div>
                  <div className="flex gap-6">
                    {stats.actions.follows > 0 && (
                      <div>
                        <div className="text-[22px] font-extrabold" style={{ color: '#0F766E', letterSpacing: '-0.02em' }}>{stats.actions.follows}</div>
                        <div className="text-[11.5px] text-gray-500">viewer{stats.actions.follows !== 1 ? 's' : ''} followed you</div>
                      </div>
                    )}
                    {stats.actions.messages > 0 && (
                      <div>
                        <div className="text-[22px] font-extrabold" style={{ color: '#0F766E', letterSpacing: '-0.02em' }}>{stats.actions.messages}</div>
                        <div className="text-[11.5px] text-gray-500">viewer{stats.actions.messages !== 1 ? 's' : ''} messaged you</div>
                      </div>
                    )}
                    {stats.total > 0 && stats.unique > 0 && (
                      <div>
                        <div className="text-[22px] font-extrabold" style={{ color: '#0A1628', letterSpacing: '-0.02em' }}>
                          {Math.round(((stats.actions.follows + stats.actions.messages) / stats.unique) * 100)}%
                        </div>
                        <div className="text-[11.5px] text-gray-500">conversion rate</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Named viewer list ── */}
              <div className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: '#3B4452' }}>
                    Who viewed your profile
                  </div>
                  {!paid && stats.viewers.length > 0 && (
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#FEF3C7', color: '#B45309' }}>Pro</span>
                  )}
                </div>

                {stats.viewers.length === 0 && stats.anon === 0 && (
                  <p className="text-[13px] text-gray-500 py-2">No views yet this period. Share your profile to attract more visitors.</p>
                )}

                {/* Identified viewers (paid only) */}
                {paid && stats.viewers.length > 0 && (
                  <div className="space-y-0">
                    {stats.viewers.map((v, i) => (
                      <Link key={v.id} href={`/pro/${v.slug || v.id}`}
                        className={`flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-gray-50 transition-colors ${i < stats.viewers.length - 1 ? 'border-b border-gray-100' : ''}`}>
                        <SmallAvatar name={v.full_name} photoUrl={v.profile_photo_url} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-gray-900 truncate">{v.full_name}</div>
                          <div className="text-[11.5px] text-gray-500 truncate">
                            {v.trade_category?.category_name}{v.city ? ` · ${v.city}` : ''}
                          </div>
                        </div>
                        <div className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(v.viewed_at)}</div>
                      </Link>
                    ))}
                    {stats.anon > 0 && (
                      <div className="flex items-center gap-3 py-2.5 px-1">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                          </svg>
                        </div>
                        <div className="text-[13px] text-gray-500">
                          {stats.anon} anonymous visitor{stats.anon !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Free tier — upsell */}
                {!paid && (
                  <div>
                    {/* Preview: first viewer blurred, rest locked */}
                    {stats.viewers.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center gap-3 py-2.5 px-1 opacity-40 blur-[3px] select-none pointer-events-none">
                          <SmallAvatar name={stats.viewers[0].full_name} photoUrl={null} />
                          <div className="flex-1">
                            <div className="text-[13px] font-semibold text-gray-900">
                              {stats.viewers[0].trade_category?.category_name ?? 'Contractor'} · {stats.viewers[0].city ?? 'Florida'}
                            </div>
                            <div className="text-[11.5px] text-gray-500">Viewed your profile</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl p-3.5 text-center" style={{ background: '#F0FDF9', border: '1px solid #CCECE9' }}>
                      <div className="text-[13px] font-bold text-gray-900 mb-1">
                        {stats.unique > 0
                          ? `See the ${stats.unique} pro${stats.unique !== 1 ? 's' : ''} behind your views`
                          : 'Unlock viewer identities'}
                      </div>
                      <p className="text-[11.5px] text-gray-600 mb-2.5">
                        Know exactly who's interested in your work — GCs, homeowners, and fellow tradespeople.
                      </p>
                      <Link href="/dashboard/settings"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-bold text-white transition-colors"
                        style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                        Upgrade to Pro
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </Link>
                    </div>

                    {stats.anon > 0 && (
                      <div className="flex items-center gap-2 mt-3 text-[12px] text-gray-500">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        {stats.anon} anonymous visitor{stats.anon !== 1 ? 's' : ''} — these remain private even on Pro
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
