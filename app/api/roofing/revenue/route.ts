import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { leadRevenue } from '@/lib/metrics/won'

const WON = 'job_won'

// Server-side revenue aggregation for the Revenue report page.
// Won date = lead_status_changed_at (real won date). Amount = approved-else-quoted.
export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('leads')
    .select('lead_status, lead_status_changed_at, updated_at, quoted_amount, roofing_job_data(approved_amount, insurance_company)')
    .eq('pro_id', proId)
    .eq('lead_status', WON)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const won = (data || []).map(l => {
    const rjd = Array.isArray(l.roofing_job_data) ? l.roofing_job_data[0] : l.roofing_job_data
    return {
      date: new Date((l.lead_status_changed_at || l.updated_at || 0) as string),
      amount: leadRevenue(l as never),
      carrier: (rjd?.insurance_company || 'No carrier / retail') as string,
    }
  })

  const now = new Date()
  const ym = (d: Date) => d.getFullYear() * 12 + d.getMonth()
  const curYM = ym(now)
  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0)

  const period = (new URL(req.url).searchParams.get('period') || 'all') as 'mtd' | 'ytd' | '12mo' | 'all'
  const inPeriod = (d: Date) => {
    if (period === 'mtd') return ym(d) === curYM
    if (period === 'ytd') return d.getFullYear() === now.getFullYear()
    if (period === '12mo') return d.getTime() >= new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime()
    return true
  }
  const titleCase = (str: string) => str.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const thisMonth = won.filter(w => ym(w.date) === curYM)
  const lastMonth = won.filter(w => ym(w.date) === curYM - 1)

  const monthly = []
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const arr = won.filter(w => ym(w.date) === ym(ref))
    monthly.push({ label: ref.toLocaleString('en-US', { month: 'short' }), revenue: sum(arr), jobs: arr.length })
  }

  // Normalize carrier names so casing/whitespace variants merge into one row.
  const carrierMap = new Map<string, { display: string; jobs: number; revenue: number }>()
  for (const w of won) {
    if (!inPeriod(w.date)) continue
    const key = w.carrier.trim().replace(/\s+/g, ' ').toLowerCase()
    const display = w.carrier === 'No carrier / retail' ? w.carrier : titleCase(w.carrier)
    const c = carrierMap.get(key) || { display, jobs: 0, revenue: 0 }
    c.jobs += 1; c.revenue += w.amount
    carrierMap.set(key, c)
  }
  const byCarrier = [...carrierMap.values()]
    .map(v => ({ carrier: v.display, jobs: v.jobs, revenue: v.revenue, avg: v.jobs ? Math.round(v.revenue / v.jobs) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
  const periodTotal = byCarrier.reduce((s, c) => s + c.revenue, 0)

  return NextResponse.json({
    thisMonth: { revenue: sum(thisMonth), jobs: thisMonth.length },
    lastMonth: { revenue: sum(lastMonth), jobs: lastMonth.length },
    monthly,
    byCarrier,
    period,
    periodTotal,
    totalYTD: sum(won.filter(w => w.date.getFullYear() === now.getFullYear())),
    totalAll: sum(won),
  })
}
