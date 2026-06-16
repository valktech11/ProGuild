'use client'
import { useEffect, useRef } from 'react'
import { getTerminalStages,  getStageAnchors, getActiveStages, getTradeConfig, isRoofing } from '@/lib/trades/_registry'
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
    result = result.filter(l => {
      // Time in current stage (not total lead age) — uses lead_status_changed_at
      const since = l.lead_status_changed_at ?? l.created_at
      const days  = (Date.now() - new Date(since).getTime()) / 86400000
      return days > 3 && l.lead_status !== anchors.won
    })
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

const STAGES = ['New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Job Won']
const STAGE_COLORS: Record<string, string> = {
  New: '#D97706', Contacted: '#2563EB', Quoted: '#7C3AED',
  Scheduled: '#0F766E', Completed: '#374151', 'Job Won': '#4A7B4A',
}
const STAGE_BGS: Record<string, string> = {
  New: '#FFFBEB', Contacted: '#EFF6FF', Quoted: '#F5F3FF',
  Scheduled: '#F0FDFA', Completed: '#F9FAFB', 'Job Won': '#F0FDF4',
}

const SOURCES = [
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
  const t = theme(dk)

  // Derive stages and sources from trade plugin — no hardcoded values
  const plugin        = getTradeConfig(tradeSlug)
  const wonKey        = getStageAnchors(tradeSlug).won
  const wonStage      = { key: wonKey, label: plugin.labels.wonStage, color: '#4A7B4A', bg: '#F0FDF4' }
  const activeStages  = getActiveStages(tradeSlug).filter(s => !s.terminal && s.key !== wonKey)
  const terminalStages = getTerminalStages(tradeSlug).filter(s => s.key !== wonKey)
  // Order: open stages → terminal (Lost/Unqualified) → Job Won at end
  const stageOptions  = [...activeStages, ...terminalStages, { ...wonStage, terminal: false }]
  const sourceOptions: { key: string; label: string }[] = (plugin as any).leadSources
    ? (plugin as any).leadSources.map((s: any) => ({ key: s.value ?? s.label as string, label: s.label as string }))
    : SOURCES  // fallback for trades without leadSources

  // Close on Escape only — no document mousedown listener (caused close-on-pill-click bug)
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function toggleArr(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const card    = t.cardBg
  const bg      = t.cardBgAlt
  const border  = t.cardBorder
  const text    = t.textPri
  const muted   = t.textMuted
  const inputBg = t.inputBg

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full flex flex-col shadow-2xl overflow-hidden"
        style={{
          width: '360px',
          maxWidth: '95vw',
          background: card,
          borderLeft: `1px solid ${border}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            <span className="text-[15px] font-bold" style={{ color: text }}>Filter Leads</span>
          </div>
          <div className="flex items-center gap-2">
            {isFilterActive(filters) && (
              <button
                onClick={onClear}
                className="text-[14px] font-semibold px-3 py-1 rounded-lg"
                style={{ color: '#0F766E', background: '#F0FDFA' }}
              >
                Clear all
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors" style={{ color: muted }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-6">

          {/* Stage */}
          <Section label="Stage" color={text}>
            <div className="flex flex-wrap gap-2">
              {stageOptions.map(s => {
                const active = filters.stages.some(f => f === s.key)
                const color  = s.color || '#374151'
                const bg     = (s as any).bg || (s as any).lightBg || '#F9FAFB'
                return (
                  <button
                    key={s.key}
                    onClick={() => onChange({ ...filters, stages: toggleArr(filters.stages, s.key) })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                    style={{
                      background: active ? bg : (dk ? '#1E293B' : '#F3F4F6'),
                      color: active ? color : muted,
                      border: active ? `1.5px solid ${color}` : `1.5px solid ${t.cardBorder}`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: active ? color : (color + '80') }}
                    />
                    {s.label}
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Lead Source */}
          <Section label="Lead Source" color={text}>
            <div className="grid grid-cols-3 gap-2">
              {sourceOptions.map(({ key, label }) => {
                const active = filters.sources.some(f => f === key)
                return (
                  <button
                    key={key}
                    onClick={() => onChange({ ...filters, sources: toggleArr(filters.sources, key) })}
                    className="px-2 py-1.5 rounded-full text-[12px] font-semibold transition-all text-center truncate"
                    style={{
                      background: active ? '#F0FDFA' : (dk ? '#1E293B' : '#F3F4F6'),
                      color: active ? '#0F766E' : muted,
                      border: active ? '1.5px solid #0F766E' : `1.5px solid ${t.cardBorder}`,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Needs Attention */}
          <Section label="Status" color={text}>
            <button
              onClick={() => onChange({ ...filters, needsAttention: !filters.needsAttention })}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[13px] font-semibold text-left transition-all"
              style={{
                background: filters.needsAttention ? '#FFF7ED' : (dk ? '#1E293B' : '#F9FAFB'),
                border: filters.needsAttention ? '1.5px solid #F59E0B' : `1.5px solid ${t.cardBorder}`,
                color: filters.needsAttention ? '#B45309' : muted,
              }}
            >
              <span className="text-base">🔥</span>
              <span>Needs attention</span>
              <span className="ml-auto text-[12px] font-normal" style={{ color: t.textSubtle }}>
                {plugin.labels.pipeline} stage &gt; 3 days
              </span>
              {filters.needsAttention && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          </Section>

          {/* Estimated Value */}
          <Section label="Estimated Value" color={text}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: muted }}>$</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minValue}
                  onChange={e => onChange({ ...filters, minValue: e.target.value })}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl text-[13px] font-medium"
                  style={{
                    background: inputBg,
                    border: `1.5px solid ${filters.minValue ? '#0F766E' : (t.cardBorder)}`,
                    color: text,
                    outline: 'none',
                  }}
                />
              </div>
              <span className="text-[14px]" style={{ color: muted }}>to</span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: muted }}>$</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxValue}
                  onChange={e => onChange({ ...filters, maxValue: e.target.value })}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl text-[13px] font-medium"
                  style={{
                    background: inputBg,
                    border: `1.5px solid ${filters.maxValue ? '#0F766E' : (t.cardBorder)}`,
                    color: text,
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </Section>

          {/* Date Received */}
          <Section label="Date Received" color={text}>
            <PillGroup
              options={[
                { key: 'today', label: 'Today' },
                { key: 'week',  label: 'This week' },
                { key: 'month', label: 'This month' },
              ]}
              value={filters.dateReceived}
              onChange={v => onChange({ ...filters, dateReceived: v === filters.dateReceived ? '' : v })}
              dk={dk}
            />
          </Section>

          {/* Follow-up Due */}
          <Section label="Follow-up Due" color={text}>
            <PillGroup
              options={[
                { key: 'overdue', label: 'Overdue' },
                { key: 'today',   label: 'Today' },
                { key: 'week',    label: 'This week' },
              ]}
              value={filters.followUpDue}
              onChange={v => onChange({ ...filters, followUpDue: v === filters.followUpDue ? '' : v })}
              dk={dk}
              overdueRed
            />
          </Section>

        </div>

        {/* Footer — sticky, always visible */}
        <div className="flex-shrink-0 px-5 py-3" style={{ borderTop: `1px solid ${border}`, background: card }}>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-[14px] font-bold transition-all hover:opacity-90 active:scale-[.98]"
            style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[14px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#6B7280' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function PillGroup({ options, value, onChange, dk, overdueRed }: {
  options: { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
  dk: boolean
  overdueRed?: boolean
}) {
  const t = theme(dk)
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(({ key, label }) => {
        const active = value === key
        const isRed = overdueRed && key === 'overdue'
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style={{
              background: active ? (isRed ? '#FEF2F2' : '#F0FDFA') : (dk ? '#1E293B' : '#F3F4F6'),
              color: active ? (isRed ? '#B91C1C' : '#0F766E') : '#9CA3AF',
              border: active
                ? `1.5px solid ${isRed ? '#FCA5A5' : '#0F766E'}`
                : `1.5px solid ${t.cardBorder}`,
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
