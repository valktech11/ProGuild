'use client'
import { useState, useCallback, useEffect } from 'react'
import { SUPPLEMENT_DISCLAIMER, groundSupplementFlags, type SupplementResult, type SupplementItem, type MeasuredLinearFootage } from '@/lib/fl/supplement'
import { Card } from '@/components/ui/Card'

interface Props {
  leadId:        string
  proId:         string
  propertyState?: string | null
  hasClaim:       boolean   // roofing_job_data.insurance_claim
  darkMode:       boolean
  measuredLF?:    MeasuredLinearFootage | null  // synthesized linear_footage from the lead (human ProMeasure LF)
}

const TEAL = '#0F766E'
const NAVY = '#0A1628'

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ── Item table ────────────────────────────────────────────────────────────────
function ItemTable({ items, dk, accent }: { items: SupplementItem[]; dk: boolean; accent: string }) {
  if (items.length === 0) return null
  const border = dk ? '#334155' : '#E2E8F0'
  const sub    = dk ? '#94A3B8' : '#64748B'
  const text   = dk ? '#E2E8F0' : '#0F172A'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ borderRadius: 10, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, padding: '12px 14px', background: dk ? 'rgba(255,255,255,0.02)' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{it.item}</div>
              <div style={{ fontSize: 12, color: sub, marginTop: 3, lineHeight: 1.45 }}>{it.reason}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {it.fl_code && <span style={{ fontSize: 11, fontWeight: 600, color: accent, background: accent + '14', padding: '2px 7px', borderRadius: 5 }}>{it.fl_code}</span>}
                {it.suggested_quantity && <span style={{ fontSize: 11, color: sub }}>Qty: {it.suggested_quantity}</span>}
                {it.suggested_unit_price > 0 && <span style={{ fontSize: 11, color: sub }}>@ {money(it.suggested_unit_price)}</span>}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: text, whiteSpace: 'nowrap' }}>{money(it.suggested_total)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SupplementAssistant({ leadId, proId, propertyState, hasClaim, darkMode: dk, measuredLF }: Props) {
  const [scope,   setScope]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<SupplementResult | null>(null)
  const [copied,  setCopied]  = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)   // ISO timestamp of last saved run
  const [restoring, setRestoring] = useState(true)

  const isFL = (propertyState ?? '').trim().toUpperCase() === 'FL'
  const grounded = groundSupplementFlags(measuredLF)

  // Load the most recent session for this lead on mount
  useEffect(() => {
    if (!isFL || !hasClaim) { setRestoring(false); return }
    fetch(`/api/roofing/supplement?lead_id=${leadId}&pro_id=${proId}`)
      .then(r => r.json())
      .then(d => {
        if (d.session) {
          setScope(d.session.scope_text || '')
          setResult(d.session.result_json as SupplementResult)
          setLastRun(d.session.created_at)
        }
      })
      .catch(() => {})
      .finally(() => setRestoring(false))
  }, [leadId, proId, isFL, hasClaim])

  const analyze = useCallback(async () => {
    if (scope.trim().length < 20) { setError('Paste the adjuster\u2019s scope of loss first (a few lines).'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/roofing/supplement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, pro_id: proId, scope_text: scope }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
      setResult((data as { result: SupplementResult }).result)
      setLastRun(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally { setLoading(false) }
  }, [scope, leadId, proId])

  const copyLetter = useCallback(() => {
    if (!result?.supplement_letter) return
    navigator.clipboard?.writeText(result.supplement_letter).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [result])

  const border = dk ? '#334155' : '#E2E8F0'
  const text   = dk ? '#E2E8F0' : '#0F172A'
  const sub    = dk ? '#94A3B8' : '#64748B'

  // Gate: roofing FL insurance claims only.
  if (restoring) {
    return (
      <Card dk={dk} accent={TEAL} style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: dk ? '#5EEAD4' : NAVY, marginBottom: 4 }}>Supplement Assistant</div>
        <div style={{ fontSize: 12, color: sub }}>Loading previous analysis…</div>
      </Card>
    )
  }

  if (!isFL) {
    return (
      <Card dk={dk} accent={TEAL} style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: dk ? '#5EEAD4' : NAVY, marginBottom: 4 }}>Supplement Assistant</div>
        <div style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>
          The Supplement Assistant applies Florida building-code line items — it only works for FL properties. Set the lead&apos;s state to <strong style={{ color: text }}>FL</strong> in Edit (contact details) to enable it.
        </div>
      </Card>
    )
  }
  if (!hasClaim) {
    return (
      <Card dk={dk} style={{ padding: '16px 18px', color: sub, fontSize: 13, lineHeight: 1.5 }}>
        Turn on <strong style={{ color: text }}>Insurance claim</strong> above and fill in the claim details first — the Supplement Assistant uses the carrier, adjuster, and roof data to draft the request.
      </Card>
    )
  }

  return (
    <Card dk={dk} accent={TEAL} pad="none">
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: dk ? '#5EEAD4' : NAVY, letterSpacing: '0.01em' }}>Supplement Assistant</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEAL }}>Recover money the carrier missed</div>
          </div>
          {lastRun && <div style={{ fontSize: 11, color: sub }}>{new Date(lastRun).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
        </div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3, lineHeight: 1.45 }}>
          Paste the adjuster&apos;s scope of loss. The assistant flags FL line items they missed or underpaid and drafts a supplement letter.
          {lastRun && <span style={{ marginLeft: 6, color: TEAL, fontWeight: 600 }}>· Last run restored</span>}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {grounded.length > 0 && (
          <div style={{ marginBottom: 14, borderRadius: 10, border: `1px solid ${border}`, background: 'transparent', padding: '11px 13px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>From your measurements</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {grounded.map(f => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{f.item}</span>
                      <span style={{ fontSize: 11, color: sub }}>· {f.basis === 'code' ? 'Code-required (FL)' : 'Standard supplement'}</span>
                    </div>
                    <span style={{ display: 'inline-block', marginTop: 2, fontSize: 12, fontWeight: 600, letterSpacing: '0.01em', color: dk ? '#94A3B8' : '#475569', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{f.code}</span>
                  </div>
                  <div style={{ whiteSpace: 'nowrap', textAlign: 'right' as const, flexShrink: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL, letterSpacing: '-0.02em' }}>{f.measured_lf}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: dk ? '#5EEAD4' : TEAL, opacity: 0.6, marginLeft: 3 }}>LF</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: sub, marginTop: 7, lineHeight: 1.4 }}>Measured by ProMeasure — check the pasted scope below covers these.</div>
          </div>
        )}
        {grounded.length === 0 && (
          <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 9, background: dk ? 'rgba(148,163,184,0.08)' : '#F8FAFC', border: `1px solid ${border}`, fontSize: 12, color: sub, lineHeight: 1.5 }}>
            Once you trace ridge, hip &amp; valley via ProMeasure — or enter LF in the calculator — the items detected from your measurements appear here automatically.
          </div>
        )}

        <textarea
          value={scope}
          onChange={e => { setScope(e.target.value); setError(null) }}
          placeholder="Paste the adjuster's scope of loss here — line items, quantities, prices…"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '11px 13px', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit',
            border: `1.5px solid ${border}`, borderRadius: 9,
            background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC', color: text,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={analyze}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 9, border: 'none',
              background: loading ? (dk ? '#334155' : '#94A3B8') : TEAL, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            {loading
              ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'pgspin 0.7s linear infinite' }} />Analyzing scope…</>
              : 'Analyze Scope'}
          </button>
          {error && <span style={{ fontSize: 12.5, color: '#DC2626', fontWeight: 600 }}>{error}</span>}
        </div>
        <style>{`@keyframes pgspin { to { transform: rotate(360deg) } }`}</style>

        {result && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Total */}
            <div style={{ padding: '14px 16px', borderRadius: 10, background: TEAL + (dk ? '22' : '10'), border: `1px solid ${TEAL}44` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#5EEAD4' : TEAL, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Estimated supplement</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: text, marginTop: 2 }}>{money(result.total_supplement_estimate)}</div>
              <div style={{ fontSize: 11.5, color: sub, marginTop: 2 }}>
                {result.missing_items.length} missing · {result.underpaid_items.length} underpaid
              </div>
            </div>

            {result.missing_items.length === 0 && result.underpaid_items.length === 0 && (
              <div style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>
                No missing or underpaid items found — the adjuster&apos;s scope looks complete against the FL checklist. That&apos;s a valid result, not an error.
              </div>
            )}

            {result.missing_items.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Missing items</div>
                <ItemTable items={result.missing_items} dk={dk} accent="#DC2626" />
              </div>
            )}

            {result.underpaid_items.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Underpaid items</div>
                <ItemTable items={result.underpaid_items} dk={dk} accent="#D97706" />
              </div>
            )}

            {result.supplement_letter && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Draft supplement letter</div>
                  <button
                    onClick={copyLetter}
                    style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${TEAL}`, background: copied ? TEAL : 'transparent', color: copied ? '#fff' : TEAL, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {copied ? 'Copied!' : 'Copy Letter'}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={result.supplement_letter}
                  rows={12}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    padding: '12px 14px', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'inherit',
                    border: `1px solid ${border}`, borderRadius: 9,
                    background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC', color: text,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: 16, padding: '11px 13px', borderRadius: 9, background: dk ? 'rgba(148,163,184,0.10)' : '#F1F5F9', border: `1px solid ${border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Disclaimer</div>
          <div style={{ fontSize: 12, color: dk ? '#94A3B8' : '#475569', lineHeight: 1.5 }}>{SUPPLEMENT_DISCLAIMER}</div>
        </div>
      </div>
    </Card>
  )
}
