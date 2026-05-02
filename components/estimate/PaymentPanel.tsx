'use client'

import { Dispatch, SetStateAction } from 'react'
import { CreditCard, Link2 } from 'lucide-react'
import { Estimate } from '@/app/dashboard/estimates/[id]/page'

export default function PaymentPanel({
  estimate, setEstimate, darkMode,
}: {
  estimate: Estimate
  setEstimate: Dispatch<SetStateAction<Estimate | null>>
  darkMode: boolean
}) {
  const dk = darkMode
  const card    = dk ? 'bg-[#1E293B] text-white border-[#334155]' : 'bg-white text-gray-900 border-[#E8E2D9]'
  const muted   = dk ? 'text-slate-400' : 'text-[#6B7280]'
  const divider = dk ? 'border-[#334155]' : 'border-[#E8E2D9]'
  const pillBg  = dk ? '#1e3a5f' : '#F0F0EC'

  const depositAmount = estimate.total * (estimate.deposit_percent / 100)
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${card}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Get Paid Faster</h3>
        <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Recommended</span>
      </div>

      {/* Deposit % — editable */}
      <div className={`pb-3 border-b ${divider} space-y-2`}>
        <div className="flex items-center justify-between text-sm">
          <span className={muted}>Deposit percentage</span>
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} max={100}
              value={estimate.deposit_percent}
              onChange={e => setEstimate(prev => prev ? { ...prev, deposit_percent: Number(e.target.value) } : prev)}
              className="est-pill w-14 text-right"
              style={{ background: pillBg, color: dk ? '#e2e8f0' : '#111827' }}
            />
            <span className={`text-sm ${muted}`}>%</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className={muted}>Deposit amount</span>
          <span className="font-semibold">{fmt(depositAmount)}</span>
        </div>
      </div>

      {/* Require deposit toggle */}
      <div className="flex items-center justify-between text-sm">
        <span className={muted}>Require deposit before job starts</span>
        <button
          onClick={() => setEstimate(prev => prev ? { ...prev, require_deposit: !prev.require_deposit } : prev)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            estimate.require_deposit ? 'bg-[#0F766E]' : dk ? 'bg-slate-600' : 'bg-gray-200'
          }`}
          role="switch" aria-checked={estimate.require_deposit}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
            estimate.require_deposit ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>

      <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm">
        <CreditCard size={14} /> Request Deposit
      </button>
      <button className={`w-full flex items-center justify-center gap-2 border py-2.5 rounded-lg text-sm font-medium transition-colors ${
        dk ? 'border-[#334155] text-slate-300 hover:border-[#0F766E] hover:text-[#0F766E]'
           : 'border-[#E8E2D9] text-[#6B7280] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
        <Link2 size={14} /> Send with Payment Link
      </button>
    </div>
  )
}
