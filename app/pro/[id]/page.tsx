'use client'
import { useState, useEffect, useRef } from 'react'
import { useProSession } from '@/lib/hooks/useProSession'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { initials, avatarColor, starsHtml, formatReviewDate, isPaid, isElite, proFirstName, proDisplayName, tradeDisplayName } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'work' | 'reviews' | 'credentials'

// State abbreviation → full name (US states ProGuild may expand to)
const STATE_NAMES: Record<string, string> = {
  FL: 'Florida', TX: 'Texas', GA: 'Georgia', CA: 'California',
  NC: 'North Carolina', SC: 'South Carolina', TN: 'Tennessee',
  AL: 'Alabama', MS: 'Mississippi', LA: 'Louisiana', AR: 'Arkansas',
  VA: 'Virginia', MD: 'Maryland', OH: 'Ohio', PA: 'Pennsylvania',
  NY: 'New York', NJ: 'New Jersey', CT: 'Connecticut', MA: 'Massachusetts',
  IL: 'Illinois', MI: 'Michigan', IN: 'Indiana', MO: 'Missouri',
  AZ: 'Arizona', NV: 'Nevada', CO: 'Colorado', WA: 'Washington',
  OR: 'Oregon', UT: 'Utah', MN: 'Minnesota', WI: 'Wisconsin',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProAvatar({ pro, size }: { pro: any; size: string }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  if (pro?.profile_photo_url)
    return <img src={pro.profile_photo_url} alt={proDisplayName(pro.full_name)}
      className={`${size} rounded-full object-cover flex-shrink-0 ring-2 ring-white/40`} />
  return (
    <div className={`${size} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ring-2 ring-white/30`}
      style={{ background: bg, color: fg, fontSize: '0.95rem', letterSpacing: '0.02em' }}>
      {initials(pro?.full_name || 'A')}
    </div>
  )
}

function ShieldBadge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#pg)"/>
      <path d="M11 16l3 3 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs><linearGradient id="pg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/>
      </linearGradient></defs>
    </svg>
  )
}

