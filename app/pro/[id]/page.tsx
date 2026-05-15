// NO 'use client' — this is a server component
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import ProProfileClient from './ProProfileClient'

interface Props {
  params: { id: string }
}

// ── Server-side metadata (Googlebot reads this) ───────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: pro } = await getSupabaseAdmin()
    .from('pros')
    .select('full_name, city, state, license_number, trade_category:trade_categories(category_name)')
    .eq('id', params.id)
    .single()

  if (!pro) return { title: 'Pro Not Found | ProGuild' }

  const trade = (Array.isArray(pro.trade_category)
    ? (pro.trade_category[0] as any)?.category_name
    : (pro.trade_category as any)?.category_name) || 'Contractor'

  const city  = pro.city || 'Florida'
  const title = `${pro.full_name} — Licensed ${trade} in ${city}, FL | ProGuild`
  const desc  = `${pro.full_name} is a DBPR-verified ${trade} based in ${city}, Florida. License #${pro.license_number}. View profile, reviews, and contact directly on ProGuild.`

  return {
    title,
    description: desc,
    alternates: { canonical: `https://proguild.ai/pro/${params.id}` },
    openGraph: {
      title,
      description: desc,
      url: `https://proguild.ai/pro/${params.id}`,
      siteName: 'ProGuild',
      locale: 'en_US',
      type: 'profile',
    },
    robots: { index: true, follow: true },
  }
}

// ── JSON-LD schema injected server-side ──────────────────────────────────────
async function getSchema(id: string) {
  const { data: pro } = await getSupabaseAdmin()
    .from('pros')
    .select('full_name, city, state, license_number, phone, profile_photo_url, avg_rating, review_count, trade_category:trade_categories(category_name)')
    .eq('id', id)
    .single()

  if (!pro) return null

  const trade = (Array.isArray(pro.trade_category)
    ? (pro.trade_category[0] as any)?.category_name
    : (pro.trade_category as any)?.category_name) || 'Contractor'

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: pro.full_name,
    description: `Licensed ${trade} in ${pro.city || 'Florida'}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: pro.city,
      addressRegion: pro.state || 'FL',
      addressCountry: 'US',
    },
    ...(pro.phone      && { telephone: pro.phone }),
    ...(pro.profile_photo_url && { image: pro.profile_photo_url }),
    url: `https://proguild.ai/pro/${id}`,
    identifier: pro.license_number,
    ...(pro.avg_rating && pro.review_count && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: pro.avg_rating,
        reviewCount: pro.review_count,
      },
    }),
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function ProProfilePage({ params }: Props) {
  const schema = await getSchema(params.id)
  if (!schema) notFound()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <ProProfileClient />
    </>
  )
}
