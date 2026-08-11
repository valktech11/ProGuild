import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initials, timeAgo, planLabel, avatarColor,
  isBusinessName, proFirstName, isPaid, isElite,
} from '@/lib/utils'
import { PlanTier } from '@/types'

// ── initials ──────────────────────────────────────────────────────────────────
describe('initials', () => {
  it('returns first letters of first and last name', () => {
    expect(initials('James Miller')).toBe('JM')
  })
  it('handles single name', () => {
    expect(initials('James')).toBe('J')
  })
  it('handles business name', () => {
    expect(initials('Infinity Roofing LLC')).toBe('IL')
  })
  it('handles empty string', () => {
    expect(initials('')).toBe('?')
  })
  it('caps at 2 characters', () => {
    expect(initials('John Paul Smith').length).toBeLessThanOrEqual(2)
  })
})

// ── isBusinessName ────────────────────────────────────────────────────────────
describe('isBusinessName', () => {
  it('detects LLC', () => expect(isBusinessName('Apex Builders LLC')).toBe(true))
  it('detects Inc', () => expect(isBusinessName('Smith Electric Inc')).toBe(true))
  it('detects Roofing', () => expect(isBusinessName('Top Roofing')).toBe(true))
  it('returns false for person name', () => expect(isBusinessName('James Miller')).toBe(false))
})

// ── proFirstName ──────────────────────────────────────────────────────────────
describe('proFirstName', () => {
  it('returns first name for person', () => expect(proFirstName('James Miller')).toBe('James'))
  it('returns "the team" for business', () => expect(proFirstName('Apex Roofing LLC')).toBe('the team'))
  it('handles empty', () => expect(proFirstName('')).toBe('the team'))
})

// ── timeAgo ───────────────────────────────────────────────────────────────────
describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'))
  })

  it('returns Today for same day', () => {
    expect(timeAgo('2026-05-01T08:00:00Z')).toBe('Today')
  })
  it('returns Yesterday for 1 day ago', () => {
    expect(timeAgo('2026-04-30T08:00:00Z')).toBe('Yesterday')
  })
  it('returns N days ago for recent', () => {
    expect(timeAgo('2026-04-27T08:00:00Z')).toBe('4 days ago')
  })
  it('returns weeks for 7+ days', () => {
    expect(timeAgo('2026-04-17T08:00:00Z')).toBe('2w ago')
  })
  it('returns months for 30+ days', () => {
    expect(timeAgo('2026-03-01T08:00:00Z')).toBe('2mo ago')
  })
  it('handles empty string', () => {
    expect(timeAgo('')).toBe('')
  })
  it('handles invalid date', () => {
    expect(timeAgo('not-a-date')).toBe('')
  })
})

// ── planLabel ─────────────────────────────────────────────────────────────────
describe('planLabel', () => {
  it('Free plan', () => expect(planLabel('Free')).toBe('Free'))
  it('Pro plan', () => expect(planLabel('Pro')).toBe('Pro'))
  it('Elite plan', () => expect(planLabel('Elite')).toBe('Elite'))
  it('Pro Founding', () => expect(planLabel('Pro_Founding')).toBe('Pro★'))
  it('Elite Founding', () => expect(planLabel('Elite_Founding')).toBe('Elite★'))
  it('Pro Annual', () => expect(planLabel('Pro_Annual')).toBe('Pro'))
  it('Elite Annual', () => expect(planLabel('Elite_Annual')).toBe('Elite'))
})

// ── isPaid / isElite ──────────────────────────────────────────────────────────
describe('isPaid', () => {
  it('Free is not paid', () => expect(isPaid('Free')).toBe(false))
  it('Pro is paid', () => expect(isPaid('Pro')).toBe(true))
  it('Elite is paid', () => expect(isPaid('Elite')).toBe(true))
  it('Pro_Annual is paid', () => expect(isPaid('Pro_Annual')).toBe(true))
})

describe('isElite', () => {
  it('Pro is not elite', () => expect(isElite('Pro')).toBe(false))
  it('Elite is elite', () => expect(isElite('Elite')).toBe(true))
  it('Elite_Founding is elite', () => expect(isElite('Elite_Founding')).toBe(true))
})

// ── avatarColor ───────────────────────────────────────────────────────────────
describe('avatarColor', () => {
  it('returns a tuple of two hex strings', () => {
    const [bg, fg] = avatarColor('James')
    expect(bg).toMatch(/^#/)
    expect(fg).toMatch(/^#/)
  })
  it('same name always returns same color', () => {
    expect(avatarColor('Alice')).toEqual(avatarColor('Alice'))
  })
  it('different names can return different colors', () => {
    // Not guaranteed but very likely with different first chars
    const colors = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'].map(n => avatarColor(n)[0])
    const unique = new Set(colors)
    expect(unique.size).toBeGreaterThan(1)
  })
})

// ── Revenue calculation logic (mirrors dashboard/page.tsx) ────────────────────
describe('revenue calculation', () => {
  it('sums quoted_amount for Paid and Completed leads only', () => {
    const leads = [
      { lead_status: 'New',       quoted_amount: 500  },
      { lead_status: 'Paid',      quoted_amount: 1200 },
      { lead_status: 'Completed', quoted_amount: 800  },
      { lead_status: 'Quoted',    quoted_amount: 2000 },
      { lead_status: 'Lost',      quoted_amount: 300  },
    ]
    const revenue = leads
      .filter(l => ['Paid', 'Completed'].includes(l.lead_status))
      .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
    expect(revenue).toBe(2000)
  })

  it('returns 0 when no closed leads', () => {
    const leads = [
      { lead_status: 'New',    quoted_amount: 500 },
      { lead_status: 'Quoted', quoted_amount: 800 },
    ]
    const revenue = leads
      .filter(l => ['Paid', 'Completed'].includes(l.lead_status))
      .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
    expect(revenue).toBe(0)
  })

  it('handles null quoted_amount gracefully', () => {
    const leads = [
      { lead_status: 'Paid', quoted_amount: null },
      { lead_status: 'Paid', quoted_amount: 500  },
    ]
    const revenue = leads
      .filter(l => ['Paid', 'Completed'].includes(l.lead_status))
      .reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
    expect(revenue).toBe(500)
  })
})

// ── Overdue logic (mirrors pipeline/page.tsx) ─────────────────────────────────
describe('overdue leads logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'))
  })

  it('flags New leads older than 3 days as overdue', () => {
    const leads = [
      { lead_status: 'New',       created_at: '2026-04-27T00:00:00Z' }, // 4 days — overdue
      { lead_status: 'New',       created_at: '2026-04-30T00:00:00Z' }, // 1 day — not overdue
      { lead_status: 'Contacted', created_at: '2026-04-27T00:00:00Z' }, // not New — not overdue
    ]
    const overdue = leads.filter(l => {
      const days = (Date.now() - new Date(l.created_at).getTime()) / 86400000
      return days >= 3 && l.lead_status === 'New'
    })
    expect(overdue.length).toBe(1)
  })
})
