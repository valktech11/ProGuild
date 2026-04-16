import Link from 'next/link'
import { Pro } from '@/types'
import { initials, avatarColor, starsHtml, isPaid, isElite } from '@/lib/utils'

interface ProCardProps {
  pro: Pro & { trade_score?: number; osha_card_type?: string; insurance_status?: string }
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
  const hasOsha  = !!(pro as any).osha_card_type
  const hasInsurance = (pro as any).insurance_status === 'active'

  return (
    <Link
      href={`/pro/${pro.id}`}
      className="group block bg-white border border-gray-200 rounded-xl p-5 hover:border-teal-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 relative"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header — avatar with availability ring + name */}
      <div className="flex gap-3 items-start mb-3">
        <div className="relative flex-shrink-0">
          {pro.profile_photo_url ? (
            <img src={pro.profile_photo_url} alt={pro.full_name}
              className={`w-11 h-11 rounded-full object-cover ${pro.available_for_work ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
              onError={e => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement)?.removeAttribute('style') }}
            />
          ) : null}
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-serif flex-shrink-0 ${pro.available_for_work ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
            style={{ background: bg, color: fg, display: pro.profile_photo_url ? 'none' : 'flex' }}>
            {initials(pro.full_name)}
          </div>
          {/* Available pulse dot */}
          {pro.available_for_work && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate text-sm leading-snug">{pro.full_name}</div>
          <div className="text-xs font-medium text-teal-700 mt-0.5">{trade}</div>
          {location && <div className="text-xs text-gray-400 mt-0.5 truncate">{location}</div>}
        </div>
      </div>

      {/* Trust badge row */}
      <div className="flex flex-wrap gap-1 mb-3">
        {pro.is_verified && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-teal-600">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
            </svg>
            Verified
          </span>
        )}
        {hasOsha && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            🦺 {(pro as any).osha_card_type}
          </span>
        )}
        {hasInsurance && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">🛡 Insured</span>
        )}
        {isElite(pro.plan_tier) && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800">Elite</span>
        )}
        {isPaid(pro.plan_tier) && !isElite(pro.plan_tier) && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-800">Pro</span>
        )}
      </div>

      {/* Rating */}
      {rating > 0 ? (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-amber-500 text-xs">{starsHtml(rating)}</span>
          <span className="text-xs font-semibold text-gray-800">{rating.toFixed(1)}</span>
          <span className="text-xs text-gray-400">({reviews})</span>
        </div>
      ) : (
        <div className="mb-3" />
      )}

      {/* Divider */}
      <div className="border-t border-gray-100 mb-3" />

      {/* Stats row — never show 0 */}
      <div className="flex text-center">
        <div className="flex-1">
          {reviews > 0 ? (
            <>
              <div className="text-sm font-semibold text-gray-900">{reviews}</div>
              <div className="text-xs text-gray-400">Reviews</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-gray-500">New member</div>
              <div className="text-xs text-gray-400 mt-0.5">{pro.is_verified ? 'Verified pro' : 'References on request'}</div>
            </>
          )}
        </div>
        <div className="flex-1 border-l border-gray-100">
          {yrs > 0 ? (
            <>
              <div className="text-sm font-semibold text-gray-900">{yrs}</div>
              <div className="text-xs text-gray-400">Yrs exp</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-gray-500">{trade !== '—' ? trade : 'Pro'}</div>
              <div className="text-xs text-gray-400 mt-0.5">Trade</div>
            </>
          )}
        </div>
        {score !== null && (
          <div className="flex-1 border-l border-gray-100">
            <div className="text-sm font-semibold text-teal-600">{score}</div>
            <div className="text-xs text-gray-400">TradeScore</div>
          </div>
        )}
      </div>

      {/* CTA */}
      <button className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 group-hover:bg-teal-50 group-hover:border-teal-200 group-hover:text-teal-700 transition-colors">
        View profile →
      </button>
    </Link>
  )
}
