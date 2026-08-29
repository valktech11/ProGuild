'use client'

import { useState } from 'react'

const TEAL = '#0d9488'
const STAR_FILLED = '#F59E0B'

function Star({ filled, onClick, onHover }: { filled: boolean; onClick: () => void; onHover: () => void }) {
  return (
    <svg onClick={onClick} onMouseEnter={onHover}
      width="44" height="44" viewBox="0 0 24 24" fill={filled ? STAR_FILLED : 'none'}
      stroke={filled ? STAR_FILLED : '#D1D5DB'} strokeWidth="1.5"
      style={{ cursor: 'pointer', transition: 'all 0.1s' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export default function ReviewClient({
  token, rrId, homeownerName, businessName, googleId, alreadyRated, existingRating
}: {
  token: string
  rrId: string
  homeownerName: string | null
  businessName: string
  googleId: string | null
  alreadyRated: boolean
  existingRating: number | null
}) {
  const [hover, setHover]     = useState(0)
  const [rating, setRating]   = useState(existingRating ?? 0)
  const [feedback, setFeedback] = useState('')
  const [step, setStep]       = useState<'rate' | 'feedback' | 'done'>(alreadyRated ? 'done' : 'rate')
  const [loading, setLoading] = useState(false)

  const firstName = homeownerName?.split(' ')[0] ?? ''

  async function handleRate(r: number) {
    setRating(r)
    if (r >= 4) {
      // High rating → redirect to Google
      setLoading(true)
      await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating: r }),
      })
      if (googleId) {
        window.location.href = `https://search.google.com/local/writereview?placeid=${googleId}`
      } else {
        setStep('done')
      }
    } else {
      // Low rating → private feedback form
      setStep('feedback')
    }
  }

  async function handleSubmitFeedback() {
    setLoading(true)
    await fetch('/api/review/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, rating, feedback }),
    })
    setStep('done')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDF9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <span style={{ fontSize: 28 }}>⭐</span>
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>Powered by ProGuild.ai</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
          {step === 'done' ? 'Thank you!' : `How was your experience${firstName ? `, ${firstName}` : ''}?`}
        </h1>

        {step === 'rate' && (
          <>
            <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 }}>
              {businessName} just completed work on your property. How did they do?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i}
                  filled={i <= (hover || rating)}
                  onClick={() => handleRate(i)}
                  onHover={() => setHover(i)}
                />
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#9CA3AF' }} onMouseLeave={() => setHover(0)}>
              Tap a star to rate
            </p>
          </>
        )}

        {step === 'feedback' && (
          <>
            <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>
              We're sorry your experience wasn't perfect. Your feedback goes directly to {businessName} to help them improve.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} filled={i <= rating} onClick={() => setRating(i)} onHover={() => {}} />
              ))}
            </div>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="What could have been better?"
              rows={4}
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <button onClick={handleSubmitFeedback} disabled={loading || !feedback.trim()}
              style={{ width: '100%', background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: !feedback.trim() ? 0.5 : 1 }}>
              {loading ? 'Submitting…' : 'Send Feedback'}
            </button>
          </>
        )}

        {step === 'done' && (
          <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 8px', lineHeight: 1.6 }}>
            {rating >= 4
              ? `Your Google review means the world to ${businessName}. Thank you for taking the time!`
              : `Thank you for your honest feedback. ${businessName} will use it to improve.`}
          </p>
        )}

      </div>
    </div>
  )
}