function CheckIcon({ size = 16, color = '#0F766E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function BeforeAfterSlider({ afterUrl, beforeUrl, title, showLabels = false }: { afterUrl: string; beforeUrl: string; title: string; showLabels?: boolean }) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  function updatePos(clientX: number) {
    if (!containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    setPos(Math.min(95, Math.max(5, ((clientX - r.left) / r.width) * 100)))
  }

  const containerW = containerRef.current?.offsetWidth || 0

  return (
    <div ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden"
      onMouseMove={e => updatePos(e.clientX)}
      onTouchMove={e => updatePos(e.touches[0].clientX)}>
      <img src={afterUrl} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute top-0 left-0 bottom-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img src={beforeUrl} alt="Before"
          className="absolute top-0 left-0 h-full object-cover"
          style={{ width: containerW > 0 ? `${containerW}px` : '100%' }} />
      </div>
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-xs font-bold text-gray-600 cursor-ew-resize">↔</div>
      </div>
      {showLabels && (
        <>
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">Before</div>
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">After</div>
        </>
      )}
    </div>
  )
}

// ── Contact Modal — 4 states: claimed+active, claimed+expired, unclaimed, owner-never-shown ──
function ContactModal({ pro, onClose }: { pro: any; onClose: () => void }) {
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [email, setEmail]     = useState('')
  const [address, setAddress] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]       = useState(false)
  const [err, setErr]         = useState('')
  const firstName = proFirstName(pro.full_name)

  function formatPhone(v: string): string {
    const d = v.replace(/\D/g, '').slice(0, 10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  }

  async function send() {
    if (!name || !phone) { setErr('Name and phone are required'); return }
    setSubmitting(true); setErr('')
    const r = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id:           pro.id,
        contact_name:     name,
        contact_email:    email || `${phone.replace(/\D/g,'')}@sms.placeholder`,
        contact_phone:    phone,
        property_address: address || null,
        message:          message || 'Contact request',
        lead_source:      'Profile_Page',
      }),
    })
    setSubmitting(false)
    if (r.ok) setDone(true)
    else setErr('Could not send — please try again.')
  }

  const subtext = pro.is_claimed
    ? 'Ready to discuss your project?'
    : 'Send them a message — they\'ll be notified'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(15,118,110,0.1)' }}>
              <CheckIcon size={24} />
            </div>
            <div className="font-bold text-gray-900 mb-1">Message sent!</div>
            <div className="text-sm" style={{ color: '#6B7280' }}>{firstName} will be in touch soon.</div>
            <button onClick={onClose} className="mt-5 text-sm font-semibold" style={{ color: '#0F766E' }}>Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b" style={{ borderColor: '#E8E2D9' }}>
              <div>
                <div className="font-bold" style={{ color: '#0A1628' }}>Contact {firstName}</div>
                <div className="text-sm mt-0.5" style={{ color: '#6B7280' }}>{subtext}</div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {err && <div className="p-2.5 bg-red-50 text-red-600 text-xs rounded-xl">{err}</div>}
              {[
                { lbl: 'Your name *',      val: name,    set: setName,    ph: 'James Smith',            type: 'text' },
                { lbl: 'Phone *',          val: phone,   set: (v: string) => setPhone(formatPhone(v)),  ph: '(555) 000-0000',        type: 'tel' },
                { lbl: 'Email',            val: email,   set: setEmail,   ph: 'you@email.com',          type: 'email' },
                { lbl: 'Property address', val: address, set: setAddress, ph: '123 Main St, Tampa FL',  type: 'text' },
              ].map(f => (
                <div key={f.lbl}>
                  <label className="text-xs font-bold uppercase tracking-wide block mb-1" style={{ color: '#A89F93' }}>{f.lbl}</label>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:border-teal-400 transition-colors"
                    style={{ borderColor: '#E8E2D9', background: '#FAF9F6' }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold uppercase tracking-wide block mb-1" style={{ color: '#A89F93' }}>Job description</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  placeholder="Briefly describe what you need..."
                  className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:border-teal-400 resize-none transition-colors"
                  style={{ borderColor: '#E8E2D9', background: '#FAF9F6' }} />
              </div>
              <button onClick={send} disabled={submitting}
                className="w-full py-3 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                {submitting ? 'Sending...' : `Send message to ${firstName} →`}
              </button>
              <p className="text-xs text-center" style={{ color: '#A89F93' }}>Free · Direct · No middleman</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Portfolio add form ────────────────────────────────────────────────────────
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
    if (r.ok) { onAdded(d.item); setPhoto(''); setTitle(''); setDesc(''); setIsJobSite(false); setIsBA(false); setBefore(''); setError('') }
    else { setError(d.error || 'Could not add item') }
  }

  return (
    <div className="bg-white rounded-2xl border p-5 mb-6" style={{ borderColor: '#E8E2D9' }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#A89F93' }}>Add project photo</div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">{error}</div>}
      {isBA && (
        <div className="mb-4 p-3 rounded-xl flex items-start gap-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span className="text-lg flex-shrink-0">↔</span>
          <div className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
            <strong>Before/After mode:</strong> Step 1 — upload the AFTER photo. Step 2 — upload the BEFORE photo.
          </div>
        </div>
      )}
      <div className="mb-4">
        {isBA && <div className="text-xs font-bold mb-1.5 px-1" style={{ color: '#F59E0B' }}>STEP 1 — AFTER photo</div>}
        {photo ? (
          <div className="relative rounded-xl overflow-hidden aspect-video bg-gray-100">
            <img src={photo} className="w-full h-full object-cover" alt="Project" />
            <button onClick={() => setPhoto('')} className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center text-sm hover:bg-black/80 transition-colors">×</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors"
            style={{ borderColor: '#E8E2D9' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#0F766E'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E2D9'}>
            {uploading ? <span className="text-sm" style={{ color: '#A89F93' }}>Uploading...</span> : (
              <><div className="text-2xl mb-2">📷</div>
              <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>Click to upload photo</div>
              <div className="text-xs mt-1" style={{ color: '#A89F93' }}>JPG, PNG or WebP · Max 5MB</div></>
            )}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, setPhoto, setUploading) }} />
      </div>
      {isBA && (
        <div className="mb-4 p-4 rounded-xl border" style={{ background: 'rgba(245,240,232,0.5)', borderColor: '#E8E2D9' }}>
          <div className="text-xs font-bold mb-1" style={{ color: '#F59E0B' }}>STEP 2 — BEFORE photo</div>
          <div className="text-xs mb-3" style={{ color: '#A89F93' }}>Upload the state before the work was done</div>
          {beforePhoto ? (
            <div className="relative rounded-xl overflow-hidden h-32">
              <img src={beforePhoto} className="w-full h-full object-cover" alt="Before" />
              <button onClick={() => setBefore('')} className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center text-sm">×</button>
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
      <div className="mb-3">
        <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: '#A89F93' }}>Project title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Full exterior repaint — Miami Beach residence"
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9', background: '#FAF9F6', color: '#0A1628' }} />
      </div>
      <div className="mb-4">
        <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: '#A89F93' }}>Description (optional)</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
          placeholder="Scope of work, materials used, challenges solved..."
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-400 resize-none transition-colors"
          style={{ borderColor: '#E8E2D9', background: '#FAF9F6', color: '#0A1628' }} />
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setIsJobSite(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border transition-all"
          style={isJobSite ? { background: '#0F766E', color: '#fff', borderColor: '#0F766E' } : { borderColor: '#E8E2D9', color: '#6B7280' }}>
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
        style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
        {saving ? 'Adding...' : 'Add to portfolio'}
      </button>
    </div>
  )
}

// ── Credential card — ACTIVE as green pill ────────────────────────────────────
function CredCard({ lic }: { lic: any }) {
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const status = lic.license_status || 'unknown'
  const expiry = lic.license_expiry_date
  const expiryStr = expiry ? new Date(expiry).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null

  const color = status === 'active'
    ? { border: '#22C55E', bg: 'rgba(34,197,94,0.05)', dot: '#22C55E', text: '#15803D', label: 'Active', pillBg: 'rgba(34,197,94,0.12)', pillBorder: 'rgba(34,197,94,0.3)' }
    : status === 'expiring_soon'
    ? { border: '#F59E0B', bg: 'rgba(245,158,11,0.05)', dot: '#F59E0B', text: '#B45309', label: daysLeft !== null ? `Expiring in ${daysLeft}d` : 'Expiring', pillBg: 'rgba(245,158,11,0.12)', pillBorder: 'rgba(245,158,11,0.3)' }
    : status === 'expired'
    ? { border: '#EF4444', bg: 'rgba(239,68,68,0.05)', dot: '#EF4444', text: '#B91C1C', label: 'Expired', pillBg: 'rgba(239,68,68,0.12)', pillBorder: 'rgba(239,68,68,0.3)' }
    : { border: '#E8E2D9', bg: '#FAF9F6', dot: '#A89F93', text: '#6B7280', label: 'Unknown', pillBg: '#F0EDE8', pillBorder: '#E8E2D9' }

  return (
    <div className="rounded-xl border overflow-hidden mb-3" style={{ borderColor: color.border, borderLeftWidth: '4px', background: color.bg }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color.dot }} />
          <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{lic.trade_name}</span>
          {lic.is_primary && (
            <span className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: '#E8E2D9', color: '#6B7280', background: '#fff' }}>Primary</span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {/* ACTIVE as green pill — spec item #7 */}
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: color.pillBg, color: color.text, border: `1px solid ${color.pillBorder}` }}>
            ● {color.label}
          </span>
          {expiryStr && <span className="text-xs hidden sm:inline" style={{ color: '#A89F93' }}>Expires {expiryStr}</span>}
        </div>
      </div>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 pb-2.5 text-xs font-medium" style={{ color: '#0F766E' }}>
        License details {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t bg-white" style={{ borderColor: '#E8E2D9' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="font-mono text-xs" style={{ color: '#0A1628' }}>
              {lic.license_number ? (
                <>
                  {lic.license_number.slice(0,4)}
                  <span style={{ color: '#A89F93' }}>{revealed ? lic.license_number.slice(4,-3) : '•••'}</span>
                  {lic.license_number.slice(-3)}
                  <button onClick={() => setRevealed(r => !r)} className="ml-2 underline text-xs" style={{ color: '#0F766E' }}>{revealed ? 'hide' : 'reveal'}</button>
                </>
              ) : '—'}
            </div>
            {lic.license_number && (
              <a href={`https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=${encodeURIComponent(lic.license_number)}`}
                target="_blank" rel="noopener noreferrer" className="text-xs font-semibold" style={{ color: '#0F766E' }}>
                Verify on Florida DBPR →
              </a>
            )}
          </div>
          {lic.license_expiry_date && (
            <div className="text-xs mt-1.5" style={{ color: '#6B7280' }}>
              Expires {new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-3 text-xs" style={{ color: '#0F766E' }}>
            <CheckIcon size={13} />
            <span>Verified with Florida Department of Business &amp; Professional Regulation</span>
          </div>
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
  const { session: _real } = useProSession()
  const [pro, setPro]                 = useState<any>(null)
  const [reviews, setReviews]         = useState<any[]>([])
  const [portfolio, setPortfolio]     = useState<any[]>([])
  const [proLicenses, setProLicenses] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [activeTab, setActiveTab]     = useState<Tab>('overview')
  const [lightbox, setLightbox]       = useState<{after:string;before?:string;title?:string} | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)

  useEffect(() => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const s = _real
    if (_real) setSession(_real)

    if (!UUID_RE.test(id)) {
      fetch(`/api/pros/slug?slug=${encodeURIComponent(id)}`)
        .then(r => r.json())
        .then(d => {
          if (d.pro_id) router.replace(`/pro/${d.pro_id}`)
          else { setError('Pro not found'); setLoading(false) }
        })
        .catch(() => { setError('Could not load profile'); setLoading(false) })
      return
    }

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
  }, [id, _real])

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
    if (navigator.share) navigator.share({ title: `${displayName} on ProGuild`, url: window.location.href })
    else { navigator.clipboard.writeText(window.location.href); setShowShareToast(true); setTimeout(() => setShowShareToast(false), 2500) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAF9F6' }}>
      <div className="w-8 h-8 border-2 border-t-teal-500 rounded-full animate-spin" style={{ borderColor: '#E8E2D9', borderTopColor: '#0F766E' }} />
    </div>
  )

  if (error || !pro) return (
    <div className="min-h-screen flex items-center justify-center text-center" style={{ background: '#FAF9F6' }}>
      <div>
        <div className="text-2xl font-bold mb-3" style={{ color: '#0A1628' }}>Pro not found</div>
        <Link href="/" className="text-sm" style={{ color: '#0F766E' }}>← Back to search</Link>
      </div>
    </div>
  )

  const isOwner    = session?.id === id
  // Use slug first (more reliable), fallback to category_name raw value
  const trade      = tradeDisplayName(pro.trade_category?.slug || pro.trade_category?.category_name)
  const location   = [pro.city, pro.state].filter(Boolean).join(', ')
  const rating     = pro.avg_rating || 0
  const reviewCnt  = pro.review_count || reviews.length || 0
  const firstName  = proFirstName(pro.full_name)
  // spec item #1: display name always parsed, never raw DBPR
  const displayName = proDisplayName(pro.full_name)
  const hasLicense    = proLicenses.length > 0 || !!pro.license_number
  const hasOsha       = !!pro.osha_card_type
  const hasInsurance  = pro.insurance_status === 'active'
  const hasCredentials = hasLicense || hasOsha || hasInsurance
  const trialActive = pro.trial_ends_at ? new Date(pro.trial_ends_at) > new Date() : false
  const showPhone   = pro.is_claimed && (isPaid(pro.plan_tier) || trialActive)
  // spec item #5: 4-state contact card logic
  // state A: claimed + paid/trial  → full CTA
  // state B: claimed + trial expired → CTA but phone gated
  // state C: unclaimed              → softer CTA, no Guild Verified
  const contactState: 'claimed-active' | 'claimed-expired' | 'unclaimed' =
    pro.is_claimed
      ? (isPaid(pro.plan_tier) || trialActive) ? 'claimed-active' : 'claimed-expired'
      : 'unclaimed'

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',    label: 'Overview' },
    { id: 'work',        label: 'Work', count: portfolio.length },
    { id: 'reviews',     label: 'Reviews', count: reviewCnt },
    { id: 'credentials', label: 'Credentials' },
  ]

  const siteUrl = 'https://proguild.ai'
  // spec item #9: SEO title + meta description using display name
  const metaTitle = `${displayName} — Licensed ${trade} in ${location || 'Florida'} | ProGuild`
  const metaDesc  = `Contact ${displayName}, a DBPR-verified ${trade.toLowerCase()} in ${location || 'Florida'}.${pro.license_number ? ` License #${pro.license_number} — Active through ${pro.license_expiry_date ? new Date(pro.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'current'}.` : ''}`

  const proSchema = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ProfessionalService'],
    '@id': `${siteUrl}/pro/${pro.id}`,
    name: displayName,
    url: `${siteUrl}/pro/${pro.id}`,
    description: pro.bio || `Licensed ${trade} in ${location}. DBPR verified.`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: pro.city || '',
      addressRegion: pro.state || 'FL',
      addressCountry: 'US',
    },
    ...(pro.license_number ? { identifier: { '@type': 'PropertyValue', name: 'DBPR License', value: pro.license_number } } : {}),
    ...(pro.is_verified ? { hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'license', recognizedBy: { '@type': 'Organization', name: 'Florida DBPR' } } } : {}),
    ...(reviewCnt > 0 && pro.avg_rating > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: pro.avg_rating.toFixed(1), reviewCount: reviewCnt, bestRating: 5, worstRating: 1 } } : {}),
  }

  return (
    <>
      {/* spec item #9: dynamic title + meta */}
      <title>{metaTitle}</title>
      <meta name="description" content={metaDesc} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(proSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

        {/* Lightbox */}
        {lightbox && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white text-2xl z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">✕</button>
            {lightbox.before ? (
              <div className="w-full max-w-4xl" style={{ height: '80vh' }} onClick={e => e.stopPropagation()}>
                <BeforeAfterSlider afterUrl={lightbox.after} beforeUrl={lightbox.before} title={lightbox.title || ''} showLabels={true} />
              </div>
            ) : (
              <img src={lightbox.after} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" onClick={e => e.stopPropagation()} />
            )}
          </div>
        )}

        {showModal && <ContactModal pro={pro} onClose={() => setShowModal(false)} />}

        {showShareToast && (
          <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">Link copied ✓</div>
        )}

        {/* ── OWNER BAR ──────────────────────────────────────────────────── */}
        {isOwner && (
          <div className="border-b" style={{ background: 'rgba(20,184,166,0.06)', borderColor: 'rgba(20,184,166,0.2)' }}>
            <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm" style={{ color: '#0C5F57' }}>
                <span>👁</span>
                <span className="font-medium">You're viewing your public profile</span>
                <span className="text-xs hidden sm:inline" style={{ color: '#A89F93' }}>— This is what homeowners see</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/edit-profile"
                  className="text-xs font-bold px-4 py-1.5 rounded-lg text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                  ✏️ Edit profile
                </Link>
                <Link href="/dashboard"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: 'rgba(20,184,166,0.3)', color: '#0C5F57' }}>
                  Dashboard →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── NAV ────────────────────────────────────────────────────────── */}
        <Navbar />

        {/* ── HERO — spec items #2 (compressed), #3 (avatar 80px), #10 (icons unified) ── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-5 pt-6">
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>

            {/* Hero band — compressed height, no dead space */}
            <div className="relative overflow-hidden"
              style={{
                height: '148px',
                background: pro.cover_image_url ? undefined : 'linear-gradient(135deg, #0A1628 0%, #0D2D4A 55%, #0C5F57 100%)',
              }}>
              {/* Blueprint grid texture */}
              {!pro.cover_image_url && (
                <div className="absolute inset-0 pointer-events-none" style={{
                  opacity: 0.04,
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }} />
              )}
              {pro.cover_image_url && (
                <>
                  <img src={pro.cover_image_url} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: 'rgba(10,22,40,0.58)' }} />
                </>
              )}
              {/* Eyebrow: trade type, top-left */}
              <div className="absolute top-4 left-6">
                <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {pro.state ? `Verified ${STATE_NAMES[pro.state.toUpperCase()] || pro.state} Contractor` : 'Verified Licensed Contractor'}
                </div>
              </div>
            </div>

            {/* Profile identity block */}
            <div className="px-5 sm:px-7 pb-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">

                {/* Left: avatar + identity */}
                <div className="flex gap-4 -mt-10 lg:flex-1 lg:min-w-0">
                  {/* spec item #3: avatar 80px, cleaner initials, corrected to display order */}
                  <div className="relative flex-shrink-0">
                    <ProAvatar pro={pro} size="w-20 h-20" />
                    {pro.available_for_work && (
                      <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                        style={{ background: '#22C55E' }} />
                    )}
                  </div>

                  <div className="pt-10 flex-1 min-w-0">
                    {/* spec item #1: H1 uses displayName (parsed), serif font */}
                    <div className="flex items-start gap-2.5 flex-wrap mb-0.5">
                      <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight"
                        style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
                        {displayName}
                      </h1>
                      {!pro.is_claimed && (
                        <span className="mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                          style={{ background: '#FBF7ED', color: '#92580C', border: '1px solid #F0E2C4' }}>
                          Unclaimed
                        </span>
                      )}
                    </div>

                    {/* Trade label */}
                    <div className="text-sm font-bold mb-2" style={{ color: '#0F766E' }}>{trade}</div>

                    {/* Credential row — tightened, spec item #2 */}
                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-sm" style={{ color: '#4A5560' }}>
                      {pro.license_number && (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <ShieldBadge size={13} /> Licensed Contractor
                        </span>
                      )}
                      {location && (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {location}
                        </span>
                      )}
                      {pro.years_experience > 0 && (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                          {pro.years_experience} yrs
                        </span>
                      )}
                    </div>

                    {/* Verification badges row */}
                    {pro.license_number && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <a href={`https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=${pro.license_number}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-all hover:opacity-80"
                          style={{ background: 'rgba(15,118,110,0.07)', color: '#0F766E', border: '1px solid rgba(15,118,110,0.2)' }}>
                          <ShieldBadge size={12} /> FL License #{pro.license_number} · Verified ↗
                        </a>
                        {/* spec item #6: Guild Verified only when is_claimed */}
                        {pro.is_claimed && pro.is_verified && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full"
                            style={{ background: 'rgba(20,184,166,0.1)', color: '#0C5F57', border: '1px solid rgba(20,184,166,0.25)' }}>
                            <CheckIcon size={11} /> Guild Verified
                          </span>
                        )}
                        {hasOsha && (
                          <span className="text-xs font-semibold px-2.5 py-1.5 rounded-full" style={{ background: '#FAF9F6', color: '#6B7280', border: '1px solid #E8E2D9' }}>
                            🦺 {pro.osha_card_type}
                          </span>
                        )}
                        {hasInsurance && (
                          <span className="text-xs font-semibold px-2.5 py-1.5 rounded-full" style={{ background: '#FAF9F6', color: '#6B7280', border: '1px solid #E8E2D9' }}>
                            🛡 Insured
                          </span>
                        )}
                        {isElite(pro.plan_tier) && (
                          <span className="text-xs font-bold px-2.5 py-1.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.25)' }}>✦ Elite Pro</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Right column: Contact card — spec item #4 (4 states) ──────── */}
                {!isOwner && (
                  <div className="w-full lg:w-68 lg:flex-shrink-0 rounded-2xl border p-5 lg:mt-2" style={{ borderColor: '#E8E2D9', background: '#fff', minWidth: '256px', maxWidth: '272px' }}>

                    {/* Unclaimed state — softer card */}
                    {contactState === 'unclaimed' && (
                      <>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: '#FAF9F6' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div className="text-base font-bold mb-1" style={{ color: '#0A1628' }}>Send {firstName} a message</div>
                        <p className="text-xs mb-4 leading-relaxed" style={{ color: '#6B7280' }}>
                          They haven't claimed this profile yet — we'll notify them by email.
                        </p>
                        <button onClick={() => setShowModal(true)}
                          className="w-full py-2.5 rounded-xl text-sm font-bold border transition-all"
                          style={{ borderColor: '#0F766E', color: '#0F766E', background: 'rgba(15,118,110,0.04)' }}>
                          Send a message
                        </button>
                        <p className="text-xs text-center mt-3 leading-relaxed" style={{ color: '#A89F93' }}>Free · Direct · No fees</p>
                      </>
                    )}

                    {/* Claimed states — active or expired */}
                    {(contactState === 'claimed-active' || contactState === 'claimed-expired') && (
                      <>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(15,118,110,0.08)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div className="text-base font-bold mb-0.5" style={{ color: '#0A1628' }}>Contact {firstName}</div>
                        {/* spec item #4: "Ready to discuss your project?" */}
                        <p className="text-sm mb-4 leading-relaxed" style={{ color: '#6B7280' }}>Ready to discuss your project?</p>
                        <button onClick={() => setShowModal(true)}
                          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                          style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                          Contact {firstName} →
                        </button>
                        {/* Phone — only claimed + paid/trial */}
                        {showPhone && (
                          <a href={`tel:${pro.phone}`}
                            className="flex items-center justify-center gap-2 w-full mt-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors"
                            style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            Call {firstName}
                          </a>
                        )}
                        {/* Expired plan — phone gated upgrade prompt */}
                        {contactState === 'claimed-expired' && !showPhone && pro.phone && (
                          <div className="mt-2 px-3 py-2 rounded-xl text-xs text-center" style={{ background: '#FAF9F6', color: '#A89F93', border: '1px solid #E8E2D9' }}>
                            🔒 Phone visible to Pro subscribers
                          </div>
                        )}

                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Services chips */}
              {(pro as any).services?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {(pro as any).services.slice(0, 6).map((s: string) => (
                    <span key={s} className="text-sm font-medium px-3 py-1 rounded-full"
                      style={{ background: 'rgba(15,118,110,0.06)', color: '#0C5F57', border: '1px solid rgba(15,118,110,0.15)' }}>
                      ✓ {s}
                    </span>
                  ))}
                  {(pro as any).services.length > 6 && (
                    <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ color: '#A89F93', border: '1px solid #E8E2D9' }}>
                      +{(pro as any).services.length - 6} more
                    </span>
                  )}
                </div>
              )}

              {/* Unclaimed claim prompt — inline below identity */}
              {!pro.is_claimed && !isOwner && (
                <div className="mt-4 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
                  style={{ background: 'linear-gradient(100deg, #FDF9EF 0%, #FBF6E8 100%)', border: '1px solid #F0E2C4' }}>
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ background: '#F5E9CC' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>
                    </span>
                    <div>
                      <div className="text-sm font-bold mb-0.5" style={{ color: '#0A1628' }}>Own this business?</div>
                      <div className="text-xs leading-relaxed" style={{ color: '#6B5A3C' }}>
                        Claim your profile to manage it, add photos, and collect reviews.
                      </div>
                    </div>
                  </div>
                  <Link href={`/login?tab=signup&claim=${pro.id}`}
                    className="text-xs font-bold px-4 py-2 rounded-lg whitespace-nowrap transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #D97706, #B45309)', color: '#fff' }}>
                    Claim this profile →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── TABS ───────────────────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-5 mt-3">
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
            <div className="flex border-b overflow-x-auto scrollbar-hide" style={{ borderColor: '#E8E2D9' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-5 py-3 text-sm font-semibold transition-all border-b-2"
                  style={activeTab === tab.id
                    ? { borderBottomColor: '#0F766E', color: '#0F766E' }
                    : { borderBottomColor: 'transparent', color: '#6B7280' }}>
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                      style={activeTab === tab.id
                        ? { background: 'rgba(20,184,166,0.15)', color: '#0F766E' }
                        : { background: '#FAF9F6', color: '#A89F93' }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── TAB CONTENT ────────────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-4">
          <div className="flex gap-5">

            {/* Main */}
            <div className="flex-1 min-w-0">

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div className="space-y-4">

                  {/* About + trust pillars — spec items #6, #8, #9 */}
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                    <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#A89F93' }}>About this pro</div>
                    <p className="text-sm leading-relaxed mb-5" style={{ color: '#4B5563' }}>
                      {pro.bio || `Licensed ${trade.toLowerCase()} serving ${pro.city || 'Florida'} and surrounding areas. Connect directly to discuss your project.`}
                    </p>
                    {/* spec item #6: verified facts only, remove unavailable metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 mt-2">
                      {[
                        {
                          icon: <ShieldBadge size={18} />,
                          label: 'Florida DBPR Verified',
                          sub: 'License confirmed with the state',
                        },
                        {
                          icon: (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ),
                          label: 'Active License',
                          sub: pro.license_expiry_date ? `Valid through ${new Date(pro.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : 'Currently active',
                        },
                        {
                          icon: (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                            </svg>
                          ),
                          label: location || 'Florida',
                          sub: `Serving ${pro.city || 'Florida'} and nearby areas`,
                        },
                        {
                          icon: (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                          ),
                          label: 'Direct Contact',
                          sub: 'Message directly, no middleman',
                        },
                      ].map(item => (
                        <div key={item.label} className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
                          <div>
                            <div className="text-xs font-bold leading-tight" style={{ color: '#0A1628' }}>{item.label}</div>
                            <div className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8A9199' }}>{item.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Services */}
                  {(pro as any).services?.length > 0 && (
                    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                      <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#A89F93' }}>Services</div>
                      <div className="flex flex-wrap gap-2">
                        {(pro as any).services.map((s: string) => (
                          <span key={s} className="text-sm font-medium px-3 py-1.5 rounded-full"
                            style={{ background: 'rgba(15,118,110,0.06)', color: '#0C5F57', border: '1px solid rgba(15,118,110,0.15)' }}>
                            ✓ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Counties served */}
                  {(pro as any).counties_served?.length > 0 && (
                    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                      <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#A89F93' }}>Counties Served</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(pro as any).counties_served.map((county: string) => (
                          <span key={county} className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(15,118,110,0.08)', color: '#0F766E', border: '1px solid rgba(15,118,110,0.15)' }}>
                            📍 {county}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Portfolio preview — only if exists */}
                  {portfolio.length > 0 && (
                    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
                      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>Project work</div>
                        <button onClick={() => setActiveTab('work')} className="text-sm font-semibold" style={{ color: '#0F766E' }}>
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

                  {/* Reviews preview — only if exists */}
                  {reviews.length > 0 && (
                    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
                      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>Recent reviews</div>
                        <button onClick={() => setActiveTab('reviews')} className="text-sm font-semibold" style={{ color: '#0F766E' }}>
                          See all {reviewCnt} →
                        </button>
                      </div>
                      <div className="px-4 pb-4 space-y-3">
                        {reviews.slice(0, 2).map(rev => (
                          <div key={rev.id} className="p-4 rounded-xl" style={{ background: '#FAF9F6' }}>
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
                </div>
              )}

              {/* ── WORK TAB ── spec item #11: never dead-end */}
              {activeTab === 'work' && (
                <div>
                  {isOwner && <AddWorkItem proId={id} onAdded={item => setPortfolio(p => [item, ...p])} />}
                  {portfolio.length === 0 ? (
                    <div className="bg-white rounded-2xl border py-12 text-center" style={{ borderColor: '#E8E2D9' }}>
                      <div className="text-3xl mb-3 opacity-20">🖼</div>
                      <div className="font-semibold mb-1" style={{ color: '#0A1628' }}>No project photos yet</div>
                      <div className="text-sm mb-4" style={{ color: '#A89F93' }}>
                        {isOwner ? 'Add your first project photo above.' : `Portfolio photos will appear here when ${firstName} adds them.`}
                      </div>
                      {!isOwner && pro.trade_category?.slug && (
                        <Link href={`/fl/${pro.trade_category.slug}`}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors"
                          style={{ borderColor: '#E8E2D9', color: '#0F766E' }}>
                          Browse other {trade.toLowerCase()} projects →
                        </Link>
                      )}
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
                                : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: '#FAF9F6', color: '#E8E2D9' }}>🖼</div>
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

              {/* ── REVIEWS TAB — spec item #12: shrink empty state */}
              {activeTab === 'reviews' && (
                <div className="space-y-4">
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
                                <div className="flex-1 rounded-full h-1.5" style={{ background: '#FAF9F6' }}>
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

                  {!isOwner && (
                    <a href={`/reviews/${id}`}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border font-semibold text-sm transition-all"
                      style={{ borderColor: '#E8E2D9', color: '#0A1628', background: '#fff' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#0A1628' }}>
                      ⭐ Write a review
                    </a>
                  )}

                  {/* spec item #12: compact empty state ~160px */}
                  {reviews.length === 0 ? (
                    <div className="bg-white rounded-2xl border py-10 text-center" style={{ borderColor: '#E8E2D9' }}>
                      <div className="text-2xl mb-2 opacity-20">⭐</div>
                      <div className="font-semibold text-sm mb-1" style={{ color: '#0A1628' }}>No reviews yet</div>
                      <div className="text-xs" style={{ color: '#A89F93' }}>
                        {isOwner ? 'Customer reviews will appear here.' : `Be the first homeowner to share your experience with ${firstName}.`}
                      </div>
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
                      <p className="text-base leading-relaxed" style={{ color: '#4B5563' }}>{rev.review_text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── CREDENTIALS TAB — spec item #7: ACTIVE pill */}
              {activeTab === 'credentials' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E8E2D9' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>License verification</div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full"
                        style={{ background: 'rgba(20,184,166,0.08)', color: '#0C5F57', border: '1px solid rgba(20,184,166,0.2)' }}>
                        <ShieldBadge size={11} /> Florida DBPR
                      </span>
                    </div>

                    {proLicenses.length > 0
                      ? proLicenses.map(lic => <div key={lic.id}><CredCard lic={lic} /></div>)
                      : pro.license_number
                        ? <CredCard lic={{ id: 'legacy', trade_name: trade, license_number: pro.license_number, license_expiry_date: pro.license_expiry_date, license_status: pro.license_status || 'active', is_primary: true }} />
                        : <div className="text-sm py-4 text-center" style={{ color: '#A89F93' }}>No license on file</div>
                    }

                    {hasOsha && (
                      <div className="rounded-xl border px-4 py-3 mb-2 flex items-center justify-between mt-2"
                        style={{ borderColor: '#22C55E', borderLeftWidth: '4px', background: 'rgba(34,197,94,0.05)' }}>
                        <div className="flex items-center gap-2.5">
                          <span>🦺</span>
                          <div>
                            <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>{pro.osha_card_type} Safety</div>
                            {pro.osha_card_expiry && <div className="text-xs" style={{ color: '#6B7280' }}>Expires {new Date(pro.osha_card_expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)' }}>● Active</span>
                      </div>
                    )}

                    {hasInsurance && (
                      <div className="rounded-xl border px-4 py-3 flex items-center justify-between"
                        style={{ borderColor: '#22C55E', borderLeftWidth: '4px', background: 'rgba(34,197,94,0.05)' }}>
                        <div className="flex items-center gap-2.5">
                          <span>🛡</span>
                          <div>
                            <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>General Liability Insurance</div>
                            {pro.insurance_expiry_date && <div className="text-xs" style={{ color: '#6B7280' }}>Expires {new Date(pro.insurance_expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)' }}>● Active</span>
                      </div>
                    )}

                    {!hasCredentials && (
                      <div className="text-sm py-8 text-center" style={{ color: '#A89F93' }}>
                        <div className="text-3xl mb-2 opacity-20">🏛</div>
                        No credentials on file yet
                      </div>
                    )}

                    {/* Verification statement + report error link — spec items #9, #13 */}
                    <div className="mt-5 pt-4 border-t" style={{ borderColor: '#F0EDE8' }}>
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <CheckIcon size={12} color="#0F766E" />
                        <span className="text-xs font-medium" style={{ color: '#6B7280' }}>
                          Verified with Florida Dept. of Business &amp; Professional Regulation
                        </span>
                      </div>
                      <div className="text-center">
                        <a href={`mailto:hello@proguild.ai?subject=Error report — pro ${pro.id}&body=Please describe the issue with this profile:`}
                          className="text-xs" style={{ color: '#C4BAB0' }}>
                          Not your profile or incorrect info? Report an error
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── STICKY SIDEBAR — desktop ────────────────────────────────── */}
            <div className="hidden lg:block w-60 flex-shrink-0">
              <div className="sticky top-20 space-y-4">

                {/* Unclaimed sidebar: claim benefits */}
                {!isOwner && !pro.is_claimed && (
                  <div className="rounded-2xl border p-5" style={{ borderColor: '#D8E6E1', background: 'linear-gradient(160deg, #F4FAF8 0%, #EFF7F4 100%)' }}>
                    <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#0F766E' }}>ProGuild Benefits</div>
                    <div className="space-y-3 mb-4">
                      {[
                        { t: 'No lead fees', s: 'Homeowners reach you directly.' },
                        { t: 'Verified badge', s: 'Trust signal on your profile.' },
                        { t: 'Showcase your work', s: 'Add photos and credentials.' },
                        { t: 'Collect reviews', s: 'Build reputation, win more jobs.' },
                      ].map(b => (
                        <div key={b.t} className="flex items-start gap-2.5">
                          <span className="flex-shrink-0 mt-0.5 flex items-center justify-center w-4 h-4 rounded-full" style={{ background: '#0F766E' }}>
                            <CheckIcon size={9} color="#fff" />
                          </span>
                          <div>
                            <div className="text-xs font-bold" style={{ color: '#0A1628' }}>{b.t}</div>
                            <div className="text-xs mt-0.5 leading-relaxed" style={{ color: '#5A6B66' }}>{b.s}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Owner: share */}
                {isOwner && (
                  <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E8E2D9' }}>
                    <button onClick={shareProfile}
                      className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                      style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
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
                      : { borderColor: '#0F766E', color: '#0C5F57', background: 'rgba(20,184,166,0.05)' }}>
                    {isFollowing ? '✓ Following' : '+ Follow'}
                  </button>
                )}

                {/* Quick info card */}
                <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E8E2D9' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#A89F93' }}>Quick info</div>
                  <div className="space-y-2">
                    {[
                      { label: 'Trade', value: trade },
                      { label: 'Location', value: location || 'Florida' },
                      ...(pro.license_number ? [{ label: 'License #', value: pro.license_number }] : []),
                      { label: 'Status', value: pro.license_status === 'active' ? '● Active' : pro.license_status || 'Verified' },
                      ...(pro.license_expiry_date ? [{ label: 'Expires', value: new Date(pro.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }] : []),
                    ].map(row => (
                      <div key={row.label} className="flex items-start justify-between gap-2 text-xs">
                        <span style={{ color: '#A89F93' }}>{row.label}</span>
                        <span className="text-right font-medium" style={{ color: row.value.startsWith('●') ? '#15803D' : '#0A1628' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── BROWSE NEARBY ──────────────────────────────────────────────── */}
        {pro.trade_category?.slug && pro.state && pro.city && (
          <div className="max-w-5xl mx-auto px-4 sm:px-5 pb-4">
            <div className="rounded-2xl border p-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ background: 'rgba(15,118,110,0.08)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <div>
                  <div className="text-sm font-bold" style={{ color: '#0A1628' }}>Looking for another contractor?</div>
                  <div className="text-sm" style={{ color: '#6B7280' }}>Browse licensed {trade.toLowerCase()}s in {pro.city.replace(/\b\w/g, (c: string) => c.toUpperCase())} and nearby.</div>
                </div>
              </div>
              <Link href={`/trades/${pro.trade_category.slug}/${(pro.state || '').toLowerCase()}/${encodeURIComponent((pro.city || '').toLowerCase())}`}
                className="text-sm font-semibold px-4 py-2 rounded-lg border whitespace-nowrap transition-colors"
                style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
                Browse nearby pros →
              </Link>
            </div>
          </div>
        )}

        {/* ── MOBILE STICKY FOOTER ───────────────────────────────────────── */}
        {!isOwner && (
          <div className="md:hidden fixed bottom-16 left-0 right-0 bg-white border-t z-40" style={{ borderColor: '#E8E2D9' }}>
            <div className="flex gap-3 px-4 py-3 max-w-sm mx-auto">
              {showPhone ? (
                <>
                  <a href={`tel:${pro.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl border"
                    style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Call
                  </a>
                  <button onClick={() => setShowModal(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-xl"
                    style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                    Contact {firstName}
                  </button>
                </>
              ) : (
                <button onClick={() => setShowModal(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                  Contact {firstName}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="border-t py-8 px-6 mt-4" style={{ borderColor: '#E8E2D9', background: '#fff', paddingBottom: !isOwner ? 'calc(80px + env(safe-area-inset-bottom))' : undefined }}>
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#0F766E', fontWeight: 500 }}>.ai</span></span>
            <div className="flex gap-4 text-xs" style={{ color: '#A89F93' }}>
              {[['/', 'Home'],['/search', 'Find a Pro'],['/privacy', 'Privacy'],['/terms', 'Terms']].map(([href, label]) => (
                <Link key={href} href={href} style={{ color: '#A89F93' }}>{label}</Link>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
