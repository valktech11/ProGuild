// components/estimate/GoodBetterBest.tsx
// 3-column tiered estimate (Standard / Upgraded / Premium).
// Renders in the estimate builder for the pro to configure.
// The public estimate page (/estimate/[id]) renders the client-facing version.
'use client'

import { useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
export interface TierLineItem {
  description: string
  quantity:    number
  unitPrice:   number
}

export interface EstimateTier {
  key:       'good' | 'better' | 'best'
  label:     string          // editable: "Standard", "Upgraded", "Premium"
  items:     TierLineItem[]
  totalOverride?: number     // optional manual override
}

interface Props {
  estimateId: string
  proId:      string
  initial:    EstimateTier[]
  darkMode:   boolean
  onSaved:    (tiers: EstimateTier[]) => void
}

const DEFAULT_TIERS: EstimateTier[] = [
  { key: 'good',   label: 'Standard',  items: [] },
  { key: 'better', label: 'Upgraded',  items: [] },
  { key: 'best',   label: 'Premium',   items: [] },
]

// Tier accent colours
const TIER_COLORS: Record<string, { border: string; badge: string; text: string }> = {
  good:   { border: '#CBD5E1', badge: '#F1F5F9', text: '#475569' },
  better: { border: '#0F766E', badge: '#F0FDFA', text: '#0F766E' },
  best:   { border: '#7C3AED', badge: '#F5F3FF', text: '#7C3AED' },
}

// ── Component ─────────────────────────────────────────────────────────────
export default function GoodBetterBest({ estimateId, proId, initial, darkMode, onSaved }: Props) {
  const [tiers,   setTiers]   = useState<EstimateTier[]>(initial.length === 3 ? initial : DEFAULT_TIERS)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)

  // ── Tier label edit ────────────────────────────────────────────────────
  const updateLabel = (key: string, label: string) => {
    setSaved(false)
    setTiers(prev => prev.map(t => t.key === key ? { ...t, label } : t))
  }

  // ── Line item updates ──────────────────────────────────────────────────
  const addItem = (tierKey: string) => {
    setSaved(false)
    setTiers(prev => prev.map(t =>
      t.key === tierKey
        ? { ...t, items: [...t.items, { description: '', quantity: 1, unitPrice: 0 }] }
        : t
    ))
  }

  const updateItem = (tierKey: string, idx: number, field: keyof TierLineItem, value: string | number) => {
    setSaved(false)
    setTiers(prev => prev.map(t => {
      if (t.key !== tierKey) return t
      const items = [...t.items]
      items[idx] = { ...items[idx], [field]: value }
      return { ...t, items }
    }))
  }

  const removeItem = (tierKey: string, idx: number) => {
    setSaved(false)
    setTiers(prev => prev.map(t =>
      t.key === tierKey
        ? { ...t, items: t.items.filter((_, i) => i !== idx) }
        : t
    ))
  }

  // ── Tier total ─────────────────────────────────────────────────────────
  const tierTotal = (tier: EstimateTier) => {
    if (tier.totalOverride !== undefined) return tier.totalOverride
    return tier.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch(`/api/estimates/${estimateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: proId, tiered_data: tiers }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as {error?: string}).error ?? `HTTP ${res.status}`)
      }

      setSaved(true)
      onSaved(tiers)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save tiers')
    } finally {
      setSaving(false)
    }
  }, [tiers, estimateId, proId, onSaved])

  // ── Styles ─────────────────────────────────────────────────────────────
  const cardBg     = darkMode ? '#1E293B' : '#FFFFFF'
  const cardBorder = darkMode ? '#334155' : '#E8E2D9'
  const textPrimary= darkMode ? '#F1F5F9' : '#0A1628'
  const textMuted  = darkMode ? '#94A3B8' : '#6B7280'
  const inputBg    = darkMode ? '#0F172A' : '#F8FAFC'
  const inputBorder= darkMode ? '#334155' : '#CBD5E1'

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${inputBorder}`,
    background: inputBg,
    color: textPrimary,
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${cardBorder}`,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: textPrimary, margin: 0 }}>
          Good / Better / Best
        </h3>
        <p style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>
          Present 3 options. Homeowners pick middle or premium 60% of the time. Average ticket +35%.
        </p>
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {tiers.map(tier => {
          const colors = TIER_COLORS[tier.key]
          const total  = tierTotal(tier)

          return (
            <div
              key={tier.key}
              style={{
                border: `2px solid ${colors.border}`,
                borderRadius: 10,
                padding: 14,
              }}
            >
              {/* Tier label (editable) */}
              <div style={{ marginBottom: 12 }}>
                <input
                  value={tier.label}
                  onChange={e => updateLabel(tier.key, e.target.value)}
                  style={{
                    ...inputStyle,
                    width: '100%',
                    fontWeight: 600,
                    fontSize: 14,
                    background: colors.badge,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    textAlign: 'center',
                  }}
                />
              </div>

              {/* Line items */}
              {tier.items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <input
                    value={item.description}
                    onChange={e => updateItem(tier.key, idx, 'description', e.target.value)}
                    placeholder="Description"
                    style={{ ...inputStyle, width: '100%', marginBottom: 4 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 4 }}>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={e => updateItem(tier.key, idx, 'quantity', parseFloat(e.target.value) || 0)}
                      placeholder="Qty"
                      style={inputStyle}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={e => updateItem(tier.key, idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      placeholder="$/unit"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => removeItem(tier.key, idx)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: '#FEE2E2',
                        color: '#DC2626',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >×</button>
                  </div>
                </div>
              ))}

              {/* Add item */}
              <button
                onClick={() => addItem(tier.key)}
                style={{
                  width: '100%',
                  padding: '6px',
                  borderRadius: 6,
                  background: 'transparent',
                  color: textMuted,
                  border: `1px dashed ${inputBorder}`,
                  cursor: 'pointer',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                + Add line item
              </button>

              {/* Tier total */}
              <div style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: colors.badge,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: colors.text, fontWeight: 500, marginBottom: 2 }}>
                  {tier.label} total
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.text }}>
                  ${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Avg ticket lift callout */}
      {tiers.some(t => t.items.length > 0) && (
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: darkMode ? '#0A1628' : '#FFF7ED',
          borderRadius: 8,
          fontSize: 12,
          color: '#C2410C',
        }}>
          💡 When you present 3 options, homeowners choose middle or premium 60% of the time.
          Avg ticket lift: +35%.
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 12, padding: '8px 12px', borderRadius: 8,
          background: '#FEF2F2', color: '#DC2626', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '9px 20px',
            borderRadius: 8,
            background: saving ? '#9CA3AF' : '#0F766E',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save tiers'}
        </button>
        {saved && <span style={{ fontSize: 13, color: '#15803D' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
