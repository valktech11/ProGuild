import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { collectedFromInvoices } from '@/lib/metrics/won'

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
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('invoices')
    .select('status, total, balance_due, due_date')
    .eq('pro_id', proId)

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
