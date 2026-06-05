// Unit tests for SB 2-A logic. Vitest/Jest-compatible (describe/it/expect).
import { computeSB2ADeadlines, addMonthsUTC } from '@/lib/fl/sb2a';

describe('addMonthsUTC', () => {
  it('clamps month-end overflow (Aug 31 + 18mo -> Feb 28)', () => {
    expect(addMonthsUTC(new Date('2024-08-31T00:00:00Z'), 18).toISOString().slice(0, 10))
      .toBe('2026-02-28');
  });
  it('handles leap day target (Jan 30 2024 + 1mo -> Feb 29)', () => {
    expect(addMonthsUTC(new Date('2024-01-30T00:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2024-02-29');
  });
});

describe('computeSB2ADeadlines', () => {
  it('returns null when no date of loss', () => {
    expect(computeSB2ADeadlines(null)).toBeNull();
    expect(computeSB2ADeadlines('')).toBeNull();
    expect(computeSB2ADeadlines('not-a-date')).toBeNull();
  });

  it('computes 1yr + 18mo due dates from date of loss', () => {
    const d = computeSB2ADeadlines('2025-10-09', '2026-06-05')!;
    expect(d[0]).toMatchObject({ key: 'initial', dueDate: '2026-10-09', status: 'ok' });
    expect(d[1]).toMatchObject({ key: 'supplemental', dueDate: '2027-04-09', status: 'ok' });
  });

  it('flags expired deadlines (negative daysLeft)', () => {
    const d = computeSB2ADeadlines('2024-01-01', '2026-06-05')!;
    expect(d[0].status).toBe('expired');
    expect(d[0].daysLeft).toBeLessThan(0);
    expect(d[1].status).toBe('expired');
  });

  it('flags urgent (<=14 days) and approaching (<=60 days)', () => {
    // initial due 2026-10-09; pick today 14 and 60 days before
    const urgent = computeSB2ADeadlines('2025-10-09', '2026-09-25')!; // 14 days to initial
    expect(urgent[0].status).toBe('urgent');
    const approaching = computeSB2ADeadlines('2025-10-09', '2026-08-20')!; // ~50 days
    expect(approaching[0].status).toBe('approaching');
  });
});
