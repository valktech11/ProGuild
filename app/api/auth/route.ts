import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const { data: pro, error } = await getSupabaseAdmin()
    .from('pros')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .ilike('email', email.trim())
    .single()

  if (error || !pro) {
    return NextResponse.json({ error: 'No account found with that email' }, { status: 404 })
  }

  if (pro.profile_status === 'Suspended') {
    return NextResponse.json({ error: 'Account suspended — contact support' }, { status: 403 })
  }

  // Return session-safe subset (never return stripe_customer_id etc to client)
  return NextResponse.json({
    session: {
      id: pro.id,
      name: pro.full_name,
      email: pro.email,
      plan: pro.plan_tier,
      trade: pro.trade_category?.category_name || null,
      trade_slug: pro.trade_category?.slug || null,
      city: pro.city,
      state: pro.state,
    }
  })
}
