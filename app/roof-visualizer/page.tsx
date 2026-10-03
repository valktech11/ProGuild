// app/roof-visualizer/page.tsx
// Public roof visualizer — no auth required.
// Roofer acquisition tool: 1 free render without account → gate → signup → 3 total free.

import type { Metadata } from 'next'
import { Suspense } from 'react'
import RoofVisualizerClient from './client'
import { getSupabaseAdmin } from '@/lib/supabase'

export const metadata: Metadata = {
  title: 'Free Roof Visualizer | See Your New Roof Before You Buy',
  description:
    'Upload a photo of your home and instantly see what your roof looks like with different shingle colors and styles. Try GAF, Owens Corning, CertainTeed, and more — free.',
  keywords: [
    'roof visualizer', 'roof color visualizer', 'shingle visualizer',
    'see new roof before buying', 'roof replacement visualizer',
    'GAF Timberline visualizer', 'Owens Corning roof visualizer',
    'roof color simulator', 'house roof makeover tool',
  ],
  openGraph: {
    title: 'Free Roof Visualizer — See Your New Roof Instantly',
    description: 'Upload a photo and see your home with different shingles before you buy. Powered by AI.',
    url: 'https://proguild.ai/roof-visualizer',
    siteName: 'ProGuild',
    type: 'website',
  },
  alternates: { canonical: 'https://proguild.ai/roof-visualizer' },
}

// Load SKU catalog server-side so the client gets it without an extra fetch
async function getSkuCatalog() {
  try {
    const sb = getSupabaseAdmin()
    const { data, error: skuErr } = await sb
      .from('viz_skus')
      .select(`
        id, slug, name, hex_preview, is_default, sort_order, swatch_url,
        viz_product_lines (
          id, slug, name,
          viz_manufacturers ( id, slug, name )
        )
      `)
      .order('sort_order')
    if (skuErr) console.error('[getSkuCatalog] supabase error:', JSON.stringify(skuErr))
    return data || []
  } catch (err) {
    console.error('[getSkuCatalog] exception:', err)
    return []
  }
}

export default async function RoofVisualizerPage() {
  const skus = await getSkuCatalog()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <>
      {/* SoftwareApplication schema */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Free Roof Visualizer',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: 'Upload a photo of your home and see your roof in different shingle colors and styles before you buy. Preview GAF, Owens Corning, CertainTeed and more.',
        url: 'https://proguild.ai/roof-visualizer',
      })}} />

      {/* HowTo schema — describes the 3-step flow */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'How to visualize a new roof on your home',
        description: 'See your home with a new roof in three steps using the free ProGuild roof visualizer.',
        step: [
          { '@type': 'HowToStep', position: 1, name: 'Upload a photo', text: 'Upload a clear photo of the front of your home.' },
          { '@type': 'HowToStep', position: 2, name: 'Pick a shingle', text: 'Choose a shingle color and style from GAF, Owens Corning, CertainTeed and other manufacturers.' },
          { '@type': 'HowToStep', position: 3, name: 'See the result', text: 'View your home rendered with the new roof and compare color options side by side.' },
        ],
      })}} />

      {/* FAQ schema — enables rich results */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'Is the roof visualizer free?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes. You can render your home with a new roof for free — no payment required to preview shingle colors and styles.' } },
          { '@type': 'Question', name: 'Which shingle brands can I preview?',
            acceptedAnswer: { '@type': 'Answer', text: 'The visualizer includes real product lines from major manufacturers such as GAF, Owens Corning and CertainTeed, with colors matched to manufacturer swatches.' } },
          { '@type': 'Question', name: 'Do I need to download anything?',
            acceptedAnswer: { '@type': 'Answer', text: 'No. The roof visualizer runs in your browser — just upload a photo of your home and pick a shingle.' } },
        ],
      })}} />

      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F5F4EF' }} />}>
        <RoofVisualizerClient skus={skus as any} />
      </Suspense>
    </>
  )
}
