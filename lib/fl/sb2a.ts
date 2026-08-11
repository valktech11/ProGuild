// FL SB 2-A claim-deadline logic (§627.70132). Pure, framework-free, unit-tested.
// Informational only — NOT legal advice. v1 omits: military-deployment tolling,
// 3-yr loss-assessment notice (627.70132(4)), 5-yr suit SOL. Confirm with counsel.

export type DeadlineStatus = 'expired' | 'urgent' | 'approaching' | 'ok';

export interface Deadline {
  key: 'initial' | 'supplemental';
  label: string;
  dueDate: string;        // YYYY-MM-DD
  daysLeft: number;       // negative = past due
  status: DeadlineStatus;
}

// Thresholds (calendar days). Tune in one place.
const URGENT_DAYS = 14;
const APPROACHING_DAYS = 60;

/** Add n months, clamping to the target month's last day (Aug 31 +18mo -> Feb 28/29). */
export function addMonthsUTC(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCMonth(r.getUTCMonth() + n, 1);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

function daysBetweenUTC(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function statusFor(daysLeft: number): DeadlineStatus {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= URGENT_DAYS) return 'urgent';
  if (daysLeft <= APPROACHING_DAYS) return 'approaching';
  return 'ok';
}

/**
 * Compute SB 2-A deadlines from a date of loss.
 * @param dateOfLoss YYYY-MM-DD (statutory clock start)
 * @param today optional override (YYYY-MM-DD) for testing; defaults to now (UTC)
 * @returns null if no date of loss is set
 */
export function computeSB2ADeadlines(
  dateOfLoss: string | null | undefined,
  today?: string,
): Deadline[] | null {
  if (!dateOfLoss) return null;
  const dol = new Date(`${dateOfLoss}T00:00:00Z`);
  if (Number.isNaN(dol.getTime())) return null;
  const now = today ? new Date(`${today}T00:00:00Z`) : new Date();

  const build = (key: Deadline['key'], label: string, months: number): Deadline => {
    const due = addMonthsUTC(dol, months);
    const daysLeft = daysBetweenUTC(now, due);
    return { key, label, dueDate: due.toISOString().slice(0, 10), daysLeft, status: statusFor(daysLeft) };
  };

  return [
    build('initial', 'Initial / reopened claim (1 yr)', 12),
    build('supplemental', 'Supplemental claim (18 mo)', 18),
  ];
}

export const SB2A_DISCLAIMER =
  'Informational only — not legal advice. Deadlines per FL §627.70132; confirm specifics (incl. tolling) with counsel.';
