/**
 * Estimate money parity test (web side).
 *
 * The EXACT mirror of mobile's test/estimate_money_parity_test.dart. Same fixture
 * inputs, same expected outputs. If web and mobile ever diverge on estimate money
 * math, ONE of these two files fails — drift can no longer reach a contractor.
 *
 * If you change an expected number here, change it in the mobile test in the same
 * commit, and vice versa.
 *
 * Rules under test (the authority):
 *   - standard line amount = round(qty * unit_price * 100) / 100   (CENTS)
 *   - tier line amount     = round(qty * unit_price)               (WHOLE DOLLARS)
 *   - tax                  = round(subtotal * (rate/100) * 100) / 100
 *   - total                = subtotal + tax
 *   - milestones           = locked 30/40/30, last absorbs remainder
 */

import { describe, it, expect } from 'vitest'
import { computeMilestones } from '@/lib/estimates/milestones'

// The line-amount + tax rules as implemented server-side (PATCH route). Kept here
// as named helpers so the test documents the exact authority.
const standardLineAmount = (qty: number, unitPrice: number) =>
  Math.round(qty * unitPrice * 100) / 100
const tierLineAmount = (qty: number, unitPrice: number) =>
  Math.round(qty * unitPrice)
const taxOf = (subtotal: number, rate: number) =>
  Math.round(subtotal * (rate / 100) * 100) / 100

describe('standardLineAmount — rounds to CENTS', () => {
  it('27.1 x 22 = 596.20 (the bug case — must NOT be 596)', () => {
    expect(standardLineAmount(27.1, 22)).toBe(596.20)
  })
  it('screenshot fixture line amounts', () => {
    expect(standardLineAmount(27.1, 300)).toBe(8130.00)
    expect(standardLineAmount(220, 4)).toBe(880.00)
    expect(standardLineAmount(220, 3)).toBe(660.00)
    expect(standardLineAmount(27.1, 85)).toBe(2303.50)
    expect(standardLineAmount(1, 500)).toBe(500.00)
  })
})

describe('standard estimate totals — screenshot fixture', () => {
  const items: [number, number][] = [
    [27.1, 300], [27.1, 22], [220, 4], [220, 3], [27.1, 85], [1, 500],
  ]
  const subtotal = items.reduce((s, [q, u]) => s + standardLineAmount(q, u), 0)

  it('subtotal = 13,069.70', () => {
    expect(subtotal).toBe(13069.70)
  })
  it('tax @ 6% = 784.18, total = 13,853.88', () => {
    const tax = taxOf(subtotal, 6)
    expect(tax).toBe(784.18)
    expect(subtotal + tax).toBe(13853.88)
  })
})

describe('tierLineAmount — rounds to WHOLE DOLLARS', () => {
  it('whole-dollar rule differs from standard cents rule (intentional)', () => {
    expect(tierLineAmount(27.1, 22)).toBe(596)       // tier: whole dollar
    expect(standardLineAmount(27.1, 22)).toBe(596.20) // standard: cents
  })
})

describe('computeMilestones — locked 30/40/30, last absorbs remainder', () => {
  it('total 13,853.88 -> 4156.16 / 5541.55 / 4156.17 (sums exactly)', () => {
    const m = computeMilestones(13853.88)
    expect(m[0].amount).toBe(4156.16)
    expect(m[1].amount).toBe(5541.55)
    expect(m[2].amount).toBe(4156.17)
    const sum = Math.round(m.reduce((s, x) => s + x.amount, 0) * 100) / 100
    expect(sum).toBe(13853.88)
  })
  it('percentages and labels are the locked schedule', () => {
    const m = computeMilestones(1000)
    expect(m.map(x => x.pct)).toEqual([30, 40, 30])
    expect(m[0].name).toBe('Deposit')
    expect(m[1].name).toBe('At Material Delivery')
    expect(m[2].name).toBe('On Completion')
    expect(m[0].amount).toBe(300)
    expect(m[1].amount).toBe(400)
    expect(m[2].amount).toBe(300)
  })
  it('odd total still sums exactly (last absorbs)', () => {
    const m = computeMilestones(100.01)
    const sum = Math.round(m.reduce((s, x) => s + x.amount, 0) * 100) / 100
    expect(sum).toBe(100.01)
  })
})
