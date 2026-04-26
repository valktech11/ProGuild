'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import Link from 'next/link'
import { initials, avatarColor } from '@/lib/utils'

export default function ProIntakePage() {
  const { slug }     = useParams<{ slug: string }>()
  const [pro, setPro] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form state
  const [name, setName]     = useState('')
  const [phone, setPhone]   = useState('')
  const [email, setEmail]   = useState('')
  const [need, setNeed]     = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]     = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    if (!slug) return
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    async function loadPro(proId: string) {
      const r = await fetch(`/api/pros/${proId}`)
      const d = await r.json()
      if (d.pro) setPro(d.pro)
      else setNotFound(true)
      setLoading(false)
    }

    if (UUID_RE.test(slug)) {
      loadPro(slug)
    } else {
      fetch(`/api/pros/slug?slug=${encodeURIComponent(slug)}`)
        .then(r => r.json())
        .then(d => d.pro_id ? loadPro(d.pro_id) : (setNotFound(true), setLoading(false)))
        .catch(() => { setNotFound(true); setLoading(false) })
    }
  }, [slug])

  async function submit() {
    if (!name.trim()) { setErr('Please enter your name'); return }
    if (!phone.trim() && !email.trim()) { setErr('Please provide a phone number or email'); return }
    if (!need.trim()) { setErr('Please describe what you need'); return }

    setSending(true); setErr('')
    const r = await fetch('/api/contact-pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: pro.id,
        contact_name: name.trim(),
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        message: need.trim(),
        lead_source: 'Website',
      }),
    })
    const d = await r.json()
    setSending(false)
    if (r.ok) setSent(true)
    else setErr(d.error || 'Something went wrong. Please try again.')
  }

  const [bg, fg] = pro ? avatarColor(pro.full_name) : ['#0F766E', '#fff']
  const trade = pro?.trade_category?.category_name || ''

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAF9F6]">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-gray-500 mb-4">Pro not found.</p>
            <Link href="/search" className="text-teal-600 hover:underline text-sm">Browse verified pros →</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <Navbar />

      <div className="max-w-md mx-auto px-4 py-10">
        {/* Pro card */}
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 mb-5 text-center">
          {pro.profile_photo_url ? (
            <img src={pro.profile_photo_url} alt={pro.full_name}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-2 border-[#E8E2D9]" />
          ) : (
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-3"
              style={{ background: bg, color: fg }}>
              {initials(pro.full_name)}
            </div>
          )}
          <h1 className="text-xl font-bold text-[#0A1628]">{pro.full_name}</h1>
          {trade && <p className="text-sm text-teal-700 font-medium mt-0.5">{trade}</p>}
          {pro.city && <p className="text-sm text-gray-400 mt-0.5">{pro.city}, {pro.state}</p>}

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {pro.is_verified && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(15,118,110,0.08)', color: '#0F766E', border: '1px solid rgba(15,118,110,0.2)' }}>
                🛡 DBPR Verified
              </span>
            )}
            {pro.license_number && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-100">
                License #{pro.license_number}
              </span>
            )}
          </div>
        </div>

        {/* Contact form */}
        {sent ? (
          <div className="bg-white border border-[#E8E2D9] rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-[#0A1628] mb-2">Request sent!</h2>
            <p className="text-sm text-gray-500">
              We've notified {pro.full_name.split(' ')[0]}. They'll be in touch shortly.
            </p>
            <Link href="/search"
              className="inline-block mt-5 text-sm text-teal-600 hover:underline">
              Browse other verified pros →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6">
            <h2 className="text-base font-bold text-[#0A1628] mb-1">
              Contact {pro.full_name.split(' ')[0]}
            </h2>
            <p className="text-sm text-gray-400 mb-5">
              Fill this out and they'll reach back to you directly.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Your name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-3 text-sm border border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
                  onFocus={e => e.target.style.borderColor = '#0F766E'}
                  onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Phone number</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d\s\-\(\)\+]/g, ''))}
                  placeholder="(555) 555-5555"
                  type="tel"
                  inputMode="numeric"
                  maxLength={15}
                  className="w-full px-4 py-3 text-sm border border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
                  onFocus={e => e.target.style.borderColor = '#0F766E'}
                  onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Email (optional)</label>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  type="email"
                  className="w-full px-4 py-3 text-sm border border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
                  onFocus={e => e.target.style.borderColor = '#0F766E'}
                  onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1.5">What do you need? *</label>
                <textarea value={need} onChange={e => setNeed(e.target.value)}
                  placeholder="I need a full interior repaint for a 3-bedroom house in Jacksonville..."
                  rows={4}
                  className="w-full px-4 py-3 text-sm border border-[#E8E2D9] rounded-xl outline-none resize-none text-[#0A1628]"
                  onFocus={e => e.target.style.borderColor = '#0F766E'}
                  onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
              </div>

              {err && <p className="text-sm text-red-500">{err}</p>}

              <button onClick={submit} disabled={sending}
                className="w-full py-3.5 text-base font-bold text-white rounded-xl disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                {sending ? 'Sending...' : `Send request to ${pro.full_name.split(' ')[0]} →`}
              </button>
            </div>

            <p className="text-xs text-center text-gray-400 mt-4">
              Powered by{' '}
              <Link href="https://proguild.ai" className="text-teal-600 hover:underline">ProGuild.ai</Link>
              {' '}· Florida's verified trades network
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
