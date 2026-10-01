'use client'
import type { ReactNode } from 'react'
import Navbar from '@/components/layout/Navbar'
import Link from 'next/link'

const TEAL = '#0F766E'

const ico = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const GROUP_ICONS: Record<string, ReactNode> = {
  mechanical: (<svg {...ico}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>),
  structural: (<svg {...ico}><path d="M3 21h18"/><path d="M6 21V8l6-4 6 4v13"/><path d="M10 21v-5h4v5"/></svg>),
  finishing:  (<svg {...ico}><path d="M3 21c0-2.4 1.7-4 3.5-4L9 19.3C9 21.1 7.2 22.5 5 22.5"/><path d="M8.5 16.5 18 7a2 2 0 0 0-3-3L5.5 13.5z"/></svg>),
  property:   (<svg {...ico}><path d="M4 20c0-8 6-13 16-13 0 10-6 14-16 13z"/><path d="M4 20c4-5 8-8 12-9.5"/></svg>),
  specialty:  (<svg {...ico}><path d="M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-3z"/><path d="M12 9.5v5M9.5 12h5"/></svg>),
}

const ALL_GROUPS = [
  { id: 'mechanical', label: 'Mechanical' },
  { id: 'structural', label: 'Structural' },
  { id: 'finishing',  label: 'Finishing' },
  { id: 'property',   label: 'Property' },
  { id: 'specialty',  label: 'Specialty' },
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
}

export default function GroupLandingPage({
  stateSlug, stateName, groupSlug, group,
}: GroupProps) {
  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
      <Navbar />

      {/* BREADCRUMB */}
      <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-2 text-xs" style={{ color: '#8A8578' }}>
          <Link href="/" style={{ color: '#8A8578' }}>Home</Link>
          <span>›</span>
          <Link href={`/${stateSlug}`} style={{ color: '#8A8578' }}>{stateName}</Link>
          <span>›</span>
          <span className="font-semibold" style={{ color: '#0A1628' }}>{group.label}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 flex gap-8">

        {/* SIDEBAR */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3 px-2" style={{ color: TEAL }}>
                {GROUP_ICONS[groupSlug]}
                <span className="text-xs font-bold uppercase tracking-widest">{group.label}</span>
              </div>
              <div className="space-y-0.5">
                {group.trades.map(trade => (
                  <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                    className="flex items-center text-sm px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(15,118,110,0.06)] hover:text-[#0F766E]"
                    style={{ color: '#55504A' }}>
                    {trade.label}
                  </Link>
                ))}
              </div>
            </div>
            <div style={{ height: '1px', background: '#E8E2D9' }} />
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-3 px-2" style={{ color: '#6E6456' }}>Other trades</div>
              <div className="space-y-0.5">
                {ALL_GROUPS.filter(g => g.id !== groupSlug).map(g => (
                  <Link key={g.id} href={`/${stateSlug}/${g.id}`}
                    className="flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg transition-colors hover:bg-[rgba(15,118,110,0.06)] hover:text-[#0F766E]"
                    style={{ color: '#55504A' }}>
                    <span className="flex-shrink-0" style={{ color: TEAL }}>{GROUP_ICONS[g.id]}</span>
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
          <div className="mb-9">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
              style={{ background: 'rgba(15,118,110,0.08)', color: TEAL }}>
              {GROUP_ICONS[groupSlug]}
            </div>
            <h1 className="font-bold leading-[1.1] tracking-tight mb-3"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontFamily: "'DM Serif Display', serif", color: '#0A1628' }}>
              {group.label} contractors in{' '}
              <span style={{ background: 'linear-gradient(100deg, #0F766E, #14B8A6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{stateName}</span>
            </h1>
            <p className="text-base leading-relaxed max-w-2xl" style={{ color: '#4B5563' }}>
              {group.description} Every pro is checked against the {stateName} state licensing database — no lead fees, contact them directly.
            </p>
          </div>

          {/* TRADE CARDS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {group.trades.map(trade => (
              <Link key={trade.slug}
                href={`/${stateSlug}/${trade.slug}`}
                className="pg-tile bg-white rounded-2xl border p-6 block"
                style={{ borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', textDecoration: 'none' }}>
                <div className="font-bold text-base mb-1" style={{ color: '#0A1628' }}>{trade.label}</div>
                <div className="text-xs mb-4" style={{ color: '#8A8578' }}>Licensed &amp; verified in {stateName}</div>
                <div className="flex items-center gap-1 text-xs font-bold" style={{ color: TEAL }}>
                  Browse {trade.label}s <span>→</span>
                </div>
              </Link>
            ))}
          </div>

          {/* SEO CONTENT */}
          <div className="border-t pt-10" style={{ borderColor: '#E8E2D9' }}>
            <h2 className="text-xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Hiring {group.label} contractors in {stateName}
            </h2>
            <p className="text-sm leading-relaxed mb-6 max-w-3xl" style={{ color: '#55504A' }}>
              ProGuild checks every {group.label.toLowerCase()} contractor in {stateName} against the state licensing board.
              Unlike platforms that charge pros per lead, ProGuild uses a flat monthly subscription — pros respond faster
              because they are not paying per contact. Find a verified {group.label.toLowerCase()} professional and hire them directly.
            </p>
            <div className="flex flex-wrap gap-2">
              {group.trades.map(trade => (
                <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                  className="pg-pill text-xs px-3 py-1.5 rounded-full border"
                  style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#fff' }}>
                  {trade.label}s in {stateName}
                </Link>
              ))}
            </div>
          </div>
        </div>{/* end main */}
      </div>{/* end flex */}

      {/* FOOTER */}
      <footer className="border-t py-8 px-6 mt-8" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#0F766E', fontWeight: 500 }}>.ai</span></span>
          <div className="flex flex-wrap gap-5 text-xs">
            {[['/', 'Home'],[`/${stateSlug}`, stateName],['/search', 'Find a Pro'],['/privacy', 'Privacy']].map(([href, label]) => (
              <Link key={href} href={href} style={{ color: '#6B7280' }}>{label}</Link>
            ))}
          </div>
          <div className="text-xs" style={{ color: '#9CA3AF' }}>© 2026 ProGuild.ai</div>
        </div>
      </footer>
    </div>
  )
}
