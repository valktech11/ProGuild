// components/roofing/WarrantyRecord.tsx
// Triggered by the job_won auto-trigger queue.
// Shown as a modal/sheet when a lead reaches Job Won stage.
// Stores warranty on the property profile record.
'use client'

import { useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
export interface WarrantyData {
  shingle_brand:    string
  shingle_model:    string
  warranty_term:    string    // "10yr" | "25yr" | "30yr" | "Lifetime"
  install_date:     string    // ISO date string YYYY-MM-DD
  expiry_date:      string    // computed or manual
  property_id:      string
  lead_id:          string
}

interface Props {
  leadId:     string
  proId:      string
  propertyId: string | null
  darkMode:   boolean
  onSaved:    (data: WarrantyData) => void
  onDismiss:  () => void
}

const WARRANTY_TERMS = ['10 Year', '25 Year', '30 Year', 'Lifetime'] as const

const COMMON_BRANDS = [
  'Owens Corning',
  'GAF',
  'CertainTeed',
  'Atlas Roofing',
  'TAMKO',
  'IKO',
  'Malarkey',
  'Other',
]

// ── Component ─────────────────────────────────────────────────────────────
export default function WarrantyRecord({ leadId, proId, propertyId, darkMode, onSaved, onDismiss }: Props) {
  const [brand,    setBrand]    = useState('')
  const [model,    setModel]    = useState('')
  const [term,     setTerm]     = useState<string>('30 Year')
  const [install,  setInstall]  = useState(new Date().toISOString().split('T')[0])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // ── Compute expiry from install date + term ────────────────────────────
  const computedExpiry = (() => {
    if (term === 'Lifetime') return 'Lifetime'
    const years = parseInt(term)
    if (!install || isNaN(years)) return ''
    const d = new Date(install)
    d.setFullYear(d.getFullYear() + years)
    return d.toISOString().split('T')[0]
  })()

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!brand.trim()) {
      setError('Shingle brand is required')
      return
    }

    setSaving(true)
    setError(null)

    const payload: WarrantyData = {
      shingle_brand: brand.trim(),
      shingle_model: model.trim(),
      warranty_term: term,
      install_date:  install,
      expiry_date:   computedExpiry,
      property_id:   propertyId ?? '',
      lead_id:       leadId,
    }

    try {
      const res = await fetch('/api/roofing/warranties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, pro_id: proId }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as {error?: string}).error ?? `HTTP ${res.status}`)
      }

      onSaved(payload)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save warranty')
    } finally {
      setSaving(false)
    }
  }, [brand, model, term, install, computedExpiry, propertyId, leadId, proId, onSaved])

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
      borderRadius: 16,
      padding: 24,
      maxWidth: 440,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>🛡️</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: textPrimary, margin: 0 }}>
          Log warranty
        </h3>
        <p style={{ fontSize: 13, color: textMuted, marginTop: 4 }}>
          Stored on the property profile. Homeowner gets a PDF copy.
        </p>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Brand */}
        <div>
          <label style={labelStyle}>Shingle brand *</label>
          <select
            value={COMMON_BRANDS.includes(brand) ? brand : 'Other'}
            onChange={e => {
              if (e.target.value !== 'Other') setBrand(e.target.value)
              else setBrand('')
            }}
            style={inputStyle}
          >
            <option value="">Select brand…</option>
            {COMMON_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* Custom brand input if Other */}
          {(!COMMON_BRANDS.includes(brand) || brand === '') && (
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="Brand name"
            />
          )}
        </div>

        {/* Model */}
        <div>
          <label style={labelStyle}>Shingle model</label>
          <input
            style={inputStyle}
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="e.g. Duration, Timberline HDZ"
          />
        </div>

        {/* Warranty term */}
        <div>
          <label style={labelStyle}>Warranty term</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {WARRANTY_TERMS.map(t => (
              <button
                key={t}
                onClick={() => setTerm(t)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 500,
                  border: `1.5px solid ${term === t ? teal : inputBorder}`,
                  background: term === t ? '#F0FDFA' : 'transparent',
                  color: term === t ? teal : textMuted,
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Install date */}
        <div>
          <label style={labelStyle}>Install date</label>
          <input
            type="date"
            style={inputStyle}
            value={install}
            onChange={e => setInstall(e.target.value)}
          />
        </div>

        {/* Computed expiry */}
        {computedExpiry && (
          <div style={{
            padding: '10px 14px',
            background: darkMode ? '#0F2D1A' : '#F0FDF4',
            borderRadius: 8,
            fontSize: 13,
            color: '#15803D',
          }}>
            ✓ Warranty expires: <strong>
              {computedExpiry === 'Lifetime' ? 'Lifetime (non-transferable)' : computedExpiry}
            </strong>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 12, padding: '8px 12px', borderRadius: 8,
          background: '#FEF2F2', color: '#DC2626', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: 8,
            background: saving ? '#9CA3AF' : teal,
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save warranty'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            background: 'transparent',
            color: textMuted,
            fontWeight: 500,
            fontSize: 14,
            border: `1px solid ${cardBorder}`,
            cursor: 'pointer',
          }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
