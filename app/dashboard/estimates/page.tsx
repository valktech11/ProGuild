'use client'
import { capName, avatarColor } from '@/lib/utils'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, FileText, Search, Trash2, X, Phone, MapPin, User, ArrowRight, ChevronLeft } from 'lucide-react'
import { Session } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'
import { estimateStatusStyle, stageStyle } from '@/lib/design'
import { theme, T } from '@/lib/tokens'
import { getTradeConfig } from '@/lib/trades/_registry'

// Separated out because useSearchParams() requires Suspense boundary in App Router
function VoidedToast({ onToast }: { onToast: (msg: string) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const voided = searchParams.get('voided')
    if (voided) {
      onToast(`${voided} has been voided`)
      window.history.replaceState({}, '', '/dashboard/estimates')
    }
  }, [searchParams, onToast])
  return null
}

type EstimateSummary = {
  id: string
  lead_id: string | null
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'invoiced' | 'paid' | 'void'
  lead_name: string
  trade: string
  total: number
  created_at: string
  valid_until: string
}

// ── New Estimate Modal (Option C) ─────────────────────────────────────────────
// Step 1: Search existing leads or click "Add new lead"
// Step 2: Inline 3-field form to create a lead, then open estimate builder
type NewEstimateModalProps = {
  open: boolean
  dk: boolean
  session: Session
  noun: string
  onClose: () => void
  onLeadSelected: (lead: any) => void   // existing lead chosen
  onNewLeadCreated: (lead: any) => void // new lead created inline
}


