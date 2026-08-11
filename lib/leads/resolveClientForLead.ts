// lib/leads/resolveClientForLead.ts
// Single source of truth for "a won job must have a customer record".
//
// When a lead reaches the won stage — via manual stage drag OR via payment
// (mark-paid, record-payment, stripe webhook) — it must be linked to a client.
// This dedupes by phone then email, creates the client if none exists, and
// writes client_id back onto the lead. Idempotent: if the lead already has a
// client_id, it's a no-op.
//
// Every won path calls this so the behaviour can never drift between paths.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveClientForLead(
  sb: SupabaseClient,
  leadId: string,
  proId: string,
): Promise<string | null> {
  try {
    const { data: lead } = await sb
      .from('leads')
      .select('client_id, contact_name, contact_phone, contact_email, property_address, contact_city, contact_state, contact_zip')
      .eq('id', leadId)
      .single()

    if (!lead) return null
    // Already linked — nothing to do.
    if (lead.client_id) return lead.client_id
    // No name to build a client from — skip silently.
    if (!lead.contact_name) return null

    const streetOnly = lead.property_address
      ? String(lead.property_address).split(',')[0].trim()
      : null

    let clientId: string | null = null

    // Dedup by phone
    if (lead.contact_phone) {
      const { data: byPhone } = await sb.from('clients').select('id')
        .eq('pro_id', proId).eq('phone', String(lead.contact_phone).trim()).maybeSingle()
      if (byPhone) clientId = byPhone.id
    }
    // Dedup by email
    if (!clientId && lead.contact_email) {
      const { data: byEmail } = await sb.from('clients').select('id')
        .eq('pro_id', proId).eq('email', String(lead.contact_email).toLowerCase().trim()).maybeSingle()
      if (byEmail) clientId = byEmail.id
    }
    // Create if still none
    if (!clientId) {
      const { data: newClient, error: insErr } = await sb.from('clients').insert({
        pro_id:        proId,
        full_name:     String(lead.contact_name).trim(),
        phone:         lead.contact_phone ? String(lead.contact_phone).trim() : null,
        email:         lead.contact_email ? String(lead.contact_email).toLowerCase().trim() : null,
        address_line1: streetOnly,
        city:          lead.contact_city  ? String(lead.contact_city).trim()  : null,
        state:         lead.contact_state ? String(lead.contact_state).trim() : null,
        zip:           lead.contact_zip   ? String(lead.contact_zip).trim()   : null,
      }).select('id').single()
      if (insErr) {
        console.error('[resolveClientForLead] client insert failed:', insErr.message)
        return null
      }
      if (newClient) clientId = newClient.id
    }

    // Link client_id back onto the lead
    if (clientId) {
      await sb.from('leads').update({ client_id: clientId }).eq('id', leadId)
    }
    return clientId
  } catch (e) {
    console.error('[resolveClientForLead] error:', e)
    return null
  }
}
