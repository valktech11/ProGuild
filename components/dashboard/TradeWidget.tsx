'use client'
import Link from 'next/link'
import type { AnyTradeConfig } from '@/lib/trades/_registry'
import { isRoofing, isHVAC } from '@/lib/trades/_registry'

interface Props {
  trade: AnyTradeConfig
  proId: string
}

// ── Roofing widget ────────────────────────────────────────────────────────────
function RoofingWidget() {
  return (
    <div className="rounded-2xl border p-4 mb-5" style={{ borderColor: '#E8E2D9', background: 'white' }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#DC2626' }}>
        🏠 Roofing Tools
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/dashboard/roofing/measure"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>📐</span>
          <span>ProMeasure</span>
        </Link>
        <Link href="/dashboard/roofing/report"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>📊</span>
          <span>Quick Bid</span>
        </Link>
        <Link href="/dashboard/roofing/takeoffs"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>🔢</span>
          <span>Takeoffs</span>
        </Link>
        <Link href="/dashboard/roofing/warranties"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>🛡️</span>
          <span>Warranties</span>
        </Link>
      </div>
    </div>
  )
}

// ── HVAC widget ───────────────────────────────────────────────────────────────
function HVACWidget() {
  return (
    <div className="rounded-2xl border p-4 mb-5" style={{ borderColor: '#E8E2D9', background: 'white' }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#0EA5E9' }}>
        ❄️ My Equipment
      </p>
      <div className="grid grid-cols-1 gap-2">
        <Link href="/dashboard/hvac/equipment"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>❄️</span>
          <span>Equipment Records</span>
        </Link>
        <Link href="/dashboard/hvac/refrigerant"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>🧪</span>
          <span>Refrigerant Log</span>
        </Link>
        <Link href="/dashboard/hvac/maintenance"
          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold hover:border-teal-400 transition-colors"
          style={{ borderColor: '#E8E2D9' }}>
          <span>🔔</span>
          <span>Maintenance Plans</span>
        </Link>
      </div>
    </div>
  )
}

// ── Default widget (misc trades) ──────────────────────────────────────────────
function DefaultWidget() {
  return null  // No trade-specific widget for misc trades — clean dashboard
}

// ── Main export — zero slug comparisons, pure type guards ─────────────────────
export default function TradeWidget({ trade, proId }: Props) {
  if (isRoofing(trade)) return <RoofingWidget />
  if (isHVAC(trade))    return <HVACWidget />
  return <DefaultWidget />
}
