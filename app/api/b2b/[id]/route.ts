import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('b2b_jobs')
    .select(`*, company:companies(id,name,city,state,company_type,is_verified), trade_category:trade_categories(id,category_name)`)
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job: data })
}
