'use client'

interface StatStripProps {
  totalLeads: number
  newLeads: number
  avgRating: number
  reviewCount: number
  pipelineValue: number
  loading: boolean
  onLeadsClick: () => void
  onRatingClick: () => void
}

export default function StatStrip({
  totalLeads,
  newLeads,
  avgRating,
  reviewCount,
  pipelineValue,
  loading,
  onLeadsClick,
  onRatingClick,
}: StatStripProps) {
  const stats = [
    {
      label: 'Total leads',
      value: loading ? '—' : totalLeads.toString(),
      sub: 'all time',
      highlight: false,
      onClick: onLeadsClick,
    },
    {
      label: 'New leads',
      value: loading ? '—' : newLeads.toString(),
      sub: 'uncontacted',
      highlight: newLeads > 0,
      onClick: onLeadsClick,
    },
    {
      label: 'Pipeline',
      value: loading ? '—' : pipelineValue > 0 ? `$${pipelineValue.toLocaleString()}` : '$0',
      sub: 'quoted value',
      highlight: false,
      onClick: onLeadsClick,
    },
    {
      label: 'Avg rating',
      value: loading ? '—' : avgRating > 0 ? `${avgRating.toFixed(1)} ★` : '—',
      sub: reviewCount > 0 ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` : 'no reviews yet',
      highlight: false,
      onClick: onRatingClick,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {stats.map(s => (
        <button
          key={s.label}
          onClick={s.onClick}
          className={`text-left rounded-2xl p-4 border transition-all hover:-translate-y-0.5 hover:shadow-sm ${
            s.highlight
              ? 'border-amber-300 bg-amber-50/40'
              : 'bg-white border-gray-100'
          }`}
        >
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            {s.label}
          </div>
          <div className={`font-serif text-3xl mb-1 ${s.highlight ? 'text-amber-600' : 'text-teal-600'}`}>
            {s.value}
          </div>
          <div className="text-xs text-gray-400">{s.sub}</div>
        </button>
      ))}
    </div>
  )
}
