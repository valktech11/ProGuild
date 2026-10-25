// lib/auth-trace.ts
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY DIAGNOSTIC — remove before promoting to prod (main).
// Logs the auth resolve/redirect sequence so we can see the exact cause of the
// claim- and login-handoff flicker on staging.
//
// Why localStorage: the claim flow does a HARD navigation (window.location.href)
// and other paths soft-navigate across several pages, so a plain console.log is
// split across page lifecycles. Mirroring every line into localStorage lets us
// capture the WHOLE claim→dashboard (or login→dashboard) sequence in one place,
// even across the reload, without the tester needing "Preserve log" enabled.
//
// After reproducing the flicker, in the browser console run:
//     copy(__authTrace())        // full sequence copied to clipboard
//   or
//     __authTrace()              // prints it
// and paste it back. Run __clearAuthTrace() before a fresh repro.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'pg_authtrace'
const MAX = 400

export function authTrace(event: string, detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const ts = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm (UTC)
  let path = '?'
  try { path = window.location?.pathname ?? '?' } catch { /* ignore */ }
  const line = `${ts} ${path.padEnd(24)} ${event}` + (detail ? ' ' + JSON.stringify(detail) : '')
  // eslint-disable-next-line no-console
  console.log('[AUTHTRACE] ' + line)
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KEY) || '[]')
    arr.push(line)
    while (arr.length > MAX) arr.shift()
    localStorage.setItem(KEY, JSON.stringify(arr))
  } catch { /* storage unavailable — console line still emitted */ }
}

export function clearAuthTrace(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// Expose convenience accessors on window for the tester (no build tooling needed).
if (typeof window !== 'undefined') {
  try {
    ;(window as any).__authTrace = (): string => {
      try { return (JSON.parse(localStorage.getItem(KEY) || '[]') as string[]).join('\n') }
      catch { return '' }
    }
    ;(window as any).__clearAuthTrace = clearAuthTrace
  } catch { /* ignore */ }
}
