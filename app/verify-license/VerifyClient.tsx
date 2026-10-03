'use client'
import { useState } from 'react'
import Link from 'next/link'

type Result = {
  id: string
  full_name: string | null
  city: string | null
  state: string | null
  license_number: string | null
  is_claimed: boolean | null
  is_verified: boolean | null
  trade_category: { category_name: string | null; slug: string | null } | null
}

const TEAL = '#0F766E'

export default function VerifyClient() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function run(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term.length < 2) { setErr('Enter at least 2 characters.'); return }
    setErr(''); setLoading(true); setResults(null)
    try {
      // A license number is alphanumeric with no spaces (e.g. CCC1331234); a name
      // has spaces/letters. Route to the right query param either way.
      const isLicense = /^[A-Za-z]{1,4}\s?\d{3,}$/.test(term) || /^\d{4,}$/.test(term)
      const url = isLicense
        ? `/api/pros?search=${encodeURIComponent(term)}&limit=10`
        : `/api/pros?search=${encodeURIComponent(term)}&limit=10`
      const res = await fetch(url)
      const data = await res.json()
      setResults(Array.isArray(data.pros) ? data.pros : [])
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={run} className="flex flex-col sm:flex-row gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Contractor name or license # (e.g. CCC1331234)"
          aria-label="Contractor name or license number"
          className="flex-1 px-4 py-3 rounded-xl border text-base outline-none"
          style={{ borderColor: '#E8E2D9', background: '#fff', color: '#0A1628' }}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold text-white text-base whitespace-nowrap disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL}, #0C5F57)` }}
        >
          {loading ? 'Checking…' : 'Verify license'}
        </button>
      </form>
      {err && <p className="mt-3 text-sm" style={{ color: '#B91C1C' }}>{err}</p>}

      {results && (
        <div className="mt-6">
          {results.length === 0 ? (
            <div className="rounded-2xl border p-6 text-center" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
              <p className="text-base font-semibold" style={{ color: '#0A1628' }}>No match found on ProGuild.</p>
              <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
                That doesn&apos;t mean the contractor is unlicensed — they may not be in our directory yet.
                You can check the official record directly at{' '}
                <a href="https://www.myfloridalicense.com/wl11.asp" target="_blank" rel="noopener noreferrer"
                   className="font-semibold underline" style={{ color: TEAL }}>Florida DBPR</a>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#6E6456' }}>
                {results.length} match{results.length === 1 ? '' : 'es'}
              </p>
              {results.map(r => (
                <Link key={r.id} href={`/pro/${r.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors hover:border-teal-400"
                  style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                  <div className="min-w-0">
                    <div className="text-base font-bold truncate" style={{ color: '#0A1628' }}>{r.full_name || 'Contractor'}</div>
                    <div className="text-sm truncate" style={{ color: '#6B7280' }}>
                      {r.trade_category?.category_name || 'Contractor'}
                      {(r.city || r.state) ? ` · ${[r.city, r.state].filter(Boolean).join(', ')}` : ''}
                    </div>
                    {r.license_number && (
                      <div className="text-xs mt-1 font-mono" style={{ color: TEAL }}>License #{r.license_number}</div>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={ r.license_number
                      ? { background: 'rgba(15,118,110,0.08)', color: TEAL }
                      : { background: '#F3F4F6', color: '#6B7280' } }>
                    {r.license_number ? 'License on file' : 'No license #'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
