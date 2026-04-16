'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, Pro } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, isPaid, isElite } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────────

function ProAvatar({ pro, cls }: { pro: any; cls: string }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  if (pro?.profile_photo_url)
    return <img src={pro.profile_photo_url} alt={pro.full_name} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  return <div className={`${cls} rounded-full flex items-center justify-center font-serif flex-shrink-0`} style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
}

// Traffic-light credential card
function CredCard({ lic }: { lic: any }) {
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const status = lic.license_status || 'unknown'
  const expiry = lic.license_expiry_date
  const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null

  const color = status === 'active' ? {
    border: 'border-l-4 border-l-green-500',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
    text: 'text-green-700',
    label: 'Active',
  } : status === 'expiring_soon' ? {
    border: 'border-l-4 border-l-amber-400',
    bg: 'bg-amber-50',
    dot: 'bg-amber-400',
    text: 'text-amber-700',
    label: daysLeft !== null ? `Expiring in ${daysLeft}d` : 'Expiring soon',
  } : status === 'expired' ? {
    border: 'border-l-4 border-l-red-400',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
    text: 'text-red-700',
    label: 'Expired',
  } : {
    border: 'border-l-4 border-l-gray-300',
    bg: 'bg-stone-50',
    dot: 'bg-gray-300',
    text: 'text-gray-500',
    label: 'Unknown',
  }

  return (
    <div className={`rounded-xl border border-gray-100 ${color.border} ${color.bg} overflow-hidden mb-2`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color.dot}`} />
          <span className="text-sm font-medium text-gray-900">{lic.trade_name}</span>
          {lic.is_primary && <span className="text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">Primary</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold ${color.text}`}>{color.label}</span>
          {expiryStr && <span className="text-xs text-gray-400">exp {expiryStr}</span>}
        </div>
      </div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 pb-2.5 flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 transition-colors">
        View credentials {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100 bg-white">
          <div className="flex items-center justify-between mt-2.5">
            <div className="font-mono text-xs text-gray-700">
              {lic.license_number ? (
                <>
                  <span>{lic.license_number.slice(0,4)}</span>
                  <span className="text-gray-400 mx-0.5">{revealed ? lic.license_number.slice(4,-3) : '•••'}</span>
                  <span>{lic.license_number.slice(-3)}</span>
                  <button onClick={() => setRevealed(r => !r)} className="ml-2 text-teal-600 underline text-xs">{revealed ? 'hide' : 'reveal'}</button>
                </>
              ) : '—'}
            </div>
            {lic.license_number && (
              <a href={`https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=${encodeURIComponent(lic.license_number)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                Verify with DBPR →
              </a>
            )}
          </div>
          {lic.license_expiry_date && (
            <div className="text-xs text-gray-400 mt-1">
              Expires {new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// OSHA / Insurance credential card — same traffic light system
function AuxCredCard({ icon, title, status, sub }: { icon: string; title: string; status: 'active'|'expiring_soon'|'expired'|'valid'; sub?: string }) {
  const color = status === 'active' || status === 'valid' ? {
    border: 'border-l-4 border-l-green-500', bg: 'bg-green-50', dot: 'bg-green-500', text: 'text-green-700', label: 'Active'
  } : status === 'expiring_soon' ? {
    border: 'border-l-4 border-l-amber-400', bg: 'bg-amber-50', dot: 'bg-amber-400', text: 'text-amber-700', label: 'Expiring'
  } : {
    border: 'border-l-4 border-l-red-400', bg: 'bg-red-50', dot: 'bg-red-500', text: 'text-red-700', label: 'Expired'
  }
  return (
    <div className={`rounded-xl border border-gray-100 ${color.border} ${color.bg} px-4 py-3 mb-2 flex items-center justify-between`}>
      <div className="flex items-center gap-2.5">
        <span className="text-base">{icon}</span>
        <div>
          <div className="text-sm font-medium text-gray-900">{title}</div>
          {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
        </div>
      </div>
      <span className={`text-xs font-semibold ${color.text}`}>{color.label}</span>
    </div>
  )
}

// Contact modal
function ContactModal({ pro, onClose }: { pro: any; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const id = pro.id
  const firstName = pro.full_name.split(' ')[0]

  async function send() {
    if (!name || !phone) { setErr('Name and phone are required'); return }
    setSubmitting(true); setErr('')
    const r = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: id, contact_name: name, contact_email: `${phone.replace(/\D/g,'')}@sms.placeholder`, contact_phone: phone, message: message || 'Contact request', lead_source: 'Profile_Page' }),
    })
    setSubmitting(false)
    if (r.ok) setDone(true)
    else setErr('Could not send — please try again.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">✓</div>
            <div className="font-semibold text-gray-900 mb-1">Message sent!</div>
            <div className="text-sm text-gray-400">{firstName} will be in touch soon.</div>
            <button onClick={onClose} className="mt-5 text-sm text-teal-600">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <div className="font-semibold text-gray-900">Contact {firstName}</div>
                <div className="text-xs text-gray-400 mt-0.5">Free · Direct · No middleman</div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {err && <div className="p-2.5 bg-red-50 text-red-600 text-xs rounded-lg">{err}</div>}
              {[
                { lbl: 'Your name *', val: name, set: setName, ph: 'James Smith', type: 'text' },
                { lbl: 'Phone (preferred) *', val: phone, set: setPhone, ph: '(555) 000-0000', type: 'tel' },
              ].map(f => (
                <div key={f.lbl}>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{f.lbl}</label>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Job description</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
                  placeholder="Briefly describe what you need done..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 resize-none transition-colors" />
              </div>
              <button onClick={send} disabled={submitting}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Sending...' : 'Send message →'}
              </button>
              <p className="text-xs text-gray-400 text-center">Zero per-lead fees · Direct contact</p>
            </div>
          </>
        )}
      </div>
    </div>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [session, setSession]       = useState<Session | null>(null)
  const [pro, setPro]               = useState<Pro | null>(null)
  const [reviews, setReviews]       = useState<any[]>([])
  const [portfolio, setPortfolio]   = useState<any[]>([])
  const [equipment, setEquipment]   = useState<any[]>([])
  const [proLicenses, setProLicenses] = useState<any[]>([])
  const [memberships, setMemberships] = useState<any[]>([])
  const [endorsements, setEndorsements] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [isFollowing, setIsFollowing] = useState(false)

  const [activeTab, setActiveTab]   = useState<'about'|'reviews'>('about')
  const [lightbox, setLightbox]     = useState<string|null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)
  const [showAllPhotos, setShowAllPhotos] = useState(false)

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
      fetch(`/api/skills?pro_id=${id}`).then(r => r.json()).then(d => setEndorsements((d.skills || []).filter((s:any) => s.endorsement_count > 0)))
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

  function shareProfile() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: `${pro?.full_name} on TradesNetwork`, url })
    else { navigator.clipboard.writeText(url); setShowShareToast(true); setTimeout(() => setShowShareToast(false), 2500) }
  }

  function downloadPdf() {
    alert('Credential Report PDF — coming soon. This will generate a one-page summary of licenses, certifications and insurance for onboarding.')
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !pro) return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center text-center">
      <div><div className="font-serif text-2xl text-gray-900 mb-3">Pro not found</div>
        <Link href="/" className="text-teal-600 text-sm">← Back to search</Link></div>
    </div>
  )

  const isOwner  = session?.id === id
  const paid     = isPaid(pro.plan_tier)
  const elite    = isElite(pro.plan_tier)
  const trade    = (pro as any).trade_category?.category_name || '—'
  const location = [pro.city, pro.state].filter(Boolean).join(', ')
  const rating   = pro.avg_rating || 0
  const reviewCnt = pro.review_count || reviews.length || 0
  const firstName = pro.full_name.split(' ')[0]
  const keywords  = extractKeywords(reviews)
  const visiblePhotos = showAllPhotos ? portfolio : portfolio.slice(0, 6)

  // Compact credential pills for hero
  const hasLicense  = proLicenses.length > 0 || !!pro.license_number
  const hasOsha     = !!(pro as any).osha_card_type
  const hasInsurance = (pro as any).insurance_status === 'active'

  // Track record bar items
  const trackItems = [
    pro.years_experience ? `${pro.years_experience} yrs experience` : null,
    rating > 0 ? `${rating.toFixed(1)} ★ rating` : null,
    hasOsha ? `${(pro as any).osha_card_type} certified` : null,
    hasLicense && pro.is_verified ? 'DBPR verified' : null,
  ].filter(Boolean) as string[]

  const hasCredentials = proLicenses.length > 0 || pro.license_number || hasOsha || hasInsurance

  return (
    <div className="min-h-screen bg-stone-100">

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl leading-none">✕</button>
        </div>
      )}

      {/* Contact modal */}
      {showModal && <ContactModal pro={pro} onClose={() => setShowModal(false)} />}

      {/* Share toast */}
      {showShareToast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">Link copied ✓</div>
      )}

      {/* Owner banner */}
      {isOwner && (
        <div className="bg-teal-50 border-b border-teal-100">
          <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-teal-700">
              <span>👁</span><span className="font-medium">Your public profile</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/edit-profile" className="text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Edit profile</Link>
              <Link href="/dashboard" className="text-xs font-semibold px-3 py-1.5 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">← Dashboard</Link>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-5 h-[52px] flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="font-serif text-lg text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 hidden sm:block">← Find a pro</Link>
          {session && !isOwner && (
            <button onClick={toggleFollow}
              className={`text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all ${isFollowing ? 'border-gray-200 text-gray-500' : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'}`}>
              {isFollowing ? '✓ Following' : '+ Follow'}
            </button>
          )}
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 pt-5">
        <div className="bg-[#152a23] rounded-xl overflow-hidden">

          {/* Identity row */}
          <div className="px-5 sm:px-7 pt-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <ProAvatar pro={pro} cls="w-16 h-16 ring-2 ring-teal-400/40" />
                {pro.available_for_work && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-[#152a23]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-white leading-tight">{pro.full_name}</h1>
                    <div className="text-teal-400 text-sm font-medium mt-0.5">{trade}</div>
                    <div className="text-teal-200/60 text-xs mt-0.5">📍 {location || 'Florida'}</div>
                  </div>
                  {/* Overflow menu */}
                  <div className="relative flex-shrink-0">
                    <button onClick={() => setShowOverflow(o => !o)}
                      className="text-teal-300 hover:text-teal-100 transition-colors text-lg px-1">⋯</button>
                    {showOverflow && (
                      <div className="absolute right-0 top-8 bg-white rounded-xl border border-gray-200 shadow-lg py-1 w-44 z-10">
                        <button onClick={() => { shareProfile(); setShowOverflow(false) }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-stone-50 transition-colors">
                          🔗 Share profile
                        </button>
                        <button onClick={() => { downloadPdf(); setShowOverflow(false) }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-stone-50 transition-colors">
                          📋 Credential Report (PDF)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {pro.is_verified && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-400/10 border border-teal-400/30 text-teal-300 font-medium">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" /> Verified
                    </span>
                  )}
                  {pro.available_for_work && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/20 border border-green-400/30 text-green-300 font-medium">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" /> Available
                    </span>
                  )}
                  {hasLicense && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-400">Licensed</span>}
                  {hasOsha && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20 text-blue-300">🦺 {(pro as any).osha_card_type}</span>}
                  {hasInsurance && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20 text-blue-300">🛡 Insured</span>}
                  {elite && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-400/20 border border-purple-400/30 text-purple-300">Elite Pro</span>}
                  {paid && !elite && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300">Pro Member</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Track record bar */}
          {trackItems.length > 0 && (
            <div className="mx-5 sm:mx-7 mb-4 bg-teal-900/40 border border-teal-700/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {trackItems.map((item, i) => (
                <span key={i} className="text-xs text-teal-300 font-medium">
                  {i > 0 && <span className="text-teal-700 mr-4">·</span>}
                  {item}
                </span>
              ))}
              {rating > 0 && (
                <span className="text-xs text-amber-400 font-medium ml-auto">{starsHtml(rating)}</span>
              )}
            </div>
          )}

          {/* CTA bar */}
          <div className="bg-[#0f1f1a] border-t border-teal-900/40 px-5 sm:px-7 py-3.5">
            {isOwner ? (
              <div className="flex gap-2">
                <Link href="/edit-profile" className="flex-1 py-2.5 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">Edit profile</Link>
                <Link href="/dashboard" className="flex-1 py-2.5 text-center border border-teal-800 text-teal-400 text-sm font-medium rounded-xl hover:bg-teal-900/30 transition-colors">← Dashboard</Link>
              </div>
            ) : (
              <div className="flex gap-2.5">
                {pro.phone ? (
                  <a href={`tel:${pro.phone}`} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-500 text-white text-sm font-semibold rounded-xl hover:bg-teal-400 transition-colors">
                    📞 Call {firstName}
                  </a>
                ) : (
                  <button onClick={() => setShowModal(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-500 text-white text-sm font-semibold rounded-xl hover:bg-teal-400 transition-colors">
                    📞 Request call
                  </button>
                )}
                <button onClick={() => setShowModal(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-teal-700 text-teal-300 text-sm font-semibold rounded-xl hover:bg-teal-900/40 transition-colors">
                  💬 Message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT — main content column */}
          <div className="lg:col-span-2 space-y-4">

            {/* ── 1. PROJECT PHOTOS ── */}
            {portfolio.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Project photos</h2>
                  <span className="text-xs text-gray-400">{portfolio.length} photos</span>
                </div>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {visiblePhotos.map(item => (
                      <div key={item.id} className="rounded-xl overflow-hidden bg-stone-100 cursor-pointer group"
                        onClick={() => item.photo_url && setLightbox(item.photo_url)}>
                        <div className="relative aspect-square">
                          {item.photo_url
                            ? <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">🖼</div>
                          }
                          {item.is_job_site && (
                            <div className="absolute top-2 left-2 bg-green-700/90 rounded-full px-2 py-0.5">
                              <span className="text-white text-xs font-semibold">✓ Verified GPS</span>
                            </div>
                          )}
                        </div>
                        <div className="px-2 py-1.5 bg-white border-t border-gray-100">
                          <div className="text-xs font-medium text-gray-800 truncate">{item.title || 'Photo'}</div>
                          {item.location_label && <div className="text-xs text-gray-400 truncate">📍 {item.location_label}</div>}
                        </div>
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
              </div>
            )}

            {/* ── 2. FLASH BIO / ABOUT ── */}
            {(pro.bio || equipment.length > 0) && (
              <div className="bg-stone-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="border-l-4 border-l-teal-500 px-5 pt-5 pb-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">About {firstName}</h2>

                  {/* Structured grid */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                    {[
                      { lbl: 'Experience', val: pro.years_experience ? `${pro.years_experience} years` : '—' },
                      { lbl: 'Location', val: location || '—' },
                      { lbl: 'Languages', val: (pro as any).preferred_language === 'es' ? 'Spanish, English' : 'English' },
                      ...((pro as any).counties_served?.length ? [{ lbl: 'Service area', val: (pro as any).counties_served.slice(0,3).join(', ') + ((pro as any).counties_served.length > 3 ? ` +${(pro as any).counties_served.length - 3}` : '') }] : []),
                    ].map(d => (
                      <div key={d.lbl}>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{d.lbl}</div>
                        <div className="text-sm text-gray-900">{d.val}</div>
                      </div>
                    ))}
                  </div>

                  {pro.bio && (
                    <p className="text-sm text-gray-600 leading-relaxed border-t border-gray-200 pt-3">{pro.bio}</p>
                  )}

                  {/* Equipment — the "hardware" line */}
                  {equipment.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Equipment & tools</div>
                      <div className="flex flex-wrap gap-1.5">
                        {equipment.map(eq => (
                          <span key={eq.id} className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${eq.certified ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-gray-600 border-gray-200'}`}>
                            {eq.certified && <span className="text-teal-500 mr-1">✓</span>}{eq.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Memberships */}
                  {memberships.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Associations</div>
                      <div className="flex flex-wrap gap-1.5">
                        {memberships.map(m => (
                          <span key={m.id} className="text-xs px-2.5 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-100 font-medium">🏛 {m.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 3. CREDENTIAL VAULT ── */}
            {hasCredentials && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">Verified credentials</h2>
                  <span className="text-xs text-gray-400 bg-stone-100 border border-gray-200 px-2 py-0.5 rounded-full">Florida DBPR</span>
                </div>

                {proLicenses.map(lic => <CredCard key={lic.id} lic={lic} />)}

                {proLicenses.length === 0 && pro.license_number && (
                  <CredCard lic={{ id: 'legacy', trade_name: trade, license_number: pro.license_number, license_expiry_date: (pro as any).license_expiry_date, license_status: (pro as any).license_status || 'unknown', is_primary: true }} />
                )}

                {hasOsha && (
                  <AuxCredCard icon="🦺" title={`${(pro as any).osha_card_type} Safety Certification`}
                    status="valid" sub={(pro as any).osha_card_expiry ? `Expires ${new Date((pro as any).osha_card_expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : undefined} />
                )}

                {hasInsurance && (
                  <AuxCredCard icon="🛡" title="General Liability Insurance"
                    status={(pro as any).insurance_status === 'expiring_soon' ? 'expiring_soon' : 'active'}
                    sub={(pro as any).insurance_expiry_date ? `Expires ${new Date((pro as any).insurance_expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : undefined} />
                )}

                <button onClick={downloadPdf}
                  className="mt-1 w-full text-center py-2.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors">
                  📋 Download Credential Report (PDF)
                </button>
                <p className="text-xs text-gray-400 mt-2.5 text-center">All licenses verified against Florida Dept. of Business &amp; Professional Regulation</p>
              </div>
            )}

            {/* ── 4. PEER ENDORSEMENTS ── */}
            {endorsements.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Peer endorsements</h2>
                <p className="text-xs text-gray-400 mb-3">Vouched for by verified pros on TradesNetwork</p>
                <div className="space-y-0">
                  {endorsements.map((skill, i) => (
                    <div key={skill.id} className={`flex items-center justify-between py-2.5 ${i < endorsements.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div>
                        <div className="text-sm text-gray-900">{skill.skill_name}</div>
                        <div className="text-xs text-teal-600 font-medium mt-0.5">Endorsed by {skill.endorsement_count} pro{skill.endorsement_count !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="flex">
                        {Array.from({ length: Math.min(skill.endorsement_count, 4) }).map((_, j) => (
                          <div key={j} className="w-6 h-6 rounded-full bg-teal-100 border-2 border-white flex items-center justify-center -ml-1.5 first:ml-0">
                            <span className="text-teal-700 text-xs font-semibold">✓</span>
                          </div>
                        ))}
                        {skill.endorsement_count > 4 && (
                          <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center -ml-1.5">
                            <span className="text-gray-500 text-xs">+{skill.endorsement_count - 4}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 5. TABS — About / Reviews ── */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5">
              {(['about', 'reviews'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl capitalize transition-colors ${activeTab === tab ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                  {tab === 'reviews' ? `Reviews (${reviewCnt})` : 'About'}
                </button>
              ))}
            </div>

            {/* About tab */}
            {activeTab === 'about' && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                  {[
                    { lbl: 'Trade', val: trade },
                    { lbl: 'Verified', val: pro.is_verified ? '✓ State database' : 'Self-reported' },
                    { lbl: 'Plan', val: pro.plan_tier || 'Free' },
                  ].map(d => (
                    <div key={d.lbl}>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{d.lbl}</div>
                      <div className={`text-sm ${d.lbl === 'Verified' && pro.is_verified ? 'text-green-700' : 'text-gray-900'}`}>{d.val}</div>
                    </div>
                  ))}
                </div>
                {pro.bio ? (
                  <p className="text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">{pro.bio}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic border-t border-gray-100 pt-4">No bio added yet.</p>
                )}
              </div>
            )}

            {/* Reviews tab */}
            {activeTab === 'reviews' && (
              <div className="space-y-3">
                {rating > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-6 mb-4">
                      <div className="text-center">
                        <div className="text-4xl font-serif font-bold text-gray-900">{rating.toFixed(1)}</div>
                        <div className="text-amber-400 text-lg mt-1">{starsHtml(rating)}</div>
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
                        <div className="flex flex-wrap gap-1.5">
                          {keywords.map(kw => <span key={kw} className="text-xs px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg font-medium capitalize">{kw}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!isOwner && (
                  <div className="flex justify-end">
                    <a href={`/reviews/${id}`} className="flex items-center gap-2 px-4 py-2 border border-teal-300 text-teal-700 text-sm font-semibold rounded-xl hover:bg-teal-50 transition-colors">
                      ⭐ Write a review
                    </a>
                  </div>
                )}
                {reviews.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl py-10 text-center">
                    <div className="text-gray-400 text-sm">{isOwner ? 'No reviews yet.' : 'No reviews yet — be the first!'}</div>
                    {!isOwner && <a href={`/reviews/${id}`} className="text-sm font-semibold text-teal-600 hover:underline mt-2 block">Leave the first review →</a>}
                  </div>
                ) : reviews.map(rev => (
                  <div key={rev.id} className="bg-white border border-gray-200 rounded-xl p-5">
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
          </div>

          {/* ── RIGHT SIDEBAR (desktop only) ── */}
          <div className="hidden lg:flex flex-col gap-4">

            {/* Stats */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                {[
                  { val: reviewCnt,                          lbl: 'Reviews' },
                  { val: pro.years_experience || '—',        lbl: 'Yrs exp' },
                ].map(s => (
                  <div key={s.lbl} className="bg-stone-50 rounded-xl py-3">
                    <div className="text-xl font-semibold text-teal-600">{s.val}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust signals */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2.5">
              {[
                { icon: '✓', lbl: pro.is_verified ? 'License verified' : 'Profile created', sub: pro.is_verified ? 'State database check' : 'Self-reported' },
                { icon: '$', lbl: 'Free to contact', sub: 'No per-lead fees ever' },
                { icon: '★', lbl: rating > 0 ? `${rating.toFixed(1)} star rating` : 'New pro', sub: rating > 0 ? `${reviewCnt} verified reviews` : 'Be the first to review' },
              ].map(item => (
                <div key={item.lbl} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center text-sm flex-shrink-0 font-semibold text-teal-700">{item.icon}</div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{item.lbl}</div>
                    <div className="text-xs text-gray-400">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Compact credential status */}
            {hasCredentials && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Credential status</div>
                <div className="space-y-2">
                  {proLicenses.slice(0, 3).map(lic => (
                    <div key={lic.id} className="flex items-center justify-between">
                      <span className="text-xs text-gray-700 truncate">{lic.trade_name}</span>
                      <span className={`text-xs font-semibold ml-2 flex-shrink-0 ${lic.license_status === 'active' ? 'text-green-600' : lic.license_status === 'expiring_soon' ? 'text-amber-600' : 'text-red-600'}`}>
                        {lic.license_status === 'active' ? '● Active' : lic.license_status === 'expiring_soon' ? '● Expiring' : '● Expired'}
                      </span>
                    </div>
                  ))}
                  {hasOsha && <div className="flex items-center justify-between"><span className="text-xs text-gray-700">🦺 {(pro as any).osha_card_type}</span><span className="text-xs font-semibold text-green-600 ml-2">● Valid</span></div>}
                  {hasInsurance && <div className="flex items-center justify-between"><span className="text-xs text-gray-700">🛡 Insurance</span><span className="text-xs font-semibold text-green-600 ml-2">● Active</span></div>}
                </div>
              </div>
            )}

            {/* Contact — desktop */}
            {!isOwner && (
              <button onClick={() => setShowModal(true)}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                💬 Send a message
              </button>
            )}

            {/* Owner shortcuts */}
            {isOwner && (
              <div className="space-y-2">
                <Link href="/edit-profile" className="block w-full py-2.5 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">Edit profile</Link>
                <Link href="/community/edit" className="block w-full py-2.5 text-center border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">Edit portfolio</Link>
              </div>
            )}

            {/* Follow (community) */}
            {session && !isOwner && (
              <button onClick={toggleFollow}
                className={`w-full py-2.5 text-sm font-semibold rounded-xl border transition-all ${isFollowing ? 'border-gray-200 text-gray-500' : 'border-teal-300 text-teal-700 hover:bg-teal-50'}`}>
                {isFollowing ? '✓ Following' : '+ Follow'}
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ── MOBILE STICKY FOOTER (hidden on lg) ── */}
      {!isOwner && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-40">
          <div className="flex gap-3 max-w-sm mx-auto">
            {pro.phone ? (
              <a href={`tel:${pro.phone}`} className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl">
                📞 Call now
              </a>
            ) : (
              <button onClick={() => setShowModal(true)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl">
                📞 Request call
              </button>
            )}
            <button onClick={() => setShowModal(true)} className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl">
              💬 Message
            </button>
          </div>
        </div>
      )}

      <footer className={`border-t border-gray-200 mt-8 py-6 ${!isOwner ? 'pb-24 lg:pb-6' : ''}`}>
        <div className="max-w-5xl mx-auto px-5 flex flex-wrap items-center justify-between gap-4">
          <div className="font-serif text-sm text-gray-900">Trades<span className="text-teal-600">Network</span></div>
          <div className="flex gap-4 text-sm">
            {[['/', 'Home'],['/about','About'],['/contact','Contact'],['/privacy','Privacy'],['/terms','Terms']].map(([href, label]) => (
              <a key={href} href={href} className="text-gray-400 hover:text-teal-600 transition-colors">{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
