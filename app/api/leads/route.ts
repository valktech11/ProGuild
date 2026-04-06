import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('leads')
    .select('*')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, job_id, contact_name, contact_email, contact_phone, message, lead_source } = body

  if (!pro_id || !contact_name || !contact_email || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('leads')
    .insert({
      pro_id,
      job_id: job_id || null,
      contact_name,
      contact_email: contact_email.toLowerCase().trim(),
      contact_phone: contact_phone || null,
      message,
      lead_status: 'New',
      lead_source: lead_source || 'Profile_Page',
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/leads error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lead: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, lead_status } = body

  if (!id || !lead_status) {
    return NextResponse.json({ error: 'id and lead_status required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('leads')
    .update({ lead_status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
