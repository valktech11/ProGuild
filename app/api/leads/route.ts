import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { leadNotificationEmail } from '@/lib/email'
import { Resend } from 'resend'
import { moderateContent } from '@/lib/moderation'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('leads').select('*').eq('pro_id', proId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, job_id, contact_name, contact_email, contact_phone, message, lead_source } = body
  if (!pro_id || !contact_name || !contact_email || !message)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // Moderate message
  const mod = await moderateContent(message)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Message not allowed: ${mod.reason}. Please keep your message professional.`
    }, { status: 422 })
  }

  const { data: lead, error } = await getSupabaseAdmin()
    .from('leads')
    .insert({
      pro_id, job_id: job_id || null,
      contact_name, contact_email: contact_email.toLowerCase().trim(),
      contact_phone: contact_phone || null, message,
      lead_status: 'New', lead_source: lead_source || 'Profile_Page',
    })
    .select().single()

  if (error) { console.error('POST /api/leads error:', error); return NextResponse.json({ error: error.message }, { status: 500 }) }

  // Fetch pro for email
  const { data: pro } = await getSupabaseAdmin()
    .from('pros').select('full_name, email, plan_tier, city, state').eq('id', pro_id).single()

  // Send email notification
  if (pro?.email && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const isPaid = pro.plan_tier !== 'Free'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: pro.email,
        subject: `New lead from ${contact_name} — ProGuild.ai`,
        html: leadNotificationEmail({
          proName: pro.full_name, proEmail: pro.email,
          contactName: contact_name, contactEmail: contact_email,
          contactPhone: contact_phone || null, message,
          city: pro.city, state: pro.state,
          leadSource: lead_source || 'Profile_Page',
          dashboardUrl: `${appUrl}/dashboard`, isPaid,
        }),
      })
    } catch (e) { console.error('Email failed:', e) }
  }

  return NextResponse.json({ lead }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, lead_status } = body
  if (!id || !lead_status) return NextResponse.json({ error: 'id and lead_status required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('leads').update({ lead_status }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
