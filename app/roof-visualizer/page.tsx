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
}

// Load SKU catalog server-side so the client gets it without an extra fetch
async function getSkuCatalog() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('viz_skus')
      .select(`
        id, slug, name, hex_preview, is_default, sort_order, swatch_url,
        viz_product_lines (
          id, slug, name,
          viz_manufacturers ( id, slug, name )
        )
      `)
      .order('sort_order')
    return data || []
  } catch {
    return []
  }
}

export default async function RoofVisualizerPage() {
  const skus = await getSkuCatalog()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F5F4EF' }} />}>
      <RoofVisualizerClient skus={skus as any} />
    </Suspense>
  )
}
