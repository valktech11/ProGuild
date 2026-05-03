'use client'

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Save, Phone, Mail, Link2, Check } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import EstimateItems from '@/components/estimate/EstimateItems'
import EstimateSummary from '@/components/estimate/EstimateSummary'
import PaymentPanel from '@/components/estimate/PaymentPanel'
import ApprovalTimeline from '@/components/estimate/ApprovalTimeline'
import SmartNudges from '@/components/estimate/SmartNudges'
import { Session } from '@/types'

export type EstimateItem = {
  id: string
  name: string
  description: string
  qty: number
  unit_price: number
  amount: number
}

export type Estimate = {
  id: string
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'paid'
  lead_name: string
  lead_source: string
  trade: string
  job_description: string
  created_at: string
  updated_at?: string
  valid_until: string
  subtotal: number
  discount: number
  tax_rate: number
  tax_amount: number
  total: number
  deposit_percent: number
  require_deposit: boolean
  terms: string
  items: EstimateItem[]
  notes?: string
  contact_phone?: string
  contact_email?: string
  timeline: { event: string; label: string; timestamp: string | null }[]
}

const STATUS_STYLES: Record<Estimate['status'], { bg: string; text: string; label: string }> = {
  draft:    { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Draft' },
  sent:     { bg: 'bg-blue-50',    text: 'text-blue-600',   label: 'Sent' },
  viewed:   { bg: 'bg-purple-50',  text: 'text-purple-600', label: 'Viewed' },
  approved: { bg: 'bg-teal-50',    text: 'text-teal-700',   label: 'Approved' },
  paid:     { bg: 'bg-green-50',   text: 'text-green-700',  label: 'Paid' },
}

export default function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  // Read session synchronously to avoid flicker
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })

  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'items' | 'notes'>('items')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showSaveTemplate,   setShowSaveTemplate]   = useState(false)
  const [templateName,       setTemplateName]       = useState('')
  const [savingTemplate,     setSavingTemplate]     = useState(false)
  const [templates,          setTemplates]          = useState<{ id: string; name: string; items: any[] }[]>([])
  const [loadingTemplates,   setLoadingTemplates]   = useState(false)
  const [editingTerms,       setEditingTerms]       = useState(false)
  const [termsValue,         setTermsValue]         = useState('')

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/estimates/${id}`)
      .then(r => r.json())
      .then(d => {
        setEstimate(d.estimate ?? MOCK_ESTIMATE)
        setLoading(false)
      })
      .catch(() => {
        // Fallback to mock while API not yet built
        setEstimate(MOCK_ESTIMATE)
        setLoading(false)
      })
  }, [id, session, router])

  const handleSave = async () => {
    if (!estimate) return
    // Don't save mock data
    if (estimate.id === 'mock-1') {
      setSaveMsg('Run v75-estimates-sql.sql on staging DB first')
      setTimeout(() => setSaveMsg(null), 5000)
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/estimates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estimate),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setSaveMsg(err.error || 'Save failed — check DB')
      } else {
        setSaveMsg('Saved ✓')
      }
    } catch {
      setSaveMsg('Network error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  // ── Template handlers ──────────────────────────────────────────────────────
  const openTemplatePicker = async () => {
    setShowTemplatePicker(true)
    setLoadingTemplates(true)
    try {
      const r = await fetch(`/api/estimate-templates?pro_id=${session!.id}`)
      const d = await r.json()
      setTemplates(d.templates || [])
    } catch { setTemplates([]) }
    finally { setLoadingTemplates(false) }
  }

  const applyTemplate = (tpl: { id: string; name: string; items: any[] }) => {
    if (!estimate) return
    const newItems = tpl.items.map((i: any) => ({
      ...i, id: crypto.randomUUID()
    }))
    const merged   = [...estimate.items, ...newItems]
    const subtotal = merged.reduce((s: number, i: any) => s + i.qty * i.unit_price, 0)
    const tax_amount = subtotal * (estimate.tax_rate / 100)
    setEstimate(prev => prev ? { ...prev, items: merged, subtotal, tax_amount, total: subtotal + tax_amount } : prev)
    setShowTemplatePicker(false)
  }

  const saveTemplate = async () => {
    if (!estimate || !templateName.trim()) return
    setSavingTemplate(true)
    try {
      await fetch('/api/estimate-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session!.id, name: templateName.trim(), items: estimate.items }),
      })
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch { /* silent */ }
    finally { setSavingTemplate(false) }
  }

  if (!session) return null

  const card = dk ? 'bg-[#1E293B] text-white border-[#334155]' : 'bg-white text-gray-900 border-[#E8E2D9]'
  const muted = dk ? 'text-slate-400' : 'text-[#6B7280]'

  return (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={toggleDark}
    >
      <div className={`min-h-screen pb-12 ${dk ? 'bg-[#0A1628]' : 'bg-[#F5F4F0]'}`}>
        <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-5">

          {/* ── Top action bar ── */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className={`flex items-center gap-1.5 text-sm font-medium ${muted} hover:text-[#0F766E] transition-colors`}
            >
              <ArrowLeft size={16} />
              Back to Estimates
            </button>

            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className={`text-sm font-medium ${saveMsg.includes('✓') ? 'text-teal-600' : 'text-red-500'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <EstimateSkeleton dk={dk} />
          ) : estimate ? (
            <>
              {/* ── Estimate header — matches reference exactly ── */}
              <div className={`rounded-xl border px-6 py-5 ${card}`}>
                {/* Single row: [name+meta left] [source columns center-right] [send button right] */}
                <div className="flex items-start gap-6">

                  {/* Col 1: name / trade / estimate# — grows */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className={`text-xl font-bold leading-tight ${dk ? 'text-white' : 'text-gray-900'}`}>
                        {estimate.lead_name}
                      </h1>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-100 shrink-0">
                        Lead
                      </span>
                    </div>
                    {estimate.trade && (
                      <p className={`text-sm mt-0.5 ${muted}`}>{estimate.trade}</p>
                    )}
                    <div className={`flex items-center gap-1.5 mt-0.5 text-xs ${muted}`}>
                      <span>Estimate #{estimate.estimate_number}</span>
                      <span>·</span>
                      <span className={`font-medium ${STATUS_STYLES[estimate.status].text}`}>{STATUS_STYLES[estimate.status].label}</span>
                      <span>·</span>
                      <span>Last edited {timeAgo(estimate.updated_at || estimate.created_at)}</span>
                    </div>
                  </div>

                  {/* Col 2: Lead Source | Created | Valid Until — pipe separated, fixed width */}
                  <div className="flex items-start shrink-0 gap-0 pt-0.5">
                    {[
                      { label: 'Lead Source', value: estimate.lead_source || '—', amber: false },
                      { label: 'Created',     value: new Date(estimate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), amber: false },
                      { label: 'Valid Until', value: new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), amber: true },
                    ].map(({ label, value, amber }, i) => (
                      <div key={label} className="flex items-stretch">
                        {i > 0 && <div className={`w-px mx-4 self-stretch ${dk ? 'bg-[#334155]' : 'bg-[#E2E8F0]'}`} />}
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-wider leading-none ${muted}`}>{label}</p>
                          <p className={`text-sm font-bold mt-1 ${amber ? 'text-amber-500' : (dk ? 'text-white' : 'text-gray-900')}`}>{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Col 3: Send button */}
                  <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                    <button
                      onClick={async () => { await handleSave(); setEstimate(prev => prev ? { ...prev, status: 'sent' } : prev) }}
                      disabled={saving}
                      className="flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap">
                      <Send size={14} />
                      Send Estimate
                    </button>
                    <p className={`text-[11px] text-right ${muted}`}>Client can approve &amp; pay instantly</p>
                  </div>
                </div>
              </div>

              {/* ── Smart nudge ── */}
              <SmartNudges darkMode={dk} />

              {/* ── Main 2-col layout ── */}
              <div className="flex gap-5 items-start">

                {/* Left — items + tabs */}
                <div className="flex-1 min-w-0 space-y-5">

                  {/* ── Tab strip — matches reference: tabs left, buttons right ── */}
                  <div className={`rounded-xl border ${card} overflow-hidden`}>
                    <div className={`flex items-center justify-between border-b ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
                      {/* Tabs */}
                      <div className="flex">
                        {(['items', 'notes'] as const).map(tab => (
                          <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3.5 text-sm font-medium transition-colors relative ${
                              activeTab === tab ? 'text-[#0F766E]' : `${muted} hover:text-[#0F766E]`}`}>
                            {tab === 'items' ? 'Estimate Items' : 'Notes & Attachments'}
                            {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0F766E]" />}
                          </button>
                        ))}
                      </div>
                      {/* Action buttons — right side of tab bar */}
                      {activeTab === 'items' && (
                        <div className="flex items-center gap-2 pr-4">
                          <button onClick={openTemplatePicker}
                            className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg border transition-colors ${
                              dk ? 'border-[#334155] text-slate-400 hover:border-[#0F766E] hover:text-[#0F766E]'
                                 : 'border-[#E8E2D9] text-[#6B7280] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                            Use Previous Job
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-6">
                      {activeTab === 'items' ? (
                        <EstimateItems
                          estimate={estimate}
                          setEstimate={setEstimate}
                          darkMode={dk}
                          onOpenTemplatePicker={openTemplatePicker}
                          onSaveTemplate={() => setShowSaveTemplate(true)}
                        />
                      ) : (
                        <NotesTab estimate={estimate} setEstimate={setEstimate} darkMode={dk} />
                      )}
                    </div>
                  </div>

                  {/* ── Save Changes bar ── */}
                  {activeTab === 'items' && (
                    <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${card}`}>
                      <div>
                        {saveMsg ? (
                          <span className={`text-sm font-medium ${saveMsg.includes('✓') || saveMsg === 'Saved ✓' ? 'text-teal-600' : 'text-red-500'}`}>
                            {saveMsg}
                          </span>
                        ) : (
                          <span className={`text-sm ${muted}`}>Changes are saved to draft — send when ready</span>
                        )}
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                          dk ? 'bg-[#1E293B] border border-[#334155] text-white hover:border-[#0F766E]'
                             : 'bg-white border border-[#E8E2D9] text-gray-800 hover:border-[#0F766E] hover:text-[#0F766E]'
                        }`}
                      >
                        <Save size={14} />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}

                  {/* ── Save as reusable job nudge ── */}
                  {activeTab === 'items' && (
                    <button onClick={() => setShowSaveTemplate(true)}
                      className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-colors text-left ${
                        dk ? 'border-[#334155] bg-[#1E293B] hover:border-[#0F766E]' : 'border-[#E8E2D9] bg-white hover:border-[#0F766E]'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${dk ? 'bg-[#0F172A]' : 'bg-[#f0f9ff]'}`}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                          </svg>
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Save this estimate as reusable job</p>
                          <p className={`text-xs mt-0.5 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>Use it again for similar jobs and save time.</p>
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${dk ? '#64748b' : '#9CA3AF'}" strokeWidth="2" className="shrink-0 ml-3">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  )}

                  {/* ── Terms & Conditions — editable ── */}
                  <div className={`rounded-xl border p-6 ${card}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`font-semibold text-sm ${dk ? 'text-white' : 'text-gray-900'}`}>Terms & Conditions</h3>
                      {!editingTerms && (
                        <button
                          onClick={() => { setTermsValue(estimate.terms); setEditingTerms(true) }}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            dk ? 'border-[#334155] text-slate-400 hover:border-[#0F766E] hover:text-[#0F766E]'
                               : 'border-[#D1D5DB] text-[#374151] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                      )}
                    </div>
                    {editingTerms ? (
                      <div className="space-y-3">
                        <textarea
                          value={termsValue}
                          onChange={e => setTermsValue(e.target.value)}
                          rows={4}
                          className={`w-full text-sm rounded-lg px-3 py-2.5 leading-relaxed resize-none ${
                            dk ? 'bg-[#0F172A] text-white' : 'bg-[#F9FAFB] text-gray-900'}`}
                          style={{ boxShadow: '0 0 0 1.5px #0F766E' }}
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingTerms(false)}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                              dk ? 'border-[#334155] text-slate-400' : 'border-[#E8E2D9] text-[#6B7280]'}`}>
                            Cancel
                          </button>
                          <button
                            onClick={() => { setEstimate(prev => prev ? { ...prev, terms: termsValue } : prev); setEditingTerms(false) }}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#0F766E] text-white hover:bg-[#0D6A62] transition-colors">
                            Save Terms
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-sm leading-relaxed ${muted}`}>{estimate.terms}</p>
                    )}
                  </div>

                  {/* ── Client Actions footer ── */}
                  <div className={`rounded-xl border p-4 ${card}`}>
                    <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>Client Actions</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/estimate/${id}`
                          navigator.clipboard.writeText(url)
                          setSaveMsg('Link copied ✓')
                        }}
                        className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-colors ${dk ? 'border-[#334155] text-slate-300 hover:border-[#0F766E] hover:text-[#0F766E]' : 'border-[#E8E2D9] text-[#374151] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
                        <Link2 size={14} /> View Estimate
                      </button>
                      <button
                        title="PDF generation coming in v76"
                        className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border opacity-40 cursor-not-allowed ${dk ? 'border-[#334155] text-slate-300' : 'border-[#E8E2D9] text-[#374151]'}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download PDF <span className="text-[10px] ml-1">v76</span>
                      </button>
                      <button
                        onClick={async () => {
                          if (!estimate) return
                          await fetch(`/api/estimates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...estimate, status: 'sent' }) })
                          setEstimate(prev => prev ? { ...prev, status: 'sent' } : prev)
                          setSaveMsg('Marked as sent ✓')
                        }}
                        className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-colors ${dk ? 'border-[#334155] text-slate-300 hover:border-[#0F766E] hover:text-[#0F766E]' : 'border-[#E8E2D9] text-[#374151] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
                        <Send size={14} /> Mark as Sent
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right sidebar */}
                <div className="w-[340px] shrink-0 space-y-5">
                  <EstimateSummary estimate={estimate} darkMode={dk} />
                  <PaymentPanel
                    estimate={estimate}
                    setEstimate={setEstimate}
                    darkMode={dk}
                    onAction={msg => { setSaveMsg(msg); setTimeout(() => setSaveMsg(null), 4000) }}
                  />
                  <ApprovalTimeline
                    timeline={estimate.timeline}
                    darkMode={dk}
                    estimateId={estimate.id}
                    contactPhone={estimate.contact_phone}
                    contactEmail={estimate.contact_email}
                    onAction={msg => { setSaveMsg(msg); setTimeout(() => setSaveMsg(null), 4000) }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className={`rounded-xl border p-12 text-center ${card} ${muted}`}>
              Estimate not found.
            </div>
          )}
        </div>
      </div>
    {/* ── Template picker modal ── */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowTemplatePicker(false)}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <h3 className={`font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Use Previous Job</h3>
              <button onClick={() => setShowTemplatePicker(false)} className={muted}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loadingTemplates ? (
                <div className={`p-8 text-center text-sm ${muted}`}>Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="p-8 text-center">
                  <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>No templates yet</p>
                  <p className={`text-xs mt-1 ${muted}`}>Build an estimate and click "Save as Template" to reuse it.</p>
                </div>
              ) : templates.map(tpl => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                  className={`w-full text-left px-5 py-3.5 border-b last:border-b-0 transition-colors ${dk ? 'border-[#334155] hover:bg-[#0F172A]' : 'border-[#E8E2D9] hover:bg-[#F9FAFB]'}`}>
                  <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>{tpl.name}</p>
                  <p className={`text-xs mt-0.5 ${muted}`}>{tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Save template modal ── */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowSaveTemplate(false)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <h3 className={`font-semibold mb-1 ${dk ? 'text-white' : 'text-gray-900'}`}>Save as Template</h3>
            <p className={`text-sm mb-4 ${muted}`}>Name this template so you can reuse it on future estimates.</p>
            <input autoFocus value={templateName} onChange={e => setTemplateName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setShowSaveTemplate(false) }}
              placeholder="e.g. Interior Paint 2BHK"
              className={`w-full text-sm px-3 py-2.5 rounded-lg mb-4 ${dk ? 'bg-[#0F172A] text-white' : 'bg-[#F5F4F0] text-gray-900'}`}
              style={{ boxShadow: '0 0 0 1.5px #0F766E' }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveTemplate(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm border ${dk ? 'border-[#334155] text-slate-400' : 'border-[#E8E2D9] text-gray-600'}`}>Cancel</button>
              <button onClick={saveTemplate} disabled={savingTemplate || !templateName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white hover:opacity-90 disabled:opacity-50">
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

// ── Notes & Attachments tab ────────────────────────────────────────────────
function NotesTab({ estimate, setEstimate, darkMode }: {
  estimate: Estimate
  setEstimate: React.Dispatch<React.SetStateAction<Estimate | null>>
  darkMode: boolean
}) {
  const dk = darkMode
  const [note, setNote] = React.useState(estimate.notes || '')
  const [saved, setSaved] = React.useState(false)

  const border  = dk ? '#334155' : '#E8E2D9'
  const bgCard  = dk ? '#1E293B' : '#ffffff'
  const col     = dk ? '#f1f5f9' : '#111827'
  const colMuted= dk ? '#94a3b8' : '#6B7280'

  const saveNote = async () => {
    setEstimate(prev => prev ? { ...prev, notes: note } : prev)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Internal notes */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#6B7280', marginBottom: 8, display: 'block' }}>
          Internal Notes
        </label>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setSaved(false) }}
          placeholder="Add notes visible only to you — job details, client preferences, reminders..."
          rows={5}
          style={{
            width: '100%', padding: '12px 14px', fontSize: 14, borderRadius: 10,
            border: `1.5px solid ${border}`, background: dk ? '#0f172a' : '#f9fafb',
            color: col, resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' as const,
          }}
          onFocus={e => (e.target.style.borderColor = '#0F766E')}
          onBlur={e => (e.target.style.borderColor = border)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 13, color: '#0F766E' }}>✓ Saved</span>}
          <button onClick={saveNote}
            style={{ padding: '7px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#0F766E', color: '#fff', cursor: 'pointer' }}>
            Save Note
          </button>
        </div>
      </div>

      {/* Attachments placeholder */}
      <div style={{ border: `1.5px dashed ${border}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center' as const }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: dk ? '#0f172a' : '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: col, marginBottom: 4 }}>File Attachments</p>
        <p style={{ fontSize: 13, color: colMuted, marginBottom: 12 }}>Attach photos, contracts, or reference documents to this estimate.</p>
        <button style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: `1.5px solid ${border}`, background: 'transparent', color: colMuted, cursor: 'not-allowed', opacity: 0.5 }}>
          Upload Files — coming in v76
        </button>
      </div>
    </div>
  )
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function EstimateSkeleton({ dk }: { dk: boolean }) {
  const shimmer = dk ? 'bg-[#1E293B] animate-pulse' : 'bg-gray-100 animate-pulse'
  return (
    <div className="space-y-5">
      <div className={`h-32 rounded-xl ${shimmer}`} />
      <div className="flex gap-5">
        <div className={`flex-1 h-96 rounded-xl ${shimmer}`} />
        <div className={`w-[340px] h-96 rounded-xl ${shimmer}`} />
      </div>
    </div>
  )
}

// ── Mock data — remove once API /api/estimates/[id] is built ──
const MOCK_ESTIMATE: Estimate = {
  id: 'mock-1',
  estimate_number: 'EST-1047',
  status: 'draft',
  lead_name: 'Surya Yadav',
  lead_source: 'Website',
  trade: 'Interior Painting • 2BHK',
  job_description: 'Full interior painting for 2BHK apartment',
  created_at: '2024-05-14T10:30:00Z',
  valid_until: '2024-05-28T10:30:00Z',
  subtotal: 1900,
  discount: 100,
  tax_rate: 7,
  tax_amount: 126,
  total: 1926,
  deposit_percent: 50,
  require_deposit: true,
  terms: 'This estimate is valid for 14 days. Payment is due upon job completion. A 50% deposit is required to begin work.',
  items: [
    { id: '1', name: 'Interior Wall Painting', description: 'Premium quality paint', qty: 1, unit_price: 1200, amount: 1200 },
    { id: '2', name: 'Ceiling Painting',       description: 'Flat white finish',      qty: 1, unit_price: 300,  amount: 300  },
    { id: '3', name: 'Surface Preparation',    description: 'Patch, sand & prime',    qty: 1, unit_price: 250,  amount: 250  },
    { id: '4', name: 'Protection & Cleanup',   description: 'Furniture covering & cleanup', qty: 1, unit_price: 150, amount: 150 },
  ],
  timeline: [
    { event: 'sent',     label: 'Sent to client',       timestamp: '2024-05-14T10:30:00Z' },
    { event: 'viewed',   label: 'Viewed by client (2 times)', timestamp: '2024-05-15T09:15:00Z' },
    { event: 'approved', label: 'Approved by client',   timestamp: null },
    { event: 'paid',     label: 'Payment received',     timestamp: null },
  ],
}
