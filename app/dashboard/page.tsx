'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Lead, Review } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, greetingText, isPaid, isElite, planLabel } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  New:       'bg-blue-50 text-blue-700',
  Contacted: 'bg-amber-50 text-amber-700',
  Converted: 'bg-teal-50 text-teal-700',
  Archived:  'bg-gray-100 text-gray-500',
}

export default function DashboardPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [proData, setProData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

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
      setProData(pData.pro)
      setLeads(lData.leads || [])
      setReviews(rData.reviews || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true); setUploadError('')
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) {
      setProData((prev: any) => ({ ...prev, profile_photo_url: d.url }))
    } else {
      setUploadError(d.error || 'Upload failed')
    }
  }

  function logout() {
    sessionStorage.removeItem('tn_pro')
    router.push('/')
  }

  if (!session) return null

  const paid = isPaid(session.plan)
  const elite = isElite(session.plan)
  const [bg, fg] = avatarColor(session.name)
  const newLeads = leads.filter(l => l.lead_status === 'New').length
  const avgRating = proData?.avg_rating || 0

  const visibleLeads = paid ? leads : leads.slice(0, 2)
  const lockedCount  = paid ? 0 : Math.max(0, leads.length - 2)

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-8 h-[60px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
          <div className="hidden md:flex items-center gap-1">
            <Link href="/dashboard" className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-100 text-gray-700">Dashboard</Link>
            <Link href="/community" className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:bg-stone-100 hover:text-gray-700 transition-colors">Community</Link>
            <Link href={`/community/profile/${session.id}`} className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:bg-stone-100 hover:text-gray-700 transition-colors">My feed profile</Link>
            <Link href="/" className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:bg-stone-100 hover:text-gray-700 transition-colors">Marketplace</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            elite ? 'bg-purple-50 text-purple-700' : paid ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
          }`}>{planLabel(session.plan)}</span>
          <span className="text-sm font-medium text-gray-700 hidden md:block">{session.name}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Log out</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-9">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-gray-900 mb-1">{greetingText(session.name)}</h1>
          <p className="text-gray-400 font-light">Here's what's happening with your profile today.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total leads', value: loading ? '—' : leads.length, sub: 'All time' },
            { label: 'New leads', value: loading ? '—' : newLeads, sub: 'Uncontacted' },
            { label: 'Reviews', value: loading ? '—' : reviews.length, sub: 'Approved' },
            { label: 'Avg rating', value: loading ? '—' : avgRating > 0 ? avgRating.toFixed(1) : '—', sub: 'Out of 5.0' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{s.label}</div>
              <div className="font-serif text-3xl text-teal-600">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>
        {/* Community quick link banner */}
        <Link href={`/community/profile/${session.id}`}
          className="flex items-center justify-between bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-2xl px-6 py-4 mb-8 hover:from-teal-700 hover:to-teal-800 transition-all group">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌐</span>
            <div>
              <div className="text-sm font-semibold">Your community profile</div>
              <div className="text-xs opacity-80">See your followers, posts and portfolio</div>
            </div>
          </div>
          <span className="text-sm font-medium opacity-80 group-hover:opacity-100">View →</span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* MAIN */}
          <div className="lg:col-span-2 space-y-5">

            {/* Leads */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Recent leads</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${newLeads > 0 ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                  {newLeads} new
                </span>
              </div>

              {loading ? (
                <div className="p-4 space-y-3">
                  {[1,2].map(i => <div key={i} className="flex gap-3"><div className="w-9 h-9 rounded-full animate-shimmer flex-shrink-0" /><div className="flex-1 space-y-2"><div className="h-3 w-1/3 animate-shimmer rounded" /><div className="h-3 w-2/3 animate-shimmer rounded" /></div></div>)}
                </div>
              ) : leads.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2 opacity-30">📬</div>
                  <div className="text-sm font-medium text-gray-600 mb-1">No leads yet</div>
                  <div className="text-xs">When homeowners contact you, they'll appear here.</div>
                </div>
              ) : (
                <>
                  {visibleLeads.map(lead => (
                    <div key={lead.id} className="flex items-start gap-4 px-6 py-4 border-b border-gray-50 hover:bg-stone-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-xs font-semibold text-teal-700 flex-shrink-0 font-serif">
                        {initials(lead.contact_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 mb-0.5">{lead.contact_name}</div>
                        <div className="text-xs text-gray-400 truncate mb-1">{lead.message}</div>
                        <div className="text-xs text-gray-400">{lead.lead_source?.replace('_', ' ')} · {timeAgo(lead.created_at)}</div>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[lead.lead_status] || STATUS_STYLES.New}`}>
                        {lead.lead_status}
                      </span>
                    </div>
                  ))}
                  {lockedCount > 0 && (
                    <div className="px-6 py-6 text-center bg-gradient-to-b from-white to-stone-50">
                      <div className="text-2xl mb-2">🔒</div>
                      <div className="text-sm font-semibold text-gray-700 mb-1">{lockedCount} more lead{lockedCount !== 1 ? 's' : ''} waiting</div>
                      <div className="text-xs text-gray-400 mb-4">Upgrade to Pro to unlock all your leads</div>
                      <Link href="/upgrade" className="inline-block px-5 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                        Upgrade to Pro — $29/month
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Reviews */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Recent reviews</span>
              </div>
              {reviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-3xl mb-2 opacity-30">⭐</div>
                  <div className="text-sm font-medium text-gray-600 mb-1">No reviews yet</div>
                  <div className="text-xs">Reviews from homeowners will appear here once approved.</div>
                </div>
              ) : reviews.slice(0, 5).map(rev => (
                <div key={rev.id} className="flex items-start gap-4 px-6 py-4 border-b border-gray-50">
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-xs font-semibold text-amber-700 flex-shrink-0 font-serif">
                    {initials(rev.reviewer_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{rev.reviewer_name}</span>
                      <span className="text-amber-500 text-xs">{starsHtml(rev.rating)}</span>
                    </div>
                    {rev.comment && <div className="text-xs text-gray-500 truncate mb-1">{rev.comment}</div>}
                    <div className="text-xs text-gray-400">{timeAgo(rev.reviewed_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">
            {/* Profile card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Your profile</div>
              <div className="text-center mb-5">
                <div className="relative w-16 h-16 mx-auto mb-3 group cursor-pointer" onClick={() => document.getElementById('avatar-input')?.click()}>
                  {proData?.profile_photo_url ? (
                    <img src={proData.profile_photo_url} alt={session.name} className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center font-serif text-xl"
                      style={{ background: bg, color: fg }}>{initials(session.name)}</div>
                  )}
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
              <div className="border-t border-gray-100 pt-4 space-y-2">
                {[
                  ['Plan', planLabel(session.plan)],
                  ['Status', proData?.profile_status || 'Active'],
                  ['Avg rating', avgRating > 0 ? `${avgRating.toFixed(1)} ★` : 'No reviews yet'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-gray-400">{l}</span>
                    <span className="font-medium text-gray-700">{v}</span>
                  </div>
                ))}
              </div>
              <Link href={`/pro/${session.id}`}
                className="mt-5 block w-full py-2 text-center text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors">
                View public profile →
              </Link>
              <Link href="/edit-profile"
                className="mt-2 block w-full py-2 text-center text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
                Edit profile
              </Link>
              <div className="border-t border-gray-100 mt-4 pt-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Community</div>
                <Link href="/community"
                  className="flex items-center gap-2 py-2 text-sm text-gray-600 hover:text-teal-600 transition-colors">
                  <span className="text-base">🏠</span> Feed
                </Link>
                <Link href={`/community/profile/${session.id}`}
                  className="flex items-center gap-2 py-2 text-sm text-gray-600 hover:text-teal-600 transition-colors border-t border-gray-50">
                  <span className="text-base">👤</span> My community profile
                </Link>
                <Link href="/community/edit"
                  className="flex items-center gap-2 py-2 text-sm text-gray-600 hover:text-teal-600 transition-colors border-t border-gray-50">
                  <span className="text-base">📸</span> Manage portfolio
                </Link>
              </div>
            </div>

            {/* Upgrade card */}
            {!paid && (
              <div className="bg-teal-600 rounded-2xl p-6 text-white">
                <h3 className="font-serif text-xl mb-2">Upgrade to Pro</h3>
                <p className="text-sm opacity-80 mb-4 leading-relaxed">Unlock all leads, priority placement, and your Pro badge.</p>
                <ul className="space-y-2 mb-5">
                  {['Unlimited leads + contact details','Email lead notifications','Pro badge on profile','Priority search placement'].map(f => (
                    <li key={f} className="text-xs flex gap-2 opacity-90"><span>✓</span>{f}</li>
                  ))}
                </ul>
                <Link href="/upgrade" className="block w-full py-2.5 text-center text-sm font-semibold bg-white text-teal-700 rounded-lg hover:opacity-90 transition-opacity">
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
