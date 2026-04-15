'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Pro } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, isPaid, isElite } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────────

function Avatar({ pro, size = 'lg' }: { pro: any; size?: 'sm'|'md'|'lg'|'xl'|'hero' }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const sz = {
    sm:   'w-8  h-8  text-xs',
    md:   'w-12 h-12 text-sm',
    lg:   'w-20 h-20 text-2xl',
    xl:   'w-28 h-28 text-3xl',
    hero: 'w-20 h-20 text-2xl ring-4 ring-teal-400/40',
  }[size]
  if (pro?.profile_photo_url)
    return <img src={pro.profile_photo_url} alt={pro.full_name}
      className={`${sz} rounded-full object-cover flex-shrink-0`} />
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-serif flex-shrink-0`}
      style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
  )
}

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm'|'md' }) {
  return (
    <span className={`text-amber-400 ${size === 'md' ? 'text-base' : 'text-sm'}`}>
      {starsHtml(rating)}
    </span>
  )
}

// Blurred license number — click to reveal
function LicenseNumber({ number }: { number: string }) {
  const [revealed, setRevealed] = useState(false)
  if (!number) return <span className="text-gray-400">—</span>
  const visible = number.slice(0, 4)
  const masked  = '•'.repeat(Math.max(0, number.length - 4))
  return (
    <button onClick={() => setRevealed(r => !r)}
      className="inline-flex items-center gap-1 font-mono text-xs group"
      title={revealed ? 'Click to hide' : 'Click to reveal full number'}>
      <span className="text-gray-300">{visible}</span>
      <span className="text-gray-400 tracking-widest">{revealed ? number.slice(4) : masked}</span>
      <span className="opacity-30 group-hover:opacity-70 transition-opacity">{revealed ? '🙈' : '👁'}</span>
    </button>
  )
}

function extractKeywords(reviews: any[]) {
  const positive = ['professional','responsive','reliable','quality','excellent','great','clean','fast','honest','affordable','knowledgeable','friendly','thorough','efficient','expert']
  const counts: Record<string, number> = {}
  for (const r of reviews) {
    const text = (r.review_text || '').toLowerCase()
    for (const kw of positive) if (text.includes(kw)) counts[kw] = (counts[kw] || 0) + 1
  }
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([kw]) => kw)
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DEFAULT_HOURS: Record<string, string> = {
  Monday: '8:00 AM – 5:00 PM', Tuesday: '8:00 AM – 5:00 PM',
  Wednesday: '8:00 AM – 5:00 PM', Thursday: '8:00 AM – 5:00 PM',
  Friday: '8:00 AM – 5:00 PM', Saturday: 'Closed', Sunday: 'Closed',
}

function dbprUrl(licenseNumber: string) {
  return `https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=` +
    encodeURIComponent(licenseNumber)
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ProProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [session, setSession]     = useState<Session | null>(null)
  const [pro, setPro]             = useState<Pro | null>(null)
  const [reviews, setReviews]     = useState<any[]>([])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const [proLicenses, setProLicenses] = useState<any[]>([])
  const [memberships, setMemberships] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [isFollowing, setIsFollowing] = useState(false)
  const [activeTab, setActiveTab] = useState<'about'|'reviews'|'photos'>('about')
  const [lightbox, setLightbox]   = useState<string|null>(null)
  const [showShareToast, setShowShareToast] = useState(false)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [showHours, setShowHours] = useState(false)

  // Contact form
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [formError, setFormError]   = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    const s   = raw ? JSON.parse(raw) : null
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
      fetch(`/api/equipment?pro_id=${id}`).then(r => r.json()).then(d => setEquipment(d.equipment || []))
      fetch(`/api/pro-licenses?pro_id=${id}`).then(r => r.json()).then(d => setProLicenses(d.licenses || []))
      fetch(`/api/memberships?pro_id=${id}`).then(r => r.json()).then(d => setMemberships(d.memberships || []))
    }).catch(() => { setError('Could not load profile'); setLoading(false) })
  }, [id])

  async function toggleFollow() {
    if (!session) { router.push('/login'); return }
    const r = await fetch('/api/follows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower_id: session.id, following_id: id }),
    })
    const d = await r.json()
    if (r.ok) setIsFollowing(d.following)
  }

  async function handleLead() {
    if (!name || !phone) { setFormError('Name and phone are required'); return }
    setSubmitting(true); setFormError('')
    const r = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: id, contact_name: name, contact_email: `${phone}@sms.placeholder`, contact_phone: phone, message: message || 'Callback request', lead_source: 'Profile_Page' }),
    })
    setSubmitting(false)
    if (r.ok) setSubmitted(true)
    else setFormError('Could not send — please try again.')
  }

  function shareProfile() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `${pro?.full_name} on TradesNetwork`, url })
    else { navigator.clipboard.writeText(url); setShowShareToast(true); setTimeout(() => setShowShareToast(false), 2500) }
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !pro) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center text-center">
      <div><div className="font-serif text-2xl text-gray-900 mb-3">Pro not found</div>
        <Link href="/" className="text-teal-600 text-sm">← Back to search</Link></div>
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
  const firstName = pro.full_name.split(' ')[0]

  // License status helpers
  function licStatusDot(status: string) {
    if (status === 'active')        return 'bg-green-500'
    if (status === 'expiring_soon') return 'bg-amber-400'
    if (status === 'expired')       return 'bg-red-500'
    return 'bg-gray-300'
  }
  function licStatusLabel(status: string) {
    if (status === 'active')        return { text: 'Active',        cls: 'text-green-700' }
    if (status === 'expiring_soon') return { text: 'Expiring soon', cls: 'text-amber-700' }
    if (status === 'expired')       return { text: 'Expired',       cls: 'text-red-700' }
    return { text: 'Unknown', cls: 'text-gray-400' }
  }

  const visiblePhotos = showAllPhotos ? portfolio : portfolio.slice(0, 6)

  return (
    <div className="min-h-screen bg-stone-50">

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl">✕</button>
        </div>
      )}

      {/* Share toast */}
      {showShareToast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">
          Link copied ✓
        </div>
      )}

      {/* Owner banner */}
      {isOwner && (
        <div className="bg-teal-50 border-b border-teal-100">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-teal-700">
              <span>👁</span><span className="font-medium">Your public profile</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">← Dashboard</Link>
              <Link href="/edit-profile" className="text-xs font-semibold px-3 py-1.5 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">Edit profile</Link>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-[56px] flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-3">
          <button onClick={shareProfile}
            className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors">
            🔗 Share
          </button>
          {session && !isOwner && (
            <button onClick={toggleFollow}
              className={`text-sm font-semibold px-4 py-1.5 rounded-lg border transition-all ${isFollowing ? 'border-gray-200 text-gray-500' : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'}`}>
              {isFollowing ? '✓ Following' : '+ Follow'}
            </button>
          )}
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <div className="bg-[#152a23] relative overflow-hidden">
        {/* Subtle texture pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />

        <div className="relative max-w-5xl mx-auto px-6 pt-8 pb-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-full ring-2 ring-teal-400/40 overflow-hidden flex-shrink-0">
                {pro.profile_photo_url
                  ? <img src={pro.profile_photo_url} alt={pro.full_name} className="w-full h-full object-cover" />
                  : (() => { const [bg,fg] = avatarColor(pro.full_name); return <div className="w-full h-full flex items-center justify-center font-serif text-2xl" style={{background:bg,color:fg}}>{initials(pro.full_name)}</div> })()
                }
              </div>
              {pro.available_for_work && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-400 rounded-full border-2 border-[#152a23]" />
              )}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-white leading-tight">{pro.full_name}</h1>
                  {(pro as any).business_name && (pro as any).business_name !== pro.full_name && (
                    <div className="text-sm text-teal-300/80 mt-0.5">{(pro as any).business_name}</div>
                  )}
                  <div className="text-teal-400 text-sm font-medium mt-0.5">{trade}</div>
                  <div className="text-teal-200/60 text-xs mt-1">
                    📍 {location || 'Florida'}{pro.years_experience ? ` · ${pro.years_experience} yrs experience` : ''}
                  </div>
                </div>

                {/* Rating — top right */}
                {rating > 0 && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-amber-400 text-sm">{starsHtml(rating)}</div>
                    <div className="text-white font-semibold text-sm mt-0.5">{rating.toFixed(1)}</div>
                    <div className="text-teal-200/60 text-xs">{reviewCnt} review{reviewCnt !== 1 ? 's' : ''}</div>
                  </div>
                )}
              </div>

              {/* Verified badge */}
              {pro.is_verified && (
                <div className="inline-flex items-center gap-1.5 mt-3 bg-teal-400/10 border border-teal-400/30 rounded-full px-3 py-1">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  <span className="text-xs text-teal-300 font-medium">Verified by TradesNetwork</span>
                </div>
              )}
              {elite && <span className="ml-2 text-xs px-2 py-0.5 bg-purple-400/20 border border-purple-400/30 rounded-full text-purple-300 font-medium">Elite Pro</span>}
              {paid && !elite && <span className="ml-2 text-xs px-2 py-0.5 bg-teal-400/10 border border-teal-400/20 rounded-full text-teal-300 font-medium">Pro Member</span>}
            </div>
          </div>
        </div>

        {/* Availability banner */}
        {pro.available_for_work && (
          <div className="bg-green-600/90 border-t border-green-500/30 px-6 py-2.5 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
            <span className="text-sm text-white font-medium">Available for new work</span>
            {(pro as any).available_note && (
              <span className="text-green-200/80 text-xs ml-1">· {(pro as any).available_note}</span>
            )}
          </div>
        )}

        {/* CTA bar */}
        <div className="bg-[#0f1f1a] border-t border-teal-900/40 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            {isOwner ? (
              <div className="flex gap-3">
                <Link href="/edit-profile"
                  className="flex-1 py-3 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                  Edit profile
                </Link>
                <Link href="/dashboard"
                  className="flex-1 py-3 text-center border border-teal-800 text-teal-400 text-sm font-medium rounded-xl hover:bg-teal-900/30 transition-colors">
                  ← Dashboard
                </Link>
              </div>
            ) : (
              <div className="flex gap-3">
                {pro.phone ? (
                  <a href={`tel:${pro.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-500 text-white text-sm font-semibold rounded-xl hover:bg-teal-400 transition-colors">
                    📞 Call {firstName}
                  </a>
                ) : (
                  <button
                    onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-500 text-white text-sm font-semibold rounded-xl hover:bg-teal-400 transition-colors">
                    📞 Request call
                  </button>
                )}
                {pro.phone && (
                  <a href={`sms:${pro.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-teal-700 text-teal-300 text-sm font-semibold rounded-xl hover:bg-teal-900/40 transition-colors">
                    💬 Text / SMS
                  </a>
                )}
                {!pro.phone && (
                  <button
                    onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-teal-700 text-teal-300 text-sm font-semibold rounded-xl hover:bg-teal-900/40 transition-colors">
                    💬 Send message
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT COLUMN — main content */}
          <div className="lg:col-span-2 space-y-5">

            {/* ── CREDENTIAL VAULT ── */}
            {(proLicenses.length > 0 || (pro as any).osha_card_type || (pro as any).insurance_status === 'active' || (pro as any).insurance_status === 'expiring_soon') && (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="px-6 pt-5 pb-2 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Verified credentials</h2>
                  <span className="text-xs text-gray-400 bg-stone-100 px-2 py-1 rounded-full">Florida DBPR</span>
                </div>

                <div className="px-6 pb-5 space-y-3">
                  {/* License cards */}
                  {proLicenses.map(lic => {
                    const expiry    = lic.license_expiry_date
                    const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                    const daysLeft  = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null
                    const { text: statusText, cls: statusCls } = licStatusLabel(lic.license_status)
                    return (
                      <div key={lic.id} className="bg-stone-50 border border-gray-100 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${licStatusDot(lic.license_status)}`} />
                            <span className="font-semibold text-sm text-gray-900">{lic.trade_name}</span>
                            {lic.is_primary && <span className="text-xs px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded font-medium">Primary</span>}
                          </div>
                          <span className={`text-xs font-semibold ${statusCls}`}>{statusText}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-400">
                            <LicenseNumber number={lic.license_number} />
                            {expiryStr && <span className="ml-2">· exp {expiryStr}{daysLeft !== null && daysLeft <= 30 && daysLeft > 0 ? ` (${daysLeft}d)` : ''}</span>}
                          </div>
                          <a href={dbprUrl(lic.license_number)} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                            Verify →
                          </a>
                        </div>
                      </div>
                    )
                  })}

                  {/* Fallback single license */}
                  {proLicenses.length === 0 && pro.license_number && (
                    <div className="bg-stone-50 border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${licStatusDot((pro as any).license_status || 'unknown')}`} />
                          <span className="font-semibold text-sm text-gray-900">{trade}</span>
                        </div>
                        <span className={`text-xs font-semibold ${licStatusLabel((pro as any).license_status || 'unknown').cls}`}>
                          {licStatusLabel((pro as any).license_status || 'unknown').text}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <LicenseNumber number={pro.license_number} />
                        <a href={dbprUrl(pro.license_number)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-teal-600 hover:text-teal-700 font-medium">Verify →</a>
                      </div>
                    </div>
                  )}

                  {/* OSHA card */}
                  {(pro as any).osha_card_type && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🦺</span>
                          <span className="font-semibold text-sm text-blue-900">{(pro as any).osha_card_type} Safety Certification</span>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Valid</span>
                      </div>
                      {(pro as any).osha_card_expiry && (
                        <div className="text-xs text-blue-500 mt-1.5 ml-7">
                          Expires {new Date((pro as any).osha_card_expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Insurance */}
                  {(pro as any).insurance_status === 'active' && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🛡️</span>
                          <span className="font-semibold text-sm text-blue-900">General Liability Insurance</span>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Active</span>
                      </div>
                      {(pro as any).insurance_expiry_date && (
                        <div className="text-xs text-blue-500 mt-1.5 ml-7">
                          Expires {new Date((pro as any).insurance_expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  )}
                  {(pro as any).insurance_status === 'expiring_soon' && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <span>🛡️</span>
                        <span className="font-semibold text-sm text-amber-900">Insurance expiring soon</span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 pt-1">
                    All licenses verified against Florida Department of Business &amp; Professional Regulation
                  </p>
                </div>
              </div>
            )}

            {/* ── PORTFOLIO ── */}
            {portfolio.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Project photos</h2>
                  <span className="text-xs text-gray-400">{portfolio.length} photos</span>
                </div>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {visiblePhotos.map(item => (
                      <div key={item.id} onClick={() => item.photo_url && setLightbox(item.photo_url)}
                        className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-stone-100">
                        {item.photo_url ? (
                          <img src={item.photo_url} alt={item.title || 'Portfolio'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                            <div className="text-2xl">🖼</div>
                            <div className="text-xs mt-1">{item.title}</div>
                          </div>
                        )}
                        {/* Title overlay on hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                          <span className="text-white text-xs font-medium truncate">{item.title}</span>
                        </div>
                        {/* GPS badge */}
                        {item.is_job_site && (
                          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                            <span className="text-xs">📍</span>
                            <span className="text-white text-xs truncate max-w-[80px]">{item.location_label || 'Job site'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {portfolio.length > 6 && (
                    <button onClick={() => setShowAllPhotos(v => !v)}
                      className="mt-3 w-full py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors">
                      {showAllPhotos ? 'Show less' : `See all ${portfolio.length} photos →`}
                    </button>
                  )}
                </div>
                {isOwner && portfolio.length === 0 && (
                  <div className="px-6 pb-5 text-center">
                    <Link href="/community/edit" className="text-sm text-teal-600 font-medium hover:underline">
                      Add project photos →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* ── TABS ── */}
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

                {/* Structured grid */}
                <div className="bg-white border border-gray-100 rounded-2xl p-6">
                  <h2 className="font-semibold text-gray-900 mb-4">About {firstName}</h2>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-5">
                    {[
                      { label: 'Experience', value: pro.years_experience ? `${pro.years_experience} years` : '—' },
                      { label: 'Location', value: location || '—' },
                      { label: 'Languages', value: (pro as any).preferred_language === 'es' ? 'Spanish, English' : 'English' },
                      { label: 'Verified', value: pro.is_verified ? '✓ State database' : 'Unverified' },
                      ...((pro as any).counties_served?.length ? [{ label: 'Service area', value: (pro as any).counties_served.slice(0,3).join(', ') + ((pro as any).counties_served.length > 3 ? ` +${(pro as any).counties_served.length - 3} more` : '') }] : []),
                    ].map(d => (
                      <div key={d.label}>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{d.label}</div>
                        <div className="text-sm text-gray-900">{d.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Bio */}
                  {pro.bio && (
                    <>
                      <div className="border-t border-gray-100 pt-4">
                        <p className="text-gray-600 text-sm leading-relaxed">{pro.bio}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Equipment */}
                {equipment.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6">
                    <h2 className="font-semibold text-gray-900 mb-3">Equipment &amp; tools</h2>
                    <div className="flex flex-wrap gap-2">
                      {equipment.map(eq => (
                        <span key={eq.id}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium ${eq.certified ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-stone-50 text-gray-600 border-gray-200'}`}>
                          {eq.certified && <span className="text-teal-500 mr-1">✓</span>}{eq.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">✓ = certified · Other items are self-reported</p>
                  </div>
                )}

                {/* Memberships */}
                {memberships.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6">
                    <h2 className="font-semibold text-gray-900 mb-3">Associations</h2>
                    <div className="flex flex-wrap gap-2">
                      {memberships.map(m => (
                        <span key={m.id} className="text-xs px-3 py-1.5 rounded-full border bg-blue-50 text-blue-700 border-blue-100 font-medium">
                          🏛️ {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Business hours */}
                <div className="bg-white border border-gray-100 rounded-2xl p-6">
                  <button onClick={() => setShowHours(h => !h)}
                    className="w-full flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">Business hours</h2>
                    <span className="text-gray-400 text-sm">{showHours ? '▲' : '▼'}</span>
                  </button>
                  {!showHours && (
                    <p className="text-sm text-gray-400 mt-2">Mon–Fri: 8:00 AM – 5:00 PM · tap to expand</p>
                  )}
                  {showHours && (
                    <div className="mt-4 space-y-2">
                      {DAYS.map(day => (
                        <div key={day} className="flex justify-between text-sm">
                          <span className="text-gray-500 w-28">{day}</span>
                          <span className={`font-medium ${DEFAULT_HOURS[day] === 'Closed' ? 'text-gray-400' : 'text-gray-900'}`}>
                            {DEFAULT_HOURS[day]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── REVIEWS TAB ── */}
            {activeTab === 'reviews' && (
              <div className="space-y-4">
                {rating > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6">
                    <div className="flex items-center gap-6 mb-4">
                      <div className="text-center">
                        <div className="text-5xl font-serif font-bold text-gray-900">{rating.toFixed(1)}</div>
                        <div className="text-amber-400 text-xl mt-1">{starsHtml(rating)}</div>
                        <div className="text-xs text-gray-400 mt-1">{reviewCnt} reviews</div>
                      </div>
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
                    {keywords.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Mentioned often</div>
                        <div className="flex flex-wrap gap-2">
                          {keywords.map(kw => (
                            <span key={kw} className="text-xs px-3 py-1 bg-teal-50 text-teal-700 rounded-full font-medium capitalize">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!isOwner && (
                  <div className="flex justify-end">
                    <a href={`/reviews/${id}`}
                      className="flex items-center gap-2 px-4 py-2 border border-teal-300 text-teal-700 text-sm font-semibold rounded-xl hover:bg-teal-50 transition-colors">
                      ⭐ Write a review
                    </a>
                  </div>
                )}

                {reviews.length === 0 ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-12 text-center">
                    <div className="text-gray-400 text-sm mb-3">
                      {isOwner ? 'No reviews yet — homeowners will leave reviews after jobs.' : 'No reviews yet — be the first!'}
                    </div>
                    {!isOwner && (
                      <a href={`/reviews/${id}`} className="text-sm font-semibold text-teal-600 hover:underline">
                        Leave the first review →
                      </a>
                    )}
                  </div>
                ) : reviews.map(rev => (
                  <div key={rev.id} className="bg-white border border-gray-100 rounded-2xl p-5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{rev.reviewer_name || 'Anonymous'}</div>
                        <div className="text-amber-400 text-sm mt-0.5">{starsHtml(rev.rating)}</div>
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
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <h2 className="font-semibold text-gray-900 mb-4">All projects &amp; photos</h2>
                {portfolio.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm">
                    {isOwner
                      ? <><Link href="/community/edit" className="text-teal-600 font-medium">Add photos</Link> to showcase your work</>
                      : 'No photos yet.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {portfolio.map(item => (
                      <div key={item.id} onClick={() => item.photo_url && setLightbox(item.photo_url)}
                        className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-stone-100">
                        {item.photo_url
                          ? <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">🖼</div>
                        }
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                          <span className="text-white text-xs font-medium truncate">{item.title}</span>
                        </div>
                        {item.is_job_site && (
                          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                            <span className="text-xs">📍</span>
                            <span className="text-white text-xs truncate max-w-[80px]">{item.location_label || 'Job site'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="space-y-4">

            {/* Stats card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-0 text-center divide-x divide-gray-100">
                {[
                  { val: reviewCnt,                                   lbl: 'Reviews' },
                  { val: pro.years_experience || '—',                 lbl: 'Yrs exp' },
                  { val: (pro as any).lead_count || 0,                lbl: 'Enquiries' },
                ].map(s => (
                  <div key={s.lbl} className="px-2">
                    <div className="text-xl font-semibold text-teal-600">{s.val}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust signals */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
              {[
                { icon: '✓', lbl: pro.is_verified ? 'License verified' : 'Profile created', sub: pro.is_verified ? 'State database check' : 'Unverified — complete profile' },
                { icon: '💰', lbl: 'Free to contact', sub: 'No per-lead fees ever' },
                { icon: rating > 0 ? '⭐' : '🆕', lbl: rating > 0 ? `${rating.toFixed(1)} star rating` : 'New pro', sub: rating > 0 ? `${reviewCnt} verified reviews` : 'Be the first to review' },
              ].map(item => (
                <div key={item.lbl} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center text-sm flex-shrink-0">{item.icon}</div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{item.lbl}</div>
                    <div className="text-xs text-gray-400">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Contact form */}
            <div id="contact-form" className="bg-white border border-gray-100 rounded-2xl p-5">
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
                </>
              ) : submitted ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-3">✓</div>
                  <div className="font-semibold text-gray-900 mb-1">Message sent!</div>
                  <div className="text-sm text-gray-400">{firstName} will be in touch soon.</div>
                </div>
              ) : (
                <>
                  <div className="font-semibold text-gray-900 mb-0.5">Contact {firstName}</div>
                  <div className="text-xs text-gray-400 mb-4">Free · No middleman · Direct contact</div>
                  {formError && <div className="mb-3 p-2.5 bg-red-50 text-red-600 text-xs rounded-lg">{formError}</div>}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Your name *</label>
                      <input value={name} onChange={e => setName(e.target.value)} placeholder="James Smith"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Phone (preferred) *</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Job description</label>
                      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                        placeholder="Briefly describe what you need done..."
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 resize-none transition-colors" />
                    </div>
                    <button onClick={handleLead} disabled={submitting}
                      className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                      {submitting ? 'Sending...' : 'Request callback →'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-3">Zero per-lead fees · Direct contact</p>
                </>
              )}
            </div>

            {/* Follow / Community */}
            {session && !isOwner && (
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
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY CTA ── (hidden on lg) */}
      {!isOwner && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-40 shadow-lg">
          <div className="flex gap-3 max-w-sm mx-auto">
            {pro.phone ? (
              <a href={`tel:${pro.phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl">
                📞 Call
              </a>
            ) : (
              <button onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl">
                📞 Request call
              </button>
            )}
            <button
              onClick={() => document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl">
              💬 Message
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className={`border-t border-gray-100 mt-12 py-8 ${!isOwner ? 'pb-24 lg:pb-8' : ''}`}>
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="font-serif text-sm text-gray-900">Trades<span className="text-teal-600">Network</span></div>
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
