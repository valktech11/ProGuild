import type { Metadata } from 'next'
import ContractorsClient from './ContractorsClient'

// Server wrapper for the For-Pros money page. Body stays a Client Component;
// metadata is server-owned so crawlers and link unfurls get the pro-acquisition
// pitch instead of generic layout meta.
const title = 'ProGuild for Contractors — CRM, Estimates & Tools for Florida Trades'
const description =
  'Run your trade business on ProGuild: visual job pipeline, estimates and proposals, customer and property records, unlimited satellite roof measurements, and AI tools. Built for Florida roofing, HVAC, electrical and more. Free for 90 days.'
const canonical = 'https://proguild.ai/contractors'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: {
    type: 'website',
    title,
    description,
    url: canonical,
    siteName: 'ProGuild',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function Page() {
  return <ContractorsClient />
}
