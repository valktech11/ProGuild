'use client'

// TrialGate — wraps dashboard layout.
// If the pro's trial has expired AND they have no active paid plan, redirects to /subscribe.
// Evaluated client-side using session.trial_ends_at + session.plan from /api/auth/me.
// No middleware DB call needed.

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useProSession } from '@/lib/hooks/useProSession'

// Pages accessible even with an expired trial
const TRIAL_EXEMPT = new Set(['/subscribe', '/dashboard/settings', '/login'])

export function TrialGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useProSession()
  const router    = useRouter()
  const pathname  = usePathname()

  useEffect(() => {
    if (loading) return
    if (!session) return
    if (TRIAL_EXEMPT.has(pathname)) return

    const plan         = session.plan as string | null
    const trialEndsAt  = (session as any).trial_ends_at as string | null
    const isPaid       = plan === 'Pro' || plan === 'Elite' || plan === 'Pro_Founding' || plan === 'Elite_Founding' || plan === 'Pro_Annual' || plan === 'Elite_Annual'

    if (isPaid) return // active subscriber — no gate

    if (!trialEndsAt) return // no trial set — legacy account, let through

    const expired = new Date(trialEndsAt) < new Date()
    if (expired) {
      router.replace('/subscribe')
    }
  }, [loading, session, pathname, router])

  return <>{children}</>
}
