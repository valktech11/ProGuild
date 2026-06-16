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
  stages: [],
  sources: [],
  needsAttention: false,
  minValue: '',
  maxValue: '',
  dateReceived: '',
  followUpDue: '',
}

export function isFilterActive(f: FilterState): boolean {
  return (
    f.stages.length > 0 ||
    f.sources.length > 0 ||
    f.needsAttention ||
    f.minValue !== '' ||
    f.maxValue !== '' ||
    f.dateReceived !== '' ||
    f.followUpDue !== ''
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
  { key: 'Phone_Call',    label: 'Phone Call' },
  { key: 'Referral',      label: 'Referral' },
  { key: 'Facebook',      label: 'Facebook' },
  { key: 'Instagram',     label: 'Instagram' },
  { key: 'Yard_Sign',     label: 'Yard Sign' },
  { key: 'Door_Knock',    label: 'Door Knock' },
  { key: 'Storm_Damage',  label: 'Storm Damage' },
  { key: 'Insurance_Co',  label: 'Insurance Co.' },
  { key: 'Website',       label: 'Website' },
  { key: 'Google',        label: 'Google' },
  { key: 'Canvassing',    label: 'Canvassing' },
  { key: 'Other',         label: 'Other' },
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
  const panelRef  = useRef<HTMLDivElement>(null)
  const [stageOpen,  setStageOpen]  = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const t = theme(dk)

  const plugin         = getTradeConfig(tradeSlug)
  const wonKey         = getStageAnchors(tradeSlug).won
  const wonStage       = { key: wonKey, label: plugin.labels.wonStage, color: '#15803D', bg: '#F0FDF4' }
  const activeStages   = getActiveStages(tradeSlug).filter(s => !s.terminal && s.key !== wonKey)
  const terminalStages = getTerminalStages(tradeSlug).filter(s => s.key !== wonKey)
  const stageOptions   = [...activeStages, ...terminalStages, { ...wonStage, terminal: false }]
  const sourceOptions: { key: string; label: string }[] = (plugin as any).leadSources
    ? (plugin as any).leadSources.map((s: any) => ({ key: s.value ?? s.label as string, label: s.label as string }))
    : SOURCES_FALLBACK

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!stageOpen && !sourceOpen) return
    const handleClick = () => { setStageOpen(false); setSourceOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [stageOpen, sourceOpen])

  function toggleArr(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const TEAL   = BRAND.teal
  const activeCount = [
    filters.stages.length > 0, filters.sources.length > 0, filters.needsAttention,
    filters.minValue !== '' || filters.maxValue !== '',
    filters.dateReceived !== '', filters.followUpDue !== '',
  ].filter(Boolean).length

  const stageSummary = () => {
    if (!filters.stages.length) return null
    if (filters.stages.length === 1) return stageOptions.find(s => s.key === filters.stages[0])?.label
    return `${filters.stages.length} stages selected`
  }
  const sourceSummary = () => {
    if (!filters.sources.length) return null
    if (filters.sources.length === 1) return sourceOptions.find(s => s.key === filters.sources[0])?.label
    return `${filters.sources.length} sources selected`
  }

  if (!open) return null

  // shared styles
  const triggerBase: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 500, border: 'none', outline: 'none',
    transition: 'border-color 120ms, background 120ms',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px 10px 32px',
    borderRadius: 10, fontSize: 13, fontWeight: 500,
    border: `1.5px solid ${t.inputBorder}`, color: t.textPri,
    background: t.inputBg, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full flex flex-col"
        style={{
          width: 360, maxWidth: '95vw',
          background: dk ? '#0E1118' : '#FFFFFF',
          borderLeft: `1px solid ${t.cardBorder}`,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 18px',
          borderBottom: `1px solid ${t.cardBorder}`,
          background: dk ? '#111827' : '#FAFAFA',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F0FDFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: t.textPri, letterSpacing: '-0.01em' }}>Filter Leads</span>
            {activeCount > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: TEAL, color: '#fff', letterSpacing: '0.02em',
              }}>{activeCount} active</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeCount > 0 && (
              <button onClick={onClear} style={{
                fontSize: 12, fontWeight: 600, color: '#EF4444',
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
              }}>Clear all</button>
            )}
            <button onClick={onClose} style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: `1px solid ${t.cardBorder}`,
              background: 'none', cursor: 'pointer', color: t.textMuted,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>

          {/* Stage */}
          <FilterGroup
            label="Stage"
            active={filters.stages.length > 0}
            onClear={() => { onChange({ ...filters, stages: [] }); setStageOpen(false) }}
            dk={dk}
          >
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => { setStageOpen(v => !v); setSourceOpen(false) }}
                style={{
                  ...triggerBase,
                  background: filters.stages.length > 0 ? (dk ? '#0D2E28' : '#F0FDFA') : (dk ? '#1E293B' : '#F8FAFC'),
                  border: `1.5px solid ${filters.stages.length > 0 ? TEAL : t.inputBorder}`,
                  color: filters.stages.length > 0 ? TEAL : t.textMuted,
                }}
              >
                <span style={{ fontWeight: filters.stages.length > 0 ? 600 : 400 }}>
                  {stageSummary() ?? 'All stages'}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: stageOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', opacity: 0.5, flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {stageOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                  background: dk ? '#1A2130' : '#FFFFFF',
                  border: `1px solid ${t.cardBorder}`, borderRadius: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                }}>
                  {/* Select all / clear */}
                  <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {filters.stages.length} of {stageOptions.length} selected
                    </span>
                    {filters.stages.length > 0 && (
                      <button onClick={() => onChange({ ...filters, stages: [] })}
                        style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {stageOptions.map((s, i) => {
                      const on = filters.stages.includes(s.key)
                      const color = (s as any).color || '#374151'
                      return (
                        <button key={s.key}
                          onClick={() => onChange({ ...filters, stages: toggleArr(filters.stages, s.key) })}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px',
                            background: on ? (dk ? '#0D2E28' : '#F0FDFA') : 'transparent',
                            border: 'none',
                            borderBottom: i < stageOptions.length - 1 ? `1px solid ${t.divider}` : 'none',
                            cursor: 'pointer', textAlign: 'left',
                          }}>
                          {/* Checkbox */}
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${on ? TEAL : t.inputBorder}`,
                            background: on ? TEAL : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: on ? 600 : 400, color: on ? t.textPri : t.textBody, flex: 1 }}>
                            {s.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Selected pills */}
            {filters.stages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {filters.stages.map(key => {
                  const s = stageOptions.find(o => o.key === key)
                  const color = (s as any)?.color || TEAL
                  return (
                    <span key={key} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 6px 3px 8px', borderRadius: 20,
                      fontSize: 11, fontWeight: 600,
                      background: dk ? '#0D2E28' : '#F0FDFA',
                      color: TEAL, border: `1px solid ${dk ? '#1A4A40' : '#CCFBF1'}`,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      {s?.label ?? key}
                      <button onClick={() => onChange({ ...filters, stages: filters.stages.filter(x => x !== key) })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 0 0 2px', color: TEAL, lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </FilterGroup>

          {/* Lead Source */}
          <FilterGroup
            label="Lead Source"
            active={filters.sources.length > 0}
            onClear={() => { onChange({ ...filters, sources: [] }); setSourceOpen(false) }}
            dk={dk}
          >
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => { setSourceOpen(v => !v); setStageOpen(false) }}
                style={{
                  ...triggerBase,
                  background: filters.sources.length > 0 ? (dk ? '#0D2E28' : '#F0FDFA') : (dk ? '#1E293B' : '#F8FAFC'),
                  border: `1.5px solid ${filters.sources.length > 0 ? TEAL : t.inputBorder}`,
                  color: filters.sources.length > 0 ? TEAL : t.textMuted,
                }}
              >
                <span style={{ fontWeight: filters.sources.length > 0 ? 600 : 400 }}>
                  {sourceSummary() ?? 'All sources'}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: sourceOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', opacity: 0.5, flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {sourceOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                  background: dk ? '#1A2130' : '#FFFFFF',
                  border: `1px solid ${t.cardBorder}`, borderRadius: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {filters.sources.length} of {sourceOptions.length} selected
                    </span>
                    {filters.sources.length > 0 && (
                      <button onClick={() => onChange({ ...filters, sources: [] })}
                        style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {sourceOptions.map((s, i) => {
                      const on = filters.sources.includes(s.key)
                      return (
                        <button key={s.key}
                          onClick={() => onChange({ ...filters, sources: toggleArr(filters.sources, s.key) })}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px',
                            background: on ? (dk ? '#0D2E28' : '#F0FDFA') : 'transparent',
                            border: 'none',
                            borderBottom: i < sourceOptions.length - 1 ? `1px solid ${t.divider}` : 'none',
                            cursor: 'pointer', textAlign: 'left',
                          }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${on ? TEAL : t.inputBorder}`,
                            background: on ? TEAL : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: on ? 600 : 400, color: on ? t.textPri : t.textBody, flex: 1 }}>
                            {s.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {filters.sources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {filters.sources.map(key => {
                  const s = sourceOptions.find(o => o.key === key)
                  return (
                    <span key={key} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 6px 3px 10px', borderRadius: 20,
                      fontSize: 11, fontWeight: 600,
                      background: dk ? '#0D2E28' : '#F0FDFA',
                      color: TEAL, border: `1px solid ${dk ? '#1A4A40' : '#CCFBF1'}`,
                    }}>
                      {s?.label ?? key}
                      <button onClick={() => onChange({ ...filters, sources: filters.sources.filter(x => x !== key) })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 0 0 2px', color: TEAL, lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </FilterGroup>

          {/* Status */}
          <FilterGroup label="Status" dk={dk}>
            <button
              onClick={() => onChange({ ...filters, needsAttention: !filters.needsAttention })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                background: filters.needsAttention ? (dk ? '#1C1600' : '#FFFBEB') : (dk ? '#1E293B' : '#F8FAFC'),
                border: `1.5px solid ${filters.needsAttention ? '#D97706' : t.inputBorder}`,
                transition: 'all 120ms',
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: filters.needsAttention ? '#FEF3C7' : (dk ? '#2D3A4A' : '#F1F5F9'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filters.needsAttention ? '#D97706' : '#9CA3AF'} strokeWidth="2.2" strokeLinecap="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: filters.needsAttention ? '#92400E' : t.textPri }}>Needs attention</div>
                <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>Stalled past stage SLA</div>
              </div>
              {/* Toggle */}
              <div style={{
                width: 36, height: 20, borderRadius: 20, flexShrink: 0,
                background: filters.needsAttention ? '#D97706' : (dk ? '#374151' : '#D1D5DB'),
                position: 'relative', transition: 'background 200ms',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: filters.needsAttention ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  transition: 'left 200ms',
                }} />
              </div>
            </button>
          </FilterGroup>

          {/* Estimated Value */}
          <FilterGroup label="Estimated Value" active={!!(filters.minValue || filters.maxValue)} onClear={() => onChange({ ...filters, minValue: '', maxValue: '' })} dk={dk}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(['minValue', 'maxValue'] as const).map((field, i) => (
                <div key={field} style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: t.textSubtle, pointerEvents: 'none', fontWeight: 500 }}>$</span>
                  <input
                    type="number"
                    placeholder={i === 0 ? 'Min' : 'Max'}
                    value={filters[field]}
                    onChange={e => onChange({ ...filters, [field]: e.target.value })}
                    style={{
                      ...inputStyle,
                      border: `1.5px solid ${filters[field] ? TEAL : t.inputBorder}`,
                    }}
                  />
                </div>
              ))}
              <span style={{ fontSize: 13, color: t.textMuted, flexShrink: 0 }}>to</span>
            </div>
          </FilterGroup>

          {/* Date Received */}
          <FilterGroup label="Date Received" active={!!filters.dateReceived} onClear={() => onChange({ ...filters, dateReceived: '' })} dk={dk}>
            <Seg
              options={[{ k: 'today', l: 'Today' }, { k: 'week', l: 'This week' }, { k: 'month', l: 'This month' }]}
              value={filters.dateReceived}
              onChange={v => onChange({ ...filters, dateReceived: v === filters.dateReceived ? '' : v })}
              dk={dk}
            />
          </FilterGroup>

          {/* Follow-up Due */}
          <FilterGroup label="Follow-up Due" active={!!filters.followUpDue} onClear={() => onChange({ ...filters, followUpDue: '' })} dk={dk}>
            <Seg
              options={[{ k: 'overdue', l: 'Overdue', red: true }, { k: 'today', l: 'Today' }, { k: 'week', l: 'This week' }]}
              value={filters.followUpDue}
              onChange={v => onChange({ ...filters, followUpDue: v === filters.followUpDue ? '' : v })}
              dk={dk}
            />
          </FilterGroup>

        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, padding: '14px 20px 20px',
          borderTop: `1px solid ${t.cardBorder}`,
          background: dk ? '#111827' : '#FAFAFA',
        }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 12,
              fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
              color: '#fff', letterSpacing: '-0.01em',
            }}
          >
            {activeCount > 0 ? `Apply ${activeCount} filter${activeCount !== 1 ? 's' : ''}` : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterGroup({ label, active, onClear, dk, children }: {
  label: string; active?: boolean; onClear?: () => void; dk: boolean; children: React.ReactNode
}) {
  const t = theme(dk)
  return (
    <div style={{ padding: '18px 20px 16px', borderBottom: `1px solid ${t.cardBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textSubtle }}>
          {label}
        </span>
        {active && onClear && (
          <button onClick={onClear}
            style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Clear
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Seg({ options, value, onChange, dk }: {
  options: { k: string; l: string; red?: boolean }[]
  value: string; onChange: (v: string) => void; dk: boolean
}) {
  const t = theme(dk)
  return (
    <div style={{
      display: 'flex', borderRadius: 10, overflow: 'hidden',
      border: `1.5px solid ${t.inputBorder}`,
      background: dk ? '#1E293B' : '#F8FAFC',
    }}>
      {options.map(({ k, l, red }, i) => {
        const on = value === k
        const ac = red && on ? '#DC2626' : BRAND.teal
        return (
          <button key={k}
            onClick={() => onChange(k)}
            style={{
              flex: 1, padding: '9px 6px', fontSize: 12, fontWeight: on ? 700 : 500,
              cursor: 'pointer', border: 'none',
              borderRight: i < options.length - 1 ? `1px solid ${t.inputBorder}` : 'none',
              background: on ? (red ? (dk ? '#2D0A0A' : '#FEF2F2') : (dk ? '#0D2E28' : '#F0FDFA')) : 'transparent',
              color: on ? ac : t.textMuted,
              transition: 'all 120ms',
            }}>
            {l}
          </button>
        )
      })}
    </div>
  )
}
