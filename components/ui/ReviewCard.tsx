'use client'

import { useState } from 'react'
import { containsProfanity } from '@/lib/profanity'
import { initials, avatarColor, timeAgo, starsHtml } from '@/lib/utils'
import { Review } from '@/types'

interface ReviewCardProps {
  review: Review
  proId: string
}

const FLAG_REASONS = ['Inappropriate', 'Fake', 'Wrong pro'] as const
type FlagReason = typeof FLAG_REASONS[number]

export default function ReviewCard({ review, proId }: ReviewCardProps) {
  const comment = review.comment || (review as any).review_text || ''
  const isOffensive = containsProfanity(comment)
  const [revealed, setRevealed] = useState(false)
  const [showFlagMenu, setShowFlagMenu] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const [flagging, setFlagging] = useState(false)

  const [bg, fg] = avatarColor(review.reviewer_name)

  async function handleFlag(reason: FlagReason) {
    setFlagging(true)
    setShowFlagMenu(false)
    try {
      await fetch('/api/review-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: review.id, pro_id: proId, reason }),
      })
    } catch {
      // silent — still mark flagged in UI
    } finally {
      setFlagged(true)
      setFlagging(false)
    }
  }

  return (
    <div className="flex items-start gap-4 px-5 py-4 border-b border-gray-50 relative">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 font-serif"
        style={{ background: bg, color: fg }}
      >
        {initials(review.reviewer_name)}
      </div>

      <div className="flex-1 min-w-0 pr-6">
        {/* Name + stars + time */}
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{review.reviewer_name}</span>
          <span className="text-amber-500 text-xs">{starsHtml(review.rating)}</span>
          <span className="text-xs text-gray-400">
            {timeAgo((review as any).reviewed_at || '')}
          </span>
        </div>

        {/* Comment — collapsed if offensive */}
        {isOffensive && !revealed ? (
          <p className="text-xs text-gray-400 italic">
            Review hidden — may contain inappropriate content.{' '}
            <button
              onClick={() => setRevealed(true)}
              className="text-teal-600 hover:underline not-italic"
            >
              Show anyway →
            </button>
          </p>
        ) : (
          comment && (
            <p className="text-xs text-gray-500 line-clamp-2">{comment}</p>
          )
        )}
      </div>

      {/* Flag button — top right */}
      <div className="absolute top-4 right-5">
        {flagged ? (
          <span className="text-xs text-gray-400">Flagged</span>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowFlagMenu(v => !v)}
              disabled={flagging}
              className="text-gray-300 hover:text-red-400 transition-colors"
              title="Flag this review"
              aria-label="Flag review"
            >
              {/* Flag icon */}
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 2h8l-2 3 2 3H2V2z" />
                <line x1="2" y1="12" x2="2" y2="2" />
              </svg>
            </button>

            {showFlagMenu && (
              <div className="absolute right-0 top-5 bg-white border border-gray-100 rounded-xl shadow-md z-10 py-1 min-w-[140px]">
                {FLAG_REASONS.map(reason => (
                  <button
                    key={reason}
                    onClick={() => handleFlag(reason)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
