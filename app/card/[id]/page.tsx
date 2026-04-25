'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { initials, avatarColor, starsHtml } from '@/lib/utils'

function statusColor(status: string) {
  if (status === 'active')        return { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  }
  if (status === 'expiring_soon') return { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400'  }
  if (status === 'expired')       return { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    }
  return                                 { bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200',   dot: 'bg-gray-400'   }
}

export default function DigitalCardPage() {
  const { id } = useParams<{ id: string }>()
  const [pro, setPro]           = useState<any>(null)
  const [licenses, setLicenses] = useState<any[]>([])
  const [reviews, setReviews]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/pros/${id}`).then(r => r.json()),
      fetch(`/api/pro-licenses?pro_id=${id}`).then(r => r.json()),
      fetch(`/api/reviews?pro_id=${id}`).then(r => r.json()),
    ]).then(([pd, ld, rd]) => {
      setPro(pd.pro)
      setLicenses(ld.licenses || [])
      setReviews((rd.reviews || []).slice(0, 3))
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!pro) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400 text-sm">
      Pro not found
    </div>
  )

  const [bg, fg] = avatarColor(pro.full_name)
  const trade = pro.trade_category?.category_name || '—'
  const rating = pro.avg_rating || 0
  const reviewCnt = pro.review_count || 0

  function share() {
    const url = `${window.location.origin}/card/${id}`
    if (navigator.share) {
      navigator.share({ title: `${pro.full_name} — ProGuild.ai`, url })
    } else {
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-10 px-4">

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Header strip */}
        <div className="h-16 bg-gradient-to-r from-teal-600 to-teal-500" />

        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="-mt-10 mb-4 flex justify-between items-end">
            {pro.profile_photo_url ? (
              <img src={pro.profile_photo_url} alt={pro.full_name}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md" />
            ) : (
              <div className="w-20 h-20 rounded-full ring-4 ring-white shadow-md flex items-center justify-center text-2xl font-serif"
                style={{ background: bg, color: fg }}>
                {initials(pro.full_name)}
              </div>
            )}
            {pro.available_for_work && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Available
              </span>
            )}
          </div>

          {/* Name + trade */}
          <h1 className="font-serif text-2xl text-gray-900 leading-tight">{pro.full_name}</h1>
          {pro.business_name && pro.business_name !== pro.full_name && (
            <p className="text-sm text-gray-400 mt-0.5">{pro.business_name}</p>
          )}
          <p className="text-sm font-medium text-teal-700 mt-1">{trade}</p>
          {(pro.city || pro.state) && (
            <p className="text-sm text-gray-400 mt-0.5">📍 {[pro.city, pro.state].filter(Boolean).join(', ')}</p>
          )}

          {/* Rating */}
          {rating > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-amber-400 text-sm">{starsHtml(rating)}</span>
              <span className="text-sm font-semibold text-gray-900">{rating.toFixed(1)}</span>
              <span className="text-sm text-gray-400">({reviewCnt})</span>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100">
            {[
              { label: 'Reviews',   value: reviewCnt },
              { label: 'Yrs exp',   value: pro.years_experience || '—' },
              { label: 'Enquiries', value: pro.lead_count || 0 },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-lg font-semibold text-teal-600">{s.value}</div>
                <div className="text-sm text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* License badges */}
        {(licenses.length > 0 || pro.license_number) && (
          <div className="px-6 pb-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Licenses</div>
            <div className="space-y-2">
              {licenses.length > 0 ? licenses.map(lic => {
                const c = statusColor(lic.license_status)
                const expiryStr = lic.license_expiry_date
                  ? new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null
                return (
                  <div key={lic.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${c.bg} ${c.border}`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold ${c.text}`}>{lic.trade_name}</div>
                      <div className="text-sm text-gray-400">{lic.license_number}{expiryStr ? ` · exp ${expiryStr}` : ''}</div>
                    </div>
                    <span className={`text-xs font-semibold ${c.text}`}>
                      {lic.license_status === 'active' ? '✓ Active' : lic.license_status === 'expiring_soon' ? '⚠️ Expiring' : lic.license_status === 'expired' ? '🔴 Expired' : '—'}
                    </span>
                  </div>
                )
              }) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-amber-50 border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">Licensed · {pro.license_number}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top reviews */}
        {reviews.length > 0 && (
          <div className="px-6 pb-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Recent reviews</div>
            <div className="space-y-2">
              {reviews.map(r => (
                <div key={r.id} className="bg-stone-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">{r.reviewer_name || 'Homeowner'}</span>
                    <span className="text-amber-400 text-xs">{starsHtml(r.rating)}</span>
                  </div>
                  {r.comment && <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="px-6 pb-6 space-y-2">
          <Link href={`/pro/${id}`}
            className="block w-full py-3 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
            View full profile →
          </Link>
          <button onClick={share}
            className="block w-full py-2.5 text-center border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
            {copied ? '✓ Link copied!' : '🔗 Share this card'}
          </button>
        </div>

        {/* Footer brand */}
        <div className="bg-gray-50 border-t border-gray-100 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-400">Powered by</span>
          <Link href="/" className="font-serif text-sm text-gray-900">Pro<span className="text-teal-600">Guild</span><span className="text-gray-500 font-sans font-medium text-sm">.ai</span></Link>
        </div>
      </div>

      {/* Share button below card */}
      <p className="text-gray-600 text-xs mt-6 text-center">
        Scan or share this card with homeowners
      </p>
    </div>
  )
}
