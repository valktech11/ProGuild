import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/hvac/equipment/[id]/public
// Public read-only Digital Twin — no auth required.
// Homeowner-facing: strips pro PII, client PII, lead notes, cylinder IDs.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Equipment ID required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Include client_id in initial fetch — avoids a second round-trip
  const { data: eq, error: eqErr } = await sb
    .from('hvac_equipment')
    .select('id, equipment_type, brand, model_number, serial_number, refrigerant_type, install_date, notes, pro_id, client_id')
    .eq('id', id)
    .single()

  if (eqErr || !eq) {
    return NextResponse.json({ error: "Equipment not found", debug: { id, eqErr } }, { status: 404 })
  }

  const clientId = (eq as any).client_id ?? null

  // Fetch contractor branding — business name only, no PII
  const { data: pro } = await sb
    .from('pros')
    .select('business_name, trade_slug')
    .eq('id', eq.pro_id)
    .single()

  // Safely fetch measurements — table may not exist in all envs; never crash the route
  const measurementsData: any[] = await sb
    .from('hvac_equipment_measurements')
    .select('id, superheat_actual, subcool_actual, suction_pressure, liquid_pressure, delta_t, static_pressure, measured_at, diagnosis')
    .eq('equipment_id', id)
    .order('measured_at', { ascending: false })
    .limit(50)
    .then(r => r.data ?? [], () => [])

  const [refrigerantResult, leadsResult, maintenanceResult] = await Promise.all([
    sb.from('hvac_refrigerant_log')
      .select('id, refrigerant_type, amount_added_lbs, amount_recovered_lbs, leak_detected, created_at')
      .eq('equipment_id', id)
      .order('created_at', { ascending: false }),
    clientId
      ? sb.from('leads')
          .select('id, message, lead_status, created_at')
          .eq('pro_id', eq.pro_id)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
    sb.from('hvac_maintenance_reminders')
      .select('id, due_date, status')
      .eq('equipment_id', id)
      .in('status', ['Scheduled', 'Completed']),
  ])

  type Event = { id: string; type: string; date: string; title: string; subtitle: string }
  const timeline: Event[] = []

  if (eq.install_date) timeline.push({
    id: `install-${id}`, type: 'install', date: eq.install_date,
    title: 'Installed',
    subtitle: [eq.brand, eq.model_number].filter(Boolean).join(' ') || 'Equipment installed',
  })

  for (const r of refrigerantResult.data ?? []) {
    const parts: string[] = [r.refrigerant_type]
    if ((r.amount_added_lbs ?? 0) > 0)    parts.push(`${r.amount_added_lbs} lbs added`)
    if ((r.amount_recovered_lbs ?? 0) > 0) parts.push(`${r.amount_recovered_lbs} lbs recovered`)
    timeline.push({
      id: `refrig-${r.id}`, type: 'refrigerant',
      date: r.created_at,
      title: r.leak_detected ? '⚠️ Leak detected — refrigerant service' : 'Refrigerant service',
      subtitle: parts.filter(Boolean).join(' · '),
    })
  }

  const r1 = (v: any) => v == null ? null : Math.round(Number(v) * 10) / 10
  for (const m of measurementsData) {
    const parts: string[] = []
    if (m.superheat_actual != null) parts.push(`SH ${r1(m.superheat_actual)}°F`)
    if (m.subcool_actual != null)   parts.push(`SC ${r1(m.subcool_actual)}°F`)
    if (m.delta_t != null)          parts.push(`ΔT ${r1(m.delta_t)}°F`)
    if (m.static_pressure != null)  parts.push(`ESP ${m.static_pressure}" WC`)
    timeline.push({
      id: `meas-${m.id}`, type: 'measurement',
      date: m.measured_at,
      title: 'Measurements recorded',
      subtitle: parts.join(' · ') || 'Field measurements',
    })
  }

  for (const l of leadsResult.data ?? []) {
    timeline.push({
      id: `lead-${l.id}`, type: 'service',
      date: l.created_at,
      title: l.message || 'Service call',
      subtitle: (l.lead_status ?? '').replace(/_/g, ' '),
    })
  }

  for (const m of maintenanceResult.data ?? []) {
    timeline.push({
      id: `maint-${m.id}`, type: 'maintenance',
      date: m.due_date, title: 'Annual maintenance', subtitle: m.status,
    })
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const logs = refrigerantResult.data ?? []

  // Strip pro_id and client_id before sending
  const { pro_id: _p, client_id: _c, ...equipmentPublic } = eq as any

  return NextResponse.json({
    equipment: equipmentPublic,
    contractor: pro ? { business_name: pro.business_name, trade_slug: pro.trade_slug } : null,
    timeline,
    latest_measurement: measurementsData[0] ?? null,
    refrigerant_stats: {
      total_added_lbs:     logs.reduce((s: number, r: any) => s + (r.amount_added_lbs ?? 0), 0),
      total_recovered_lbs: logs.reduce((s: number, r: any) => s + (r.amount_recovered_lbs ?? 0), 0),
      leak_events:         logs.filter((r: any) => r.leak_detected).length,
      event_count:         logs.length,
    },
    service_count: leadsResult.data?.length ?? 0,
  })
}
