import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// GET /api/hvac/equipment/[id]/timeline
// Unified Digital Twin data for one equipment unit.
// Merges: equipment record, refrigerant log, measurements, service leads, maintenance.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id } = await params
  const proId = __auth.proId
  const _scopeCompanyId = __auth.companyId
  const _scopeRole = __auth.role
  const sb = getSupabaseAdmin()

  const { data: eq, error: eqErr } = await sb
    .from('hvac_equipment')
    .select('*, hvac_maintenance_reminders(id, due_date, status)')
    .eq('id', id)
    .eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!))
    .single()
  if (eqErr || !eq) {
    console.error('[equipment/timeline] equipment fetch failed:', eqErr?.message, 'id:', id, 'pro:', proId)
    return NextResponse.json({ error: eqErr?.message ?? 'Equipment not found' }, { status: 404 })
  }

  // measurements query is fault-tolerant — the table may not exist yet in staging.
  const [refrigerantResult, measurementsResult, leadsResult] = await Promise.all([
    sb.from('hvac_refrigerant_log').select('*').eq('equipment_id', id).eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!)).order('created_at', { ascending: false }),
    Promise.resolve(sb.from('hvac_equipment_measurements').select('*').eq('equipment_id', id).eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!)).order('measured_at', { ascending: false }).limit(50)).catch(() => ({ data: [] as any[] })),
    sb.from('leads').select('id, message, lead_status, created_at, quoted_amount, notes').eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!)).eq('client_id', eq.client_id).order('created_at', { ascending: false }).limit(50),
  ])
  const refrigerantLogs = refrigerantResult.data
  const measurements    = measurementsResult.data
  const leads           = leadsResult.data

  type Event = { id: string; type: string; date: string; title: string; subtitle: string; meta: Record<string, unknown> }
  const timeline: Event[] = []

  if (eq.installation_date) timeline.push({
    id: `install-${id}`, type: 'install', date: eq.installation_date,
    title: 'Installed',
    subtitle: [eq.brand, eq.model_number].filter(Boolean).join(' ') || 'Equipment installed',
    meta: { serial: eq.serial_number },
  })

  for (const r of refrigerantLogs ?? []) {
    const parts: string[] = []
    if ((r.amount_added_lbs ?? 0) > 0)    parts.push(`+${r.amount_added_lbs} lbs added`)
    if ((r.amount_recovered_lbs ?? 0) > 0) parts.push(`${r.amount_recovered_lbs} lbs recovered`)
    timeline.push({
      id: `refrig-${r.id}`, type: 'refrigerant',
      date: r.created_at,
      title: r.leak_detected ? '⚠️ Leak detected — refrigerant service' : 'Refrigerant service',
      subtitle: [r.refrigerant_type, ...parts].filter(Boolean).join(' · '),
      meta: r,
    })
  }

  const r1 = (v: any) => v == null ? null : Math.round(Number(v) * 10) / 10
  for (const m of measurements ?? []) {
    const parts: string[] = []
    if (m.superheat_actual != null) parts.push(`SH ${r1(m.superheat_actual)}°F`)
    if (m.subcool_actual != null)   parts.push(`SC ${r1(m.subcool_actual)}°F`)
    if (m.suction_pressure != null) parts.push(`Suc ${r1(m.suction_pressure)} psig`)
    if (m.static_pressure != null)  parts.push(`ESP ${m.static_pressure}" WC`)
    if (m.delta_t != null)          parts.push(`ΔT ${r1(m.delta_t)}°F`)
    timeline.push({
      id: `meas-${m.id}`, type: 'measurement',
      date: m.measured_at,
      title: 'Measurements recorded',
      subtitle: parts.join(' · ') || 'Field measurements',
      meta: m,
    })
  }

  for (const l of leads ?? []) {
    timeline.push({
      id: `lead-${l.id}`, type: 'service',
      date: l.created_at,
      title: l.message || 'Service call',
      subtitle: (l.lead_status ?? '').replace(/_/g, ' '),
      meta: { lead_id: l.id, status: l.lead_status, quoted_amount: l.quoted_amount, notes: l.notes },
    })
  }

  for (const m of (eq.hvac_maintenance_reminders as any[]) ?? []) {
    if (m.status === 'Scheduled' || m.status === 'Completed') {
      timeline.push({
        id: `maint-${m.id}`, type: 'maintenance',
        date: m.due_date, title: 'Annual maintenance', subtitle: m.status, meta: m,
      })
    }
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return NextResponse.json({
    equipment: eq,
    timeline,
    latest_measurement: (measurements ?? [])[0] ?? null,
    refrigerant_stats: {
      total_added_lbs:     (refrigerantLogs ?? []).reduce((s, r) => s + (r.amount_added_lbs ?? 0), 0),
      total_recovered_lbs: (refrigerantLogs ?? []).reduce((s, r) => s + (r.amount_recovered_lbs ?? 0), 0),
      leak_events:         (refrigerantLogs ?? []).filter(r => r.leak_detected).length,
    },
  })
}
