'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Pro } from '@/types'
import { initials, avatarColor, starsHtml, isPaid, isElite } from '@/lib/utils'

interface ProCardProps {
  pro: Pro & { trade_score?: number; osha_card_type?: string; insurance_status?: string }
  index?: number
}

function UnclaimedContactForm({ pro }: { pro: ProCardProps['pro'] }) {
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [phone, setPhone]   = useState('')
  const [need, setNeed]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const [err, setErr]       = useState('')
  const [open, setOpen]     = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !need.trim()) { setErr('Please fill in your name and what you need.'); return }
    if (!phone.trim() && !email.trim()) { setErr('Please provide a phone number or email so the pro can reach you.'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/contact-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id: pro.id,
          contact_name: name.trim(),
          contact_email: email.trim() || null,
          contact_phone: phone.trim() || null,
          message: need.trim(),
          lead_source: 'Registry_Card',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.detail?.message || 'Failed')
      setSent(true)
    } catch (e: any) {
      setErr(e.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-3 rounded-xl p-4 text-center"
        style={{ background: 'rgba(15,118,110,0.06)', border: '1px solid rgba(15,118,110,0.2)' }}>
        <div className="text-2xl mb-1">✓</div>
        <div className="text-sm font-semibold" style={{ color: '#0C5F57' }}>Enquiry sent!</div>
        <div className="text-xs mt-1" style={{ color: '#6B7280' }}>
          Your request has been saved. When {pro.full_name.split(' ')[0]} joins ProGuild, they will see your enquiry waiting for them.
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button onClick={() => setOpen(true)}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
          Send an enquiry →
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div className="text-xs font-semibold mb-1" style={{ color: '#0C5F57' }}>
        We'll reach out to {pro.full_name.split(' ')[0]} on your behalf
      </div>
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder="Your name *" className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
        style={{ borderColor: '#E8E2D9', color: '#0A1628' }} />
      <input value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Your email (optional)" type="email"
        className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
        style={{ borderColor: '#E8E2D9', color: '#0A1628' }} />
      <input
        value={phone}
        onChange={e => setPhone(e.target.value.replace(/[^\d\s\-\(\)\+]/g, ''))}
        placeholder="(555) 555-5555"
        type="tel"
        inputMode="numeric"
        maxLength={15}
        className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
        style={{ borderColor: '#E8E2D9', color: '#0A1628' }}
      />
      <textarea value={need} onChange={e => setNeed(e.target.value)}
        placeholder="What do you need done? *" rows={2}
        className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
        style={{ borderColor: '#E8E2D9', color: '#0A1628' }} />
      {err && <div className="text-xs text-red-500">{err}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)}
          className="flex-1 py-2 rounded-lg text-sm border"
          style={{ borderColor: '#E8E2D9', color: '#6B7280' }}>Cancel</button>
        <button type="submit" disabled={loading}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
          {loading ? 'Sending...' : 'Send request'}
        </button>
      </div>
    </form>
  )
}

