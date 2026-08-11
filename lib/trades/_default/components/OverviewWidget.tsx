'use client'
// ── Default OverviewWidget ────────────────────────────────────────────────────
// Returns null — misc trades (painter, mason, landscaper, GC etc.) use the
// standard overview layout defined in app/dashboard/page.tsx.
// No trade-specific morning sections needed for generic trades.
import type { OverviewWidgetProps } from '@/lib/trades/_registry/types'

export default function DefaultOverviewWidget(_props: OverviewWidgetProps): null {
  return null
}
