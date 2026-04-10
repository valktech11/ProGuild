import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const { data, error } = await getSupabaseAdmin()
    .from('pros')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })
  return NextResponse.json({ pro: data })
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await req.json()

  // Moderate bio if provided
  if (body.bio) {
    const mod = await moderateContent(body.bio)
    if (!mod.safe) {
      return NextResponse.json({
        error: `Bio not allowed: ${mod.reason}. Please keep your bio professional.`
      }, { status: 422 })
    }
  }

  const allowed = [
    'full_name','phone','city','state','zip_code','bio',
    'years_experience','profile_photo_url','license_number',
    'is_verified','plan_tier','stripe_customer_id','profile_status',
    'trade_category_id','available_for_work','available_note',
    'is_claimed','claimed_at',
  ]
  const updates: Record<string, any> = {}
  for (const key of allowed) { if (key in body) updates[key] = body[key] }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin().from('pros').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pro: data })
}
