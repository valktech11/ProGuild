// app/api/leads/[id]/photos/report/route.ts
// POST — generate damage photo report PDF for a lead.
// Auth: requirePro (pro must own the lead).

export const runtime = 'nodejs'
export const maxDuration = 45

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { renderPhotoReportPdf, type PhotoPhase } from '@/lib/roofing/photoReportPdf'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const { id: leadId } = await params
  if (!UUID_RE.test(leadId))
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Verify lead ownership
  const { data: lead } = await sb
    .from('leads')
    .select('id, contact_name, property_address, contact_city, contact_state, contact_zip')
    .eq('id', leadId)
    .eq('pro_id', auth.proId)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pro details
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, business_name')
    .eq('id', auth.proId)
    .maybeSingle()

  // Insurance claim for carrier/claim-number/date-of-loss
  const { data: rjd } = await sb
    .from('roofing_job_data')
    .select('date_of_loss, insurance_company, claim_number')
    .eq('lead_id', leadId)
    .maybeSingle()

  // Photos grouped by phase
  const { data: photos } = await sb
    .from('lead_photos')
    .select('id, url, annotated_url, has_annotation, phase, caption, taken_at')
    .eq('lead_id', leadId)
    .eq('pro_id', auth.proId)
    .order('taken_at', { ascending: true })

  // Group by phase
  const phaseMap = new Map<string, typeof photos>()
  for (const p of photos ?? []) {
    const key = p.phase || 'other'
    if (!phaseMap.has(key)) phaseMap.set(key, [])
    phaseMap.get(key)!.push(p)
  }

  const phaseOrder = ['damage','overview','interior','gutters','flashing','decking','before','progress','after','other']
  const phases: PhotoPhase[] = []
  for (const key of phaseOrder) {
    const ps = phaseMap.get(key)
    if (ps?.length) {
      phases.push({
        phase: key,
        photos: ps.map(p => ({
          url:           p.url ?? '',
          caption:       p.caption ?? '',
          takenAt:       p.taken_at ?? '',
          hasAnnotation: p.has_annotation ?? false,
          annotatedUrl:  p.annotated_url ?? undefined,
        })),
      })
      phaseMap.delete(key)
    }
  }
  // Any unlisted phases
  for (const [key, ps] of phaseMap) {
    if (ps?.length) phases.push({ phase: key, photos: ps.map(p => ({ url: p.url ?? '', caption: p.caption ?? '', takenAt: p.taken_at ?? '', hasAnnotation: p.has_annotation ?? false, annotatedUrl: p.annotated_url ?? undefined })) })
  }

  const address = [lead.property_address, lead.contact_city, lead.contact_state, lead.contact_zip]
    .filter(Boolean).join(', ')
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const element = renderPhotoReportPdf({
    address,
    claimNumber: (rjd as any)?.claim_number ?? '',
    carrier:     (rjd as any)?.insurance_company ?? '',
    dateOfLoss:  (rjd as any)?.date_of_loss ?? '',
    proName:     pro?.full_name     ?? 'ProGuild Pro',
    proCompany:  pro?.business_name ?? '',
    phases,
    generatedAt: generated,
  }) as any

  const buffer   = await renderToBuffer(element)
  const slug     = address.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
  const filename = `photo-report-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`

  return new NextResponse(Buffer.from(buffer) as any, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
