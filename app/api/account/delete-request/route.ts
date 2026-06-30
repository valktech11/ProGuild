import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY)

// Account deletion — Option A (request-based, not self-serve).
// Sends a notice to contact@proguild.ai with the pro's identity so Raj can
// process the deletion manually, given financial-record retention questions
// (invoices/proposals tied to pro_id may need to be kept for tax/legal reasons).
// Satisfies Apple/Google's requirement for an in-app deletion path without any
// risk of an automated flow accidentally destroying records that must be kept.
export async function POST(req: NextRequest) {
  const { pro_id } = await req.json()
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data: pro } = await getSupabaseAdmin()
    .from('pros').select('id, full_name, email, phone, business_name').eq('id', pro_id).single()
  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  try {
    await resend.emails.send({
      from:    'ProGuild <hello@proguild.ai>',
      to:      'contact@proguild.ai',
      subject: `Account deletion request — ${pro.full_name || pro.email}`,
      html: `
        <p>A pro has requested account deletion via the app.</p>
        <ul>
          <li><strong>Pro ID:</strong> ${pro.id}</li>
          <li><strong>Name:</strong> ${pro.full_name || '—'}</li>
          <li><strong>Business:</strong> ${pro.business_name || '—'}</li>
          <li><strong>Email:</strong> ${pro.email || '—'}</li>
          <li><strong>Phone:</strong> ${pro.phone || '—'}</li>
        </ul>
        <p>Process manually, checking invoice/proposal retention requirements before deleting.</p>
      `,
    })
  } catch (err: any) {
    console.error('[account/delete-request] Resend error:', err)
    return NextResponse.json({ error: 'Could not send request — try emailing contact@proguild.ai directly.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
