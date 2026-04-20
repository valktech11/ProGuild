'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { initials, avatarColor, starsHtml, formatReviewDate, isPaid, isElite } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'work' | 'reviews' | 'credentials'

// ── Sub-components ────────────────────────────────────────────────────────────

function ProAvatar({ pro, size }: { pro: any; size: string }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  if (pro?.profile_photo_url)
    return <img src={pro.profile_photo_url} alt={pro.full_name}
      className={`${size} rounded-full object-cover flex-shrink-0 ring-2 ring-teal-400/30`} />
  return <div className={`${size} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
    style={{ background: bg, color: fg, fontSize: '1rem' }}>{initials(pro?.full_name || 'A')}</div>
}

function ShieldBadge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#pg)"/>
      <path d="M11 16l3 3 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs><linearGradient id="pg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#0D7377"/>
      </linearGradient></defs>
    </svg>
  )
}

function BeforeAfterSlider({ afterUrl, beforeUrl, title }: { afterUrl: string; beforeUrl: string; title: string }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="relative w-full h-full select-none overflow-hidden"
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setPos(Math.min(95,Math.max(5,((e.clientX-r.left)/r.width)*100))) }}
      onTouchMove={e => { const r = e.currentTarget.getBoundingClientRect(); setPos(Math.min(95,Math.max(5,((e.touches[0].clientX-r.left)/r.width)*100))) }}>
      <img src={afterUrl} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <div className="absolute inset-0" style={{ width: `${100*100/pos}%` }}>
          <img src={beforeUrl} alt="Before" className="absolute inset-0 w-full h-full object-cover" />
        </div>
      </div>
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-xs font-bold text-gray-600">↔</div>
      </div>
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">Before</div>
      <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">After</div>
    </div>
  )
}

function ContactModal({ pro, onClose }: { pro: any; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const firstName = pro.full_name.split(' ')[0]

  async function send() {
    if (!name || !phone) { setErr('Name and phone are required'); return }
    setSubmitting(true); setErr('')
    const r = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: pro.id, contact_name: name, contact_email: `${phone.replace(/\D/g,'')}@sms.placeholder`, contact_phone: phone, message: message || 'Contact request', lead_source: 'Profile_Page' }),
    })
    setSubmitting(false)
    if (r.ok) setDone(true)
    else setErr('Could not send — please try again.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">✓</div>
            <div className="font-bold text-gray-900 mb-1">Message sent!</div>
            <div className="text-sm text-gray-400">{firstName} will be in touch soon.</div>
            <button onClick={onClose} className="mt-5 text-sm text-teal-600">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b" style={{ borderColor: '#E8E2D9' }}>
              <div>
                <div className="font-bold text-gray-900">Contact {firstName}</div>
                <div className="text-xs text-gray-400 mt-0.5">Free · Direct · No middleman</div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {err && <div className="p-2.5 bg-red-50 text-red-600 text-xs rounded-xl">{err}</div>}
              {[
                { lbl: 'Your name *', val: name, set: setName, ph: 'James Smith', type: 'text' },
                { lbl: 'Phone *', val: phone, set: setPhone, ph: '(555) 000-0000', type: 'tel' },
              ].map(f => (
                <div key={f.lbl}>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">{f.lbl}</label>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:border-teal-400 transition-colors"
                    style={{ borderColor: '#E8E2D9', background: '#F5F0E8' }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Job description</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  placeholder="Briefly describe what you need..."
                  className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:border-teal-400 resize-none transition-colors"
                  style={{ borderColor: '#E8E2D9', background: '#F5F0E8' }} />
              </div>
              <button onClick={send} disabled={submitting}
                className="w-full py-3 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
                style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                {submitting ? 'Sending...' : `Send message to ${firstName} →`}
              </button>
              <p className="text-xs text-gray-400 text-center">Zero per-lead fees · Direct contact</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Portfolio add form (inline in Work tab) ───────────────────────────────────
function AddWorkItem({ proId, onAdded }: { proId: string; onAdded: (item: any) => void }) {
  const [photo, setPhoto]         = useState('')
  const [title, setTitle]         = useState('')
  const [desc, setDesc]           = useState('')
  const [isJobSite, setIsJobSite] = useState(false)
  const [isBA, setIsBA]           = useState(false)
  const [beforePhoto, setBefore]  = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadingB, setUploadingB] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const fileRef  = useRef<HTMLInputElement>(null)
  const beforeRef = useRef<HTMLInputElement>(null)

  async function uploadPhoto(file: File, setUrl: (u: string) => void, setLoading: (b: boolean) => void) {
    setLoading(true); setError('')
    const form = new FormData()
    form.append('file', file); form.append('pro_id', proId)
    form.append('bucket', 'portfolio'); form.append('folder', proId)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setLoading(false)
    if (r.ok) setUrl(d.url)
    else setError(d.error || 'Upload failed')
  }

  async function save() {
    if (!photo) { setError('Please add a photo'); return }
    if (!title.trim()) { setError('Please add a project title'); return }
    if (isBA && !beforePhoto) { setError('Please upload the Before photo'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/portfolio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: proId, photo_url: photo, title, description: desc || null, is_job_site: isJobSite, is_before_after: isBA, before_photo_url: isBA ? beforePhoto : null }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) {
      onAdded(d.item)
      setPhoto(''); setTitle(''); setDesc(''); setIsJobSite(false); setIsBA(false); setBefore(''); setError('')
    } else { setError(d.error || 'Could not add item') }
  }

  return (
    <div className="bg-white rounded-2xl border p-5 mb-6" style={{ borderColor: '#E8E2D9' }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#A89F93' }}>Add project photo</div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">{error}</div>}

      {/* Before/After numbered steps */}
      {isBA && (
        <div className="mb-4 p-3 rounded-xl flex items-start gap-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span className="text-lg flex-shrink-0">↔</span>
          <div className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
            <strong>Before/After mode:</strong> Step 1 — upload the AFTER photo below (the finished result).
            Step 2 — upload the BEFORE photo (the state before work began).
          </div>
        </div>
      )}

      {/* Main photo upload */}
      <div className="mb-4">
        {isBA && (
          <div className="text-xs font-bold mb-1.5 px-1" style={{ color: '#F59E0B' }}>
            STEP 1 — AFTER photo (the finished result)
          </div>
        )}
        {photo ? (
          <div className="relative rounded-xl overflow-hidden aspect-video bg-gray-100">
            <img src={photo} className="w-full h-full object-cover" alt="Project" />
            <button onClick={() => setPhoto('')}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center text-sm hover:bg-black/80 transition-colors">×</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors"
            style={{ borderColor: '#E8E2D9' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#14B8A6'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E2D9'}>
            {uploading ? (
              <span className="text-sm" style={{ color: '#A89F93' }}>Uploading...</span>
            ) : (
              <>
                <div className="text-2xl mb-2">📷</div>
                <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>Click to upload photo</div>
                <div className="text-xs mt-1" style={{ color: '#A89F93' }}>JPG, PNG or WebP · Max 5MB</div>
              </>
            )}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, setPhoto, setUploading) }} />
      </div>

      {/* Before/After photo upload */}
      {isBA && (
        <div className="mb-4 p-4 rounded-xl border" style={{ background: 'rgba(245,240,232,0.5)', borderColor: '#E8E2D9' }}>
          <div className="text-xs font-bold mb-1" style={{ color: '#F59E0B' }}>STEP 2 — BEFORE photo</div>
          <div className="text-xs mb-3" style={{ color: '#A89F93' }}>Upload the state before the work was done</div>
          {beforePhoto ? (
            <div className="relative rounded-xl overflow-hidden h-32">
              <img src={beforePhoto} className="w-full h-full object-cover" alt="Before" />
              <button onClick={() => setBefore('')}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center text-sm">×</button>
            </div>
          ) : (
            <button onClick={() => beforeRef.current?.click()}
              className="w-full border-2 border-dashed rounded-xl p-4 text-center transition-colors"
              style={{ borderColor: '#F59E0B' }}>
              {uploadingB ? 'Uploading...' : '📷 Upload Before photo'}
            </button>
          )}
          <input ref={beforeRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, setBefore, setUploadingB) }} />
        </div>
      )}

      {/* Title */}
      <div className="mb-3">
        <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: '#A89F93' }}>Project title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Full exterior repaint — Miami Beach residence"
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9', background: '#F5F0E8', color: '#0A1628' }} />
      </div>

      {/* Description */}
      <div className="mb-4">
        <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: '#A89F93' }}>Description (optional)</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
          placeholder="Scope of work, materials used, challenges solved..."
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-400 resize-none transition-colors"
          style={{ borderColor: '#E8E2D9', background: '#F5F0E8', color: '#0A1628' }} />
      </div>

      {/* Toggles */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setIsJobSite(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border transition-all"
          style={isJobSite ? { background: '#14B8A6', color: '#fff', borderColor: '#14B8A6' } : { borderColor: '#E8E2D9', color: '#6B7280' }}>
          📍 GPS job site
        </button>
        <button onClick={() => { setIsBA(v => !v); setBefore('') }}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border transition-all"
          style={isBA ? { background: '#F59E0B', color: '#fff', borderColor: '#F59E0B' } : { borderColor: '#E8E2D9', color: '#6B7280' }}>
          ↔ Before/After
        </button>
      </div>

      <button onClick={save} disabled={saving || !photo || !title.trim()}
        className="w-full py-3 text-white text-sm font-bold rounded-xl disabled:opacity-40 transition-all"
        style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
        {saving ? 'Adding...' : 'Add to portfolio'}
      </button>
    </div>
  )
}

// ── Credential traffic-light card ─────────────────────────────────────────────
function CredCard({ lic }: { lic: any }) {
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const status = lic.license_status || 'unknown'
  const expiry = lic.license_expiry_date
  const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null

  const color = status === 'active' ? { border: '#22C55E', bg: 'rgba(34,197,94,0.06)', dot: '#22C55E', text: '#15803D', label: 'Active' }
    : status === 'expiring_soon' ? { border: '#F59E0B', bg: 'rgba(245,158,11,0.06)', dot: '#F59E0B', text: '#B45309', label: daysLeft !== null ? `Expiring in ${daysLeft}d` : 'Expiring' }
    : status === 'expired' ? { border: '#EF4444', bg: 'rgba(239,68,68,0.06)', dot: '#EF4444', text: '#B91C1C', label: 'Expired' }
    : { border: '#E8E2D9', bg: '#F5F0E8', dot: '#A89F93', text: '#6B7280', label: 'Unknown' }

  return (
    <div className="rounded-xl border overflow-hidden mb-2" style={{ borderColor: color.border, borderLeftWidth: '4px', background: color.bg }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color.dot }} />
          <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{lic.trade_name}</span>
          {lic.is_primary && <span className="text-xs px-1.5 py-0.5 bg-white border rounded" style={{ borderColor: '#E8E2D9', color: '#6B7280' }}>Primary</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold" style={{ color: color.text }}>{color.label}</span>
          {expiryStr && <span className="text-xs" style={{ color: '#A89F93' }}>exp {expiryStr}</span>}
        </div>
      </div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 pb-2.5 text-xs font-medium transition-colors"
        style={{ color: '#14B8A6' }}>
        Details {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-2 border-t bg-white" style={{ borderColor: '#E8E2D9' }}>
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs" style={{ color: '#0A1628' }}>
              {lic.license_number ? (
                <>
                  {lic.license_number.slice(0,4)}
                  <span style={{ color: '#A89F93' }}>{revealed ? lic.license_number.slice(4,-3) : '•••'}</span>
                  {lic.license_number.slice(-3)}
                  <button onClick={() => setRevealed(r => !r)} className="ml-2 underline text-xs" style={{ color: '#14B8A6' }}>{revealed ? 'hide' : 'reveal'}</button>
                </>
              ) : '—'}
            </div>
            {lic.license_number && (
              <a href={`https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=${encodeURIComponent(lic.license_number)}`}
                target="_blank" rel="noopener noreferrer" className="text-xs font-medium" style={{ color: '#14B8A6' }}>
                Verify with DBPR →
              </a>
            )}
          </div>
          {lic.license_expiry_date && (
            <div className="text-xs mt-1" style={{ color: '#6B7280' }}>
              Expires {new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [session, setSession]         = useState<any>(null)
  const [pro, setPro]                 = useState<any>(null)
  const [reviews, setReviews]         = useState<any[]>([])
  const [portfolio, setPortfolio]     = useState<any[]>([])
  const [proLicenses, setProLicenses] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [activeTab, setActiveTab]     = useState<Tab>('overview')
  const [lightbox, setLightbox]       = useState<string | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    const s   = raw ? JSON.parse(raw) : null
    if (s) setSession(s)

    Promise.all([
      fetch(`/api/pros/${id}${!s || s.id !== id ? '?view=1' : ''}`).then(r => r.json()),
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
      fetch(`/api/pro-licenses?pro_id=${id}`).then(r => r.json()).then(d => setProLicenses(d.licenses || []))
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
    if (navigator.share) navigator.share({ title: `${pro?.full_name} on ProGuild`, url: window.location.href })
    else { navigator.clipboard.writeText(window.location.href); setShowShareToast(true); setTimeout(() => setShowShareToast(false), 2500) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
      <div className="w-8 h-8 border-2 border-t-teal-500 rounded-full animate-spin" style={{ borderColor: '#E8E2D9', borderTopColor: '#14B8A6' }} />
    </div>
  )

  if (error || !pro) return (
    <div className="min-h-screen flex items-center justify-center text-center" style={{ background: '#F5F0E8' }}>
      <div>
        <div className="text-2xl font-bold mb-3" style={{ color: '#0A1628' }}>Pro not found</div>
        <Link href="/" className="text-sm" style={{ color: '#14B8A6' }}>← Back to search</Link>
      </div>
    </div>
  )

  const isOwner   = session?.id === id
  const trade     = pro.trade_category?.category_name || '—'
  const location  = [pro.city, pro.state].filter(Boolean).join(', ')
  const rating    = pro.avg_rating || 0
  const reviewCnt = pro.review_count || reviews.length || 0
  const firstName = pro.full_name.split(' ')[0]
  const hasLicense    = proLicenses.length > 0 || !!pro.license_number
  const hasOsha       = !!pro.osha_card_type
  const hasInsurance  = pro.insurance_status === 'active'
  const hasCredentials = hasLicense || hasOsha || hasInsurance

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',     label: 'Overview' },
    { id: 'work',         label: 'Work', count: portfolio.length },
    { id: 'reviews',      label: 'Reviews', count: reviewCnt },
    { id: 'credentials',  label: 'Credentials' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl">✕</button>
        </div>
      )}

      {showModal && <ContactModal pro={pro} onClose={() => setShowModal(false)} />}

      {showShareToast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">Link copied ✓</div>
      )}

      {/* ── OWNER BAR — only visible to the pro ──────────────────────────── */}
      {isOwner && (
        <div className="border-b" style={{ background: 'rgba(20,184,166,0.06)', borderColor: 'rgba(20,184,166,0.2)' }}>
          <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: '#0D7377' }}>
              <span>👁</span>
              <span className="font-medium">You're viewing your public profile</span>
              <span className="text-xs hidden sm:inline" style={{ color: '#A89F93' }}>— This is what homeowners and pros see</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/edit-profile"
                className="text-xs font-bold px-4 py-1.5 rounded-lg text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                ✏️ Edit profile
              </Link>
              <Link href="/dashboard"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: 'rgba(20,184,166,0.3)', color: '#0D7377' }}>
                Dashboard →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#nav-g)"/><text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text><defs><linearGradient id="nav-g" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#0D7377"/></linearGradient></defs></svg>
            </div>
            <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#14B8A6', fontWeight: 300 }}>.ai</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/search" className="text-xs hidden sm:block transition-colors" style={{ color: '#A89F93' }}>← Find a pro</Link>
            {session && !isOwner && (
              <button onClick={toggleFollow}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border transition-all"
                style={isFollowing
                  ? { borderColor: '#E8E2D9', color: '#6B7280' }
                  : { background: 'linear-gradient(135deg, #14B8A6, #0D7377)', color: '#fff', borderColor: '#14B8A6' }}>
                {isFollowing ? '✓ Following' : '+ Follow'}
              </button>
            )}
            {!isOwner && (
              <button onClick={() => setShowModal(true)}
                className="text-xs font-bold px-4 py-2 rounded-lg text-white sm:hidden"
                style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                Contact
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 pt-6">
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>

          {/* Cover / header area */}
          <div className="relative h-28 sm:h-36"
            style={{ background: pro.cover_image_url ? undefined : 'linear-gradient(135deg, #0A1628, #0D2D4A)' }}>
            {pro.cover_image_url && (
              <>
                <img src={pro.cover_image_url} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'rgba(10,22,40,0.6)' }} />
              </>
            )}
          </div>

          {/* Profile info */}
          <div className="px-5 sm:px-7 pb-5">
            {/* Avatar — overlaps cover */}
            <div className="flex items-end justify-between -mt-10 mb-4">
              <div className="relative">
                <ProAvatar pro={pro} size="w-20 h-20" />
                {pro.available_for_work && (
                  <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2 border-white" style={{ background: '#22C55E' }} />
                )}
              </div>
              {/* Desktop contact CTA */}
              {!isOwner && (
                <button onClick={() => setShowModal(true)}
                  className="hidden sm:flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                  Contact {firstName}
                </button>
              )}
            </div>

            {/* Name + trade */}
            <h1 className="text-xl sm:text-2xl font-bold mb-0.5" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              {pro.full_name}
            </h1>
            <div className="text-sm font-semibold mb-0.5" style={{ color: '#14B8A6' }}>{trade}</div>
            <div className="text-sm mb-3" style={{ color: '#A89F93' }}>
              📍 {location || 'Florida'}
              {pro.years_experience ? ` · ${pro.years_experience} yrs exp` : ''}
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-2">
              {pro.is_verified && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(20,184,166,0.1)', color: '#0D7377', border: '1px solid rgba(20,184,166,0.25)' }}>
                  <ShieldBadge size={13} /> Guild Verified
                </span>
              )}
              {pro.available_for_work && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#15803D', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22C55E' }} /> Available now
                </span>
              )}
              {hasLicense && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: '#F5F0E8', color: '#6B7280', border: '1px solid #E8E2D9' }}>
                  🏛 DBPR Licensed
                </span>
              )}
              {hasOsha && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: '#F5F0E8', color: '#6B7280', border: '1px solid #E8E2D9' }}>
                  🦺 {pro.osha_card_type}
                </span>
              )}
              {hasInsurance && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: '#F5F0E8', color: '#6B7280', border: '1px solid #E8E2D9' }}>
                  🛡 Insured
                </span>
              )}
              {isElite(pro.plan_tier) && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.25)' }}>
                  ✦ Elite Pro
                </span>
              )}
            </div>

            {/* Rating row */}
            {rating > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-amber-400 text-sm">{starsHtml(rating)}</span>
                <span className="text-sm font-bold" style={{ color: '#0A1628' }}>{rating.toFixed(1)}</span>
                <span className="text-sm" style={{ color: '#A89F93' }}>({reviewCnt} reviews)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 mt-4">
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
          <div className="flex border-b overflow-x-auto scrollbar-hide" style={{ borderColor: '#E8E2D9' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex-shrink-0 flex items-center gap-1.5 px-5 py-3.5 text-sm font-semibold transition-all border-b-2"
                style={activeTab === tab.id
                  ? { borderBottomColor: '#14B8A6', color: '#14B8A6' }
                  : { borderBottomColor: 'transparent', color: '#6B7280' }}>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                    style={activeTab === tab.id
                      ? { background: 'rgba(20,184,166,0.15)', color: '#14B8A6' }
                      : { background: '#F5F0E8', color: '#A89F93' }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── TAB CONTENT ──────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 py-5">
        <div className="flex gap-5">

          {/* Main content */}
          <div className="flex-1 min-w-0">

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-4">

                {/* Bio */}
                {pro.bio && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                    <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#A89F93' }}>About {firstName}</div>
                    <p className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>{pro.bio}</p>
                  </div>
                )}

                {/* Quick stats */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { n: portfolio.length || '—', l: 'Projects' },
                      { n: reviewCnt > 0 ? rating.toFixed(1) : '—', l: 'Rating' },
                      { n: pro.years_experience ? `${pro.years_experience}yr` : '—', l: 'Experience' },
                    ].map(s => (
                      <div key={s.l}>
                        <div className="text-2xl font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>{s.n}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#A89F93' }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top 4 portfolio photos preview */}
                {portfolio.length > 0 && (
                  <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
                    <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>Project work</div>
                      <button onClick={() => setActiveTab('work')} className="text-xs font-semibold" style={{ color: '#14B8A6' }}>
                        See all {portfolio.length} →
                      </button>
                    </div>
                    <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {portfolio.slice(0, 4).map(item => (
                        <div key={item.id} className="rounded-xl overflow-hidden bg-stone-100 aspect-square cursor-pointer"
                          onClick={() => item.photo_url && setLightbox(item.is_before_after && item.before_photo_url ? {after:item.photo_url,before:item.before_photo_url,title:item.title} : {after:item.photo_url})}>
                          {item.is_before_after && item.before_photo_url && item.photo_url
                            ? <BeforeAfterSlider afterUrl={item.photo_url} beforeUrl={item.before_photo_url} title={item.title} />
                            : item.photo_url
                              ? <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                              : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: '#E8E2D9' }}>🖼</div>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top 2 reviews preview */}
                {reviews.length > 0 && (
                  <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
                    <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>Recent reviews</div>
                      <button onClick={() => setActiveTab('reviews')} className="text-xs font-semibold" style={{ color: '#14B8A6' }}>
                        See all {reviewCnt} →
                      </button>
                    </div>
                    <div className="px-4 pb-4 space-y-3">
                      {reviews.slice(0, 2).map(rev => (
                        <div key={rev.id} className="p-4 rounded-xl" style={{ background: '#F5F0E8' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="font-semibold text-sm" style={{ color: '#0A1628' }}>{rev.reviewer_name || 'Anonymous'}</div>
                            <div className="text-amber-400 text-xs">{starsHtml(rev.rating)}</div>
                          </div>
                          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: '#6B7280' }}>{rev.review_text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trust strip */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { icon: '🛡', t: hasCredentials ? 'License Verified' : 'Profile Created', s: hasCredentials ? 'Florida DBPR database check' : 'Awaiting verification' },
                      { icon: '✦', t: 'Zero Lead Fees', s: 'Direct contact, no middleman' },
                      { icon: '⭐', t: rating > 0 ? `${rating.toFixed(1)} Star Rating` : 'New Member', s: rating > 0 ? `${reviewCnt} verified reviews` : 'References available on request' },
                    ].map(item => (
                      <div key={item.t} className="flex items-start gap-3">
                        <div className="text-xl flex-shrink-0">{item.icon}</div>
                        <div>
                          <div className="text-xs font-bold" style={{ color: '#0A1628' }}>{item.t}</div>
                          <div className="text-xs mt-0.5" style={{ color: '#A89F93' }}>{item.s}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* WORK TAB */}
            {activeTab === 'work' && (
              <div>
                {isOwner && (
                  <AddWorkItem proId={id} onAdded={item => setPortfolio(p => [item, ...p])} />
                )}
                {portfolio.length === 0 ? (
                  <div className="bg-white rounded-2xl border py-16 text-center" style={{ borderColor: '#E8E2D9' }}>
                    <div className="text-4xl mb-3 opacity-20">🖼</div>
                    <div className="font-bold mb-1" style={{ color: '#0A1628' }}>No project photos yet</div>
                    <div className="text-sm" style={{ color: '#A89F93' }}>{isOwner ? 'Add your first project photo above.' : `${firstName} hasn't added portfolio photos yet.`}</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {portfolio.map(item => (
                      <div key={item.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
                        <div className="relative aspect-video cursor-pointer"
                          onClick={() => item.photo_url && setLightbox(item.is_before_after && item.before_photo_url ? {after:item.photo_url,before:item.before_photo_url,title:item.title} : {after:item.photo_url})}>
                          {item.is_before_after && item.before_photo_url && item.photo_url
                            ? <BeforeAfterSlider afterUrl={item.photo_url} beforeUrl={item.before_photo_url} title={item.title} />
                            : item.photo_url
                              ? <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                              : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: '#F5F0E8', color: '#E8E2D9' }}>🖼</div>
                          }
                          {item.is_job_site && !item.is_before_after && (
                            <div className="absolute top-2 left-2 bg-green-700/90 rounded-full px-2 py-0.5">
                              <span className="text-white text-xs font-bold">✓ GPS</span>
                            </div>
                          )}
                          {item.is_before_after && (
                            <div className="absolute top-2 left-2 bg-amber-600/90 rounded-full px-2 py-0.5">
                              <span className="text-white text-xs font-bold">↔ Before/After</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="font-semibold text-sm mb-0.5" style={{ color: '#0A1628' }}>{item.title || 'Untitled'}</div>
                          {item.description && <div className="text-xs line-clamp-2" style={{ color: '#6B7280' }}>{item.description}</div>}
                          {item.location_label && <div className="text-xs mt-1" style={{ color: '#A89F93' }}>📍 {item.location_label}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* REVIEWS TAB */}
            {activeTab === 'reviews' && (
              <div className="space-y-4">
                {/* Rating summary */}
                {rating > 0 && (
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-5xl font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>{rating.toFixed(1)}</div>
                        <div className="text-amber-400 text-lg mt-1">{starsHtml(rating)}</div>
                        <div className="text-xs mt-1" style={{ color: '#A89F93' }}>{reviewCnt} reviews</div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {[5,4,3,2,1].map(star => {
                          const cnt = reviews.filter(r => Math.round(r.rating) === star).length
                          const pct = reviewCnt > 0 ? (cnt / reviewCnt) * 100 : 0
                          return (
                            <div key={star} className="flex items-center gap-2 text-xs">
                              <span className="w-3 text-right" style={{ color: '#A89F93' }}>{star}</span>
                              <div className="flex-1 rounded-full h-1.5" style={{ background: '#F5F0E8' }}>
                                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: '#F59E0B' }} />
                              </div>
                              <span className="w-4" style={{ color: '#A89F93' }}>{cnt}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Write review CTA */}
                {!isOwner && (
                  <a href={`/reviews/${id}`}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border font-semibold text-sm transition-all"
                    style={{ borderColor: '#E8E2D9', color: '#0A1628', background: '#fff' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#14B8A6'; e.currentTarget.style.color = '#14B8A6' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#0A1628' }}>
                    ⭐ Write a review
                  </a>
                )}

                {/* Review list */}
                {reviews.length === 0 ? (
                  <div className="bg-white rounded-2xl border py-16 text-center" style={{ borderColor: '#E8E2D9' }}>
                    <div className="text-4xl mb-3 opacity-20">⭐</div>
                    <div className="font-bold mb-1" style={{ color: '#0A1628' }}>No reviews yet</div>
                    <div className="text-sm" style={{ color: '#A89F93' }}>{isOwner ? 'Reviews from customers will appear here.' : 'Be the first to leave a review!'}</div>
                  </div>
                ) : reviews.map(rev => (
                  <div key={rev.id} className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-sm" style={{ color: '#0A1628' }}>{rev.reviewer_name || 'Anonymous'}</div>
                        <div className="text-amber-400 text-sm mt-0.5">{starsHtml(rev.rating)}</div>
                      </div>
                      <div className="text-xs" style={{ color: '#A89F93' }}>{formatReviewDate(rev.reviewed_at || rev.created_at)}</div>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>{rev.review_text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* CREDENTIALS TAB */}
            {activeTab === 'credentials' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>License verification</div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(20,184,166,0.1)', color: '#0D7377', border: '1px solid rgba(20,184,166,0.2)' }}>
                      🛡 Florida DBPR
                    </span>
                  </div>

                  {proLicenses.length > 0
                    ? proLicenses.map(lic => <CredCard key={lic.id} lic={lic} />)
                    : pro.license_number
                      ? <CredCard lic={{ id: 'legacy', trade_name: trade, license_number: pro.license_number, license_expiry_date: pro.license_expiry_date, license_status: pro.license_status || 'unknown', is_primary: true }} />
                      : <div className="text-sm py-4 text-center" style={{ color: '#A89F93' }}>No license on file</div>
                  }

                  {hasOsha && (
                    <div className="rounded-xl border px-4 py-3 mb-2 flex items-center justify-between mt-2"
                      style={{ borderColor: '#22C55E', borderLeftWidth: '4px', background: 'rgba(34,197,94,0.06)' }}>
                      <div className="flex items-center gap-2.5">
                        <span>🦺</span>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>{pro.osha_card_type} Safety</div>
                          {pro.osha_card_expiry && <div className="text-xs" style={{ color: '#6B7280' }}>Expires {new Date(pro.osha_card_expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
                        </div>
                      </div>
                      <span className="text-xs font-bold" style={{ color: '#15803D' }}>Active</span>
                    </div>
                  )}

                  {hasInsurance && (
                    <div className="rounded-xl border px-4 py-3 flex items-center justify-between"
                      style={{ borderColor: '#22C55E', borderLeftWidth: '4px', background: 'rgba(34,197,94,0.06)' }}>
                      <div className="flex items-center gap-2.5">
                        <span>🛡</span>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>General Liability Insurance</div>
                          {pro.insurance_expiry_date && <div className="text-xs" style={{ color: '#6B7280' }}>Expires {new Date(pro.insurance_expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
                        </div>
                      </div>
                      <span className="text-xs font-bold" style={{ color: '#15803D' }}>Active</span>
                    </div>
                  )}

                  {!hasCredentials && (
                    <div className="text-sm py-8 text-center" style={{ color: '#A89F93' }}>
                      <div className="text-3xl mb-2 opacity-20">🏛</div>
                      No credentials on file yet
                    </div>
                  )}

                  <p className="text-xs mt-4 text-center" style={{ color: '#C4BAB0' }}>
                    All licenses verified against Florida Dept. of Business & Professional Regulation
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── STICKY SIDEBAR — desktop only ────────────────────────────── */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-20 space-y-4">

              {/* Contact CTA */}
              {!isOwner && (
                <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E8E2D9' }}>
                  <button onClick={() => setShowModal(true)}
                    className="w-full py-3 text-white text-sm font-bold rounded-xl mb-3 transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                    Contact {firstName}
                  </button>
                  {pro.phone && (
                    <a href={`tel:${pro.phone}`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border text-sm font-semibold transition-all"
                      style={{ borderColor: '#E8E2D9', color: '#0A1628' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#14B8A6'; e.currentTarget.style.color = '#14B8A6' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#0A1628' }}>
                      📞 Call {firstName}
                    </a>
                  )}
                  <p className="text-xs text-center mt-3" style={{ color: '#C4BAB0' }}>Free · No lead fees · Direct contact</p>
                </div>
              )}

              {/* Owner shortcuts */}
              {isOwner && (
                <div className="bg-white rounded-2xl border p-4 space-y-2" style={{ borderColor: '#E8E2D9' }}>
                  <Link href="/edit-profile"
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-white text-sm font-bold rounded-xl transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                    ✏️ Edit profile
                  </Link>
                  <Link href="/dashboard"
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                    style={{ borderColor: '#E8E2D9', color: '#6B7280' }}>
                    📊 Dashboard
                  </Link>
                  <button onClick={shareProfile}
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                    style={{ borderColor: '#E8E2D9', color: '#6B7280' }}>
                    🔗 Share profile
                  </button>
                </div>
              )}

              {/* Follow */}
              {session && !isOwner && (
                <button onClick={toggleFollow}
                  className="w-full py-2.5 text-sm font-bold rounded-xl border transition-all"
                  style={isFollowing
                    ? { borderColor: '#E8E2D9', color: '#6B7280', background: '#fff' }
                    : { borderColor: '#14B8A6', color: '#0D7377', background: 'rgba(20,184,166,0.05)' }}>
                  {isFollowing ? '✓ Following' : '+ Follow'}
                </button>
              )}

              {/* Quick stats */}
              <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E8E2D9' }}>
                <div className="space-y-3">
                  {[
                    { icon: '🖼', label: `${portfolio.length} project photos` },
                    { icon: '⭐', label: rating > 0 ? `${rating.toFixed(1)} stars · ${reviewCnt} reviews` : 'No reviews yet' },
                    { icon: '📍', label: location || 'Florida' },
                    ...(pro.years_experience ? [{ icon: '🏗', label: `${pro.years_experience} years experience` }] : []),
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2.5 text-xs" style={{ color: '#6B7280' }}>
                      <span className="text-sm">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY FOOTER ─────────────────────────────────────────── */}
      {!isOwner && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-40" style={{ borderColor: '#E8E2D9', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <div className="flex gap-3 px-4 pt-3 max-w-sm mx-auto">
            {pro.phone ? (
              <a href={`tel:${pro.phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-xl"
                style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                📞 Call
              </a>
            ) : (
              <button onClick={() => setShowModal(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-xl"
                style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
                Contact
              </button>
            )}
            <button onClick={() => setShowModal(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl border"
              style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
              💬 Message
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t py-8 px-6 mt-8" style={{ borderColor: '#E8E2D9', background: '#fff', paddingBottom: !isOwner ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#14B8A6', fontWeight: 300 }}>.ai</span></span>
          <div className="flex gap-4 text-xs" style={{ color: '#A89F93' }}>
            {[['/', 'Home'],['/search', 'Find a Pro'],['/privacy', 'Privacy'],['/terms', 'Terms']].map(([href, label]) => (
              <Link key={href} href={href} style={{ color: '#A89F93' }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
