/**
 * POST /api/pros/slug
 * Generates and assigns a vanity slug to a pro if they don't have one.
 * Called when a pro claims their profile (or on-demand from edit profile).
 *
 * Body: { pro_id: string }
 * Returns: { slug: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateSlugCandidates } from '@/lib/slug'

export async function POST(req: NextRequest) {
  try {
    const { pro_id } = await req.json()
    if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    // Fetch pro data
    const { data: pro, error: fetchError } = await supabase
      .from('pros')
      .select('id, full_name, slug, city, state, license_number, trade_category:trade_categories(category_name)')
      .eq('id', pro_id)
      .single()

    if (fetchError || !pro) {
      return NextResponse.json({ error: 'Pro not found' }, { status: 404 })
    }

    // Already has a slug — return it
    if (pro.slug) return NextResponse.json({ slug: pro.slug })

    // Generate candidates
    const candidates = generateSlugCandidates({
      fullName:      pro.full_name,
      trade:         (pro.trade_category as any)?.category_name || null,
      city:          pro.city,
      state:         pro.state,
      licenseNumber: pro.license_number,
    })

    // Try each candidate until one is available
    let chosenSlug: string | null = null
    for (const candidate of candidates) {
      const { data: existing } = await supabase
        .from('pros')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle()

      if (!existing) {
        chosenSlug = candidate
        break
      }
    }

    // Should never happen given the license fallback, but safety net
    if (!chosenSlug) {
      chosenSlug = `${candidates[0]}-${Date.now().toString(36)}`
    }

    // Save slug
    const { error: updateError } = await supabase
      .from('pros')
      .update({ slug: chosenSlug })
      .eq('id', pro_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ slug: chosenSlug })
  } catch (err) {
    console.error('slug POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * GET /api/pros/slug?slug=wasim-akram-painter-jacksonville
 * Resolves a slug to a pro ID — used by the /pro/[slug] page.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('pros')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ pro_id: data.id })
}