export default function ProCard({ pro, index = 0 }: ProCardProps) {
  const [bg, fg]     = avatarColor(pro.full_name)
  const rating       = pro.avg_rating || 0
  const reviews      = pro.review_count || 0
  const yrs          = pro.years_experience || 0
  const trade        = pro.trade_category?.category_name || '—'
  const location     = [pro.city, pro.state].filter(Boolean).join(', ')
  const score        = pro.trade_score || null
  const hasOsha      = !!(pro as any).osha_card_type
  const hasInsurance = (pro as any).insurance_status === 'active'
  const isClaimed    = pro.is_claimed

  const body = (
    <>
      {/* Header */}
      <div className="flex gap-3 items-start mb-3">
        <div className="relative flex-shrink-0">
          {pro.profile_photo_url ? (
            <img src={pro.profile_photo_url} alt={pro.full_name}
              className={`w-11 h-11 rounded-full object-cover ${pro.available_for_work ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
              onError={e => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement)?.removeAttribute('style') }} />
          ) : null}
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-serif flex-shrink-0 ${pro.available_for_work ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
            style={{ background: bg, color: fg, display: pro.profile_photo_url ? 'none' : 'flex' }}>
            {initials(pro.full_name)}
          </div>
          {pro.available_for_work && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate text-base leading-snug">{pro.full_name}</div>
          <div className="text-sm font-medium text-teal-700 mt-0.5">{trade}</div>
          {location && <div className="text-sm text-gray-400 mt-0.5 truncate">{location}</div>}
        </div>
      </div>

      {/* Trust badges */}
      <div className="flex flex-wrap gap-1 mb-3">
        {isClaimed && pro.is_verified && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(20,184,166,0.1)', color: '#0C5F57', border: '1px solid rgba(20,184,166,0.25)' }}>
            <svg width="11" height="11" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#pcg)"/>
              <path d="M11 16l3 3 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <defs><linearGradient id="pcg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#0C5F57"/>
              </linearGradient></defs>
            </svg>
            Guild Verified
          </span>
        )}
        {pro.license_number && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(15,118,110,0.06)', color: '#0F766E', border: '1px solid rgba(15,118,110,0.15)' }}>
            🛡 #{pro.license_number}
          </span>
        )}
        {hasOsha && <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">🦺 {(pro as any).osha_card_type}</span>}
        {hasInsurance && <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">🛡 Insured</span>}
        {isElite(pro.plan_tier) && <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-800">Elite</span>}
        {isPaid(pro.plan_tier) && !isElite(pro.plan_tier) && <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-800">Pro</span>}
      </div>

      {/* Rating */}
      {rating > 0
        ? <div className="flex items-center gap-1.5 mb-3">
            <span className="text-amber-500 text-sm">{starsHtml(rating)}</span>
            <span className="text-sm font-semibold text-gray-800">{rating.toFixed(1)}</span>
            <span className="text-sm text-gray-400">({reviews})</span>
          </div>
        : <div className="mb-3" />
      }

      <div className="border-t border-gray-100 mb-3" />

      {/* Stats */}
      <div className="flex text-center">
        <div className="flex-1">
          {reviews > 0
            ? <><div className="text-sm font-semibold text-gray-900">{reviews}</div><div className="text-sm text-gray-400">Reviews</div></>
            : <><div className="text-sm font-semibold text-gray-500">New</div><div className="text-sm text-gray-400">{pro.is_verified ? 'Verified' : 'Member'}</div></>
          }
        </div>
        <div className="flex-1 border-l border-gray-100">
          {yrs > 0
            ? <><div className="text-sm font-semibold text-gray-900">{yrs}</div><div className="text-sm text-gray-400">Yrs exp</div></>
            : <><div className="text-sm font-semibold text-gray-500">{trade !== '—' ? trade : 'Pro'}</div><div className="text-sm text-gray-400">Trade</div></>
          }
        </div>
        {score !== null && (
          <div className="flex-1 border-l border-gray-100">
            <div className="text-sm font-semibold text-teal-600">{score}</div>
            <div className="text-sm text-gray-400">Score</div>
          </div>
        )}
      </div>
    </>
  )

  if (isClaimed) {
    return (
      <Link href={`/pro/${pro.id}`}
        className="group block bg-white rounded-xl p-5 hover:-translate-y-0.5 transition-all duration-200"
        style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', animationDelay: `${index * 40}ms` }}>
        {body}
        <button className="mt-3 w-full py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 group-hover:bg-teal-50 group-hover:border-teal-400 group-hover:text-teal-700 transition-colors">
          View profile →
        </button>
      </Link>
    )
  }

  return (
    <div className="bg-white rounded-xl p-5"
      style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', animationDelay: `${index * 40}ms` }}>
      {body}
      <UnclaimedContactForm pro={pro} />
    </div>
  )
}
