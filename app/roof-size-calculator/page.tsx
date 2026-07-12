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
      {/* SoftwareApplication schema — helps Google show rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Free Roof Size Calculator',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Instantly calculate your roof size by entering your address. Get square footage, roofing squares, and pitch — no drawing required.',
            url: 'https://proguild.ai/roof-size-calculator',
          }),
        }}
      />
      <RoofCalculatorClient />
    </>
  )
}
