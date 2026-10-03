import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { DBPR_TRADES } from '@/config/dbpr-trades'
import { GUIDES } from '@/config/guides'
import VerifyClient from './VerifyClient'

const canonical = 'https://proguild.ai/verify-license'
const title = 'Verify a Florida Contractor’s License | ProGuild'
const description =
  'Check whether a Florida contractor is licensed. Search by name or DBPR license number against ProGuild’s directory built from official Florida DBPR records, and learn how to confirm any license on the state portal.'

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'verify Florida contractor license', 'check contractor license Florida',
    'is my contractor licensed Florida', 'DBPR license lookup', 'Florida DBPR license check',
    'licensed contractor verification Florida', 'CCC license lookup', 'how to check a roofer’s license',
  ],
  alternates: { canonical },
  openGraph: { type: 'website', title, description, url: canonical, siteName: 'ProGuild' },
  twitter: { card: 'summary', title, description },
}

const FAQ = [
  {
    q: 'How do I check if a contractor is licensed in Florida?',
    a: 'Every state-level construction license in Florida is issued by the Department of Business and Professional Regulation (DBPR). You can search a contractor by name or license number on ProGuild above, or look the license up directly on the DBPR portal at myfloridalicense.com. A valid Florida license number follows a letter-prefix format such as CCC (roofing), CAC (air conditioning), EC (electrical) or CGC (general).',
  },
  {
    q: 'What does a Florida contractor license number look like?',
    a: 'Florida license numbers start with a letter prefix that identifies the trade and license class, followed by digits — for example CCC1331234 for a certified roofing contractor or CAC1812345 for an air conditioning contractor. The prefix tells you what work the contractor is legally allowed to perform.',
  },
  {
    q: 'Is a contractor without a license number on ProGuild unlicensed?',
    a: 'Not necessarily. ProGuild profiles are built from official Florida DBPR records, but a contractor may not yet appear in our directory, or may operate under a company license. If you don’t find a match, confirm directly on the DBPR portal before hiring.',
  },
  {
    q: 'Why does hiring a licensed contractor matter in Florida?',
    a: 'Florida law requires a state or local license for most construction trades. A licensed contractor has met education, experience and insurance requirements, can pull permits, and gives you recourse through the state if work goes wrong. Unlicensed work can void insurance claims and leave you liable.',
  },
]

export default function Page() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Florida Contractor License Verifier',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: 'Search Florida contractors by name or DBPR license number against records built from the official Florida DBPR database.',
    url: canonical,
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://proguild.ai' },
      { '@type': 'ListItem', position: 2, name: 'Verify a License', item: canonical },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
        <Navbar />

        {/* Breadcrumb */}
        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-sm" style={{ color: '#6E6456' }}>
            <Link href="/" className="hover:text-teal-600 transition-colors" style={{ color: '#6E6456' }}>Home</Link>
            <span>›</span>
            <span className="font-semibold" style={{ color: '#0F766E' }}>Verify a License</span>
          </div>
        </div>

        {/* Hero + search */}
        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-4xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Verify a Florida contractor&apos;s license
            </h1>
            <p className="text-base mb-6" style={{ color: '#4B5563' }}>
              Search by name or DBPR license number. ProGuild profiles are built from official Florida
              Department of Business &amp; Professional Regulation (DBPR) records — always confirm the current
              status on the state portal before you hire.
            </p>
            <VerifyClient />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-10">
          {/* How to check yourself */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              How to check a license yourself
            </h2>
            <ol className="space-y-3">
              {[
                ['Go to the DBPR portal', <>Open <a href="https://www.myfloridalicense.com/wl11.asp" target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: '#0F766E' }}>myfloridalicense.com</a>, the official Florida licensing database.</>],
                ['Search by name or license number', 'Enter the contractor or company name, or the license number if you have it.'],
                ['Confirm the status and trade', 'Check that the license is Active, matches the work you’re hiring for, and hasn’t expired.'],
              ].map(([t, d], i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold flex-shrink-0" style={{ background: '#0F766E' }}>{i + 1}</span>
                  <div><span className="font-semibold" style={{ color: '#0A1628' }}>{t}</span> <span style={{ color: '#4B5563' }}>— {d}</span></div>
                </li>
              ))}
            </ol>
          </section>

          {/* License code guide — real DBPR data */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Florida license codes by trade
            </h2>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#E8E2D9' }}>
              <table className="w-full text-sm" style={{ background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#FAF9F6', color: '#6E6456' }}>
                    <th className="text-left font-semibold px-4 py-2.5">Trade</th>
                    <th className="text-left font-semibold px-4 py-2.5">License prefix</th>
                    <th className="text-left font-semibold px-4 py-2.5 hidden sm:table-cell">DBPR class</th>
                  </tr>
                </thead>
                <tbody>
                  {DBPR_TRADES.map(t => (
                    <tr key={t.slug} className="border-t" style={{ borderColor: '#E8E2D9' }}>
                      <td className="px-4 py-2.5">
                        <Link href={`/fl/${t.slug}`} className="font-semibold hover:underline" style={{ color: '#0A1628' }}>{t.label}</Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: '#0F766E' }}>{t.licenseCodes.join(' / ')}</td>
                      <td className="px-4 py-2.5 hidden sm:table-cell" style={{ color: '#6B7280' }}>{t.licenseLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Frequently asked questions
            </h2>
            <div className="space-y-4">
              {FAQ.map((f, i) => (
                <div key={i} className="rounded-2xl border p-5" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                  <h3 className="text-base font-bold mb-2" style={{ color: '#0A1628' }}>{f.q}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Related guides */}
          <section className="mt-10 pt-8 border-t" style={{ borderColor: '#E8E2D9' }}>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#6E6456' }}>Related guides</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {GUIDES.slice(0, 4).map(g => (
                <Link key={g.slug} href={`/guides/${g.slug}`}
                  className="block rounded-2xl border p-4 transition-colors hover:border-teal-400" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#0F766E' }}>{g.category}</div>
                  <div className="text-sm font-bold" style={{ color: '#0A1628' }}>{g.title}</div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
