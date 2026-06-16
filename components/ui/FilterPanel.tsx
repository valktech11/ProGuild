'use client'
import { useEffect, useRef, useState } from 'react'
import { getTerminalStages,  getStageAnchors, getActiveStages, getTradeConfig, isRoofing } from '@/lib/trades/_registry'
import { isStalled } from '@/lib/metrics/sla'
import { Lead } from '@/types'
import { theme, T } from '@/lib/tokens'

export interface FilterState {
  stages: string[]
  sources: string[]
  needsAttention: boolean
  minValue: string
  maxValue: string
  dateReceived: string   // '' | 'today' | 'week' | 'month'
  followUpDue: string    // '' | 'overdue' | 'today' | 'week'
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

  if (f.stages.length > 0) {
    result = result.filter(l => f.stages.some(s => s === l.lead_status))
  }

  if (f.sources.length > 0) {
    result = result.filter(l => f.sources.includes(l.lead_source))
  }

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
    const now      = new Date()
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

// ── Static fallbacks ────────────────────────────────────────────────────────
const SOURCES_FALLBACK = [
  { key: 'Referral',      label: 'Referral' },
  { key: 'Profile_Page',  label: 'Profile Page' },
  { key: 'Job_Post',      label: 'Job Post' },
  { key: 'Search_Result', label: 'Search Result' },
  { key: 'Direct',        label: 'Direct' },
  { key: 'Facebook',      label: 'Facebook' },
  { key: 'Instagram',     label: 'Instagram' },
  { key: 'Website',       label: 'Website' },
  { key: 'Phone_Call',    label: 'Phone Call' },
  { key: 'Yard_Sign',     label: 'Yard Sign' },
  { key: 'Walk_In',       label: 'Walk-In' },
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
  const panelRef = useRef<HTMLDivElement>(null)
  const [stageOpen,  setStageOpen]  = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const t = theme(dk)

  const plugin       = getTradeConfig(tradeSlug)
  const wonKey       = getStageAnchors(tradeSlug).won
  const wonStage     = { key: wonKey, label: plugin.labels.wonStage, color: '#4A7B4A', bg: '#F0FDF4' }
  const activeStages = getActiveStages(tradeSlug).filter(s => !s.terminal && s.key !== wonKey)
  const terminalStages = getTerminalStages(tradeSlug).filter(s => s.key !== wonKey)
  const stageOptions = [...activeStages, ...terminalStages, { ...wonStage, terminal: false }]
  const sourceOptions: { key: string; label: string }[] = (plugin as any).leadSources
    ? (plugin as any).leadSources.map((s: any) => ({ key: s.value ?? s.label as string, label: s.label as string }))
    : SOURCES_FALLBACK

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function toggleArr(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const TEAL    = '#0F766E'
  const border  = t.cardBorder
  const text    = t.textPri
  const muted   = t.textMuted
  const subtle  = t.textSubtle

  if (!open) return null

  const activeCount = [
    filters.stages.length > 0,
    filters.sources.length > 0,
    filters.needsAttention,
    filters.minValue !== '' || filters.maxValue !== '',
    filters.dateReceived !== '',
    filters.followUpDue !== '',
  ].filter(Boolean).length

  // summary label for a dropdown trigger
  function stageSummary() {
    if (filters.stages.length === 0) return 'All stages'
    if (filters.stages.length === 1) {
      return stageOptions.find(s => s.key === filters.stages[0])?.label ?? filters.stages[0]
    }
    return `${filters.stages.length} stages`
  }
  function sourceSummary() {
    if (filters.sources.length === 0) return 'All sources'
    if (filters.sources.length === 1) {
      return sourceOptions.find(s => s.key === filters.sources[0])?.label ?? filters.sources[0]
    }
    return `${filters.sources.length} sources`
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.30)' }} onClick={onClose}>
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full flex flex-col shadow-2xl"
        style={{ width: 360, maxWidth: '95vw', background: t.cardBg, borderLeft: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 16px', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: text }}>Filter Leads</span>
            {activeCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: TEAL, color: '#fff' }}>
                {activeCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeCount > 0 && (
              <button onClick={onClear} style={{ fontSize: 12, fontWeight: 600, color: TEAL, background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                Clear all
              </button>
            )}
            <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: muted }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 16px' }}>

          {/* ── Stage dropdown ── */}
          <FilterSection label="Stage" active={filters.stages.length > 0} onClear={() => onChange({ ...filters, stages: [] })}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setStageOpen(v => !v); setSourceOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: filters.stages.length > 0 ? '#F0FDFA' : (dk ? '#1E293B' : '#F8FAFC'),
                  border: `1.5px solid ${filters.stages.length > 0 ? TEAL : border}`,
                  color: filters.stages.length > 0 ? TEAL : muted,
                  fontSize: 13, fontWeight: 500,
                }}
              >
                <span style={{ fontWeight: filters.stages.length > 0 ? 600 : 400 }}>{stageSummary()}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: stageOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {stageOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 10,
                  background: t.cardBg, border: `1px solid ${border}`, borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
                }}>
                  {stageOptions.map((s, i) => {
                    const isActive = filters.stages.includes(s.key)
                    const color = (s as any).color || '#374151'
                    return (
                      <button
                        key={s.key}
                        onClick={() => onChange({ ...filters, stages: toggleArr(filters.stages, s.key) })}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', background: isActive ? (dk ? '#0F2922' : '#F0FDFA') : 'transparent',
                          border: 'none', borderBottom: i < stageOptions.length - 1 ? `1px solid ${border}` : 'none',
                          cursor: 'pointer', textAlign: 'left' as const,
                          transition: 'background 100ms',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color }} />
                        <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? TEAL : text, flex: 1 }}>
                          {s.label}
                        </span>
                        {isActive && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                  {filters.stages.length > 0 && (
                    <button
                      onClick={() => { onChange({ ...filters, stages: [] }); setStageOpen(false) }}
                      style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderTop: `1px solid ${border}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#EF4444', textAlign: 'left' as const }}
                    >
                      Clear stage filter
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Selected stage pills — compact summary below trigger */}
            {filters.stages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {filters.stages.map(key => {
                  const s = stageOptions.find(o => o.key === key)
                  const color = (s as any)?.color || '#374151'
                  return (
                    <span key={key} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 6px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: '#F0FDFA', color: TEAL, border: `1px solid #CCFBF1`,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      {s?.label ?? key}
                      <button onClick={() => onChange({ ...filters, stages: filters.stages.filter(x => x !== key) })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: TEAL, lineHeight: 1, fontSize: 13 }}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </FilterSection>

          <Divider />

          {/* ── Lead Source dropdown ── */}
          <FilterSection label="Lead Source" active={filters.sources.length > 0} onClear={() => onChange({ ...filters, sources: [] })}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setSourceOpen(v => !v); setStageOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: filters.sources.length > 0 ? '#F0FDFA' : (dk ? '#1E293B' : '#F8FAFC'),
                  border: `1.5px solid ${filters.sources.length > 0 ? TEAL : border}`,
                  color: filters.sources.length > 0 ? TEAL : muted,
                  fontSize: 13, fontWeight: 500,
                }}
              >
                <span style={{ fontWeight: filters.sources.length > 0 ? 600 : 400 }}>{sourceSummary()}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: sourceOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {sourceOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 10,
                  background: t.cardBg, border: `1px solid ${border}`, borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
                  maxHeight: 280, overflowY: 'auto',
                }}>
                  {sourceOptions.map((s, i) => {
                    const isActive = filters.sources.includes(s.key)
                    return (
                      <button
                        key={s.key}
                        onClick={() => onChange({ ...filters, sources: toggleArr(filters.sources, s.key) })}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', background: isActive ? (dk ? '#0F2922' : '#F0FDFA') : 'transparent',
                          border: 'none', borderBottom: i < sourceOptions.length - 1 ? `1px solid ${border}` : 'none',
                          cursor: 'pointer', textAlign: 'left' as const,
                          transition: 'background 100ms',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? TEAL : text, flex: 1 }}>
                          {s.label}
                        </span>
                        {isActive && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                  {filters.sources.length > 0 && (
                    <button
                      onClick={() => { onChange({ ...filters, sources: [] }); setSourceOpen(false) }}
                      style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderTop: `1px solid ${border}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#EF4444', textAlign: 'left' as const }}
                    >
                      Clear source filter
                    </button>
                  )}
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
                      padding: '3px 8px 3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: '#F0FDFA', color: TEAL, border: '1px solid #CCFBF1',
                    }}>
                      {s?.label ?? key}
                      <button onClick={() => onChange({ ...filters, sources: filters.sources.filter(x => x !== key) })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: TEAL, lineHeight: 1, fontSize: 13 }}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </FilterSection>

          <Divider />

          {/* ── Needs attention ── */}
          <FilterSection label="Status">
            <button
              onClick={() => onChange({ ...filters, needsAttention: !filters.needsAttention })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left' as const,
                background: filters.needsAttention ? '#FFFBEB' : (dk ? '#1E293B' : '#F8FAFC'),
                border: `1.5px solid ${filters.needsAttention ? '#D97706' : border}`,
                transition: 'all 120ms',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: filters.needsAttention ? '#92400E' : text }}>Needs attention</div>
                <div style={{ fontSize: 11, color: subtle, marginTop: 1 }}>Stalled past stage SLA</div>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                background: filters.needsAttention ? '#D97706' : (dk ? '#334155' : '#E2E8F0'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {filters.needsAttention && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
            </button>
          </FilterSection>

          <Divider />

          {/* ── Estimated Value ── */}
          <FilterSection label="Estimated Value" active={!!(filters.minValue || filters.maxValue)} onClear={() => onChange({ ...filters, minValue: '', maxValue: '' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: muted, pointerEvents: 'none' }}>$</span>
                <input type="number" placeholder="Min" value={filters.minValue}
                  onChange={e => onChange({ ...filters, minValue: e.target.value })}
                  style={{
                    width: '100%', paddingLeft: 26, paddingRight: 10, paddingTop: 10, paddingBottom: 10,
                    borderRadius: 10, fontSize: 13, fontWeight: 500,
                    background: dk ? '#1E293B' : '#F8FAFC',
                    border: `1.5px solid ${filters.minValue ? TEAL : border}`,
                    color: text, outline: 'none', boxSizing: 'border-box' as const,
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: muted, flexShrink: 0 }}>to</span>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: muted, pointerEvents: 'none' }}>$</span>
                <input type="number" placeholder="Max" value={filters.maxValue}
                  onChange={e => onChange({ ...filters, maxValue: e.target.value })}
                  style={{
                    width: '100%', paddingLeft: 26, paddingRight: 10, paddingTop: 10, paddingBottom: 10,
                    borderRadius: 10, fontSize: 13, fontWeight: 500,
                    background: dk ? '#1E293B' : '#F8FAFC',
                    border: `1.5px solid ${filters.maxValue ? TEAL : border}`,
                    color: text, outline: 'none', boxSizing: 'border-box' as const,
                  }}
                />
              </div>
            </div>
          </FilterSection>

          <Divider />

          {/* ── Date Received ── */}
          <FilterSection label="Date Received" active={!!filters.dateReceived} onClear={() => onChange({ ...filters, dateReceived: '' })}>
            <SegmentedControl
              options={[{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }]}
              value={filters.dateReceived}
              onChange={v => onChange({ ...filters, dateReceived: v === filters.dateReceived ? '' : v })}
              dk={dk} color={TEAL}
            />
          </FilterSection>

          <Divider />

          {/* ── Follow-up Due ── */}
          <FilterSection label="Follow-up Due" active={!!filters.followUpDue} onClear={() => onChange({ ...filters, followUpDue: '' })}>
            <SegmentedControl
              options={[{ key: 'overdue', label: 'Overdue', red: true }, { key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }]}
              value={filters.followUpDue}
              onChange={v => onChange({ ...filters, followUpDue: v === filters.followUpDue ? '' : v })}
              dk={dk} color={TEAL}
            />
          </FilterSection>

        </div>

        {/* ── Footer ── */}
        <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: `1px solid ${border}`, background: t.cardBg }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 700,
              background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff',
              border: 'none', cursor: 'pointer',
            }}
          >
            {activeCount > 0 ? `Show results · ${activeCount} filter${activeCount !== 1 ? 's' : ''} active` : 'Done'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FilterSection({ label, active, onClear, children }: {
  label: string; active?: boolean; onClear?: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6B7280' }}>
          {label}
        </span>
        {active && onClear && (
          <button onClick={onClear} style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Clear
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: '#F1F5F9', margin: '0 0 20px' }} />
}

function SegmentedControl({ options, value, onChange, dk, color }: {
  options: { key: string; label: string; red?: boolean }[]
  value: string
  onChange: (v: string) => void
  dk: boolean
  color: string
}) {
  const t = theme(dk)
  return (
    <div style={{ display: 'flex', background: dk ? '#1E293B' : '#F1F5F9', borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map(({ key, label, red }) => {
        const active = value === key
        const activeColor = red ? '#DC2626' : color
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 500,
              border: 'none', cursor: 'pointer', transition: 'all 120ms',
              background: active ? (dk ? '#1E3A35' : '#fff') : 'transparent',
              color: active ? activeColor : t.textMuted,
              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function countActiveFilters(f: FilterState): number {
  let n = 0
  if (f.stages.length > 0) n++
  if (f.sources.length > 0) n++
  if (f.needsAttention) n++
  if (f.minValue || f.maxValue) n++
  if (f.dateReceived) n++
  if (f.followUpDue) n++
  return n
}
