import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  const approved = searchParams.get('approved') !== 'false'

  let query = getSupabaseAdmin()
    .from('reviews')
    .select('*')
    .order('reviewed_at', { ascending: false })

  if (proId) query = query.eq('pro_id', proId)
  if (approved) query = query.eq('is_approved', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Map 'comment' → 'review_text' so the profile page can read it consistently
  const reviews = (data || []).map((r: any) => ({ ...r, review_text: r.comment || r.review_text || '' }))
  return NextResponse.json({ reviews })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, job_id, reviewer_name, reviewer_email, rating, comment, review_text } = body

  if (!pro_id || !reviewer_name || !reviewer_email || !rating) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('reviews')
    .insert({
      pro_id,
      job_id: job_id || null,
      reviewer_name,
      reviewer_email: reviewer_email.toLowerCase().trim(),
      rating: parseInt(rating),
      comment: (comment || review_text || null),
      is_approved: false, // requires admin approval
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ review: data }, { status: 201 })
}
