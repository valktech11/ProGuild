'use client'
import { useEffect } from 'react'

// First-touch acquisition capture. On the first page of a visit, stash the
// external referrer + landing path in a 60-day cookie (never overwritten after),
// so the claim routes can attribute how a contractor arrived — Google vs an
// email/claim link vs direct. Best-effort; wrapped so it can never break a page.
export default function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split('; ').some(c => c.startsWith('pg_attr='))) return
      const payload = JSON.stringify({
        ref: document.referrer || '',
        land: location.pathname + location.search,
        t: Date.now(),
      })
      document.cookie =
        `pg_attr=${encodeURIComponent(payload)}; path=/; max-age=${60 * 60 * 24 * 60}; SameSite=Lax`
    } catch { /* ignore — attribution is non-critical */ }
  }, [])
  return null
}
