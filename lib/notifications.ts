// lib/notifications.ts
// Central helper for inserting pro_notifications rows.
// All notification inserts go through here so the schema stays consistent.

import { getSupabaseAdmin } from '@/lib/supabase'

export type NotificationType =
  | 'lead_assigned'
  | 'lead_unassigned'
  | 'job_won'
  | 'estimate_approved'
  | 'new_lead_created'

interface NotifyParams {
  proId: string          // recipient
  companyId: string | null
  type: NotificationType
  title: string
  body?: string
  leadId?: string | null
}

export async function notify(params: NotifyParams): Promise<void> {
  try {
    await getSupabaseAdmin().from('pro_notifications').insert({
      pro_id:     params.proId,
      company_id: params.companyId,
      type:       params.type,
      title:      params.title,
      body:       params.body ?? null,
      lead_id:    params.leadId ?? null,
    })
  } catch {
    // Non-fatal — never let notification failure break the main operation
  }
}

// Notify all owners of a company except the actor themselves
export async function notifyOwners(
  companyId: string,
  actorProId: string,
  params: Omit<NotifyParams, 'proId' | 'companyId'>
): Promise<void> {
  try {
    const sb = getSupabaseAdmin()
    const { data: owners } = await sb
      .from('company_members')
      .select('pro_id')
      .eq('company_id', companyId)
      .eq('role', 'owner')
      .neq('pro_id', actorProId)
    
    if (!owners?.length) return
    
    await sb.from('pro_notifications').insert(
      owners.map(o => ({
        pro_id:     o.pro_id,
        company_id: companyId,
        type:       params.type,
        title:      params.title,
        body:       params.body ?? null,
        lead_id:    params.leadId ?? null,
      }))
    )
  } catch {
    // Non-fatal
  }
}
