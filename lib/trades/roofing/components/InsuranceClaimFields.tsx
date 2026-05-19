// components/roofing/InsuranceClaimFields.tsx
// 9 insurance claim fields behind a toggle.
// Rendered on lead detail page for roofing trade only.
// Guard: isRoofing(tradeConfig) must be true before rendering.
'use client'

import { useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
export interface InsuranceClaimData {
  insurance_claim:        boolean
  insurance_company:      string
  claim_number:           string
  adjuster_name:          string
  adjuster_phone:         string
  adjuster_appointment:   string   // ISO datetime string
  claim_status:           string
  approved_amount:        string   // stored as string for input, parse on save
  supplement_amount:      string
  deductible:             string
}

interface Props {
  leadId:    string
  proId:     string
  initial:   Partial<InsuranceClaimData>
  darkMode:  boolean
  onSaved:   (data: InsuranceClaimData) => void
}

const CLAIM_STATUSES = [
  'Filed',
  'Adjuster Scheduled',
  'Adjuster Visited',
  'Approved',
  'Supplement Filed',
  'Supplement Approved',
  'Denied',
  'Closed',
] as const

// ── Component ─────────────────────────────────────────────────────────────
export default function InsuranceClaimFields({ leadId, proId, initial, darkMode, onSaved }: Props) {
  const [open, setOpen]       = useState(initial.insurance_claim ?? false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)

  const [fields, setFields] = useState<InsuranceClaimData>({
    insurance_claim:      initial.insurance_claim      ?? false,
    insurance_company:    initial.insurance_company    ?? '',
    claim_number:         initial.claim_number         ?? '',
    adjuster_name:        initial.adjuster_name        ?? '',
    adjuster_phone:       initial.adjuster_phone       ?? '',
    adjuster_appointment: initial.adjuster_appointment ?? '',
    claim_status:         initial.claim_status         ?? 'Filed',
    approved_amount:      initial.approved_amount      ?? '',
    supplement_amount:    initial.supplement_amount    ?? '',
    deductible:           initial.deductible           ?? '',
  })

  const set = (key: keyof InsuranceClaimData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSaved(false)
      setFields(f => ({ ...f, [key]: e.target.value }))
    }

  const handleToggle = useCallback(async () => {
    const newOpen = !open
    setOpen(newOpen)
    setFields(f => ({ ...f, insurance_claim: newOpen }))

    // Persist toggle state immediately — no full form save needed
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: proId, insurance_claim: newOpen }),
    }).catch(() => {/* non-fatal */})
  }, [open, leadId, proId])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    // Validate phone format loosely
    const phone = fields.adjuster_phone.replace(/\D/g, '')
    if (phone.length > 0 && phone.length < 10) {
      setError('Adjuster phone must be 10+ digits')
      setSaving(false)
      return
    }

    // Parse currency fields — remove $ and commas
    const parseCurrency = (v: string) => {
      const n = parseFloat(v.replace(/[$,]/g, ''))
      return isNaN(n) ? null : n
    }

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:                 proId,
          insurance_claim:        fields.insurance_claim,
          insurance_company:      fields.insurance_company    || null,
          claim_number:           fields.claim_number         || null,
          adjuster_name:          fields.adjuster_name        || null,
          adjuster_phone:         fields.adjuster_phone       || null,
          adjuster_appointment:   fields.adjuster_appointment || null,
          claim_status:           fields.claim_status         || null,
          approved_amount:        parseCurrency(fields.approved_amount),
          supplement_amount:      parseCurrency(fields.supplement_amount),
          deductible:             parseCurrency(fields.deductible),
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as {error?: string}).error ?? `HTTP ${res.status}`)
      }

      setSaved(true)
      onSaved(fields)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [fields, leadId, proId, onSaved])

  // ── Styles ─────────────────────────────────────────────────────────────
  const cardBg     = darkMode ? '#1E293B' : '#FFFFFF'
  const cardBorder = darkMode ? '#334155' : '#E8E2D9'
  const textPrimary= darkMode ? '#F1F5F9' : '#0A1628'
  const textMuted  = darkMode ? '#94A3B8' : '#6B7280'
  const inputBg    = darkMode ? '#0F172A' : '#F8FAFC'
  const inputBorder= darkMode ? '#334155' : '#CBD5E1'
  const teal       = '#0F766E'

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: `1.5px solid ${inputBorder}`,
    background: inputBg,
    color: textPrimary,
    fontSize: 14,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: textMuted,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${cardBorder}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    }}>
      {/* Toggle row */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={handleToggle}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
            🛡️ Insurance claim
          </div>
          {!open && (
            <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
              {fields.insurance_company
                ? `${fields.insurance_company}${fields.claim_number ? ` · #${fields.claim_number}` : ''}`
                : 'Tap to expand insurance fields'}
            </div>
          )}
        </div>

        {/* Toggle switch */}
        <div style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: open ? teal : (darkMode ? '#334155' : '#CBD5E1'),
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            top: 3,
            left: open ? 23 : 3,
            transition: 'left 0.2s',
          }} />
        </div>
      </div>

      {/* Fields (shown when open) */}
      {open && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* Insurance company */}
            <div>
              <label style={labelStyle}>Insurance company</label>
              <input
                style={inputStyle}
                value={fields.insurance_company}
                onChange={set('insurance_company')}
                placeholder="State Farm, Citizens…"
              />
            </div>

            {/* Claim number */}
            <div>
              <label style={labelStyle}>Claim number</label>
              <input
                style={inputStyle}
                value={fields.claim_number}
                onChange={set('claim_number')}
                placeholder="Assigned by insurer"
              />
            </div>

            {/* Adjuster name */}
            <div>
              <label style={labelStyle}>Adjuster name</label>
              <input
                style={inputStyle}
                value={fields.adjuster_name}
                onChange={set('adjuster_name')}
                placeholder="Full name"
              />
            </div>

            {/* Adjuster phone */}
            <div>
              <label style={labelStyle}>Adjuster phone</label>
              <input
                style={inputStyle}
                type="tel"
                value={fields.adjuster_phone}
                onChange={set('adjuster_phone')}
                placeholder="(305) 555-0142"
              />
            </div>

            {/* Adjuster appointment */}
            <div>
              <label style={labelStyle}>Adjuster appointment</label>
              <input
                style={inputStyle}
                type="datetime-local"
                value={fields.adjuster_appointment}
                onChange={set('adjuster_appointment')}
              />
              <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>
                You must be present at the property
              </div>
            </div>

            {/* Claim status */}
            <div>
              <label style={labelStyle}>Claim status</label>
              <select style={inputStyle} value={fields.claim_status} onChange={set('claim_status')}>
                {CLAIM_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Approved amount */}
            <div>
              <label style={labelStyle}>Approved amount</label>
              <input
                style={inputStyle}
                value={fields.approved_amount}
                onChange={set('approved_amount')}
                placeholder="$0.00"
              />
            </div>

            {/* Supplement amount */}
            <div>
              <label style={labelStyle}>Supplement amount</label>
              <input
                style={inputStyle}
                value={fields.supplement_amount}
                onChange={set('supplement_amount')}
                placeholder="$0.00"
              />
            </div>

            {/* Deductible */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Deductible (homeowner pays)</label>
              <input
                style={{ ...inputStyle, width: '50%' }}
                value={fields.deductible}
                onChange={set('deductible')}
                placeholder="$0.00"
              />
            </div>
          </div>

          {/* Total net calculation */}
          {fields.approved_amount && (
            <div style={{
              marginTop: 14,
              padding: '10px 14px',
              background: darkMode ? '#0F2D1A' : '#F0FDF4',
              borderRadius: 8,
              fontSize: 13,
              color: '#15803D',
            }}>
              {(() => {
                const approved   = parseFloat(fields.approved_amount.replace(/[$,]/g, '')) || 0
                const supplement = parseFloat(fields.supplement_amount.replace(/[$,]/g, '')) || 0
                const deductible = parseFloat(fields.deductible.replace(/[$,]/g, '')) || 0
                const net        = approved + supplement - deductible
                return (
                  <>
                    Approved ${approved.toLocaleString()}
                    {supplement > 0 && ` + supplement $${supplement.toLocaleString()}`}
                    {deductible > 0 && ` − deductible $${deductible.toLocaleString()}`}
                    {' '}= <strong>net ${net.toLocaleString()}</strong>
                  </>
                )
              })()}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 8,
              background: '#FEF2F2',
              color: '#DC2626',
              fontSize: 13,
            }}>{error}</div>
          )}

          {/* Save button */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                background: saving ? '#9CA3AF' : teal,
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save insurance fields'}
            </button>
            {saved && (
              <span style={{ fontSize: 13, color: '#15803D' }}>✓ Saved</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
