import type { Metadata } from 'next'
import HomeClient from './HomeClient'

// Server wrapper: the homepage body is a Client Component (interactive search,
// autocomplete). Metadata must be server-owned so non-JS crawlers and social
// scrapers (FB/LinkedIn/Slack link unfurls) get real tags, not layout defaults.
const title = 'ProGuild — Find Licensed, DBPR-Verified Contractors in Florida'
const description =
  'ProGuild is the verified network for Florida’s skilled trades. Find licensed roofers, HVAC techs, electricians, plumbers and more — every license checked against Florida DBPR records. No shared leads. Always free for homeowners.'
const canonical = 'https://proguild.ai'

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
  return <HomeClient />
}
