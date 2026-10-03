import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { GUIDES, getGuide, type GuideBlock } from '@/config/guides'

export const revalidate = 86400

const SITE = 'https://proguild.ai'

export async function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const g = getGuide(slug)
  if (!g) return { title: 'Guide | ProGuild', robots: { index: false, follow: true } }
  const canonical = `${SITE}/guides/${g.slug}`
  return {
    title: g.metaTitle,
    description: g.description,
    keywords: g.keywords,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title: g.title,
      description: g.description,
      url: canonical,
      siteName: 'ProGuild',
      publishedTime: g.datePublished,
      modifiedTime: g.dateModified,
    },
    twitter: { card: 'summary_large_image', title: g.title, description: g.description },
  }
}

function Block({ b }: { b: GuideBlock }) {
  switch (b.type) {
    case 'h2':
      return <h2 className="text-2xl font-bold mt-9 mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>{b.text}</h2>
    case 'p':
      return <p className="text-base leading-relaxed mb-4" style={{ color: '#374151' }}>{b.text}</p>
    case 'ul':
      return (
        <ul className="mb-4 space-y-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-base leading-relaxed" style={{ color: '#374151' }}>
              <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#0F766E' }} />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="mb-4 space-y-2.5">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-base leading-relaxed" style={{ color: '#374151' }}>
              <span className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold flex-shrink-0" style={{ background: '#0F766E' }}>{i + 1}</span>
              <span>{it}</span>
            </li>
          ))}
        </ol>
      )
    case 'callout':
      return (
        <div className="my-5 rounded-2xl border-l-4 p-4" style={{ borderColor: '#0F766E', background: 'rgba(15,118,110,0.05)' }}>
          <p className="text-sm leading-relaxed" style={{ color: '#0A1628' }}>{b.text}</p>
        </div>
      )
    case 'cta':
      return (
        <div className="my-6 rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
          <span className="text-base font-semibold" style={{ color: '#0A1628' }}>{b.text}</span>
          <Link href={b.href} className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm whitespace-nowrap" style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
            {b.label}
          </Link>
        </div>
      )
  }
}

export default async function GuidePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const g = getGuide(slug)
  if (!g) notFound()

  const canonical = `${SITE}/guides/${g.slug}`
  const related = GUIDES.filter(x => x.slug !== g.slug).slice(0, 3)

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    datePublished: g.datePublished,
    dateModified: g.dateModified,
    author: { '@type': 'Organization', name: 'ProGuild', url: SITE },
    publisher: { '@type': 'Organization', name: 'ProGuild', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    url: canonical,
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
      { '@type': 'ListItem', position: 3, name: g.title, item: canonical },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
        <Navbar />

        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-2 text-sm overflow-x-auto" style={{ color: '#6E6456' }}>
            <Link href="/" className="hover:text-teal-600 transition-colors" style={{ color: '#6E6456' }}>Home</Link>
            <span>›</span>
            <Link href="/guides" className="hover:text-teal-600 transition-colors" style={{ color: '#6E6456' }}>Guides</Link>
            <span>›</span>
            <span className="font-semibold flex-shrink-0" style={{ color: '#0F766E' }}>{g.category}</span>
          </div>
        </div>

        <article className="max-w-3xl mx-auto px-6 py-10">
          <div className="mb-2 text-sm font-semibold uppercase tracking-widest" style={{ color: '#0F766E' }}>{g.category}</div>
          <h1 className="text-4xl font-bold mb-3 leading-tight" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>{g.title}</h1>
          <div className="text-sm mb-8" style={{ color: '#6B7280' }}>
            {new Date(g.datePublished).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {g.readMins} min read
          </div>

          {g.blocks.map((b, i) => <Block key={i} b={b} />)}

          {/* Related */}
          <div className="mt-12 pt-8 border-t" style={{ borderColor: '#E8E2D9' }}>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#6E6456' }}>More guides</h2>
            <div className="space-y-3">
              {related.map(r => (
                <Link key={r.slug} href={`/guides/${r.slug}`}
                  className="block rounded-2xl border p-4 transition-colors hover:border-teal-400" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#0F766E' }}>{r.category}</div>
                  <div className="text-base font-bold" style={{ color: '#0A1628' }}>{r.title}</div>
                </Link>
              ))}
            </div>
          </div>
        </article>
      </div>
    </>
  )
}
