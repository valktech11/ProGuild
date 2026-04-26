'use client'

import { useState, useEffect } from 'react'
import { Session } from '@/types'

interface BusinessCardModalProps {
  session: Session
  proData: any
  onClose: () => void
}

export default function BusinessCardModal({ session, proData, onClose }: BusinessCardModalProps) {
  const [copied, setCopied] = useState(false)
  const cardUrl = `https://proguild.ai/card/${session.id}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(cardUrl)}&color=0f766e&bgcolor=ffffff&margin=8`

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(cardUrl) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${session.name} — ProGuild Verified Pro`,
          text: `${session.name}, ${session.trade || 'licensed pro'} in ${session.city || 'Florida'}`,
          url: cardUrl,
        })
        return
      } catch {}
    }
    copyLink()
  }

  const avgRating = proData?.avg_rating || 0
  const reviewCount = proData?.review_count || 0
  const licenseNumber = proData?.license_number || ''

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,22,40,0.6)' }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">

        {/* Card face — dark navy */}
        <div className="px-6 pt-6 pb-5 text-center" style={{ background: '#0A1628' }}>

          {/* ProGuild badge */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" fill="#0F766E" />
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#14B8A6' }}>
              ProGuild · Verified Pro
            </span>
          </div>

          {/* Avatar */}
          {proData?.profile_photo_url ? (
            <img
              src={proData.profile_photo_url}
              alt={session.name}
              className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2"
              style={{ borderColor: '#0F766E' }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3"
              style={{ background: '#0F766E', color: 'white' }}
            >
              {session.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Name + trade + city */}
          <div className="text-xl font-bold text-white mb-0.5">{session.name}</div>
          <div className="text-sm" style={{ color: '#9FE1CB' }}>
            {session.trade || 'Licensed Professional'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#5DCAA5' }}>
            {session.city ? `${session.city}, FL` : 'Florida'}
          </div>

          {/* License number */}
          {licenseNumber && (
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#9FE1CB' }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#14B8A6" strokeWidth="1.2" strokeLinecap="round">
                <rect x="1" y="1.5" width="9" height="8" rx="1.5" />
                <path d="M3 4.5h5M3 6.5h3" />
              </svg>
              License: {licenseNumber}
            </div>
          )}

          {/* Rating */}
          {avgRating > 0 && (
            <div className="flex items-center justify-center gap-1 mt-3">
              {[1,2,3,4,5].map(i => (
                <svg key={i} width="12" height="12" viewBox="0 0 12 12"
                  fill={i <= Math.round(avgRating) ? '#14B8A6' : 'transparent'}
                  stroke="#14B8A6" strokeWidth="0.8">
                  <path d="M6 1l1.2 2.9L10 4.3l-2 2 .5 2.9L6 8l-2.5 1.2.5-2.9-2-2 2.8-.4L6 1z" />
                </svg>
              ))}
              <span className="text-xs ml-1" style={{ color: '#5DCAA5' }}>
                {avgRating.toFixed(1)} ({reviewCount})
              </span>
            </div>
          )}
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center px-6 py-4 border-b border-gray-100">
          <img src={qrUrl} alt="QR code" width={180} height={180} className="rounded-lg" />
          <p className="text-xs text-gray-400 mt-2 text-center">
            Scan to verify license &amp; view profile
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 space-y-2">
          <button
            onClick={shareNative}
            className="w-full py-2.5 text-center text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}
          >
            Share →
          </button>

          <a
            href={`/card/${session.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2.5 text-center text-sm font-semibold border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Preview my card →
          </a>

          <button
            onClick={copyLink}
            className="block w-full py-2 text-center text-sm text-teal-600 hover:underline transition-colors"
          >
            {copied ? '✓ Link copied!' : '🔗 Copy card link'}
          </button>

          <button
            onClick={onClose}
            className="block w-full py-2 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
