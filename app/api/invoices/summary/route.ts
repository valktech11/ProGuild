import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { collectedFromInvoices } from '@/lib/metrics/won'
import { requirePro } from '@/lib/pro-auth'

// ── /api/invoices/summary ─────────────────────────────────────────────────────
// Single source of truth for invoice aggregates. Web (invoices/page.tsx) and
// mobile both read from here so the numbers can never disagree.
//
// Returns:
//   outstanding      — Σ balance_due on unpaid, non-void invoices ("money owed to you")
//   collected        — Σ total on paid invoices ("money in")
//   overdue          — Σ balance_due where past due_date and still owing
//   overdueCount     — number of overdue invoices
//   outstandingCount — number of unpaid, non-void invoices

const OPEN_STATUSES = ['sent', 'viewed', 'partial_payment'] // owing + chaseable
const CLOSED = ['paid', 'void']

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const _invSumCompanyId = __auth.companyId
  const _invSumProId = __auth.proId
  const _invSumRole = __auth.role
  if (!_invSumCompanyId) return NextResponse.json({ error: 'No company context' }, { status: 400 })
  let _invSumLeadIds: string[] | null = null
  if (_invSumRole === 'member' && _invSumProId) {
    const { data: _ml } = await getSupabaseAdmin().from('leads').select('id')
      .eq('company_id', _invSumCompanyId).eq('assigned_to_pro_id', _invSumProId).is('deleted_at', null)
    _invSumLeadIds = (_ml ?? []).map((l: any) => l.id)
    if (_invSumLeadIds.length === 0) return NextResponse.json({ total: 0, paid: 0, outstanding: 0, overdue: 0, count: 0 })
  }

  const sb = getSupabaseAdmin()
  let _invSumQ2 = sb.from('invoices').select('status, total, balance_due, due_date').eq('company_id', _invSumCompanyId)
  if (_invSumLeadIds !== null && _invSumLeadIds.length > 0) _invSumQ2 = _invSumQ2.in('lead_id', _invSumLeadIds)
  const { data, error } = await _invSumQ2

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const invoices = data || []
  const now = Date.now()
  const round2 = (n: number) => Math.round(n * 100) / 100

  // Outstanding: anything not paid/void still carries a balance owed to the pro.
  const outstandingInvoices = invoices.filter(i => !CLOSED.includes(i.status as string))
  const outstanding = round2(outstandingInvoices.reduce((s, i) => s + ((i.balance_due as number) || 0), 0))

  // Collected: realized money from paid invoices.
  const collected = collectedFromInvoices(invoices as { status?: string | null; total?: number | null }[])

  // Overdue: past due_date and still chaseable (sent/viewed/partial_payment).
  const overdueInvoices = invoices.filter(i =>
    i.due_date != null &&
    new Date(i.due_date as string).getTime() < now &&
    OPEN_STATUSES.includes(i.status as string)
  )
  const overdue = round2(overdueInvoices.reduce((s, i) => s + ((i.balance_due as number) || 0), 0))

  return NextResponse.json({
    outstanding,
    collected,
    overdue,
    overdueCount: overdueInvoices.length,
    outstandingCount: outstandingInvoices.length,
  })
}
