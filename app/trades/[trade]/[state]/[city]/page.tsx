import { Metadata } from 'next'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase'
import { initials, avatarColor, starsHtml, isPaid } from '@/lib/utils'

interface Props {
  params: Promise<{ trade: string; state: string; city: string }>
}

// Generate metadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { trade, state, city } = await params
  const tradeName = decodeURIComponent(trade).replace(/-/g, ' ')
  const cityName  = decodeURIComponent(city).replace(/-/g, ' ')
  const stateName = state.toUpperCase()

  return {
    title:       `Licensed ${tradeName}s in ${cityName}, ${stateName} | TradesNetwork`,
    description: `Find verified, licensed ${tradeName}s in ${cityName}, ${stateName}. Browse profiles, read reviews, and contact trusted trade professionals near you.`,
    openGraph: {
      title:       `Licensed ${tradeName}s in ${cityName}, ${stateName}`,
      description: `Browse ${tradeName}s in ${cityName}, ${stateName} — verified licenses, real reviews, direct contact.`,
    },
  }
}

async function getPros(trade: string, state: string, city: string) {
  const tradeName = decodeURIComponent(trade).replace(/-/g, ' ')
  const cityName  = decodeURIComponent(city).replace(/-/g, ' ')

  // Find trade category
  const { data: cat } = await getSupabaseAdmin()
    .from('trade_categories')
    .select('id')
    .ilike('category_name', tradeName)
    .single()

  if (!cat) return []

  const { data } = await getSupabaseAdmin()
    .from('pros')
    .select(`*, trade_category:trade_categories(category_name)`)
    .eq('trade_category_id', cat.id)
    .eq('profile_status', 'Active')
    .ilike('city', cityName)
    .ilike('state', state)
    .order('avg_rating', { ascending: false, nullsFirst: false })
    .limit(24)

  return data || []
}

export default async function TradeCityPage({ params }: Props) {
  const { trade, state, city } = await params
  const tradeName = decodeURIComponent(trade).replace(/-/g, ' ')
  const cityName  = decodeURIComponent(city).replace(/-/g, ' ')
  const stateUpper = state.toUpperCase()
  const pros = await getPros(trade, state, city)

  // Capitalise trade name properly
  const tradeLabel = tradeName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const cityLabel  = cityName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">All trades</Link>
          <Link href="/post-job" className="text-sm font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Post a job</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
          <Link href="/" className="hover:text-teal-600 transition-colors">Home</Link>
          <span>→</span>
          <span>{tradeLabel}s</span>
          <span>→</span>
          <span>{stateUpper}</span>
          <span>→</span>
          <span className="text-gray-700">{cityLabel}</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-gray-900 mb-3">
            Licensed {tradeLabel}s in {cityLabel}, {stateUpper}
          </h1>
          <p className="text-lg text-gray-400 font-light leading-relaxed">
            Browse {pros.length} verified {tradeLabel.toLowerCase()}
            {pros.length !== 1 ? 's' : ''} in {cityLabel}. 
            All professionals listed have been verified against state licensing databases.
          </p>
        </div>

        {/* Trust signals */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: '✓', label: 'License verified', sub: 'From state database' },
            { icon: '⭐', label: 'Real reviews',     sub: 'From verified customers' },
            { icon: '🔒', label: 'Safe contact',     sub: 'Direct to the pro' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-xs font-semibold text-gray-800">{s.label}</div>
              <div className="text-xs text-gray-400">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Pro grid */}
        {pros.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center">
            <div className="text-4xl mb-3 opacity-20">🔍</div>
            <h2 className="font-serif text-xl text-gray-700 mb-2">No {tradeLabel.toLowerCase()}s listed yet in {cityLabel}</h2>
            <p className="text-gray-400 text-sm mb-6">Try browsing all {tradeLabel.toLowerCase()}s in {stateUpper} or search our full directory.</p>
            <Link href={`/?trade=${encodeURIComponent(tradeLabel)}`} className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors">
              Browse all {tradeLabel.toLowerCase()}s
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pros.map((pro: any) => {
              const [bg, fg] = avatarColor(pro.full_name)
              const rating   = pro.avg_rating || 0
              const location = [pro.city, pro.state].filter(Boolean).join(', ')
              return (
                <Link key={pro.id} href={`/pro/${pro.id}`}
                  className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-teal-300 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex gap-4 items-start mb-4">
                    {pro.profile_photo_url ? (
                      <img src={pro.profile_photo_url} alt={pro.full_name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-serif text-base flex-shrink-0"
                        style={{ background: bg, color: fg }}>{initials(pro.full_name)}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{pro.full_name}</div>
                      <div className="text-sm font-medium text-teal-700">{tradeLabel}</div>
                      <div className="text-xs text-gray-400">{location}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {pro.is_verified && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800">✓ Verified</span>}
                    {pro.license_number && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Licensed</span>}
                    {isPaid(pro.plan_tier) && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">Pro</span>}
                  </div>
                  {rating > 0 ? (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-500 text-sm">{starsHtml(rating)}</span>
                      <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
                      <span className="text-xs text-gray-400">({pro.review_count})</span>
                    </div>
                  ) : <div className="h-5 mb-3" />}
                  {pro.bio && <p className="text-xs text-gray-500 line-clamp-2 mb-4">{pro.bio}</p>}
                  <div className="mt-3 w-full py-2 text-center text-sm font-medium text-teal-700 border border-teal-200 rounded-lg bg-teal-50">
                    View profile →
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* SEO footer text */}
        <div className="mt-12 bg-white border border-gray-100 rounded-2xl p-7">
          <h2 className="font-serif text-xl text-gray-900 mb-3">
            Hiring a {tradeLabel} in {cityLabel}, {stateUpper}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            When hiring a {tradeLabel.toLowerCase()} in {cityLabel}, always verify their license is active and in good standing
            with the {stateUpper} state licensing board. All professionals on TradesNetwork have been 
            cross-referenced with official state licensing databases.
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Browse profiles, read verified reviews from real customers, and contact pros directly.
            No middleman. No hidden fees.
          </p>
          <div className="mt-5 flex gap-3 flex-wrap">
            <Link href={`/`} className="text-sm text-teal-600 font-medium hover:underline">
              Browse all {tradeLabel.toLowerCase()}s →
            </Link>
            <Link href="/post-job" className="text-sm text-teal-600 font-medium hover:underline">
              Post a job →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
