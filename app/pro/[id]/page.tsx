'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Pro } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, isPaid, isElite } from '@/lib/utils'

function Avatar({ pro, size = 'lg' }: { pro: any; size?: 'sm'|'md'|'lg'|'xl' }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const sz = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-20 h-20 text-2xl', xl: 'w-28 h-28 text-3xl' }[size]
  if (pro?.profile_photo_url)
    return <img src={pro.profile_photo_url} alt={pro.full_name} className={`${sz} rounded-full object-cover flex-shrink-0 ring-4 ring-white shadow-md`} />
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-serif flex-shrink-0 ring-4 ring-white shadow-md`}
      style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
  )
}

function StarDisplay({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-amber-400 text-sm">{starsHtml(rating)}</span>
      <span className="font-semibold text-gray-900 text-sm">{rating.toFixed(1)}</span>
      <span className="text-gray-400 text-sm">({count} review{count !== 1 ? 's' : ''})</span>
    </div>
  )
}

// Extract keywords from reviews
function extractKeywords(reviews: any[]) {
  const positive = ['professional','responsive','reliable','quality','excellent','great','clean','fast','honest','affordable','knowledgeable','friendly','thorough','efficient','expert']
  const counts: Record<string, number> = {}
  for (const r of reviews) {
    const text = (r.review_text || '').toLowerCase()
    for (const kw of positive) {
      if (text.includes(kw)) counts[kw] = (counts[kw] || 0) + 1
    }
  }
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6).map(([kw]) => kw)
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DEFAULT_HOURS = { Monday: '8:00 AM – 5:00 PM', Tuesday: '8:00 AM – 5:00 PM', Wednesday: '8:00 AM – 5:00 PM', Thursday: '8:00 AM – 5:00 PM', Friday: '8:00 AM – 5:00 PM', Saturday: 'Closed', Sunday: 'Closed' }

export default function ProProfilePage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [session, setSession]       = useState<Session | null>(null)
  const [pro, setPro]               = useState<Pro | null>(null)
  const [reviews, setReviews]       = useState<any[]>([])
  const [portfolio, setPortfolio]   = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [isFollowing, setIsFollowing] = useState(false)
  const [activeTab, setActiveTab]   = useState<'about'|'reviews'|'photos'>('about')
  const [lightbox, setLightbox]     = useState<string|null>(null)
  const [showHours, setShowHours]   = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)
  const [equipment, setEquipment] = useState<any[]>([])

  // Lead form
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [formError, setFormError]   = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    const s = raw ? JSON.parse(raw) : null
    if (s) setSession(s)

    Promise.all([
      fetch(`/api/pros/${id}`).then(r => r.json()),
      fetch(`/api/reviews?pro_id=${id}`).then(r => r.json()),
      fetch(`/api/portfolio?pro_id=${id}`).then(r => r.json()),
      s ? fetch(`/api/follows?pro_id=${id}`).then(r => r.json()) : Promise.resolve(null),
    ]).then(([proData, reviewData, portfolioData, followData]) => {
      if (proData.error) { setError(proData.error); setLoading(false); return }
      setPro(proData.pro)
      setReviews(reviewData.reviews || [])
      setPortfolio(portfolioData.items || [])
      if (followData && s) setIsFollowing((followData.followers||[]).some((f:any) => f?.id === s.id))
      setLoading(false)
      // Load equipment
      fetch(`/api/equipment?pro_id=${id}`).then(r => r.json()).then(d => setEquipment(d.equipment || []))
    }).catch(() => { setError('Could not load profile'); setLoading(false) })
  }, [id])

  async function toggleFollow() {
    if (!session) { router.push('/login'); return }
    const r = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower_id: session.id, following_id: id }),
    })
    const d = await r.json()
    if (r.ok) setIsFollowing(d.following)
  }

  async function handleLead() {
    if (!name || !email || !message) { setFormError('Please fill in all required fields'); return }
    setSubmitting(true); setFormError('')
    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: id, contact_name: name, contact_email: email, contact_phone: phone, message, lead_source: 'Profile_Page' }),
    })
    setSubmitting(false)
    if (r.ok) setSubmitted(true)
    else setFormError('Could not send message. Please try again.')
  }

  function shareProfile() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: `${pro?.full_name} on TradesNetwork`, url })
    } else {
      navigator.clipboard.writeText(url)
      setShowShareToast(true)
      setTimeout(() => setShowShareToast(false), 2500)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !pro) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center text-center">
      <div><div className="font-serif text-2xl text-gray-900 mb-3">Pro not found</div><Link href="/" className="text-teal-600 text-sm">← Back to search</Link></div>
    </div>
  )

  const isOwner   = session?.id === id
  const paid      = isPaid(pro.plan_tier)
  const elite     = isElite(pro.plan_tier)
  const trade     = (pro as any).trade_category?.category_name || '—'
  const location  = [pro.city, pro.state].filter(Boolean).join(', ')
  const rating    = pro.avg_rating || 0
  const reviewCnt = pro.review_count || reviews.length || 0
  const keywords  = extractKeywords(reviews)
  const hours     = DEFAULT_HOURS

  return (
    <div className="min-h-screen bg-stone-50">

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl">✕</button>
        </div>
      )}

      {/* Share toast */}
      {showShareToast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">
          Link copied to clipboard ✓
        </div>
      )}

      {/* Owner banner */}
      {isOwner && (
        <div className="bg-teal-50 border-b border-teal-100">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-teal-700">
              <span>👁</span> <span className="font-medium">This is how your profile looks to homeowners</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">← Dashboard</Link>
              <Link href="/edit-profile" className="text-xs font-semibold px-3 py-1.5 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">Edit profile</Link>
              <Link href="/community/edit" className="text-xs font-semibold px-3 py-1.5 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">Community profile</Link>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Find a pro</Link>
          {session && !isOwner && (
            <button onClick={toggleFollow}
              className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-all ${isFollowing ? 'border-gray-200 text-gray-500' : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'}`}>
              {isFollowing ? '✓ Following' : '+ Follow'}
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — main profile */}
          <div className="lg:col-span-2 space-y-5">

            {/* Hero card */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              {/* Cover strip */}
              <div className="h-20 bg-gradient-to-r from-teal-600 to-teal-500" />
              <div className="px-8 pb-6">
                {/* Avatar + share */}
                <div className="flex items-end justify-between -mt-10 mb-4">
                  <div className="relative">
                    <Avatar pro={pro} size="xl" />
                    {pro.available_for_work && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white" title="Available for work" />
                    )}
                  </div>
                  <button onClick={shareProfile}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors">
                    🔗 Share
                  </button>
                </div>

                {/* Name + trade */}
                <h1 className="font-serif text-3xl text-gray-900 mb-1">{pro.full_name}</h1>
                <div className="text-base font-medium text-teal-700 mb-1">{trade}</div>
                <div className="text-sm text-gray-400 mb-3">{location}{pro.years_experience ? ` · ${pro.years_experience} yrs experience` : ''}</div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {pro.is_verified && <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-teal-50 text-teal-800">✓ License Verified</span>}
                  {elite && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-50 text-purple-800">Elite Pro</span>}
                  {paid && !elite && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-800">Pro Member</span>}
                  {pro.license_number && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800">Licensed · {pro.license_number}</span>}
                  {/* License status badge with expiry date + hover tooltip */}
                  {(pro as any).license_status === 'active' && (() => {
                    const expiry = (pro as any).license_expiry_date
                    const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                    return (
                      <span
                        title={expiryStr ? `License expires ${expiryStr}` : 'License is active'}
                        className="relative group flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 cursor-default"
                      >
                        <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
                        License active{expiryStr ? ` · exp ${expiryStr}` : ''}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg z-10">
                          {expiryStr ? `Expires ${expiryStr}` : 'License is currently active'}
                        </span>
                      </span>
                    )
                  })()}
                  {(pro as any).license_status === 'expiring_soon' && (() => {
                    const expiry = (pro as any).license_expiry_date
                    const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                    const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null
                    return (
                      <span
                        title={expiryStr ? `License expires ${expiryStr} — ${daysLeft} days left` : 'License expiring soon'}
                        className="relative group flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 cursor-default"
                      >
                        ⚠️ Expiring soon{expiryStr ? ` · ${expiryStr}` : ''}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg z-10">
                          {daysLeft !== null ? `${daysLeft} days left — expires ${expiryStr}` : 'License expiring soon — renewal needed'}
                        </span>
                      </span>
                    )
                  })()}
                  {(pro as any).license_status === 'expired' && (() => {
                    const expiry = (pro as any).license_expiry_date
                    const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                    return (
                      <span
                        title={expiryStr ? `License expired ${expiryStr}` : 'License has expired'}
                        className="relative group flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 cursor-default"
                      >
                        🔴 License expired{expiryStr ? ` · ${expiryStr}` : ''}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg z-10">
                          {expiryStr ? `Expired ${expiryStr} — renewal required` : 'License has expired — renewal required'}
                        </span>
                      </span>
                    )
                  })()}
                  {/* OSHA card */}
                  {(pro as any).osha_card_type && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      🦺 {(pro as any).osha_card_type} certified
                    </span>
                  )}
                  {pro.available_for_work && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                      Available{(pro as any).available_note ? ` · ${(pro as any).available_note}` : ''}
                    </span>
                  )}
                </div>

                {/* Rating */}
                {rating > 0 && <StarDisplay rating={rating} count={reviewCnt} />}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100">
                  {[
                    { label: 'Reviews', value: reviewCnt },
                    { label: 'Yrs exp', value: pro.years_experience || '—' },
                    { label: 'Enquiries', value: (pro as any).lead_count || 0 },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-xl font-semibold text-teal-600">{s.value}</div>
                      <div className="text-xs text-gray-400">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1.5">
              {(['about','reviews','photos'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl capitalize transition-colors ${activeTab === tab ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                  {tab === 'reviews' ? `Reviews (${reviewCnt})` : tab === 'photos' ? `Photos (${portfolio.length})` : 'About'}
                </button>
              ))}
            </div>

            {/* ── ABOUT TAB ── */}
            {activeTab === 'about' && (
              <div className="space-y-4">
                {pro.bio && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-7">
                    <h2 className="font-semibold text-gray-900 mb-3">About</h2>
                    <p className="text-gray-600 leading-relaxed">{pro.bio}</p>
                  </div>
                )}

                {/* Details */}
                <div className="bg-white border border-gray-100 rounded-2xl p-7">
                  <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Trade',       value: trade },
                      { label: 'Location',    value: location },
                      { label: 'Experience',  value: pro.years_experience ? `${pro.years_experience} years` : '—' },
                      { label: 'Plan',        value: pro.plan_tier || 'Free' },
                      { label: 'License',     value: pro.license_number || '—' },
                      { label: 'Verified',    value: pro.is_verified ? 'Yes — state database' : 'Not yet' },
                    ].map(d => (
                      <div key={d.label}>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{d.label}</div>
                        <div className="text-sm font-medium text-gray-900">{d.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Equipment proficiency */}
                {equipment.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-7">
                    <h2 className="font-semibold text-gray-900 mb-4">Equipment & tools</h2>
                    <div className="flex flex-wrap gap-2">
                      {equipment.map(eq => (
                        <span key={eq.id} className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border ${eq.certified ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-stone-50 text-gray-600 border-gray-200'}`}>
                          {eq.certified && <span className="text-teal-500 font-bold text-xs">✓</span>}
                          {eq.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">✓ = certified · Unverified items are self-reported</p>
                  </div>
                )}

                {/* Business hours */}
                <div className="bg-white border border-gray-100 rounded-2xl p-7">
                  <button onClick={() => setShowHours(h => !h)} className="w-full flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">Business hours</h2>
                    <span className="text-gray-400 text-sm">{showHours ? '▲' : '▼'}</span>
                  </button>
                  {showHours && (
                    <div className="mt-4 space-y-2">
                      {DAYS.map(day => (
                        <div key={day} className="flex justify-between text-sm">
                          <span className="text-gray-500 w-28">{day}</span>
                          <span className={`font-medium ${hours[day as keyof typeof hours] === 'Closed' ? 'text-gray-400' : 'text-gray-900'}`}>
                            {hours[day as keyof typeof hours]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!showHours && (
                    <p className="text-sm text-gray-400 mt-2">Mon–Fri: 8:00 AM – 5:00 PM · Click to see full schedule</p>
                  )}
                </div>
              </div>
            )}

            {/* ── REVIEWS TAB ── */}
            {activeTab === 'reviews' && (
              <div className="space-y-4">
                {/* Rating summary */}
                {rating > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-7">
                    <div className="flex items-center gap-6 mb-4">
                      <div className="text-center">
                        <div className="text-5xl font-serif font-bold text-gray-900">{rating.toFixed(1)}</div>
                        <div className="text-amber-400 text-lg mt-1">{starsHtml(rating)}</div>
                        <div className="text-xs text-gray-400 mt-1">{reviewCnt} reviews</div>
                      </div>
                      {/* Star bars */}
                      <div className="flex-1 space-y-1.5">
                        {[5,4,3,2,1].map(star => {
                          const cnt = reviews.filter(r => Math.round(r.rating) === star).length
                          const pct = reviewCnt > 0 ? (cnt / reviewCnt) * 100 : 0
                          return (
                            <div key={star} className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400 w-4">{star}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-gray-400 w-4">{cnt}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {/* Keywords */}
                    {keywords.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Customers mention</div>
                        <div className="flex flex-wrap gap-2">
                          {keywords.map(kw => (
                            <span key={kw} className="text-xs px-3 py-1 bg-teal-50 text-teal-700 rounded-full font-medium capitalize">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Write a review button — non-owners only */}
                {!isOwner && (
                  <div className="flex justify-end">
                    <a href={`/reviews/${id}`}
                      className="flex items-center gap-2 px-4 py-2 border border-teal-300 text-teal-700 text-sm font-semibold rounded-xl hover:bg-teal-50 transition-colors">
                      ⭐ Write a review
                    </a>
                  </div>
                )}

                {/* Individual reviews */}
                {reviews.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-12 text-center">
                    <div className="text-gray-400 text-sm mb-3">
                      {isOwner ? 'No reviews yet. Homeowners will leave reviews after jobs.' : 'No reviews yet — be the first!'}
                    </div>
                    {!isOwner && (
                      <a href={`/reviews/${id}`} className="text-sm font-semibold text-teal-600 hover:underline">
                        Leave the first review →
                      </a>
                    )}
                  </div>
                ) : reviews.map(rev => (
                  <div key={rev.id} className="bg-white border border-gray-100 rounded-2xl p-6">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-gray-900">{rev.reviewer_name || 'Anonymous'}</div>
                        <div className="text-amber-400 text-sm">{starsHtml(rev.rating)}</div>
                      </div>
                      <div className="text-xs text-gray-400">{timeAgo(rev.created_at)}</div>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{rev.review_text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── PHOTOS TAB ── */}
            {activeTab === 'photos' && (
              <div className="bg-white border border-gray-100 rounded-2xl p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Projects & Photos</h2>
                {portfolio.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    {isOwner ? <><Link href="/community/edit" className="text-teal-600 font-medium">Add photos</Link> to showcase your work</> : 'No photos yet.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {portfolio.map(item => (
                      <div key={item.id} onClick={() => item.photo_url && setLightbox(item.photo_url)}
                        className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-stone-100">
                        {item.photo_url ? (
                          <img
                            src={item.photo_url}
                            alt={item.title || 'Portfolio'}
                            className="w-full h-full object-cover"
                            onError={e => {
                              const el = e.currentTarget
                              el.style.display = 'none'
                              const parent = el.parentElement
                              if (parent) {
                                parent.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center text-gray-400"><div class="text-2xl mb-1">🖼</div><div class="text-xs">${item.title || 'Photo'}</div></div>`
                              }
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                            <div className="text-2xl mb-1">🖼</div>
                            <div className="text-xs">{item.title || 'Photo'}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — contact sidebar */}
          <div className="space-y-4">

            {/* Follow + Message (non-owner) */}
            {!isOwner && session && (
              <div className="flex gap-2">
                <button onClick={toggleFollow}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all ${isFollowing ? 'border-gray-200 text-gray-500' : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'}`}>
                  {isFollowing ? '✓ Following' : '+ Follow'}
                </button>
                <a href={`/messages?with=${id}`}
                  className="flex-1 py-2.5 text-sm font-semibold text-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-teal-300 hover:text-teal-700 transition-all">
                  💬 Message
                </a>
              </div>
            )}

            {/* Request a call button */}
            {!isOwner && (
              <button className="w-full py-2.5 border border-teal-300 text-teal-700 text-sm font-semibold rounded-xl hover:bg-teal-50 transition-colors">
                📞 Request a call
              </button>
            )}

            {/* Contact form / owner card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              {isOwner ? (
                <>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Your contact info</div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📧</span>
                      <div><div className="text-xs text-gray-400">Email</div><div className="text-sm font-medium text-gray-900">{pro.email}</div></div>
                    </div>
                    {pro.phone && (
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📱</span>
                        <div><div className="text-xs text-gray-400">Phone</div><div className="text-sm font-medium text-gray-900">{pro.phone}</div></div>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    <Link href="/edit-profile" className="block w-full py-2.5 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">Edit profile</Link>
                    <Link href="/dashboard" className="block w-full py-2.5 text-center border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">← Dashboard</Link>
                  </div>
                </>
              ) : submitted ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-3">✓</div>
                  <div className="font-semibold text-gray-900 mb-1">Message sent!</div>
                  <div className="text-sm text-gray-400">{pro.full_name} will be in touch soon.</div>
                </div>
              ) : (
                <>
                  <div className="font-semibold text-gray-900 mb-1">Contact {pro.full_name.split(' ')[0]}</div>
                  <div className="text-xs text-gray-400 mb-4">Free — no per-lead fees ever</div>
                  {formError && <div className="mb-3 p-2.5 bg-red-50 text-red-600 text-xs rounded-lg">{formError}</div>}
                  <div className="space-y-3">
                    {[
                      { label: 'Your name *',    val: name,    set: setName,    type: 'text',  ph: 'James Smith' },
                      { label: 'Email *',        val: email,   set: setEmail,   type: 'email', ph: 'james@example.com' },
                      { label: 'Phone',          val: phone,   set: setPhone,   type: 'tel',   ph: '(555) 000-0000' },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">{f.label}</label>
                        <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Message *</label>
                      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                        placeholder="Describe the job you need done..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 resize-none transition-colors" />
                    </div>
                    <button onClick={handleLead} disabled={submitting}
                      className="w-full py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                      {submitting ? 'Sending...' : 'Send message →'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-3">Zero per-lead fees · Direct contact · No middleman</p>
                </>
              )}
            </div>

            {/* Quick info card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
              {[
                { icon: '✓', label: 'License verified', sub: 'State database check' },
                { icon: '💰', label: 'Free to contact', sub: 'No per-lead fees ever' },
                { icon: '⭐', label: rating > 0 ? `${rating.toFixed(1)} rating` : 'New pro', sub: rating > 0 ? `${reviewCnt} verified reviews` : 'Be the first to review' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center text-sm flex-shrink-0">{item.icon}</div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{item.label}</div>
                    <div className="text-xs text-gray-400">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-12 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-gray-400">© 2026 TradesNetwork</div>
          <div className="flex gap-5 text-sm">
            {[['/', 'Home'],['/about','About'],['/contact','Contact'],['/privacy','Privacy'],['/terms','Terms']].map(([href, label]) => (
              <a key={href} href={href} className="text-gray-400 hover:text-teal-600 transition-colors">{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
