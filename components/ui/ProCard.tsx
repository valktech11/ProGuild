import Link from 'next/link'
import { Pro } from '@/types'
import { initials, avatarColor, starsHtml, isPaid, isElite } from '@/lib/utils'

interface ProCardProps {
  pro: Pro & { trade_score?: number }
  index?: number
}

export default function ProCard({ pro, index = 0 }: ProCardProps) {
  const [bg, fg] = avatarColor(pro.full_name)
  const rating   = pro.avg_rating || 0
  const reviews  = pro.review_count || 0
  const yrs      = pro.years_experience || 0
  const trade    = pro.trade_category?.category_name || '—'
  const location = [pro.city, pro.state].filter(Boolean).join(', ')
  const score    = pro.trade_score || null

  return (
    <Link
      href={`/pro/${pro.id}`}
      className="group block bg-white border border-gray-100 rounded-2xl p-6 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-50 hover:-translate-y-0.5 transition-all duration-200 relative"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Available for work badge */}
      {pro.available_for_work && (
        <div className="absolute top-4 right-4 flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-medium text-green-700">Available</span>
        </div>
      )}

      {/* Header */}
      <div className="flex gap-4 items-start mb-4">
        {pro.profile_photo_url ? (
          <img src={pro.profile_photo_url} alt={pro.full_name}
            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
            onError={e => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement)?.removeAttribute('style') }}
          />
        ) : null}
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-serif flex-shrink-0"
          style={{ background: bg, color: fg, display: pro.profile_photo_url ? 'none' : 'flex' }}>
          {initials(pro.full_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate pr-16">{pro.full_name}</div>
          <div className="text-sm font-medium text-teal-700">{trade}</div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {pro.is_verified && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-800">✓ Verified</span>
        )}
        {isElite(pro.plan_tier) && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-800">Elite</span>
        )}
        {isPaid(pro.plan_tier) && !isElite(pro.plan_tier) && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-800">Pro</span>
        )}
      </div>

      {/* Location */}
      <div className="text-sm text-gray-400 mb-3">
        {location && <span>{location}</span>}
        {yrs > 0 && <span>{location ? ' · ' : ''}{yrs} yrs exp</span>}
      </div>

      {/* Rating */}
      {rating > 0 ? (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-amber-500 text-sm">{starsHtml(rating)}</span>
          <span className="text-sm font-semibold text-gray-800">{rating.toFixed(1)}</span>
          <span className="text-xs text-gray-400">({reviews})</span>
        </div>
      ) : (
        <div className="h-6 mb-4" />
      )}

      {/* Divider */}
      <div className="border-t border-gray-100 mb-4" />

      {/* Stats + TradeScore */}
      <div className="flex">
        <div className="flex-1 text-center">
          <div className="text-base font-semibold text-gray-900">{reviews}</div>
          <div className="text-xs text-gray-400">Reviews</div>
        </div>
        <div className="flex-1 text-center border-l border-gray-100">
          <div className="text-base font-semibold text-gray-900">{yrs || '—'}</div>
          <div className="text-xs text-gray-400">Yrs exp</div>
        </div>
        {score !== null && (
          <div className="flex-1 text-center border-l border-gray-100">
            <div className="text-base font-semibold text-teal-600">{score}</div>
            <div className="text-xs text-gray-400">TradeScore</div>
          </div>
        )}
      </div>

      {/* CTA */}
      <button className="mt-4 w-full py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 group-hover:bg-teal-50 group-hover:border-teal-200 group-hover:text-teal-700 transition-colors">
        View profile →
      </button>
    </Link>
  )
}