function NewEstimateModal({ open, dk, session, noun, onClose, onLeadSelected, onNewLeadCreated }: NewEstimateModalProps) {
  const [step, setStep]                   = useState<'search' | 'new-lead'>('search')
  const [query, setQuery]                 = useState('')
  const [leads, setLeads]                 = useState<any[]>([])
  const [loadingLeads, setLoadingLeads]   = useState(false)

  // New lead fields
  const [newName,    setNewName]    = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newCity,    setNewCity]    = useState('')
  const [newState,   setNewState]   = useState('')
  const [newZip,     setNewZip]     = useState('')
  const [newPhone,   setNewPhone]   = useState('')
  const [newEmail,   setNewEmail]   = useState('')

  // Autocomplete state
  const [addrPredictions, setAddrPredictions] = useState<{description:string;place_id:string}[]>([])
  const [addrLoading,     setAddrLoading]     = useState(false)
  const [showPred,        setShowPred]        = useState(false)
  const addrDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addrWrapRef  = useRef<HTMLDivElement>(null)

  const [errors,   setErrors]   = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [successName, setSuccessName] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const t = theme(dk)

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep('search'); setQuery(''); setErrors({})
      setCreating(false); setSuccess(false)
      setNewName(''); setNewAddress(''); setNewCity(''); setNewState(''); setNewZip('')
      setNewPhone(''); setNewEmail('')
      setAddrPredictions([]); setShowPred(false)
      setLoadingLeads(true)
      fetch(`/api/leads?pro_id=${session.id}`)
        .then(r => r.json())
        .then(d => setLeads(d.leads || []))
        .catch(() => setLeads([]))
        .finally(() => setLoadingLeads(false))
    }
  }, [open, session.id])

  // ── Auto-focus search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open && step === 'search') setTimeout(() => searchRef.current?.focus(), 80)
  }, [open, step])

  // ── Close predictions on outside click ────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!addrWrapRef.current?.contains(e.target as Node)) setShowPred(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Address autocomplete (debounced, server-side API) ─────────────────────
  function handleAddressInput(val: string) {
    setNewAddress(val)
    setNewCity(''); setNewState(''); setNewZip('')
    setErrors(er => ({ ...er, address: '' }))
    if (addrDebounce.current) clearTimeout(addrDebounce.current)
    if (val.length < 3) { setAddrPredictions([]); setShowPred(false); return }
    addrDebounce.current = setTimeout(async () => {
      setAddrLoading(true)
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(val)}`)
        const data = res.ok ? await res.json() : {}
        setAddrPredictions(data.predictions || [])
        setShowPred((data.predictions || []).length > 0)
      } catch { setAddrPredictions([]) }
      finally { setAddrLoading(false) }
    }, 280)
  }

  async function selectPrediction(pred: {description:string; place_id:string}) {
    setShowPred(false)
    setNewAddress(pred.description.split(',')[0].trim())
    setAddrLoading(true)
    try {
      const res  = await fetch(`/api/places/details?place_id=${pred.place_id}`)
      const data = res.ok ? await res.json() : {}
      const comps: any[] = data.result?.address_components || []
      let streetNum='', route='', city='', state='', zip=''
      for (const c of comps) {
        const types: string[] = c.types || []
        if (types.includes('street_number'))                streetNum = c.long_name
        if (types.includes('route'))                        route     = c.long_name
        if (types.includes('locality'))                     city      = c.long_name
        if (!city && types.includes('sublocality_level_1')) city      = c.long_name
        if (types.includes('administrative_area_level_1'))  state     = c.short_name
        if (types.includes('postal_code'))                  zip       = c.long_name
      }
      const street = `${streetNum} ${route}`.trim() || pred.description.split(',')[0].trim()
      setNewAddress(street)
      setNewCity(city)
      setNewState(state)
      setNewZip(zip)
    } catch { /* keep typed value */ }
    finally { setAddrLoading(false) }
  }

  // ── Lead selection ─────────────────────────────────────────────────────────
  function handleSelectLead(lead: any) {
    setSuccessName(lead.contact_name)
    setSuccess(true)
    setTimeout(() => { onLeadSelected(lead); setSuccess(false) }, 800)
  }

  // ── New lead submit ────────────────────────────────────────────────────────
  async function handleCreateAndContinue() {
    const errs: Record<string, string> = {}
    if (!newName.trim())    errs.name    = 'Name is required'
    if (!newAddress.trim()) errs.address = 'Address is required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setCreating(true)
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:           session.id,
          contact_name:     newName.trim(),
          property_address: newAddress.trim(),
          contact_city:     newCity.trim()  || null,
          contact_state:    newState.trim() || null,
          contact_zip:      newZip.trim()   || null,
          contact_phone:    newPhone.trim() || null,
          contact_email:    newEmail.trim() || null,
          message:          'Lead created from estimate builder',
          is_manual:        true,
          lead_source:      'Manual_Entry',
        }),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        setErrors({ submit: e.error || 'Failed to create lead' })
        setCreating(false); return
      }
      const d = await r.json()
      setSuccessName(newName.trim())
      setSuccess(true)
      setTimeout(() => { onNewLeadCreated(d.lead); setSuccess(false) }, 900)
    } catch (err: any) {
      setErrors({ submit: err.message || 'Network error' })
      setCreating(false)
    }
  }

  if (!open) return null

  const filtered = leads.filter(l => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      (l.contact_name     || '').toLowerCase().includes(q) ||
      (l.property_address || '').toLowerCase().includes(q) ||
      (l.contact_city     || '').toLowerCase().includes(q)
    )
  }).slice(0, 20)

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle = (hasError?: boolean): React.CSSProperties => ({
    width: '100%', padding: '10px 12px',
    border: `1.5px solid ${hasError ? '#EF4444' : t.inputBorder}`,
    borderRadius: 8, background: t.inputBg,
    color: t.textPri, fontSize: 14, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  })
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: t.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5,
  }
  const focusIn  = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#0F766E'
    e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(15,118,110,0.12)'
  }
  const focusOut = (e: React.FocusEvent<HTMLInputElement>, hasError?: boolean) => {
    e.currentTarget.style.borderColor = hasError ? '#EF4444' : t.inputBorder
    e.currentTarget.style.boxShadow   = 'none'
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !creating) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,22,40,0.52)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: 18,
        width: '100%', maxWidth: 520,
        boxShadow: '0 32px 80px rgba(10,22,40,0.28), 0 2px 8px rgba(10,22,40,0.08)',
        overflow: 'hidden', position: 'relative',
      }}>

        {/* ── Success overlay ── */}
        {success && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: t.cardBg, borderRadius: 18,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0F766E, #14B8A6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              boxShadow: '0 8px 24px rgba(15,118,110,0.35)',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M4 12L9 17L20 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: t.textPri, marginBottom: 4 }}>Opening estimate builder</p>
            <p style={{ fontSize: 13, color: t.textMuted }}>For {capName(successName)}</p>
          </div>
        )}

        {/* ── Creating spinner ── */}
        {creating && !success && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, borderRadius: 18,
            background: dk ? 'rgba(17,24,39,0.88)' : 'rgba(255,255,255,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              border: `3px solid ${dk ? '#334155' : '#E8E2D9'}`,
              borderTopColor: '#0F766E',
              animation: 'pg-spin 0.7s linear infinite',
            }} />
            <p style={{ fontSize: 13, color: t.textMuted, marginTop: 14 }}>
              Creating lead &amp; opening estimate…
            </p>
          </div>
        )}

        {/* ── Teal header band ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
          padding: '20px 24px 18px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            {step === 'new-lead' && (
              <button
                onClick={() => { setStep('search'); setErrors({}) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 12, color: 'rgba(255,255,255,0.75)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 0 8px', fontWeight: 500,
                }}
              >
                <ChevronLeft size={13} /> Back to search
              </button>
            )}
            <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
              {step === 'search' ? `New ${noun}` : 'Add new lead'}
            </p>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 3, marginBottom: 0 }}>
              {step === 'search'
                ? `Select a lead or add a new one to get started`
                : `Create a lead and jump straight to the ${noun.toLowerCase()}`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', backdropFilter: 'blur(4px)',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Step 1: Search leads ── */}
        {step === 'search' && (
          <div style={{ padding: '16px 24px 24px' }}>
            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={15} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: t.textMuted, pointerEvents: 'none',
              }} />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, address, or city…"
                style={{ ...inputStyle(), paddingLeft: 36 }}
                onFocus={focusIn} onBlur={focusOut}
              />
            </div>

            {/* Lead results */}
            <div style={{
              maxHeight: 272, overflowY: 'auto',
              border: `1px solid ${t.cardBorder}`, borderRadius: 10, marginBottom: 14,
            }}>
              {loadingLeads ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
                  Loading leads…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
                  {query ? `No leads match "${query}"` : 'No leads yet'}
                </div>
              ) : (
                filtered.map((lead, i) => {
                  const [bg, fg] = avatarColor(lead.contact_name || '')
                  const ss = stageStyle(lead.lead_status, dk, session.trade_slug ?? undefined)
                  return (
                    <button
                      key={lead.id}
                      onClick={() => handleSelectLead(lead)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', border: 'none',
                        borderBottom: i < filtered.length - 1 ? `1px solid ${t.cardBorder}` : 'none',
                        background: 'transparent', cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: bg, color: fg,
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {(lead.contact_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: t.textPri, margin: 0 }}>
                          {capName(lead.contact_name)}
                        </p>
                        {(lead.property_address || lead.contact_city) && (
                          <p style={{ fontSize: 12, color: t.textMuted, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={11} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[lead.property_address, lead.contact_city].filter(Boolean).join(', ')}
                            </span>
                          </p>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 100,
                        background: ss.bg, color: ss.color, whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {ss.label}
                      </span>
                      <ArrowRight size={13} style={{ color: t.textMuted, flexShrink: 0 }} />
                    </button>
                  )
                })
              )}
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: t.cardBorder }} />
              <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, letterSpacing: '0.05em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: t.cardBorder }} />
            </div>

            {/* Add new lead CTA */}
            <button
              onClick={() => setStep('new-lead')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 16px', border: `1.5px dashed ${t.inputBorder}`,
                borderRadius: 10, background: 'transparent',
                color: t.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#0F766E'
                e.currentTarget.style.color = '#0F766E'
                e.currentTarget.style.background = dk ? 'rgba(15,118,110,0.08)' : '#F0FDFA'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = t.inputBorder
                e.currentTarget.style.color = t.textMuted
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Plus size={14} /> Add new lead &amp; create estimate
            </button>
          </div>
        )}

        {/* ── Step 2: New lead form ── */}
        {step === 'new-lead' && (
          <div style={{ padding: '20px 24px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Name */}
              <div>
                <label style={labelStyle}>
                  <User size={11} /> Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setErrors(er => ({ ...er, name: '' })) }}
                  placeholder="Homeowner full name"
                  style={inputStyle(!!errors.name)}
                  onFocus={focusIn}
                  onBlur={e => focusOut(e, !!errors.name)}
                />
                {errors.name && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 4, marginBottom: 0 }}>{errors.name}</p>}
              </div>

              {/* Address with autocomplete */}
              <div>
                <label style={labelStyle}>
                  <MapPin size={11} /> Property address <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div ref={addrWrapRef} style={{ position: 'relative' }}>
                  <input
                    value={newAddress}
                    onChange={e => handleAddressInput(e.target.value)}
                    onFocus={e => { focusIn(e); if (addrPredictions.length > 0) setShowPred(true) }}
                    onBlur={e => focusOut(e, !!errors.address)}
                    placeholder="Start typing to search address…"
                    style={{ ...inputStyle(!!errors.address), paddingRight: addrLoading ? 36 : 12 }}
                    autoComplete="off"
                  />
                  {addrLoading && (
                    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: `2px solid ${t.cardBorder}`, borderTopColor: '#0F766E',
                        animation: 'pg-spin 0.7s linear infinite',
                      }} />
                    </div>
                  )}
                  {/* Autocomplete dropdown */}
                  {showPred && addrPredictions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                      background: t.cardBg, border: `1.5px solid #0F766E`,
                      borderRadius: 10, marginTop: 4,
                      boxShadow: '0 8px 24px rgba(10,22,40,0.15)',
                      overflow: 'hidden',
                    }}>
                      {addrPredictions.map((pred, i) => (
                        <button
                          key={pred.place_id}
                          onMouseDown={e => { e.preventDefault(); selectPrediction(pred) }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '10px 14px', border: 'none',
                            borderBottom: i < addrPredictions.length - 1 ? `1px solid ${t.cardBorder}` : 'none',
                            background: 'transparent', cursor: 'pointer', textAlign: 'left',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <MapPin size={13} style={{ color: '#0F766E', flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 13, color: t.textPri, lineHeight: 1.4 }}>{pred.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {errors.address && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 4, marginBottom: 0 }}>{errors.address}</p>}
              </div>

              {/* City / State / Zip row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 10 }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    placeholder="Tampa"
                    style={inputStyle()}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input
                    value={newState}
                    onChange={e => setNewState(e.target.value)}
                    placeholder="FL"
                    maxLength={2}
                    style={inputStyle()}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>
                <div>
                  <label style={labelStyle}>ZIP</label>
                  <input
                    value={newZip}
                    onChange={e => setNewZip(e.target.value)}
                    placeholder="33601"
                    maxLength={10}
                    style={inputStyle()}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>
              </div>

              {/* Phone + Email row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>
                    <Phone size={11} /> Phone
                  </label>
                  <input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="(813) 555-0100"
                    style={inputStyle()}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
                      <path d="M1 4.5L7 8.5L13 4.5" stroke="currentColor" strokeWidth="1.25"/>
                    </svg>
                    Email
                  </label>
                  <input
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="homeowner@email.com"
                    type="email"
                    style={inputStyle()}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                </div>
              </div>

              {/* Info note */}
              <div style={{
                background: dk ? 'rgba(15,118,110,0.1)' : '#F0FDFA',
                border: `1px solid ${dk ? 'rgba(15,118,110,0.25)' : '#CCFBF1'}`,
                borderRadius: 8, padding: '10px 12px',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" stroke="#0F766E" strokeWidth="1.25"/>
                  <path d="M7 6.5V10M7 4.5V5" stroke="#0F766E" strokeWidth="1.25" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 12, color: '#0F766E', lineHeight: 1.5 }}>
                  Lead created at <strong>Lead In</strong> stage. Property auto-linked from address. Add job details from the lead page later.
                </span>
              </div>

              {/* Submit error */}
              {errors.submit && (
                <p style={{ fontSize: 12, color: '#EF4444', margin: 0, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>
                  {errors.submit}
                </p>
              )}

              {/* CTA button */}
              <button
                onClick={handleCreateAndContinue}
                disabled={creating}
                style={{
                  width: '100%', padding: '12px 16px',
                  background: 'linear-gradient(135deg, #0F766E, #0D9488)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 14, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: creating ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(15,118,110,0.35)',
                  letterSpacing: '-0.01em',
                }}
                onMouseEnter={e => { if (!creating) e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,118,110,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,118,110,0.35)' }}
              >
                Create lead &amp; open estimate builder
                <ArrowRight size={15} />
              </button>

            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes pg-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default function EstimatesPage() {
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })

  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const tc   = getTradeConfig(session?.trade_slug)
  const noun = tc.labels.estimate ?? 'Proposals'

  const [estimates,    setEstimates]    = useState<EstimateSummary[]>([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [search,       setSearch]       = useState('')

  // Option C modal state
  const [showNewEstimateModal, setShowNewEstimateModal] = useState(false)

  // E1: column header sort
  const [sortCol, setSortCol] = useState<'date' | 'total' | 'name' | 'status'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'name' || col === 'status' ? 'asc' : 'desc') }
  }
  // E2: status filter
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // E3: show archived (void/declined)
  const [showArchived, setShowArchived] = useState(false)

  const [voidedToast, setVoidedToast] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Existing estimate conflict modal
  const [existingEst, setExistingEst] = useState<{ id: string; estimate_number: string; total: number; lead_name: string } | null>(null)
  const [pendingLead,  setPendingLead]  = useState<any>(null)
  const [createError,  setCreateError]  = useState<string | null>(null)

  useEffect(() => {
    if (voidedToast) {
      const timer = setTimeout(() => setVoidedToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [voidedToast])

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/estimates?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => setEstimates(d.estimates || []))
      .catch(() => setEstimates([]))
      .finally(() => setLoading(false))
  }, [session, router])

  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  // Called when user selects an existing lead from Option C modal
  const handleLeadSelected = async (lead: any) => {
    if (!session || creating) return
    setShowNewEstimateModal(false)
    setCreating(true)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          state:         session.state || '',
          lead_id:       lead.id,
          lead_name:     lead.contact_name || 'New Client',
          lead_source:   lead.lead_source || '',
          trade:         session.trade || '',
          trade_slug:    session.trade_slug || '',
          contact_phone: lead.contact_phone || '',
          contact_email: lead.contact_email || '',
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create estimate')
        setCreating(false)
        return
      }
      const d = await r.json()
      if (d.existed) {
        setExistingEst({ ...d.estimate, lead_name: lead.contact_name || 'this lead' })
        setPendingLead(lead)
        setCreating(false)
      } else if (d.estimate?.id) {
        router.push(`/dashboard/estimates/${d.estimate.id}`)
      } else {
        setCreating(false)
      }
    } catch (err: any) {
      setCreateError(err.message || 'Network error')
      setCreating(false)
    }
  }

  // Called when user created a new lead inline in Option C modal
  const handleNewLeadCreated = async (lead: any) => {
    if (!session) return
    setShowNewEstimateModal(false)
    setCreating(true)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          state:         session.state || '',
          lead_id:       lead?.id || null,
          lead_name:     lead?.contact_name || 'New Client',
          lead_source:   lead?.lead_source || 'Manual_Entry',
          trade:         session.trade || '',
          trade_slug:    session.trade_slug || '',
          contact_phone: lead?.contact_phone || '',
          contact_email: lead?.contact_email || '',
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create estimate')
        setCreating(false)
        return
      }
      const d = await r.json()
      if (d.estimate?.id) {
        router.push(`/dashboard/estimates/${d.estimate.id}`)
      } else {
        setCreating(false)
      }
    } catch (err: any) {
      setCreateError(err.message || 'Network error')
      setCreating(false)
    }
  }

  const createFresh = async () => {
    if (!session || creating) return
    setCreating(true)
    setExistingEst(null)
    try {
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          state:         session.state || '',
          lead_id:       pendingLead?.id || null,
          lead_name:     pendingLead?.contact_name || 'New Client',
          lead_source:   pendingLead?.lead_source || '',
          trade:         session.trade || '',
          trade_slug:    session.trade_slug || '',
          contact_phone: pendingLead?.contact_phone || '',
          contact_email: pendingLead?.contact_email || '',
          force_new:     true,
        }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}`)
      else setCreating(false)
    } catch { setCreating(false) }
  }

  const deleteEstimate = (e: React.MouseEvent, estId: string) => {
    e.stopPropagation()
    setConfirmDelete(estId)
  }

  const doDelete = async (estId: string) => {
    try {
      await fetch(`/api/estimates/${estId}`, { method: 'DELETE' })
      setEstimates(prev => prev.filter(est => est.id !== estId))
    } catch { /* silent */ }
    setConfirmDelete(null)
  }

  if (!session) return null

  const t     = theme(dk)
  const muted = dk ? 'text-slate-400' : 'text-[#6B7280]'

  // Filter + sort
  const archivedStatuses = ['void', 'declined']
  const filtered = estimates
    .filter(e => {
      if (!showArchived && archivedStatuses.includes(e.status)) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      return e.lead_name.toLowerCase().includes(search.toLowerCase()) ||
             e.estimate_number.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortCol === 'date')   return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      if (sortCol === 'total')  return dir * (a.total - b.total)
      if (sortCol === 'name')   return dir * a.lead_name.localeCompare(b.lead_name)
      if (sortCol === 'status') {
        const order = ['draft','sent','viewed','approved','invoiced','paid','declined','void']
        return dir * (order.indexOf(a.status) - order.indexOf(b.status))
      }
      return 0
    })

  const archivedCount = estimates.filter(e => archivedStatuses.includes(e.status)).length

  // Stats
  const STATUS_PRIORITY: Record<string, number> = { invoiced: 1, approved: 2, viewed: 3, sent: 4 }
  const activeStatuses = ['sent', 'viewed', 'approved', 'invoiced']
  const bestPerLead = Object.values(
    estimates
      .filter(e => activeStatuses.includes(e.status))
      .reduce((acc, e) => {
        const key = e.lead_id || e.id
        const existing = acc[key]
        if (!existing || (STATUS_PRIORITY[e.status] || 99) < (STATUS_PRIORITY[existing.status] || 99)) {
          acc[key] = e
        }
        return acc
      }, {} as Record<string, typeof estimates[0]>)
  )
  const totalValue    = (bestPerLead as typeof estimates).reduce((s, e) => s + e.total, 0)
  const sentCount     = estimates.filter(e => e.status === 'sent' || e.status === 'viewed').length

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })

  return (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={toggleDark}
    >
      <div className="min-h-screen pb-12">
        <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">

          <Suspense fallback={null}>
            <VoidedToast onToast={msg => setVoidedToast(msg)} />
          </Suspense>

          {/* Voided toast */}
          {voidedToast && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: dk ? 'rgba(100,116,139,0.15)' : '#F1F5F9', border: '1px solid #CBD5E1' }}>
              <span style={{ fontSize: 14 }}>🗂</span>
              <span style={{ fontSize: 13, color: dk ? '#94A3B8' : '#475569' }}>{voidedToast}</span>
              <button onClick={() => setVoidedToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: dk ? '#64748B' : '#94A3B8', fontSize: 16 }}>×</button>
            </div>
          )}

          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{noun}</h1>
              <p className={`text-sm mt-0.5 hidden md:block ${muted}`}>Create and send professional {noun.toLowerCase()} to your leads</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {}}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg whitespace-nowrap"
                style={{ border: '1.5px solid #0F766E', color: '#0F766E', background: '#F0FDFA' }}
              >
                Good/Better/Best
              </button>
              <button
                onClick={() => setShowNewEstimateModal(true)}
                disabled={creating}
                className="flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap"
              >
                <Plus size={16} />
                {creating ? 'Creating...' : `New ${noun}`}
              </button>
            </div>
          </div>

          {/* ── Stats bar ── */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: `Total ${noun}`, value: estimates.length.toString() },
              { label: 'Sent / In Review', value: sentCount.toString() },
              { label: 'Active Estimates Value', value: fmt(totalValue) },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border p-3 md:p-4" style={{ borderColor: t.cardBorder, background: t.cardBg }}>
                <p className={`text-[12px] font-bold uppercase tracking-wide ${muted}`}>{stat.label}</p>
                <p className="text-xl md:text-2xl font-bold mt-1" style={{ color: t.textPri }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* ── Error toast ── */}
          {createError && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 font-medium">{createError}</p>
              <button onClick={() => setCreateError(null)} className="text-red-400 hover:text-red-600 ml-4 text-lg leading-none">×</button>
            </div>
          )}

          {/* ── Search ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5 flex-1" style={{ borderColor: t.cardBorder, background: t.cardBg }}>
              <Search size={16} className={muted} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by client name or estimate number..."
                className={`flex-1 bg-transparent text-sm focus:outline-none placeholder:text-[#9CA3AF]`}
                style={{ color: t.textPri }}
              />
              {search && (
                <button onClick={() => setSearch('')} className={`text-xs hover:text-red-400 ${muted}`}>✕</button>
              )}
            </div>
          </div>

          {/* E2: Status filter pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {(['all','draft','sent','viewed','approved','invoiced','paid'] as const).map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors shrink-0 ${
                  statusFilter === s
                    ? 'bg-[#0F766E] border-[#0F766E] text-white'
                    : dk ? 'border-[#334155] text-slate-400 hover:border-teal-600' : 'border-[#E8E2D9] text-[#6B7280] hover:border-teal-600'
                }`}>
                {s === 'all' ? 'All Active' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Estimates table ── */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: t.cardBorder, background: t.cardBg }}>
            {/* Table header */}
            <div className={`hidden md:grid grid-cols-[1fr_140px_100px_120px_100px_40px] gap-4 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wide ${muted} ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <button onClick={() => toggleSort('name')} className={`flex items-center gap-1 text-left hover:text-[#0F766E] transition-colors ${sortCol === 'name' ? 'text-[#0F766E]' : ''}`}>
                Client / Estimate {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <span>Trade</span>
              <button onClick={() => toggleSort('status')} className={`flex items-center gap-1 hover:text-[#0F766E] transition-colors ${sortCol === 'status' ? 'text-[#0F766E]' : ''}`}>
                Status {sortCol === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button onClick={() => toggleSort('total')} className={`flex items-center gap-1 justify-end w-full hover:text-[#0F766E] transition-colors ${sortCol === 'total' ? 'text-[#0F766E]' : ''}`}>
                {sortCol === 'total' ? (sortDir === 'asc' ? '↑' : '↓') : ''} Total
              </button>
              <button onClick={() => toggleSort('date')} className={`flex items-center gap-1 justify-end w-full hover:text-[#0F766E] transition-colors ${sortCol === 'date' ? 'text-[#0F766E]' : ''}`}>
                {sortCol === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''} Date
              </button>
              <span />
            </div>

            {loading ? (
              <div className="space-y-0">
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ height: 64, borderBottom: `1px solid ${t.cardBorder}`, background: t.cardBgAlt }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              estimates.length === 0
                ? <EmptyState dk={dk} onCreate={() => setShowNewEstimateModal(true)} creating={creating} noun={noun} />
                : (
                  <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                    <p className={`font-semibold text-sm ${dk ? 'text-white' : 'text-gray-700'}`}>
                      No {statusFilter !== 'all' ? statusFilter : ''} estimates match your search
                    </p>
                    <button onClick={() => { setSearch(''); setStatusFilter('all') }}
                      className="mt-3 text-xs text-[#0F766E] hover:underline">
                      Clear filters
                    </button>
                  </div>
                )
            ) : (
              <div>
                {filtered.map((est, i) => (
                  <button
                    key={est.id}
                    onClick={() => router.push(`/dashboard/estimates/${est.id}`)}
                    className={`w-full text-left transition-colors border-b last:border-b-0 ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}
                    style={{ background: i % 2 === 1 ? t.tableRowOdd : 'transparent' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = t.cardBgHover)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? t.tableRowOdd : 'transparent')}
                  >
                    {/* Mobile */}
                    <div className="flex items-center gap-3 px-4 py-3.5 md:hidden">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: t.textPri }}>{est.lead_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>#{est.estimate_number}</p>
                      </div>
                      <span style={{ background: estimateStatusStyle(est.status, dk).bg, color: estimateStatusStyle(est.status, dk).text, padding: '2px 10px', borderRadius: 20, fontSize: T.fontBadge, fontWeight: 600, display: 'inline-flex', flexShrink: 0 }}>
                        {estimateStatusStyle(est.status, dk).label}
                      </span>
                      <div className="text-sm font-bold shrink-0" style={{ color: t.textPri }}>{fmt(est.total)}</div>
                      <button onClick={e => deleteEstimate(e, est.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Desktop */}
                    <div className="hidden md:grid grid-cols-[1fr_140px_100px_120px_100px_40px] gap-4 px-5 py-4">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: t.textPri }}>{est.lead_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>#{est.estimate_number}</p>
                      </div>
                      <div className="text-sm self-center truncate" style={{ color: t.textMuted }}>{est.trade}</div>
                      <div className="self-center">
                        <span style={{ background: estimateStatusStyle(est.status, dk).bg, color: estimateStatusStyle(est.status, dk).text, padding: '2px 10px', borderRadius: 20, fontSize: T.fontBadge, fontWeight: 600, display: 'inline-flex' }}>
                          {estimateStatusStyle(est.status, dk).label}
                        </span>
                      </div>
                      <div className="text-sm font-semibold self-center text-right" style={{ color: t.textPri }}>{fmt(est.total)}</div>
                      <div className="text-xs self-center text-right" style={{ color: t.textMuted }}>
                        {new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <button onClick={e => deleteEstimate(e, est.id)} className="self-center p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* E3: archive toggle */}
          {archivedCount > 0 && (
            <div className="text-center py-2">
              <button onClick={() => setShowArchived(v => !v)}
                className={`text-xs font-medium transition-colors hover:text-[#0F766E] ${muted}`}>
                {showArchived ? `Hide archived (${archivedCount})` : `Show archived — void & declined (${archivedCount})`}
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── Option C: New Estimate Modal ── */}
      {session && (
        <NewEstimateModal
          open={showNewEstimateModal}
          dk={dk}
          session={session}
          noun={noun}
          onClose={() => setShowNewEstimateModal(false)}
          onLeadSelected={handleLeadSelected}
          onNewLeadCreated={handleNewLeadCreated}
        />
      )}

      {/* ── Existing estimate modal ── */}
      {existingEst && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setExistingEst(null)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <h3 className={`font-bold text-base mb-1 ${dk ? 'text-white' : 'text-gray-900'}`}>Estimate already exists</h3>
            <p className={`text-sm mb-4 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>
              A draft estimate was found for <span className={`font-semibold ${dk ? 'text-white' : 'text-gray-800'}`}>{existingEst.lead_name}</span>.
            </p>
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 mb-5 ${dk ? 'border-[#334155] bg-[#0F172A]' : 'border-[#E8E2D9] bg-gray-50'}`}>
              <div>
                <p className={`text-sm font-bold ${dk ? 'text-white' : 'text-gray-900'}`}>#{existingEst.estimate_number}</p>
                <p className={`text-xs mt-0.5 ${dk ? 'text-slate-400' : 'text-[#6B7280]'}`}>Draft</p>
              </div>
              <span className="text-sm font-bold text-[#0F766E]">
                ${existingEst.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => router.push(`/dashboard/estimates/${existingEst.id}`)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white hover:opacity-90 transition-opacity">
                Open Existing
              </button>
              <button onClick={createFresh} disabled={creating}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors disabled:opacity-50 ${dk ? 'border-[#334155] text-slate-300 hover:border-[#0F766E]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                {creating ? 'Creating...' : 'New Version'}
              </button>
            </div>
            <button onClick={() => setExistingEst(null)}
              className={`w-full mt-3 text-xs transition-colors ${dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDelete(null)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEE2E2' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-base ${dk ? 'text-white' : 'text-gray-900'}`}>Delete estimate?</h3>
                <p className={`text-sm mt-0.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${dk ? 'border-[#334155] text-slate-300' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                Cancel
              </button>
              <button onClick={() => doDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: '#DC2626' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

function EmptyState({ dk, onCreate, creating, noun }: { dk: boolean; onCreate: () => void; creating: boolean; noun: string }) {
  const muted = dk ? 'text-slate-400' : 'text-[#6B7280]'
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${dk ? 'bg-[#0F172A]' : 'bg-teal-50'}`}>
        <FileText size={24} className="text-[#0F766E]" />
      </div>
      <p className={`font-semibold text-base ${dk ? 'text-white' : 'text-gray-900'}`}>No estimates yet</p>
      <p className={`text-sm mt-1 mb-5 ${muted}`}>Create your first estimate and send it to a client in minutes.</p>
      <button
        onClick={onCreate}
        disabled={creating}
        className="flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        <Plus size={15} />
        {creating ? 'Creating...' : `Create First ${noun}`}
      </button>
    </div>
  )
}
