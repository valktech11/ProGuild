'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { initials, avatarColor, timeAgo, fmtCurrency } from '@/lib/utils'
import { theme, T } from '@/lib/tokens'
import { usePlacesAutocomplete } from '@/lib/hooks/usePlacesAutocomplete'

function TAG_COLORS(dk: boolean): Record<string, { bg: string; text: string }> {
  return {
    Residential: { bg: dk ? 'rgba(29,78,216,0.15)' : '#EFF6FF',  text: dk ? '#93C5FD' : '#1D4ED8' },
    Commercial:  { bg: dk ? 'rgba(109,40,217,0.15)' : '#F5F3FF', text: dk ? '#C4B5FD' : '#6D28D9' },
    Repeat:      { bg: dk ? 'rgba(21,128,61,0.15)' : '#F0FDF4',  text: dk ? '#86EFAC' : '#15803D' },
    VIP:         { bg: dk ? 'rgba(180,83,9,0.15)' : '#FFFBEB',   text: dk ? '#FCD34D' : '#B45309' },
  }
}

export default function ClientsPage() {
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null)
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  const [clients, setClients]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [search,  setSearch]    = useState('')
  const [sort,    setSort]      = useState<'name' | 'value' | 'recent'>('recent')
  const [showAdd, setShowAdd]   = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newPhone,  setNewPhone]  = useState('')
  const [newEmail,  setNewEmail]  = useState('')
  const [newStreet, setNewStreet] = useState('')
  const [newCity,   setNewCity]   = useState('')
  const [newState,  setNewState]  = useState('')
  const [newZip,    setNewZip]    = useState('')
  const [newNotes,  setNewNotes]  = useState('')
  const [newTags,   setNewTags]   = useState<string[]>([])
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  // Google Places autocomplete on street address
  const streetRef = useRef<HTMLInputElement>(null)
  usePlacesAutocomplete(streetRef, (formatted: string) => {
    const zipMatch   = formatted.match(/\b(\d{5})\b/)
    const stateMatch = formatted.match(/,\s*([A-Z]{2})\s+\d{5}/)
    const parts      = formatted.replace(', USA', '').split(', ')
    if (zipMatch)   setNewZip(zipMatch[1])
    if (stateMatch) setNewState(stateMatch[1])
    if (parts.length >= 3) setNewCity(parts[parts.length - 3] || '')
    if (parts.length >= 1) setNewStreet(parts[0] || '')
  })

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.push('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    fetch(`/api/clients?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLoading(false) })
  }, [router])

  async function addClient() {
    if (!newName.trim()) { setErr('Name is required'); return }
    if (!session) return
    setSaving(true); setErr('')
    const r = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: session.id,
        full_name:    newName.trim(),
        phone:        newPhone.trim()  || null,
        email:        newEmail.trim()  || null,
        address_line1: newStreet.trim() || null,
        city:         newCity.trim()   || null,
        state:        newState.trim()  || null,
        zip:          newZip.trim()    || null,
        notes:        newNotes.trim()  || null,
        tags:         newTags,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) {
      setClients(prev => [{ ...d.client, job_count: 0, lifetime_value: 0 }, ...prev])
      setShowAdd(false)
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewStreet(''); setNewCity(''); setNewState(''); setNewZip(''); setNewNotes(''); setNewTags([])
    } else setErr(d.error || 'Failed to save')
  }

  async function deleteClient() {
    if (!deleteTarget) return
    await fetch(`/api/clients?id=${deleteTarget.id}`, { method: 'DELETE' })
    setClients(prev => prev.filter(c => c.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  function toggleTag(tag: string) {
    setNewTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const filtered = clients
    .filter(c => !search || c.full_name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search))
    .sort((a, b) => {
      if (sort === 'name')  return a.full_name.localeCompare(b.full_name)
      if (sort === 'value') return (b.lifetime_value || 0) - (a.lifetime_value || 0)
      return new Date(b.last_contact || b.created_at).getTime() - new Date(a.last_contact || a.created_at).getTime()
    })

  const totalValue = clients.reduce((sum, c) => sum + (c.lifetime_value || 0), 0)
  const t = theme(dk)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 10,
    border: `1.5px solid ${t.inputBorder}`, background: t.inputBg,
    color: t.textPri, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Link href="/dashboard" style={{ fontSize: 14, color: t.textMuted, textDecoration: 'none' }}>Dashboard</Link>
                <span style={{ color: t.textSubtle }}>/</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>Clients</span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: t.textPri, margin: 0 }}>Clients</h1>
              <p style={{ fontSize: 14, color: t.textMuted, marginTop: 2 }}>
                {clients.length} client{clients.length !== 1 ? 's' : ''}
                {totalValue > 0 && ` · ${fmtCurrency(totalValue)} lifetime revenue`}
              </p>
            </div>
            <button onClick={() => setShowAdd(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, color: '#fff', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0F766E, #0C5F57)', cursor: 'pointer' }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add client
            </button>
          </div>

          {/* Search + sort */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              style={{ ...inputStyle, flex: 1 }}
              onFocus={e => (e.target.style.borderColor = '#0F766E')}
              onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
            <select value={sort} onChange={e => setSort(e.target.value as any)}
              style={{ ...inputStyle, width: 'auto', paddingRight: 32, appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', cursor: 'pointer', fontWeight: 500 }}>
              <option value="recent">Recent</option>
              <option value="value">Top value</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          {/* Client list */}
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 64, borderRadius: 10, animation: 'shimmer 1.4s ease-in-out infinite', background: 'linear-gradient(90deg, #F3F4F6 25%, #E9EAEC 50%, #F3F4F6 75%)', backgroundSize: '200% 100%' }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 24px' }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>👥</div>
                <p style={{ fontSize: 16, fontWeight: 600, color: t.textPri, marginBottom: 4 }}>
                  {search ? 'No clients match your search' : 'No clients yet'}
                </p>
                <p style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
                  {search ? 'Try a different name or phone number' : 'Add your first client or save one from a lead'}
                </p>
                {!search && (
                  <button onClick={() => setShowAdd(true)}
                    style={{ fontSize: 14, fontWeight: 600, color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    + Add your first client
                  </button>
                )}
              </div>
            ) : filtered.map((client, i) => {
              const [bg, fg] = avatarColor(client.full_name)
              return (
                <Link key={client.id} href={`/dashboard/clients/${client.id}`}
                  className="active:opacity-70 active:scale-[.99]"
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', textDecoration: 'none', transition: 'background 0.15s', background: i % 2 === 1 ? t.tableRowAlt : 'transparent' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = t.tableRowHover)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? t.tableRowAlt : 'transparent')}
                >
                  <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, background: bg, color: fg }}>
                    {initials(client.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: t.textPri }}>{client.full_name}</span>
                      {(client.address_line1 || client.city) && (
                        <span style={{ fontSize: 12, color: t.textMuted, display: 'block', marginTop: 1 }}>
                          {[client.address_line1, client.city, client.state].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {(client.tags || []).map((tag: string) => {
                        const tc = TAG_COLORS(dk)[tag] || { bg: t.cardBgAlt, text: t.textMuted }
                        return (
                          <span key={tag} style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.text }}>{tag}</span>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                      {client.phone && <span style={{ fontSize: 14, color: t.textMuted }}>{client.phone}</span>}
                      {client.email && <span style={{ fontSize: 14, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {client.lifetime_value > 0 && (
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F766E' }}>${client.lifetime_value.toLocaleString()}</div>
                    )}
                    <div style={{ fontSize: 13, color: t.textSubtle }}>
                      {client.job_count} job{client.job_count !== 1 ? 's' : ''} · {timeAgo(client.last_contact || client.created_at)}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={t.textSubtle} strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </Link>
              )
            })}
          </div>

          {/* Delete confirm modal */}
          {deleteTarget && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setDeleteTarget(null)}>
              <div style={{ background: t.cardBg, borderRadius: 20, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
                onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: t.textPri, textAlign: 'center', marginBottom: 8 }}>Delete {deleteTarget.full_name}?</h3>
                <p style={{ fontSize: 14, color: t.textMuted, textAlign: 'center', marginBottom: 4 }}>This removes them from your client book permanently.</p>
                <p style={{ fontSize: 13, color: t.textSubtle, textAlign: 'center', marginBottom: 20 }}>Their job history will remain in your pipeline.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setDeleteTarget(null)}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: `2px solid ${t.cardBorder}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={deleteClient}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add client modal */}
          {showAdd && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: '16px' }}
              onClick={() => setShowAdd(false)}>
              <div style={{ background: t.cardBg, width: '100%', maxWidth: 640, borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: `1px solid ${t.cardBorder}`, flexShrink: 0 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: t.textPri, margin: 0 }}>New client</h2>
                    <p style={{ fontSize: 13, color: t.textMuted, margin: '2px 0 0' }}>Add a client manually or save from a lead</p>
                  </div>
                  <button onClick={() => setShowAdd(false)}
                    style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: t.cardBgAlt, color: t.textMuted, cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>

                  {/* Name + Phone — 2 col */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>Full name *</p>
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="John Smith" type="text" autoComplete="off"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = '#0F766E')}
                        onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>Phone</p>
                      <input value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/[^\d\s\-\(\)\+]/g, ''))}
                        placeholder="(555) 555-5555" type="tel" autoComplete="off"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = '#0F766E')}
                        onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                    </div>
                  </div>

                  {/* Email — full width */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>Email</p>
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                      placeholder="john@example.com" type="email" autoComplete="off"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#0F766E')}
                      onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: `1px solid ${t.divider}`, margin: '2px 0' }} />

                  {/* Street address — Google Places autocomplete */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>Street address</p>
                    <input ref={streetRef} value={newStreet} onChange={e => setNewStreet(e.target.value)}
                      placeholder="9933 Orchard Hills Rd"
                      autoComplete="off"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = '#0F766E')}
                      onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                  </div>

                  {/* City / State / Zip — 3 col */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px', gap: 14 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>City</p>
                      <input value={newCity} onChange={e => setNewCity(e.target.value)}
                        placeholder="Jacksonville" autoComplete="off"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = '#0F766E')}
                        onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>State</p>
                      <select value={newState} onChange={e => setNewState(e.target.value)}
                        style={{ ...inputStyle, paddingRight: 6 }}
                        onFocus={e => (e.target.style.borderColor = '#0F766E')}
                        onBlur={e => (e.target.style.borderColor = t.inputBorder)}>
                        <option value="">—</option>
                        {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>Zip</p>
                      <input value={newZip} onChange={e => setNewZip(e.target.value.replace(/\D/g,'').slice(0,5))}
                        placeholder="32207" maxLength={5} inputMode="numeric" autoComplete="off"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = '#0F766E')}
                        onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: `1px solid ${t.divider}`, margin: '2px 0' }} />

                  {/* Tags */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 10 }}>Tags</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['Residential','Commercial','Repeat','VIP'].map(tag => (
                        <button key={tag} onClick={() => toggleTag(tag)}
                          style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 20, cursor: 'pointer', border: `1.5px solid ${newTags.includes(tag) ? '#0F766E' : t.inputBorder}`, background: newTags.includes(tag) ? '#0F766E' : 'transparent', color: newTags.includes(tag) ? '#fff' : t.textMuted, transition: 'all 0.15s' }}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: t.textMuted, marginBottom: 7 }}>Notes</p>
                    <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                      placeholder="Gate code 1234, has two dogs, prefers morning appointments..."
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                      onFocus={e => (e.target.style.borderColor = '#0F766E')}
                      onBlur={e => (e.target.style.borderColor = t.inputBorder)} />
                  </div>

                  {err && <p style={{ fontSize: 14, color: '#EF4444', margin: 0 }}>{err}</p>}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 10, padding: '16px 28px 24px', borderTop: `1px solid ${t.cardBorder}`, flexShrink: 0 }}>
                  <button onClick={() => setShowAdd(false)}
                    style={{ flex: 1, padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: `2px solid ${t.cardBorder}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={addClient} disabled={saving}
                    style={{ flex: 2, padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, #0F766E, #0C5F57)', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving...' : 'Save client'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
