import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateSlugCandidates } from '@/lib/slug'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

  const { data: pro, error } = await getSupabaseAdmin()
    .from('pros')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .ilike('email', email.trim())
    .single()

  if (error || !pro) return NextResponse.json({ error: 'No account found with that email' }, { status: 404 })
  if (pro.profile_status === 'Suspended') return NextResponse.json({ error: 'Account suspended — contact support' }, { status: 403 })

  // Auto-generate slug if this pro doesn't have one yet
  let slug: string | null = pro.slug || null
  if (!slug) {
    const candidates = generateSlugCandidates({
      fullName:      pro.full_name,
      trade:         (pro.trade_category as any)?.category_name || null,
      city:          pro.city,
      state:         pro.state,
      licenseNumber: pro.license_number,
    })

    const supabase = getSupabaseAdmin()
    for (const candidate of candidates) {
      const { data: existing } = await supabase
        .from('pros').select('id').eq('slug', candidate).maybeSingle()
      if (!existing) { slug = candidate; break }
    }
    if (!slug) slug = `${candidates[0]}-${Date.now().toString(36)}`

    // Save slug silently — don't fail login if this errors
    await supabase.from('pros').update({ slug }).eq('id', pro.id)
  }

  return NextResponse.json({
    session: {
      id:         pro.id,
      name:       pro.full_name,
      email:      pro.email,
      plan:       pro.plan_tier,
      trade:      pro.trade_category?.category_name || null,
      trade_slug: pro.trade_category?.slug || null,
      city:       pro.city,
      state:      pro.state,
      slug,                          // ← vanity slug for sharing
    }
  })
}
