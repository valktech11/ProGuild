'use client'
import { useEffect, useRef, useState } from 'react'
import { getTerminalStages, getStageAnchors, getActiveStages, getTradeConfig } from '@/lib/trades/_registry'
import { isStalled } from '@/lib/metrics/sla'
import { Lead } from '@/types'
import { theme, BRAND } from '@/lib/tokens'

export interface FilterState {
  stages: string[]
  sources: string[]
  needsAttention: boolean
  minValue: string
  maxValue: string
  dateReceived: string
  followUpDue: string
}

export const DEFAULT_FILTERS: FilterState = {
  stages: [], sources: [], needsAttention: false,
  minValue: '', maxValue: '', dateReceived: '', followUpDue: '',
}

export function isFilterActive(f: FilterState): boolean {
  return (
    f.stages.length > 0 || f.sources.length > 0 || f.needsAttention ||
    f.minValue !== '' || f.maxValue !== '' || f.dateReceived !== '' || f.followUpDue !== ''
  )
}

export function applyFilters(leads: Lead[], f: FilterState, tradeSlug?: string | null): Lead[] {
  let result = leads
  if (f.stages.length > 0) result = result.filter(l => f.stages.some(s => s === l.lead_status))
  if (f.sources.length > 0) result = result.filter(l => f.sources.includes(l.lead_source))
  if (f.needsAttention) {
    const anchors = getStageAnchors(tradeSlug)
    result = result.filter(l => isStalled(l, anchors.entry))
  }
  if (f.minValue !== '') {
    const min = parseFloat(f.minValue)
    result = result.filter(l => (l.quoted_amount ?? 0) >= min)
  }
  if (f.maxValue !== '') {
    const max = parseFloat(f.maxValue)
    result = result.filter(l => (l.quoted_amount ?? 0) <= max)
  }
  if (f.dateReceived) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const weekStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    result = result.filter(l => {
      const t = new Date(l.created_at).getTime()
      if (f.dateReceived === 'today') return t >= todayStart
      if (f.dateReceived === 'week')  return t >= weekStart
      if (f.dateReceived === 'month') return t >= monthStart
      return true
    })
  }
  if (f.followUpDue) {
    const today = new Date(); today.setHours(0,0,0,0)
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999)
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
    result = result.filter(l => {
      if (!l.follow_up_date) return false
      const d = new Date(l.follow_up_date)
      if (f.followUpDue === 'overdue') return d < today
      if (f.followUpDue === 'today')   return d >= today && d <= todayEnd
      if (f.followUpDue === 'week')    return d >= today && d <= weekEnd
      return true
    })
  }
  return result
}

const SOURCES_FALLBACK = [
  { key: 'Phone_Call', label: 'Phone Call' }, { key: 'Referral', label: 'Referral' },
  { key: 'Facebook', label: 'Facebook' }, { key: 'Instagram', label: 'Instagram' },
  { key: 'Yard_Sign', label: 'Yard Sign' }, { key: 'Door_Knock', label: 'Door Knock' },
  { key: 'Storm_Damage', label: 'Storm Damage' }, { key: 'Insurance_Co', label: 'Insurance Co.' },
  { key: 'Website', label: 'Website' }, { key: 'Google', label: 'Google' },
  { key: 'Canvassing', label: 'Canvassing' }, { key: 'Other', label: 'Other' },
]

interface Props {
  open: boolean
  filters: FilterState
  onChange: (f: FilterState) => void
  onClose: () => void
  onClear: () => void
  dk: boolean
  tradeSlug?: string | null
}

