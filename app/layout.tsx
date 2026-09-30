import type { Metadata } from 'next'
import MaintenanceGate from '@/components/layout/MaintenanceGate'
import { SessionProvider } from '@/components/auth/SessionProvider'
import { TrialGate } from '@/components/auth/TrialGate'
import './globals.css'

export const metadata: Metadata = {
  title: 'ProGuild.ai — Your Craft. Your Guild.',
  description: 'Florida\'s verified trades network. Find DBPR-licensed electricians, plumbers, HVAC techs and more. Zero lead fees. License verified.',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://proguild.ai/',
    title: 'ProGuild.ai — Find a licensed Florida contractor you can actually reach.',
    description: 'Search DBPR-licensed Florida contractors by trade and city and contact them directly. Zero lead fees. Every license verified against Florida DBPR.',
    siteName: 'ProGuild.ai',
    images: [{ url: 'https://proguild.ai/og-image.png', width: 1200, height: 630, alt: 'ProGuild.ai — find a licensed Florida contractor you can actually reach.' }],
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ProGuild.ai',
  url: 'https://proguild.ai',
  logo: 'https://proguild.ai/icon.png',
  description: 'Florida\'s verified trades network. Every pro verified against Florida DBPR records. Zero per-lead fees.',
  slogan: 'Your Craft. Your Guild.',
  areaServed: { '@type': 'State', name: 'Florida', containedInPlace: { '@type': 'Country', name: 'United States' } },
  knowsAbout: ['HVAC', 'Electrician', 'Plumber', 'Roofer', 'General Contractor', 'Pool & Spa', 'Painter', 'Solar Installer', 'Impact Windows', 'Flooring'],
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'hello@proguild.ai' },
  sameAs: ['https://proguild.ai'],
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ProGuild.ai',
  url: 'https://proguild.ai',
  description: 'Florida\'s verified trades professional network',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: 'https://proguild.ai/search?q={search_term_string}' },
    'query-input': 'required name=search_term_string',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href="https://proguild.ai/" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      </head>
      <body className="bg-stone-50 text-gray-900 antialiased" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <SessionProvider>
          <MaintenanceGate>
            <TrialGate>
              {children}
            </TrialGate>
          </MaintenanceGate>
        </SessionProvider>
      </body>
    </html>
  )
}
