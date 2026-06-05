// Drop-in for the lead detail page. Renders SB 2-A countdowns on a claim.
// Usage: <SB2ADeadlineBadge dateOfLoss={lead.date_of_loss} />
import { computeSB2ADeadlines, SB2A_DISCLAIMER, type DeadlineStatus } from '@/lib/fl/sb2a';

const STYLES: Record<DeadlineStatus, string> = {
  expired:     'bg-red-100 text-red-800 border-red-300',
  urgent:      'bg-orange-100 text-orange-800 border-orange-300',
  approaching: 'bg-amber-100 text-amber-800 border-amber-300',
  ok:          'bg-emerald-100 text-emerald-800 border-emerald-300',
};

function label(daysLeft: number, status: DeadlineStatus): string {
  if (status === 'expired') return `Passed ${Math.abs(daysLeft)}d ago`;
  return `${daysLeft}d left`;
}

export function SB2ADeadlineBadge({ dateOfLoss }: { dateOfLoss: string | null | undefined }) {
  const deadlines = computeSB2ADeadlines(dateOfLoss);
  if (!deadlines) {
    return (
      <p className="text-sm text-gray-500">
        Set a <span className="font-medium">date of loss</span> to track FL SB 2-A deadlines.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-700">FL claim deadlines (SB 2-A)</h4>
      {deadlines.map((d) => (
        <div key={d.key} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${STYLES[d.status]}`}>
          <span className="font-medium">{d.label}</span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{d.dueDate}</span>
            <span className="font-semibold">{label(d.daysLeft, d.status)}</span>
          </span>
        </div>
      ))}
      <p className="text-xs text-gray-400">{SB2A_DISCLAIMER}</p>
    </div>
  );
}
