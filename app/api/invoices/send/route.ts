import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { invoice_id, pro_id } = await req.json()

  if (!invoice_id || !pro_id) {
    return NextResponse.json({ error: 'invoice_id and pro_id are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Fetch invoice
  const { data: inv, error: invErr } = await sb
    .from('invoices')
    .select('id, invoice_number, total, balance_due, due_date, lead_name, contact_email, status, pro_id, lead_id')
    .eq('id', invoice_id)
    .maybeSingle()

  if (invErr || !inv) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Ownership check
  if (inv.pro_id !== pro_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Resolve email from lead if invoice has null contact_email
  if (!inv.contact_email && (inv as any).lead_id) {
    const { data: leadRow } = await sb
      .from('leads')
      .select('contact_email')
      .eq('id', (inv as any).lead_id)
      .maybeSingle()
    if (leadRow?.contact_email) (inv as any).contact_email = leadRow.contact_email
  }

  if (!inv.contact_email) {
    return NextResponse.json({ error: 'No email on file for this client' }, { status: 422 })
  }

  // Guard: don't resend paid or voided invoices
  if (inv.status === 'paid' || inv.status === 'void') {
    return NextResponse.json({ error: `Cannot send invoice with status '${inv.status}'` }, { status: 422 })
  }

  // Fetch pro
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, phone_cell, city, state')
    .eq('id', pro_id)
    .maybeSingle()

  const proName  = pro?.full_name ?? 'Your Contractor'
  const proPhone = pro?.phone_cell ?? ''
  const proCity  = [pro?.city, pro?.state].filter(Boolean).join(', ')

  const baseUrl     = process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'
  const invoiceUrl  = `${baseUrl}/invoice/${invoice_id}`
  const clientName  = inv.lead_name ?? 'Homeowner'
  const invNumber   = inv.invoice_number ?? 'INV'
  const amountDue   = Number(inv.balance_due ?? inv.total ?? 0)
    .toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
  const dueDate = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0F766E,#0A5A54);padding:32px 32px 28px;">
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">
        Invoice
      </div>
      <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.02em;">
        ${amountDue}
      </div>
      <div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:4px;">${invNumber}</div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:16px;color:#111827;margin:0 0 8px;font-weight:600;">Hi ${clientName},</p>
      <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px;">
        Your invoice <strong>${invNumber}</strong> from ${proName} is ready.
        ${dueDate ? `Payment is due by <strong>${dueDate}</strong>.` : ''}
        You can review and pay securely online.
      </p>

      <!-- Amount box -->
      <div style="background:#F5F4F0;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">
        <div style="font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Amount Due</div>
        <div style="font-size:36px;font-weight:800;color:#0A1628;letter-spacing:-0.02em;">${amountDue}</div>
        ${dueDate ? `<div style="font-size:13px;color:#6B7280;margin-top:4px;">Due ${dueDate}</div>` : ''}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${invoiceUrl}"
          style="display:inline-block;padding:14px 32px;background:#0F766E;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;letter-spacing:-0.01em;">
          View &amp; Pay Invoice →
        </a>
      </div>

      <!-- Divider -->
      <div style="border-top:1px solid #E5E7EB;margin:0 0 24px;"></div>

      <!-- Pro info -->
      <p style="font-size:14px;color:#6B7280;margin:0 0 4px;">Questions? Contact your contractor:</p>
      <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 2px;">${proName}</p>
      ${proCity ? `<p style="font-size:14px;color:#6B7280;margin:0 0 2px;">${proCity}</p>` : ''}
      ${proPhone ? `<p style="font-size:14px;color:#6B7280;margin:0;">📞 ${proPhone}</p>` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:16px 32px;text-align:center;">
      <p style="font-size:12px;color:#9CA3AF;margin:0;">
        Sent via <a href="https://proguild.ai" style="color:#0F766E;text-decoration:none;">ProGuild.ai</a>
        — the professional contractor platform
      </p>
    </div>
  </div>
</body>
</html>`

  try {
    await resend.emails.send({
      from:    'ProGuild <hello@proguild.ai>',
      to:      inv.contact_email,
      subject: `Invoice ${invNumber} from ${proName} — ${amountDue} due`,
      html,
    })
  } catch (err: any) {
    console.error('[invoices/send] Resend error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  // Set status to 'sent' — this also unblocks the public /invoice/[id] page (which 404s on draft)
  const { error: patchErr } = await sb
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', invoice_id)

  if (patchErr) {
    // Email delivered but status update failed — log, don't 500.
    // Homeowner has the link. Status drift is recoverable.
    console.error('[invoices/send] status patch failed after email sent:', patchErr)
  }

  return NextResponse.json({ ok: true })
}
