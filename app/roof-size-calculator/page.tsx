// app/roof-size-calculator/page.tsx
// Public roof size calculator — no auth required.
// SEO target: "roof size calculator", "how big is my roof", "roof square footage estimator Florida"

import type { Metadata } from 'next'
import RoofCalculatorClient from './client'

export const metadata: Metadata = {
  title: 'Free Roof Size Calculator | Instant Roof Measurement by Address',
  description:
    'Get an instant roof size estimate by entering your address — no drawing, no ladder, no measuring tape required. See your roof square footage, roofing squares, and pitch in seconds.',
  keywords: [
    'roof size calculator', 'how big is my roof', 'roof square footage calculator',
    'roof measurement tool', 'roofing squares calculator', 'roof area calculator',
    'free roof estimate Florida', 'satellite roof measurement', 'roof measurement by address',
  ],
  openGraph: {
    title: 'Free Roof Size Calculator — Instant Measurement by Address',
    description: 'Enter your address and get an instant roof size estimate using satellite imagery. No drawing required.',
    url: 'https://proguild.ai/roof-size-calculator',
    siteName: 'ProGuild',
    type: 'website',
  },
}

export default function RoofSizeCalculatorPage() {
  return (
    <>
      {/* SoftwareApplication schema */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Free Roof Size Calculator',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: 'Instantly calculate your roof size by entering your address. Get square footage, roofing squares, and pitch — no drawing required.',
        url: 'https://proguild.ai/roof-size-calculator',
      })}} />

      {/* Organization schema */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'ProGuild',
        url: 'https://proguild.ai',
        description: 'ProGuild connects Florida homeowners with licensed roofing contractors.',
        areaServed: { '@type': 'State', name: 'Florida' },
      })}} />

      {/* FAQ schema — enables rich results in Google */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'How accurate is the roof size calculator?',
            acceptedAnswer: { '@type': 'Answer', text: 'Our calculator uses satellite imagery analysis and is typically accurate within 5–10% of the actual roof area. For insurance claims, permits, or contractor estimates, a licensed roofer should verify on-site.' } },
          { '@type': 'Question', name: 'What is a roofing square?',
            acceptedAnswer: { '@type': 'Answer', text: 'A roofing square equals 100 square feet of roof area. A typical Florida home has between 15 and 40 squares. Contractors use squares to estimate materials and labor costs.' } },
          { '@type': 'Question', name: 'What does roof pitch mean?',
            acceptedAnswer: { '@type': 'Answer', text: 'Roof pitch describes how steep your roof is, expressed as rise over run (e.g. 4/12). Steeper roofs cost more to replace.' } },
          { '@type': 'Question', name: 'Can I measure my roof without climbing it?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes — this tool calculates your roof size from satellite imagery. No ladder, no drone, no contractor visit required to get an estimate.' } },
          { '@type': 'Question', name: 'Does this work for tile roofs common in Florida?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes. The calculator measures roof area regardless of roofing material — asphalt shingle, concrete tile, clay tile, or metal.' } },
          { '@type': 'Question', name: 'Is this tool free?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, completely free. No sign-up or account required.' } },
        ],
      })}} />

      <RoofCalculatorClient />
    </>
  )
}
