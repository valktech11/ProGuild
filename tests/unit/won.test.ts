import { describe, it, expect } from 'vitest'
import { wonInMonth, sumQuoted } from '@/lib/metrics/won'

const iso = (offsetMonths: number) => {
  const d = new Date(); d.setMonth(d.getMonth() - offsetMonths, 15)
  return d.toISOString()
}

describe('wonInMonth', () => {
  const leads = [
    { lead_status: 'job_won', lead_status_changed_at: iso(0), quoted_amount: 18433 }, // this month
    { lead_status: 'job_won', lead_status_changed_at: iso(0), quoted_amount: 41782 }, // this month
    { lead_status: 'job_won', lead_status_changed_at: iso(1), quoted_amount: 9000 },  // last month
    { lead_status: 'lost',    lead_status_changed_at: iso(0), quoted_amount: 5000 },  // wrong status
    { lead_status: 'job_won', lead_status_changed_at: null, updated_at: iso(0), quoted_amount: 1000 }, // fallback
  ]

  it('counts only this-month wins by the won date (incl. fallback)', () => {
    const won = wonInMonth(leads, 'job_won', 0)
    expect(won.length).toBe(3)                       // two dated + one fallback
    expect(sumQuoted(won)).toBe(18433 + 41782 + 1000)
  })
  it('offset 1 returns last month', () => {
    expect(wonInMonth(leads, 'job_won', 1).map(l => l.quoted_amount)).toEqual([9000])
  })
  it('filters by status (lost)', () => {
    expect(wonInMonth(leads, 'lost', 0).length).toBe(1)
  })
})

import { leadRevenue, sumRevenue } from '@/lib/metrics/won'
describe('leadRevenue (approved-else-quoted)', () => {
  it('uses approved_amount when present', () => {
    expect(leadRevenue({ quoted_amount: 1000, roofing_job_data: { approved_amount: 41782 } })).toBe(41782)
  })
  it('falls back to quoted when no approved', () => {
    expect(leadRevenue({ quoted_amount: 18433, roofing_job_data: { approved_amount: null } })).toBe(18433)
    expect(leadRevenue({ quoted_amount: 18433, roofing_job_data: null })).toBe(18433)
  })
  it('handles roofing_job_data returned as array', () => {
    expect(leadRevenue({ quoted_amount: 1000, roofing_job_data: [{ approved_amount: 5000 }] })).toBe(5000)
  })
  it('sumRevenue totals correctly', () => {
    expect(sumRevenue([
      { quoted_amount: 1000, roofing_job_data: { approved_amount: 41782 } },
      { quoted_amount: 18433 },
    ])).toBe(41782 + 18433)
  })
})
