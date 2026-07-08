// app/job/[token]/page.tsx
// Public homeowner portal — no login required. Token-based access.
// Shows job status, estimate (approval), and invoice.

import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'

export default async function HomeownerPortal({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const sb = getSupabaseAdmin()

  // Resolve token
  const { data: portal } = await sb
    .from('homeowner_portal_tokens')
    .select('lead_id, pro_id')
    .eq('token', token)
    .maybeSingle()
  if (!portal) return notFound()

  const { lead_id, pro_id } = portal

  // Lead details
  const { data: lead } = await sb
    .from('leads')
    .select('contact_name, property_address, contact_city, contact_state, lead_status')
    .eq('id', lead_id).maybeSingle()
  if (!lead) return notFound()

  // Pro details
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, business_name, phone_cell, email')
    .eq('id', pro_id).maybeSingle()

  // Latest estimate
  const { data: estimate } = await sb
    .from('estimates')
    .select('id, total_price, status, created_at')
    .eq('lead_id', lead_id)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()

  // Latest invoice
  const { data: invoice } = await sb
    .from('invoices')
    .select('id, total_amount, amount_paid, status')
    .eq('lead_id', lead_id)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()

  const stages = [
    { key: 'lead_in',           label: 'Inquiry received' },
    { key: 'inspection',        label: 'Inspection scheduled' },
    { key: 'insurance_approved',label: 'Claim approved' },
    { key: 'proposal_sent',     label: 'Proposal sent' },
    { key: 'proposal_signed',   label: 'Contract signed' },
    { key: 'scheduled',         label: 'Job scheduled' },
    { key: 'in_progress',       label: 'Work in progress' },
    { key: 'job_won',           label: 'Job complete' },
  ]
  const stageIdx = stages.findIndex(s => s.key === lead.lead_status)
  const address = [lead.property_address, lead.contact_city, lead.contact_state].filter(Boolean).join(', ')

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0A1628,#0F766E)', padding: '24px 24px 20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>ProGuild</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Job status for {lead.contact_name}</div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* Property */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Property</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A1628' }}>{address || '—'}</div>
        </div>

        {/* Progress */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Progress</div>
          {stages.map((s, i) => {
            const done = i <= stageIdx
            const active = i === stageIdx
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: done ? '#0F766E' : '#E2E8F0',
                  border: active ? '3px solid #0F766E' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {done && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 400, color: done ? '#0A1628' : '#94A3B8' }}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Estimate */}
        {estimate && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Estimate</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0A1628' }}>${Math.round(estimate.total_price || 0).toLocaleString()}</div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                background: estimate.status === 'signed' ? '#F0FDFA' : '#FFFBEB',
                color: estimate.status === 'signed' ? '#0F766E' : '#D97706' }}>
                {estimate.status === 'signed' ? 'Signed ✓' : 'Awaiting your signature'}
              </div>
            </div>
            {estimate.status !== 'signed' && estimate.id && (
              <a href={`/estimate/${estimate.id}`}
                style={{ display: 'block', marginTop: 12, textAlign: 'center', background: '#0F766E', color: '#fff',
                  padding: '11px', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                Review &amp; Sign Estimate
              </a>
            )}
          </div>
        )}

        {/* Invoice */}
        {invoice && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Invoice</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Total</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0A1628' }}>${Math.round(invoice.total_amount || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Paid</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>${Math.round(invoice.amount_paid || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Remaining</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#DC2626' }}>
                  ${Math.round((invoice.total_amount || 0) - (invoice.amount_paid || 0)).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contractor contact */}
        {pro && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Your Contractor</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1628' }}>{pro.full_name}</div>
            {pro.business_name && <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{pro.business_name}</div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              {pro.phone_cell && (
                <a href={`tel:${pro.phone_cell}`} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', color: '#0F766E', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  📞 Call
                </a>
              )}
              {pro.email && (
                <a href={`mailto:${pro.email}`} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', color: '#0F766E', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  ✉️ Email
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
