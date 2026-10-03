import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { SOLUTIONS } from '@/config/solutions'

const SITE = 'https://proguild.ai'
const canonical = `${SITE}/for`
const title = 'ProGuild for Contractors — CRM & Software by Trade | ProGuild'
const description =
  'ProGuild is all-in-one software for Florida trade contractors: CRM, estimates, invoicing, satellite measurements and a verified directory. See the plan for your trade — free for 90 days.'

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
    name: 'ProGuild for Contractors',
    itemListElement: SOLUTIONS.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/for/${s.slug}`, name: s.title })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
        <Navbar />

        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-4xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>Software built for your trade</h1>
            <p className="text-base max-w-2xl" style={{ color: '#4B5563' }}>
              One flat plan replaces your CRM, measurement vendor and lead service. Pick your trade to see what&apos;s included — free for 90 days, no credit card.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="grid gap-4 sm:grid-cols-3">
            {SOLUTIONS.map(s => (
              <Link key={s.slug} href={`/for/${s.slug}`}
                className="flex flex-col rounded-2xl border p-5 transition-colors hover:border-teal-400" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#0F766E' }}>{s.trade}</div>
                <div className="text-lg font-bold mb-2 leading-snug" style={{ color: '#0A1628' }}>{s.title}</div>
                <div className="text-sm mb-3" style={{ color: '#6B7280' }}>Flat {s.price}/mo after a 90-day free trial.</div>
                <span className="mt-auto text-sm font-semibold" style={{ color: '#0F766E' }}>See what&apos;s included →</span>
              </Link>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/contractors" className="text-sm font-semibold underline" style={{ color: '#0F766E' }}>
              See the full For-Pros overview →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
