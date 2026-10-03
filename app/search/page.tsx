import type { Metadata } from 'next'
import SearchClient from './SearchClient'

// Server wrapper. Bare /search is a real, indexable discovery hub. Faceted/param
// URLs (?q=, ?trade=, ?city=, ?group=, pagination) are near-infinite permutations
// that would dilute crawl budget, so any query string flips the page to
// robots:index:false (still follow) while the canonical stays the bare URL.
const canonical = 'https://proguild.ai/search'
const title = 'Search Licensed Florida Contractors by Trade & City | ProGuild'
const description =
  'Search ProGuild’s network of DBPR-verified Florida contractors by trade and city — roofing, HVAC, electrical, plumbing, pool, solar and more. Every license checked against state records. No shared leads.'

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
): Promise<Metadata> {
  const sp = await searchParams
  const hasFacets = Object.keys(sp).length > 0

  return {
    title,
    description,
    alternates: { canonical },
    ...(hasFacets ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: 'ProGuild',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function Page() {
  return <SearchClient />
}
