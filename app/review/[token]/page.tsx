// /review/[token] — Public review gating page
// 1-3 stars → private feedback form on ProGuild
// 4-5 stars → redirect to Google review

import { getSupabaseAdmin } from '@/lib/supabase'
import ReviewClient from './ReviewClient'

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const sb = getSupabaseAdmin()
  const { data: rr } = await sb
    .from('review_requests')
    .select('id, homeowner_name, pro_id, status, rating')
    .eq('token', token)
    .single()

  if (!rr) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F3EF' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48 }}>🔍</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginTop: 16 }}>Link not found</h2>
          <p style={{ color: '#6B7280', fontSize: 14, marginTop: 8 }}>This review link may have expired or already been used.</p>
        </div>
      </div>
    )
  }

  // Fetch pro's google_id and business name
  const { data: pro } = await sb
    .from('pros')
    .select('business_name, full_name, google_id')
    .eq('id', rr.pro_id)
    .single()

  const businessName = (pro as any)?.business_name || (pro as any)?.full_name || 'Your contractor'
  const googleId = (pro as any)?.google_id ?? null
  const alreadyRated = rr.status === 'rated'

  return (
    <ReviewClient
      token={token}
      rrId={rr.id}
      homeownerName={(rr as any).homeowner_name}
      businessName={businessName}
      googleId={googleId}
      alreadyRated={alreadyRated}
      existingRating={(rr as any).rating}
    />
  )
}
