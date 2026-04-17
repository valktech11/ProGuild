'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { initials, avatarColor } from '@/lib/utils'
import Navbar from '@/components/layout/Navbar'

function Star({ filled, half, onClick }: { filled: boolean; half?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-3xl transition-transform hover:scale-110 focus:outline-none">
      <span className={filled ? 'text-amber-400' : 'text-gray-200'}>★</span>
    </button>
  )
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
}

export default function ReviewPage() {
  const { pro_id } = useParams<{ pro_id: string }>()
  const router     = useRouter()

  const [pro, setPro]         = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating]   = useState(0)
  const [hover, setHover]     = useState(0)
  const [name, setName]       = useState(() => {
    try { const s = JSON.parse(sessionStorage.getItem('tn_pro') || '{}'); return s.name || '' } catch { return '' }
  })
  const [email, setEmail]     = useState(() => {
    try { const s = JSON.parse(sessionStorage.getItem('tn_pro') || '{}'); return s.email || '' } catch { return '' }
  })
  const [comment, setComment] = useState('')
  const [jobType, setJobType] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    fetch(`/api/pros/${pro_id}`)
      .then(r => r.json())
      .then(d => { setPro(d.pro); setLoading(false) })
  }, [pro_id])

  const BANNED = [/\bfuck/i,/\bshit/i,/\bbitch/i,/\basshole/i,/\bcunt/i,/\bdick\b/i,/\bwhore/i,/\bslut/i]
  function hasProfanity(t: string) { return BANNED.some(p => p.test(t)) }

  async function handleSubmit() {
    if (!rating)        { setError('Please select a star rating'); return }
    if (!name.trim())   { setError('Please enter your name'); return }
    if (!email.trim())  { setError('Please enter your email'); return }
    if (!comment.trim()){ setError('Please write a review'); return }
    if (hasProfanity(comment)) {
      setError('Please keep your review professional and respectful. Personal attacks or profanity are not allowed.')
      return
    }

    setSubmitting(true); setError('')
    const r = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id,
        reviewer_name:  name.trim(),
        reviewer_email: email.trim(),
        rating,
        comment: comment.trim(),
        review_text: comment.trim(),
      }),
    })
    setSubmitting(false)
    if (r.ok) setSubmitted(true)
    else {
      const d = await r.json()
      setError(d.error || 'Could not submit review. Please try again.')
    }
  }

  if (loading) return (
    <><Navbar />
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </>
  )

  if (!pro) return (
    <><Navbar />
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-center">
        <div>
          <div className="font-serif text-2xl text-gray-900 mb-3">Pro not found</div>
          <Link href="/" className="text-teal-600 text-sm">← Back to home</Link>
        </div>
      </div>
    </>
  )

  const [bg, fg] = avatarColor(pro.full_name)
  const trade    = pro.trade_category?.category_name || 'Trade professional'
  const location = [pro.city, pro.state].filter(Boolean).join(', ')
  const displayRating = hover || rating

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-stone-50">
        <div className="max-w-xl mx-auto px-6 py-12">

          {/* Pro card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6 flex items-center gap-4">
            {pro.profile_photo_url ? (
              <img src={pro.profile_photo_url} alt={pro.full_name} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-serif text-xl flex-shrink-0"
                style={{ background: bg, color: fg }}>{initials(pro.full_name)}</div>
            )}
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">{pro.full_name}</h2>
              <div className="text-sm text-teal-700">{trade}</div>
              {location && <div className="text-xs text-gray-400">{location}</div>}
              {pro.is_verified && (
                <span className="text-xs font-semibold text-teal-600">✓ License verified</span>
              )}
            </div>
          </div>

          {submitted ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">🌟</div>
              <h2 className="font-serif text-2xl text-gray-900 mb-2">Thank you for your review!</h2>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Your review has been submitted and will appear on {pro.full_name}'s profile after approval.
              </p>
              <Link href={`/pro/${pro_id}`}
                className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                Back to profile →
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-8">
              <h1 className="font-serif text-2xl text-gray-900 mb-1">Leave a review</h1>
              <p className="text-sm text-gray-400 mb-7">Share your experience with {pro.full_name.split(' ')[0]}</p>

              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{error}</div>
              )}

              {/* Star rating */}
              <div className="mb-6">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
                  Your rating *
                </label>
                <div className="flex items-center gap-1"
                  onMouseLeave={() => setHover(0)}>
                  {[1,2,3,4,5].map(star => (
                    <button key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHover(star)}
                      className="text-4xl transition-all hover:scale-110 focus:outline-none leading-none">
                      <span className={star <= displayRating ? 'text-amber-400' : 'text-gray-200'}>★</span>
                    </button>
                  ))}
                  {displayRating > 0 && (
                    <span className="ml-3 text-sm font-semibold text-gray-700">{RATING_LABELS[displayRating]}</span>
                  )}
                </div>
              </div>

              {/* Job type */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Type of job <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input value={jobType} onChange={e => setJobType(e.target.value)}
                  placeholder={`e.g. Kitchen rewiring, pipe repair, AC installation...`}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
              </div>

              {/* Review text */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Your review *
                </label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={5}
                  placeholder={`What was it like working with ${pro.full_name.split(' ')[0]}? Describe the quality of work, communication, timeliness...`}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 resize-none transition-colors" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Be specific — it helps other homeowners</span>
                  <span>{comment.length} chars</span>
                </div>
              </div>

              {/* Name + email */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: 'Your name *',    val: name,  set: setName,  type: 'text',  ph: 'James Smith' },
                  { label: 'Email address *',val: email, set: setEmail, type: 'email', ph: 'james@example.com' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
                    <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mb-5">Your email is only used to verify your review. It won't be shown publicly.</p>

              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Submitting...' : 'Submit review →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
