'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { Pro, Review, Session } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, formatDate, isPaid, isElite, planLabel } from '@/lib/utils'

export default function ProProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [pro, setPro]         = useState<Pro | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Contact form
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [message, setMessage]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    // Get logged-in session
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) setSession(JSON.parse(raw))

    if (!id) return
    Promise.all([
      fetch(`/api/pros/${id}`).then(r => r.json()),
      fetch(`/api/reviews?pro_id=${id}`).then(r => r.json()),
    ]).then(([proData, reviewData]) => {
      if (proData.error) { setError(proData.error); setLoading(false); return }
      setPro(proData.pro)
      setReviews(reviewData.reviews || [])
      setLoading(false)
    }).catch(() => { setError('Could not load profile'); setLoading(false) })
  }, [id])

  const handleSubmit = async () => {
    if (!name || !email || !message) { setFormError('Please fill in name, email and message.'); return }
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

  if (loading) return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {[200, 300, 200].map((h, i) => <div key={i} className="bg-white rounded-2xl animate-shimmer" style={{ height: h }} />)}
        </div>
        <div className="bg-white rounded-2xl animate-shimmer h-96" />
      </div>
    </>
  )

  if (error || !pro) return (
    <>
      <Navbar />
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <div className="text-5xl mb-4 opacity-20">👤</div>
        <h2 className="font-serif text-2xl text-gray-900 mb-3">Pro not found</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <Link href="/" className="px-6 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
          Back to search
        </Link>
      </div>
    </>
  )

  const [bg, fg]  = avatarColor(pro.full_name)
  const rating    = pro.avg_rating || 0
  const trade     = pro.trade_category?.category_name || '—'
  const location  = [pro.city, pro.state].filter(Boolean).join(', ')
  const paid      = isPaid(pro.plan_tier)
  const elite     = isElite(pro.plan_tier)
  const isOwner   = session?.id === id  // ← key check

  // Phone visible if: viewer is the owner OR viewer is on a paid plan
  const showPhone = isOwner || paid

  return (
    <>
      <Navbar />

      {/* ── OWNER BANNER — only shown to the pro viewing their own profile ── */}
      {isOwner && (
        <div className="bg-teal-50 border-b border-teal-100">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-teal-700">
              <span>👁</span>
              <span className="font-medium">This is how your profile looks to homeowners</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/edit-profile"
                className="text-xs font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
                Edit profile
              </Link>
              <Link href="/community/edit"
                className="text-xs font-semibold px-3 py-1.5 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">
                Edit community profile
              </Link>
              <Link href="/dashboard"
                className="text-xs font-medium px-3 py-1.5 text-teal-600 hover:text-teal-800 transition-colors">
                ← Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* LEFT */}
        <div className="lg:col-span-2 space-y-5">

          {/* Header card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-8">
            <div className="flex gap-5 items-start mb-6">
              {pro.profile_photo_url ? (
                <img src={pro.profile_photo_url} alt={pro.full_name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center font-serif text-2xl flex-shrink-0" style={{ background: bg, color: fg }}>
                  {initials(pro.full_name)}
                </div>
              )}
              <div className="flex-1">
                <h1 className="font-serif text-3xl text-gray-900 mb-1">{pro.full_name}</h1>
                <div className="text-base font-medium text-teal-700 mb-1">{trade}</div>
                <div className="text-sm text-gray-400 mb-3">
                  {location}{pro.years_experience ? ` · ${pro.years_experience} years experience` : ''}
                </div>
                <div className="flex flex-wrap gap-2">
                  {pro.is_verified && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-teal-50 text-teal-800">✓ Verified</span>}
                  {elite && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-50 text-purple-800">Verified Elite</span>}
                  {paid && !elite && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-800">Pro member</span>}
                  {pro.license_number && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800">Licensed · {pro.license_number}</span>}
                </div>
              </div>
            </div>

            {rating > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <span className="font-serif text-4xl text-gray-900">{rating.toFixed(1)}</span>
                <div>
                  <div className="text-amber-500 text-lg tracking-wide">{starsHtml(rating)}</div>
                  <div className="text-xs text-gray-400">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}

            <div className="flex border-t border-gray-100 pt-5">
              {[
                { n: reviews.length,                 l: 'Reviews'   },
                { n: pro.years_experience || '—',    l: 'Yrs exp'   },
                { n: pro.lead_count || 0,            l: 'Enquiries' },
              ].map(s => (
                <div key={s.l} className="flex-1 text-center border-r border-gray-100 last:border-0">
                  <div className="font-serif text-2xl text-teal-600">{s.n}</div>
                  <div className="text-xs text-gray-400 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bio */}
          {pro.bio && (
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">About</div>
              <p className="text-gray-600 leading-relaxed font-light">{pro.bio}</p>
            </div>
          )}

          {/* Details */}
          <div className="bg-white border border-gray-100 rounded-2xl p-7">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Details</div>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ['Trade',      trade],
                  ['Location',   location || '—'],
                  ...(pro.years_experience ? [['Experience', `${pro.years_experience} years`]] : []),
                  ...(pro.zip_code ? [['Zip code', pro.zip_code]] : []),
                  ['Plan',       planLabel(pro.plan_tier)],
                  ['Verified',   pro.is_verified ? 'Yes' : 'Not yet'],
                ] as string[][]
              ).map(([l, v]) => (
                <div key={l}>
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{l}</div>
                  <div className="text-sm font-medium text-gray-700">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews */}
          <div className="bg-white border border-gray-100 rounded-2xl p-7">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">
              Reviews ({reviews.length})
            </div>
            {reviews.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No reviews yet — be the first.</div>
            ) : (
              <div className="space-y-4">
                {reviews.map(rev => (
                  <div key={rev.id} className="border border-gray-100 rounded-xl p-5">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-sm text-gray-900">{rev.reviewer_name}</span>
                      <span className="text-xs text-gray-400">{formatDate(rev.reviewed_at)}</span>
                    </div>
                    <div className="text-amber-500 text-sm mb-2">{starsHtml(rev.rating)} {rev.rating}/5</div>
                    {rev.comment && <p className="text-sm text-gray-600 leading-relaxed">{rev.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Contact */}
        <div className="bg-white border border-gray-100 rounded-2xl p-7 sticky top-20">
          {/* Owner sees their own contact info, not the form */}
          {isOwner ? (
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Your contact info</div>
              <div className="space-y-3 text-left">
                {pro.email && (
                  <div className="flex items-center gap-3 bg-stone-50 rounded-xl p-3">
                    <span className="text-lg">✉️</span>
                    <div>
                      <div className="text-xs text-gray-400">Email</div>
                      <div className="text-sm font-medium text-gray-800">{pro.email}</div>
                    </div>
                  </div>
                )}
                {pro.phone && (
                  <div className="flex items-center gap-3 bg-stone-50 rounded-xl p-3">
                    <span className="text-lg">📞</span>
                    <div>
                      <div className="text-xs text-gray-400">Phone</div>
                      <div className="text-sm font-medium text-gray-800">{pro.phone}</div>
                    </div>
                  </div>
                )}
              </div>
              <Link href="/edit-profile" className="mt-5 block w-full py-2.5 text-center text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
                Edit profile
              </Link>
              <Link href="/dashboard" className="mt-2 block w-full py-2.5 text-center text-sm font-medium border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors">
                ← Back to dashboard
              </Link>
            </div>
          ) : submitted ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-teal-700 font-semibold">✓</div>
              <h3 className="font-serif text-xl text-gray-900 mb-2">Message sent!</h3>
              <p className="text-sm text-gray-400">
                Your message has been sent to {pro.full_name.split(' ')[0]}. They'll be in touch soon.
              </p>
            </div>
          ) : (
            <>
              <h2 className="font-serif text-xl text-gray-900 mb-1">
                Contact {pro.full_name.split(' ')[0]}
              </h2>
              <p className="text-sm text-gray-400 mb-6">Send a message and they'll get back to you directly.</p>

              {formError && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{formError}</div>}

              {[
                { id: 'c-name',  label: 'Your name',        value: name,  set: setName,  placeholder: 'John Smith',        type: 'text'  },
                { id: 'c-email', label: 'Email',             value: email, set: setEmail, placeholder: 'john@example.com',   type: 'email' },
                { id: 'c-phone', label: 'Phone (optional)',  value: phone, set: setPhone, placeholder: '(555) 000-0000',     type: 'tel'   },
              ].map(f => (
                <div key={f.id} className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors" />
                </div>
              ))}

              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Describe what you need help with..." rows={4}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors resize-none" />
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Sending...' : 'Send message'}
              </button>
              <p className="text-xs text-gray-400 text-center mt-3">
                Your details are only shared with {pro.full_name.split(' ')[0]}.
              </p>

              {/* Phone — visible to owner always, visible to paid viewers, blurred for free */}
              {pro.phone && (
                <>
                  <div className="border-t border-gray-100 my-5" />
                  <div className="flex items-center gap-3 bg-stone-50 rounded-xl p-3">
                    <div className="w-9 h-9 bg-teal-50 rounded-full flex items-center justify-center text-sm">📞</div>
                    <div>
                      <div className="text-xs text-gray-400">Phone</div>
                      {showPhone ? (
                        <div className="text-sm font-semibold text-gray-800">{pro.phone}</div>
                      ) : (
                        <Link href="/upgrade" className="text-sm text-teal-600 font-medium hover:underline">
                          Upgrade to Pro to view
                        </Link>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating edit button — owner only, visible when scrolled past banner */}
      {isOwner && (
        <Link href="/edit-profile"
          className="fixed bottom-6 right-6 bg-teal-600 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg hover:bg-teal-700 transition-all hover:scale-105 flex items-center gap-2 z-50">
          ✏️ Edit profile
        </Link>
      )}
    </>
  )
}
