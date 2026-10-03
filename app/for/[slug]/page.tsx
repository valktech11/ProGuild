import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { SOLUTIONS, getSolution, TYPICAL_STACK } from '@/config/solutions'

export const revalidate = 86400

const SITE = 'https://proguild.ai'

export async function generateStaticParams() {
  return SOLUTIONS.map(s => ({ slug: s.slug }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const s = getSolution(slug)
  if (!s) return { title: 'ProGuild for Contractors', robots: { index: false, follow: true } }
  const canonical = `${SITE}/for/${s.slug}`
  return {
    title: s.metaTitle,
    description: s.description,
    keywords: s.keywords,
    alternates: { canonical },
    openGraph: { type: 'website', title: s.title, description: s.description, url: canonical, siteName: 'ProGuild' },
    twitter: { card: 'summary_large_image', title: s.title, description: s.description },
  }
}

export default async function SolutionPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const s = getSolution(slug)
  if (!s) notFound()

  const canonical = `${SITE}/for/${s.slug}`

  const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `ProGuild — ${s.trade} CRM`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android',
    description: s.description,
    url: canonical,
    offers: {
      '@type': 'Offer',
      price: s.price.replace(/[^0-9.]/g, ''),
      priceCurrency: 'USD',
      description: 'Free for 90 days, then a flat monthly plan.',
    },
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: s.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'For Contractors', item: `${SITE}/for` },
      { '@type': 'ListItem', position: 3, name: s.title, item: canonical },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
        <Navbar />

        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-2 text-sm" style={{ color: '#6E6456' }}>
            <Link href="/" className="hover:text-teal-600 transition-colors" style={{ color: '#6E6456' }}>Home</Link>
            <span>›</span>
            <Link href="/for" className="hover:text-teal-600 transition-colors" style={{ color: '#6E6456' }}>For Contractors</Link>
            <span>›</span>
            <span className="font-semibold" style={{ color: '#0F766E' }}>{s.trade}</span>
          </div>
        </div>

        {/* Hero */}
        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-5xl mx-auto px-6 py-12">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 leading-tight" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>{s.title}</h1>
            <p className="text-lg mb-6 max-w-2xl" style={{ color: '#4B5563' }}>{s.intro}</p>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <Link href="/login?tab=signup" className="px-6 py-3 rounded-xl font-semibold text-white text-base" style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>Start free for 90 days →</Link>
              <Link href="/claim/find" className="px-6 py-3 rounded-xl font-semibold text-base border" style={{ borderColor: '#E8E2D9', color: '#0A1628', background: '#fff' }}>Find your DBPR profile</Link>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold" style={{ color: '#0A1628' }}>
              {['No credit card required', 'Cancel anytime', `Flat ${s.price}/mo after trial`, 'Import jobs by CSV'].map(x => (
                <span key={x} className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shrink-0" style={{ background: '#0F766E' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  </span>
                  {x}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12">
          {/* Features */}
          <h2 className="text-2xl font-bold mb-6" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>Everything included in one flat plan</h2>
          <div className="grid gap-4 sm:grid-cols-2 mb-14">
            {s.features.map((f, i) => (
              <div key={i} className="rounded-2xl border p-5" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                <h3 className="text-base font-bold mb-1.5" style={{ color: '#0A1628' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Cost comparison */}
          <div className="rounded-2xl border p-6 mb-14" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>One flat rate instead of a stack of bills</h2>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>What contractors typically pay for the same capabilities, piece by piece:</p>
            <div className="space-y-2 mb-5">
              {TYPICAL_STACK.map(t => (
                <div key={t.tool} className="flex items-center justify-between text-sm py-2 border-b" style={{ borderColor: '#F3F4F6' }}>
                  <span style={{ color: '#374151' }}>{t.tool}</span>
                  <span className="font-mono" style={{ color: '#6B7280' }}>{t.cost}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(15,118,110,0.06)' }}>
              <span className="font-bold" style={{ color: '#0A1628' }}>ProGuild — all of it</span>
              <span className="font-bold text-lg" style={{ color: '#0F766E' }}>{s.price}/mo flat</span>
            </div>
          </div>

          {/* FAQ */}
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>Frequently asked questions</h2>
          <div className="space-y-4 mb-12">
            {s.faqs.map((f, i) => (
              <div key={i} className="rounded-2xl border p-5" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                <h3 className="text-base font-bold mb-2" style={{ color: '#0A1628' }}>{f.q}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>{f.a}</p>
              </div>
            ))}
          </div>

          {/* Final CTA */}
          <div className="rounded-2xl p-8 text-center" style={{ background: 'linear-gradient(135deg, #0A1628, #0F2240)' }}>
            <h2 className="text-2xl font-bold mb-2 text-white">Start free for 90 days</h2>
            <p className="text-sm mb-6" style={{ color: '#94A3B8' }}>No credit card needed. Your DBPR profile may already be built — claim it in 30 seconds.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/login?tab=signup" className="px-6 py-3 rounded-xl font-semibold text-white text-base" style={{ background: 'linear-gradient(135deg, #0F766E, #14B8A6)' }}>Get started →</Link>
              <Link href="/claim/find" className="px-6 py-3 rounded-xl font-semibold text-base" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>Find your profile</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
