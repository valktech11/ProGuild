'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { Session } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

const TAG_COLORS: Record<string, string> = {
  Residential: 'bg-blue-50 text-blue-700',
  Commercial:  'bg-purple-50 text-purple-700',
  Repeat:      'bg-green-50 text-green-700',
  VIP:         'bg-amber-50 text-amber-700',
}

export default function ClientsPage() {
  const router = useRouter()
  const [session, setSession]   = useState<Session | null>(null)
  const [clients, setClients]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [search,  setSearch]    = useState('')
  const [sort,    setSort]      = useState<'name' | 'value' | 'recent'>('recent')
  const [showAdd, setShowAdd]   = useState(false)

  // New client form
  const [newName,  setNewName]  = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newTags,  setNewTags]  = useState<string[]>([])
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    fetch(`/api/clients?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLoading(false) })
  }, [])

  async function addClient() {
    if (!newName.trim()) { setErr('Name is required'); return }
    if (!session) return
    setSaving(true); setErr('')
    const r = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: session.id,
        full_name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
        notes: newNotes.trim() || null,
        tags: newTags,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) {
      setClients(prev => [{ ...d.client, job_count: 0, lifetime_value: 0 }, ...prev])
      setShowAdd(false)
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewNotes(''); setNewTags([])
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

  // Filter + sort
  const filtered = clients
    .filter(c => !search || c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search))
    .sort((a, b) => {
      if (sort === 'name')   return a.full_name.localeCompare(b.full_name)
      if (sort === 'value')  return (b.lifetime_value || 0) - (a.lifetime_value || 0)
      return new Date(b.last_contact || b.created_at).getTime() - new Date(a.last_contact || a.created_at).getTime()
    })

  const totalValue = clients.reduce((sum, c) => sum + (c.lifetime_value || 0), 0)

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-7">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-sm text-gray-400 hover:text-teal-600 transition-colors">Dashboard</Link>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-semibold text-[#0A1628]">Clients</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0A1628]">Client address book</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {clients.length} client{clients.length !== 1 ? 's' : ''}
              {totalValue > 0 && ` · $${totalValue.toLocaleString()} lifetime revenue`}
            </p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl"
            style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
            <span className="text-lg leading-none">+</span> Add client
          </button>
        </div>

        {/* Search + sort */}
        <div className="flex gap-3 mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="flex-1 px-4 py-2.5 text-sm border border-[#E8E2D9] rounded-xl outline-none bg-white text-[#0A1628]"
            onFocus={e => e.target.style.borderColor = '#0F766E'}
            onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
          <select value={sort} onChange={e => setSort(e.target.value as any)}
            className="px-3 py-2.5 text-sm border border-[#E8E2D9] rounded-xl outline-none bg-white text-[#0A1628]">
            <option value="recent">Recent</option>
            <option value="value">Top value</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        {/* Client list */}
        <div className="bg-white border border-[#E8E2D9] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-50" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3 opacity-20">👥</div>
              <p className="text-base font-semibold text-gray-600 mb-1">
                {search ? 'No clients match your search' : 'No clients yet'}
              </p>
              <p className="text-sm text-gray-400 mb-5">
                {search ? 'Try a different name or phone number' : 'Add your first client or save one from a lead'}
              </p>
              {!search && (
                <button onClick={() => setShowAdd(true)}
                  className="text-sm font-semibold text-teal-600 hover:underline">
                  + Add your first client
                </button>
              )}
            </div>
          ) : filtered.map((client, i) => {
            const [bg, fg] = avatarColor(client.full_name)
            return (
              <Link key={client.id} href={`/dashboard/clients/${client.id}`}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-[#FAF9F6] transition-colors ${
                  i > 0 ? 'border-t border-gray-50' : ''
                }`}>
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: bg, color: fg }}>
                  {initials(client.full_name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-[#0A1628] truncate">{client.full_name}</span>
                    {(client.tags || []).map((tag: string) => (
                      <span key={tag} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TAG_COLORS[tag] || 'bg-gray-50 text-gray-500'}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {client.phone && <span className="text-sm text-gray-400">{client.phone}</span>}
                    {client.email && <span className="text-sm text-gray-400 truncate">{client.email}</span>}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right flex-shrink-0">
                  {client.lifetime_value > 0 && (
                    <div className="text-base font-bold text-teal-600">
                      ${client.lifetime_value.toLocaleString()}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    {client.job_count} job{client.job_count !== 1 ? 's' : ''} · {timeAgo(client.last_contact || client.created_at)}
                  </div>
                </div>

                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#C4BCAF" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </Link>
            )
          })}
        </div>

        {/* Delete confirm modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDeleteTarget(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                Delete {deleteTarget.full_name}?
              </h3>
              <p className="text-sm text-gray-500 text-center leading-relaxed mb-2">
                This removes them from your client book permanently.
              </p>
              <p className="text-xs text-gray-400 text-center mb-5">
                Their job history will remain in your pipeline.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-3.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={deleteClient}
                  className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add client modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowAdd(false)}>
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-bold text-[#0A1628]">New client</h2>
                <button onClick={() => setShowAdd(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl">×</button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {[
                  { label: 'Full name *', value: newName, set: setNewName, placeholder: 'John Smith', type: 'text' },
                  { label: 'Phone', value: newPhone, set: (v: string) => setNewPhone(v.replace(/[^\d\s\-\(\)\+]/g, '')), placeholder: '(555) 555-5555', type: 'tel' },
                  { label: 'Email', value: newEmail, set: setNewEmail, placeholder: 'john@example.com', type: 'email' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{f.label}</p>
                    <input value={f.value} onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder} type={f.type}
                      className="w-full px-4 py-3 text-sm border-2 border-[#E8E2D9] rounded-xl outline-none text-[#0A1628]"
                      onFocus={e => e.target.style.borderColor = '#0F766E'}
                      onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
                  </div>
                ))}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Tags</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Residential','Commercial','Repeat','VIP'].map(tag => (
                      <button key={tag} onClick={() => toggleTag(tag)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                          newTags.includes(tag)
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-500 border-gray-200'
                        }`}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Notes</p>
                  <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                    placeholder="Gate code 1234, has two dogs, prefers morning appointments..."
                    rows={3}
                    className="w-full px-4 py-3 text-sm border-2 border-[#E8E2D9] rounded-xl outline-none resize-none text-[#0A1628]"
                    onFocus={e => e.target.style.borderColor = '#0F766E'}
                    onBlur={e => e.target.style.borderColor = '#E8E2D9'} />
                </div>
                {err && <p className="text-sm text-red-500">{err}</p>}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)}
                    className="flex-1 py-3.5 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-600">Cancel</button>
                  <button onClick={addClient} disabled={saving}
                    className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                    {saving ? 'Saving...' : 'Save client'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
