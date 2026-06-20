// Single source of truth for invoice money: amount_paid / balance_due / status / paid_at.
//
// THE RULE:
//   amount_paid = sum of payment_history amounts
//   balance_due = max(0, total − amount_paid)
//   status      = paid            (balance ≤ 0)
//               | partial_payment (something paid, balance remains)
//               | <current>       (nothing paid yet)
//   paid_at     = set when fully paid (keeps an existing timestamp if present)
//
// A payment is recorded by appending ONE entry to payment_history; the SERVER
// derives the four fields above from that history. This is the ONLY place they
// are computed. Clients (web + mobile) send the new payment and render the
// result — they never compute balance/status themselves. (Previously the same
// formula was hand-copied into the web page and the mobile screen, with the
// server just storing whatever the client sent — two copies that could drift.)

export type InvoiceBalances = {
  amount_paid: number
  balance_due: number
  status: string
  paid_at: string | null
}

export function computeInvoiceBalances(input: {
  total: number
  payment_history?: { amount?: number | null }[] | null
  current_status?: string | null
  current_paid_at?: string | null
  now?: string
}): InvoiceBalances {
  const total = Math.round((Number(input.total) || 0) * 100) / 100
  const amount_paid =
    Math.round((input.payment_history ?? []).reduce((s, p) => s + (Number(p?.amount) || 0), 0) * 100) / 100
  const balance_due = Math.round(Math.max(0, total - amount_paid) * 100) / 100

  const status =
    balance_due <= 0 ? 'paid'
    : amount_paid > 0 ? 'partial_payment'
    : (input.current_status ?? 'sent')

  const now = input.now ?? new Date().toISOString()
  const paid_at = balance_due <= 0 ? (input.current_paid_at ?? now) : (input.current_paid_at ?? null)

  return { amount_paid, balance_due, status, paid_at }
}
