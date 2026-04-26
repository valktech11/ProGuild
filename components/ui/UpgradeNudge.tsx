'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { isPaid } from '@/lib/utils'
import { PlanTier } from '@/types'

interface UpgradeNudgeProps {
  plan: PlanTier
}

const DISMISS_KEY = 'pg_upgrade_nudge_dismissed'
const DISMISS_DAYS = 30

export default function UpgradeNudge({ plan }: UpgradeNudgeProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isPaid(plan)) return
    try {
      const ts = localStorage.getItem(DISMISS_KEY)
      if (ts) {
        const age = Date.now() - parseInt(ts)
        if (age < DISMISS_DAYS * 86400000) return
      }
    } catch {}
    setVisible(true)
  }, [plan])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()) } catch {}
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="flex items-center gap-3 bg-teal-600/5 border border-teal-600/20 rounded-2xl px-4 py-3">
      <p className="text-sm text-gray-800 flex-1">
        <span className="font-semibold">Upgrade to Pro</span>
        {' '}— unlimited leads, priority placement, Pro badge
      </p>
      <Link
        href="/upgrade"
        className="text-sm font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap transition-colors"
      >
        $29/mo →
      </Link>
      <button
        onClick={dismiss}
        className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
