// POST /api/company/invite
// Owner-only. Generates a company_invites row (or returns an existing unused one)
// and sends an invite email via Resend. Returns the invite URL.
//
// DELETE /api/company/invite?token=xxx
// Owner revokes a pending invite (marks it used_at = NOW() with no used_by).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import { Resend } from 'resend'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai'

async function requireOwner(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return { error: auth.error }
  const { proId, companyId } = auth

  if (!companyId) {
    return { error: NextResponse.json({ error: 'No company context' }, { status: 400 }) }
  }

  // Verify caller is owner of this company
  const sb = getSupabaseAdmin()
  const { data: member } = await sb
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('pro_id', proId)
    .single()

  if (member?.role !== 'owner') {
    return { error: NextResponse.json({ error: 'Only the company owner can manage invites' }, { status: 403 }) }
  }

  return { proId: proId!, companyId: companyId! }
}

export async function POST(req: NextRequest) {
  const ownerCtx = await requireOwner(req)
  if ('error' in ownerCtx) return ownerCtx.error

  const { proId, companyId } = ownerCtx
  const sb = getSupabaseAdmin()

  // Return an existing valid unused invite if one exists (idempotent — owners
  // can hit "copy link" multiple times without flooding the invites table).
  const { data: existing } = await sb
    .from('company_invites')
    .select('token, expires_at')
    .eq('company_id', companyId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Parse body early (before token generation)
  const body = await req.json().catch(() => ({}))
  const recipientEmail: string | null = body.email ?? null

  let token: string

  if (existing?.token) {
    token = existing.token
  } else {
    // Generate token server-side (don't rely on DB default)
    const crypto = await import('crypto')
    const generatedToken = crypto.randomBytes(24).toString('hex')

    const { data: invite, error: invErr } = await sb
      .from('company_invites')
      .insert({
        company_id: companyId,
        created_by: proId,
        token:      generatedToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('token')
      .single()

    if (invErr || !invite) {
      console.error('[company/invite] insert failed', invErr)
      return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })
    }
    token = invite.token
  }

  const inviteUrl = `${APP_URL}/join/${token}`

  if (recipientEmail && process.env.RESEND_API_KEY) {
    try {
      // Get company name for the email
      const { data: company } = await sb
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single()

      const { data: inviter } = await sb
        .from('pros')
        .select('full_name')
        .eq('id', proId)
        .single()

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'ProGuild.ai <hello@proguild.ai>',
        to: recipientEmail,
        subject: `You've been invited to join ${company?.name ?? 'a company'} on ProGuild`,
        html: companyInviteEmail({
          inviterName: inviter?.full_name ?? 'Your team owner',
          companyName: company?.name ?? 'the team',
          inviteUrl,
          expiresInDays: 7,
        }),
      })
    } catch (e) {
      console.error('[company/invite] email EXCEPTION:', e)
      // Non-fatal — return URL even if email fails
    }
  }

  return NextResponse.json({ ok: true, invite_url: inviteUrl, token })
}

export async function DELETE(req: NextRequest) {
  const ownerCtx = await requireOwner(req)
  if ('error' in ownerCtx) return ownerCtx.error

  const { companyId } = ownerCtx
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('company_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .eq('company_id', companyId)
    .is('used_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── Email template ────────────────────────────────────────────────────────────
function companyInviteEmail({
  inviterName,
  companyName,
  inviteUrl,
  expiresInDays,
}: {
  inviterName: string
  companyName: string
  inviteUrl: string
  expiresInDays: number
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:32px 16px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d9;">

    <tr><td style="background:#0d9488;padding:28px 32px;">
      <div style="font-size:22px;font-weight:700;color:#ffffff;">ProGuild.ai</div>
      <div style="font-size:14px;color:#ccfbf1;margin-top:4px;">Team Invitation</div>
    </td></tr>

    <tr><td style="padding:32px;">
      <p style="font-size:16px;font-weight:600;color:#111827;margin:0 0 12px;">
        ${inviterName} invited you to join <strong>${companyName}</strong>
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px;">
        You've been added to their team on ProGuild.ai. Click below to create your account
        and start managing jobs together. This link expires in ${expiresInDays} days.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td>
          <a href="${inviteUrl}"
             style="display:block;background:#0d9488;color:#ffffff;text-align:center;
                    padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;
                    text-decoration:none;">
            Accept Invitation →
          </a>
        </td></tr>
      </table>

      <p style="font-size:12px;color:#6b7280;margin:0;">
        Or copy this link: <a href="${inviteUrl}" style="color:#0d9488;">${inviteUrl}</a>
      </p>
    </td></tr>

    <tr><td style="border-top:1px solid #e2e1db;padding:16px 32px;background:#fafaf8;">
      <div style="font-size:12px;color:#9c9a92;">
        Sent via ProGuild.ai · <a href="https://proguild.ai" style="color:#73726c;text-decoration:none;">proguild.ai</a>
      </div>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`
}
