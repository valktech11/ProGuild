import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

// Always read fresh from the database — never serve a cached response.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
    'is_claimed','claimed_at','license_expiry_date','license_status','slug',
    'osha_card_type','osha_card_number','osha_card_expiry','preferred_language',
    'business_name','phone_cell','phone_work','phone_cell2','counties_served','address_line1','cover_image_url',
    'services','pricing_note',
  ]
  const updates: Record<string, any> = {}
  for (const key of allowed) { if (key in body) updates[key] = body[key] }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

  // When trade_category_id changes, resolve and sync trade_slug so pipeline works correctly
  if ('trade_category_id' in updates && updates.trade_category_id) {
    const { data: cat } = await getSupabaseAdmin()
      .from('trade_categories')
      .select('slug')
      .eq('id', updates.trade_category_id)
      .single()
    updates.trade_slug = cat?.slug || null
  } else if ('trade_category_id' in updates && !updates.trade_category_id) {
    updates.trade_slug = null
  }

  const { data, error } = await getSupabaseAdmin().from('pros').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pro: data })
}
