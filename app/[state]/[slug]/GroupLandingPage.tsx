'use client'
import Link from 'next/link'

const ALL_GROUPS = [
  { id: 'mechanical', label: 'Mechanical', icon: '⚡', accent: '#14B8A6' },
  { id: 'structural', label: 'Structural', icon: '🏗', accent: '#6366F1' },
  { id: 'finishing',  label: 'Finishing',  icon: '🎨', accent: '#F59E0B' },
  { id: 'property',   label: 'Property',   icon: '🌿', accent: '#10B981' },
  { id: 'specialty',  label: 'Specialty',  icon: '🔐', accent: '#8B5CF6' },
]

interface GroupProps {
  stateSlug: string
  stateName: string
  stateAbbr: string
  groupSlug: string
  group: {
    label: string; icon: string; accent: string; description: string
    trades: { label: string; slug: string }[]
  }
  totalCount: number
  tradeCounts: Record<string, number>
}

export default function GroupLandingPage({
  stateSlug, stateName, groupSlug, group, totalCount, tradeCounts
}: GroupProps) {
  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8', fontFamily: "'DM Sans', sans-serif" }}>

      {/* NAV */}
      <nav className="sticky top-0 z-40 bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#glg)"/><text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text><defs><linearGradient id="glg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#0D7377"/></linearGradient></defs></svg>
            </div>
            <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#14B8A6', fontWeight: 300 }}>.ai</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm hidden sm:block" style={{ color: '#6B7280' }}>Log in</Link>
            <Link href="/login?tab=signup" className="text-xs font-bold px-4 py-2 rounded-lg text-white" style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>Join Free</Link>
          </div>
        </div>
      </nav>

      {/* VISUAL ANCHOR + BREADCRUMB */}
      <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border flex-shrink-0"
            style={{ borderColor: group.accent, borderTopWidth: '2px', background: group.accent + '08' }}>
            <span className="text-lg">{group.icon}</span>
            <span className="text-xs font-bold" style={{ color: group.accent }}>{group.label}</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: '#A89F93' }}>
            <Link href="/" style={{ color: '#A89F93' }}>Home</Link>
            <span>›</span>
            <Link href={`/${stateSlug}`} style={{ color: '#A89F93' }}>{stateName}</Link>
            <span>›</span>
            <span className="font-semibold" style={{ color: group.accent }}>{group.label}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 flex gap-8">

        {/* SIDEBAR */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-base">{group.icon}</span>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: group.accent }}>{group.label}</span>
              </div>
              <div className="space-y-0.5">
                {group.trades.map(trade => (
                  <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                    className="flex items-center text-sm px-2.5 py-2 rounded-lg transition-colors"
                    style={{ color: '#6B7280' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F5F0E8'; e.currentTarget.style.color = group.accent }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                    {trade.label}
                  </Link>
                ))}
              </div>
            </div>
            <div style={{ height: '1px', background: '#E8E2D9' }} />
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-3 px-2" style={{ color: '#A89F93' }}>Other trades</div>
              <div className="space-y-0.5">
                {ALL_GROUPS.filter(g => g.id !== groupSlug).map(g => (
                  <Link key={g.id} href={`/${stateSlug}/${g.id}`}
                    className="flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg transition-colors"
                    style={{ color: '#6B7280' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F5F0E8'; e.currentTarget.style.color = g.accent }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                    <span className="text-base flex-shrink-0">{g.icon}</span>
                    <span>{g.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="flex-1 min-w-0">

        {/* HERO */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            {group.label} Contractors in {stateName}
          </h1>
          <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: '#6B7280' }}>
            {group.description} Every pro is verified against the {stateName} state licensing database.
            {totalCount > 0 && ` Browse ${totalCount.toLocaleString()}+ verified ${group.label.toLowerCase()} professionals.`}
          </p>
        </div>

        {/* TRADE CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {group.trades.map(trade => {
            const count = tradeCounts[trade.slug] || 0
            return (
              <Link key={trade.slug}
                href={`/${stateSlug}/${trade.slug}`}
                className="bg-white rounded-2xl border p-6 hover:shadow-md transition-all hover:-translate-y-0.5 block"
                style={{ borderColor: '#E8E2D9', borderTopWidth: '3px', borderTopColor: group.accent, textDecoration: 'none' }}>
                <div className="font-bold text-base mb-1" style={{ color: '#0A1628' }}>{trade.label}</div>
                <div className="text-xs mb-4" style={{ color: '#A89F93' }}>
                  {count > 0
                    ? <><span className="font-semibold" style={{ color: group.accent }}>{count.toLocaleString()}</span> verified pros in {stateName}</>
                    : `Verified pros in ${stateName}`}
                </div>
                <div className="flex items-center gap-1 text-xs font-bold" style={{ color: group.accent }}>
                  Browse {trade.label}s <span>→</span>
                </div>
              </Link>
            )
          })}
        </div>

        {/* SEO CONTENT */}
        <div className="border-t pt-10" style={{ borderColor: '#E8E2D9' }}>
          <h2 className="text-lg font-bold mb-3" style={{ color: '#0A1628' }}>
            Hiring {group.label} contractors in {stateName}
          </h2>
          <p className="text-sm leading-relaxed mb-6 max-w-3xl" style={{ color: '#6B7280' }}>
            ProGuild verifies every {group.label.toLowerCase()} contractor in {stateName} against the state licensing board.
            Unlike other platforms that charge pros per lead, ProGuild uses a flat monthly subscription —
            pros respond faster because they are not paying per contact. Find a verified {group.label.toLowerCase()} professional
            and hire them directly.
          </p>
          <div className="flex flex-wrap gap-2">
            {group.trades.map(trade => (
              <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#fff' }}
                onMouseEnter={e => { e.currentTarget.style.color = group.accent; e.currentTarget.style.borderColor = group.accent }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.borderColor = '#E8E2D9' }}>
                {trade.label}s in {stateName}
              </Link>
            ))}
          </div>
        </div>
        </div>{/* end main */}
      </div>{/* end flex */}

      {/* FOOTER */}
      <footer className="border-t py-8 px-6 mt-8" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#14B8A6', fontWeight: 300 }}>.ai</span></span>
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#A89F93' }}>
            {[['/', 'Home'],[`/${stateSlug}`, stateName],['/search', 'Find a Pro'],['/privacy', 'Privacy']].map(([href, label]) => (
              <Link key={href} href={href} style={{ color: '#A89F93' }}>{label}</Link>
            ))}
          </div>
          <div className="text-xs" style={{ color: '#C4BAB0' }}>© 2026 ProGuild.ai</div>
        </div>
      </footer>
    </div>
  )
}