export default function FilterPanel({ open, filters, onChange, onClose, onClear, dk, tradeSlug }: Props) {
  const [openMenu, setOpenMenu] = useState<'stage' | 'source' | null>(null)
  const t = theme(dk)

  const plugin         = getTradeConfig(tradeSlug)
  const wonKey         = getStageAnchors(tradeSlug).won
  const wonStage       = { key: wonKey, label: plugin.labels.wonStage, color: '#15803D' }
  const activeStages   = getActiveStages(tradeSlug).filter(s => !s.terminal && s.key !== wonKey)
  const terminalStages = getTerminalStages(tradeSlug).filter(s => s.key !== wonKey)
  const stageOptions   = [...activeStages, ...terminalStages, { ...wonStage, terminal: false }]
  const sourceOptions: { key: string; label: string }[] = (plugin as any).leadSources
    ? (plugin as any).leadSources.map((s: any) => ({ key: s.value ?? s.label as string, label: s.label as string }))
    : SOURCES_FALLBACK

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') openMenu ? setOpenMenu(null) : onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, openMenu])

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

  const TEAL = BRAND.teal
  const activeCount = [
    filters.stages.length > 0, filters.sources.length > 0, filters.needsAttention,
    filters.minValue !== '' || filters.maxValue !== '',
    filters.dateReceived !== '', filters.followUpDue !== '',
  ].filter(Boolean).length

  if (!open) return null

  const surface  = dk ? '#0E1118' : '#FFFFFF'
  const headBg   = dk ? '#111827' : '#FBFBFA'
  const fieldBg  = dk ? '#1E293B' : '#F6F7F9'
  const fieldOn  = dk ? '#0D2E28' : '#ECFDF7'
  const sectionGap = 22

  const stageLabel  = filters.stages.length === 0 ? 'All stages'
    : filters.stages.length === 1 ? (stageOptions.find(s => s.key === filters.stages[0])?.label ?? '1 selected')
    : `${filters.stages.length} stages`
  const sourceLabel = filters.sources.length === 0 ? 'All sources'
    : filters.sources.length === 1 ? (sourceOptions.find(s => s.key === filters.sources[0])?.label ?? '1 selected')
    : `${filters.sources.length} sources`

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full flex flex-col"
        style={{ width: 380, maxWidth: '95vw', background: surface, boxShadow: '-12px 0 48px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', background: headBg, borderBottom: `1px solid ${t.cardBorder}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: t.textPri, letterSpacing: '-0.02em' }}>Filters</span>
            {activeCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 20, background: TEAL, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {activeCount}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: t.textMuted }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 22px 28px' }}>

          {/* Stage */}
          <Group label="Stage" active={filters.stages.length > 0} onClear={() => onChange({ ...filters, stages: [] })} dk={dk} gap={sectionGap}>
            <Dropdown
              open={openMenu === 'stage'}
              onToggle={() => setOpenMenu(m => m === 'stage' ? null : 'stage')}
              onClose={() => setOpenMenu(null)}
              label={stageLabel}
              activeN={filters.stages.length}
              totalN={stageOptions.length}
              dk={dk} fieldBg={fieldBg} fieldOn={fieldOn} teal={TEAL}
              options={stageOptions.map(s => ({ key: s.key, label: s.label, color: (s as any).color }))}
              selected={filters.stages}
              onPick={k => onChange({ ...filters, stages: toggle(filters.stages, k) })}
              onClearAll={() => onChange({ ...filters, stages: [] })}
            />
          </Group>

          {/* Lead Source */}
          <Group label="Lead Source" active={filters.sources.length > 0} onClear={() => onChange({ ...filters, sources: [] })} dk={dk} gap={sectionGap}>
            <Dropdown
              open={openMenu === 'source'}
              onToggle={() => setOpenMenu(m => m === 'source' ? null : 'source')}
              onClose={() => setOpenMenu(null)}
              label={sourceLabel}
              activeN={filters.sources.length}
              totalN={sourceOptions.length}
              dk={dk} fieldBg={fieldBg} fieldOn={fieldOn} teal={TEAL}
              options={sourceOptions}
              selected={filters.sources}
              onPick={k => onChange({ ...filters, sources: toggle(filters.sources, k) })}
              onClearAll={() => onChange({ ...filters, sources: [] })}
            />
          </Group>

          {/* Needs attention */}
          <Group label="Status" dk={dk} gap={sectionGap}>
            <button
              onClick={() => onChange({ ...filters, needsAttention: !filters.needsAttention })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: filters.needsAttention ? (dk ? '#1C1600' : '#FFFBEB') : fieldBg,
                border: `1.5px solid ${filters.needsAttention ? '#E0A800' : 'transparent'}`,
                transition: 'all 140ms',
              }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: filters.needsAttention ? '#92400E' : t.textPri }}>Needs attention</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>Leads stalled past their stage SLA</div>
              </div>
              <div style={{ width: 38, height: 22, borderRadius: 22, flexShrink: 0, background: filters.needsAttention ? '#E0A800' : (dk ? '#374151' : '#D4D7DD'), position: 'relative', transition: 'background 180ms' }}>
                <div style={{ position: 'absolute', top: 2, left: filters.needsAttention ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 180ms' }} />
              </div>
            </button>
          </Group>

          {/* Estimated value */}
          <Group label="Estimated Value" active={!!(filters.minValue || filters.maxValue)} onClear={() => onChange({ ...filters, minValue: '', maxValue: '' })} dk={dk} gap={sectionGap}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(['minValue', 'maxValue'] as const).map((field, i) => (
                <div key={field} style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: t.textSubtle, pointerEvents: 'none', fontWeight: 600 }}>$</span>
                  <input type="number" inputMode="numeric" placeholder={i === 0 ? 'Min' : 'Max'} value={filters[field]}
                    onChange={e => onChange({ ...filters, [field]: e.target.value })}
                    style={{
                      width: '100%', padding: '11px 12px 11px 26px', borderRadius: 10, fontSize: 13.5, fontWeight: 500,
                      background: filters[field] ? fieldOn : fieldBg,
                      border: `1.5px solid ${filters[field] ? TEAL : 'transparent'}`,
                      color: t.textPri, outline: 'none', boxSizing: 'border-box',
                    }} />
                </div>
              ))}
            </div>
          </Group>

          {/* Date received */}
          <Group label="Date Received" active={!!filters.dateReceived} onClear={() => onChange({ ...filters, dateReceived: '' })} dk={dk} gap={sectionGap}>
            <Seg options={[{ k: 'today', l: 'Today' }, { k: 'week', l: 'This week' }, { k: 'month', l: 'This month' }]}
              value={filters.dateReceived} onChange={v => onChange({ ...filters, dateReceived: v === filters.dateReceived ? '' : v })}
              dk={dk} fieldBg={fieldBg} teal={TEAL} />
          </Group>

          {/* Follow-up */}
          <Group label="Follow-up Due" active={!!filters.followUpDue} onClear={() => onChange({ ...filters, followUpDue: '' })} dk={dk} gap={0}>
            <Seg options={[{ k: 'overdue', l: 'Overdue', red: true }, { k: 'today', l: 'Today' }, { k: 'week', l: 'This week' }]}
              value={filters.followUpDue} onChange={v => onChange({ ...filters, followUpDue: v === filters.followUpDue ? '' : v })}
              dk={dk} fieldBg={fieldBg} teal={TEAL} />
          </Group>

        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '14px 22px', background: headBg, borderTop: `1px solid ${t.cardBorder}`, display: 'flex', gap: 10 }}>
          {activeCount > 0 && (
            <button onClick={onClear} style={{ padding: '13px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: `1.5px solid ${t.inputBorder}`, color: t.textBody }}>
              Reset
            </button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#0F766E,#0D9488)', color: '#fff' }}>
            {activeCount > 0 ? `Show results` : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dropdown (multi-select with checkboxes) ──────────────────────────────────
function Dropdown({ open, onToggle, onClose, label, activeN, totalN, dk, fieldBg, fieldOn, teal, options, selected, onPick, onClearAll }: {
  open: boolean; onToggle: () => void; onClose: () => void
  label: string; activeN: number; totalN: number
  dk: boolean; fieldBg: string; fieldOn: string; teal: string
  options: { key: string; label: string; color?: string }[]
  selected: string[]; onPick: (k: string) => void; onClearAll: () => void
}) {
  const t = theme(dk)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 13.5,
          background: activeN > 0 ? fieldOn : fieldBg,
          border: `1.5px solid ${activeN > 0 ? teal : 'transparent'}`,
          color: activeN > 0 ? teal : t.textBody, fontWeight: activeN > 0 ? 600 : 400,
          outline: 'none',
        }}>
        <span>{label}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', opacity: 0.55, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop catches outside clicks; sits behind the menu (z lower) */}
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 31,
            background: dk ? '#1A2130' : '#FFFFFF',
            border: `1px solid ${t.cardBorder}`, borderRadius: 12,
            boxShadow: '0 16px 40px rgba(0,0,0,0.16)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${t.divider}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {activeN} of {totalN} selected
              </span>
              {activeN > 0 && (
                <button onClick={onClearAll} style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
              )}
            </div>
            <div style={{ maxHeight: 252, overflowY: 'auto' }}>
              {options.map((o, i) => {
                const on = selected.includes(o.key)
                return (
                  <button key={o.key} onClick={() => onPick(o.key)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                      padding: '11px 14px',
                      background: on ? fieldOn : 'transparent',
                      border: 'none', borderBottom: i < options.length - 1 ? `1px solid ${t.divider}` : 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${on ? teal : (dk ? '#475569' : '#CBD5E1')}`,
                      background: on ? teal : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                    {o.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
                    <span style={{ fontSize: 13.5, fontWeight: on ? 600 : 400, color: on ? t.textPri : t.textBody }}>{o.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Group wrapper ─────────────────────────────────────────────────────────────
function Group({ label, active, onClear, dk, gap, children }: {
  label: string; active?: boolean; onClear?: () => void; dk: boolean; gap: number; children: React.ReactNode
}) {
  const t = theme(dk)
  return (
    <div style={{ marginBottom: gap }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.textMuted }}>{label}</span>
        {active && onClear && (
          <button onClick={onClear} style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Segmented control ─────────────────────────────────────────────────────────
function Seg({ options, value, onChange, dk, fieldBg, teal }: {
  options: { k: string; l: string; red?: boolean }[]
  value: string; onChange: (v: string) => void; dk: boolean; fieldBg: string; teal: string
}) {
  const t = theme(dk)
  return (
    <div style={{ display: 'flex', background: fieldBg, borderRadius: 12, padding: 4, gap: 4 }}>
      {options.map(({ k, l, red }) => {
        const on = value === k
        const ac = red ? '#DC2626' : teal
        return (
          <button key={k} onClick={() => onChange(k)}
            style={{
              flex: 1, padding: '9px 6px', borderRadius: 9, fontSize: 12.5, fontWeight: on ? 700 : 500,
              cursor: 'pointer', border: 'none',
              background: on ? (dk ? '#0E1118' : '#FFFFFF') : 'transparent',
              color: on ? ac : t.textMuted,
              boxShadow: on ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 130ms',
            }}>
            {l}
          </button>
        )
      })}
    </div>
  )
}
