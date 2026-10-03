import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { GUIDES } from '@/config/guides'

const SITE = 'https://proguild.ai'
const canonical = `${SITE}/guides`
const title = 'Contractor & Roofing Guides for Florida Homeowners | ProGuild'
const description =
  'Practical guides for Florida homeowners: how to verify a contractor’s license, what license codes mean, how to hire a roofer, and what drives roof replacement cost.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { type: 'website', title, description, url: canonical, siteName: 'ProGuild' },
  twitter: { card: 'summary', title, description },
}

export default function Page() {
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'ProGuild Guides',
    itemListElement: GUIDES.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/guides/${g.slug}`,
      name: g.title,
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
        <Navbar />

        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-4xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>Guides</h1>
            <p className="text-base" style={{ color: '#4B5563' }}>
              Straight answers for Florida homeowners hiring licensed contractors — verifying licenses,
              reading DBPR codes, hiring roofers, and understanding roof cost.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="grid gap-4 sm:grid-cols-2">
            {GUIDES.map(g => (
              <Link key={g.slug} href={`/guides/${g.slug}`}
                className="flex flex-col rounded-2xl border p-5 transition-colors hover:border-teal-400" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#0F766E' }}>{g.category} · {g.readMins} min</div>
                <div className="text-lg font-bold mb-2 leading-snug" style={{ color: '#0A1628' }}>{g.title}</div>
                <div className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{g.description}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
