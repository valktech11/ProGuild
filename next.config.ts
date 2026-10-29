import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {},
  images: {
    remotePatterns: [],
  },
  async redirects() {
    return [
      // Legacy /trades/{trade}/{state}/{city} directory tree duplicated the
      // canonical /fl ([state]/[slug]/[city]) tree with no canonical tag,
      // producing GSC "Duplicate without user-selected canonical". 308-consolidate
      // the whole tree into /fl. Named params match a single segment, so the
      // three rules are mutually exclusive by depth.
      {
        source: '/trades/:trade/:state/:city',
        destination: '/:state/:trade/:city',
        permanent: true,
      },
      {
        source: '/trades/:trade/:state',
        destination: '/:state/:trade',
        permanent: true,
      },
      {
        source: '/trades/:trade',
        destination: '/fl/:trade',
        permanent: true,
      },
      // Stale sitemap.xml was submitted to GSC (50k legacy URLs, now erroring)
      // and can't be removed from the GSC UI. Point it at the live index so a
      // re-read supersedes the stale set with the current one.
      {
        source: '/sitemap.xml',
        destination: '/sitemaps',
        permanent: true,
      },
    ]
  },
}

export default config
