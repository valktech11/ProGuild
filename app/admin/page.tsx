'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session } from '@/types'
import { timeAgo } from '@/lib/utils'

type Section = 'dashboard' | 'pros' | 'leads' | 'moderation' | 'config' | 'emails' | 'categories' | 'cron'

function StatCard({ label, value, sub, color = 'teal' }: { label: string; value: any; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    teal: 'text-teal-600', amber: 'text-amber-500', red: 'text-red-500', purple: 'text-purple-600'
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-3xl font-serif font-bold ${colors[color]}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
      <div>
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        {sub && <div className="text-sm text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-teal-600' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${value ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [section, setSection] = useState<Section>('dashboard')
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [toast, setToast]     = useState('')
  const [accessDenied, setAccessDenied] = useState(false)

  // Pros filter state
  const [proSearch, setProSearch] = useState('')
  const [proClaimed, setProClaimed] = useState('')

  // Email campaign state
  const [emailCity, setEmailCity]   = useState('')
  const [emailLimit, setEmailLimit] = useState('20')
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult]   = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/admin-login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    // Verify admin
    fetch(`/api/admin?section=dashboard`, { headers: { 'x-pro-id': s.id } })
      .then(r => {
        if (r.status === 403) { setAccessDenied(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setData(d); setLoading(false) } })
  }, [])

  const loadSection = useCallback(async (sec: Section, params = '') => {
    if (!session) return
    setLoading(true)
    const r = await fetch(`/api/admin?section=${sec}${params}`, { headers: { 'x-pro-id': session.id } })
    const d = await r.json()
    setData(d)
    setLoading(false)
  }, [session])

  useEffect(() => {
    if (session && section !== 'emails' && section !== 'categories' && section !== 'cron') loadSection(section)
    if (session && section === 'categories') {
      fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || []))
    }
  }, [section, session])

  async function updateConfig(key: string, value: string) {
    if (!session) return
    setSaving(key)
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-pro-id': session.id },
      body: JSON.stringify({ config_key: key, config_value: value }),
    })
    setSaving(null)
    showToast('Saved ✓')
    loadSection('config')
  }

  async function updatePro(proId: string, updates: Record<string, any>) {
    if (!session) return
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-pro-id': session.id },
      body: JSON.stringify({ pro_id: proId, ...updates }),
    })
    showToast('Pro updated ✓')
    loadSection('pros')
  }

  async function deletePost(postId: string) {
    if (!session || !confirm('Delete this post?')) return
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-pro-id': session.id },
      body: JSON.stringify({ delete_post_id: postId }),
    })
    showToast('Post deleted ✓')
    loadSection('moderation')
  }

  async function sendEmails() {
    if (!session) return
    setEmailSending(true); setEmailResult('')
    const r = await fetch('/api/admin/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pro-id': session.id },
      body: JSON.stringify({ city: emailCity || undefined, limit: parseInt(emailLimit) }),
    })
    const d = await r.json()
    setEmailSending(false)
    setEmailResult(`✓ Sent ${d.sent} of ${d.total} emails${d.message ? ` — ${d.message}` : ''}`)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const navItems: { id: Section; icon: string; label: string }[] = [
    { id: 'dashboard',  icon: '📊', label: 'Dashboard'  },
    { id: 'pros',       icon: '👥', label: 'Pros'       },
    { id: 'leads',      icon: '📥', label: 'Leads'      },
    { id: 'moderation', icon: '🛡',  label: 'Moderation' },
    { id: 'config',     icon: '⚙️',  label: 'Config'    },
    { id: 'emails',     icon: '📧', label: 'Emails'     },
    { id: 'categories', icon: '🏷',  label: 'Categories' },
    { id: 'cron',       icon: '⏰',  label: 'Cron & Outreach' },
  ]

  const cfg = data?.config || {}
  const [cats, setCats]         = useState<any[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatSlug, setNewCatSlug] = useState('')
  const [editCatId, setEditCatId]   = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [cronLoading, setCronLoading] = useState(false)
  const [cronResult, setCronResult]   = useState<any>(null)
  const [cronSending, setCronSending] = useState(false)

  if (loading && !accessDenied) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (accessDenied) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 max-w-md text-center">
        <div className="text-5xl mb-5">🔒</div>
        <h1 className="font-serif text-2xl text-white mb-3">Access denied</h1>
        <p className="text-gray-400 text-sm mb-2 leading-relaxed">
          This page is restricted to ProGuild administrators only.
        </p>
        <p className="text-gray-500 text-xs mb-7">
          If you believe you should have admin access, contact the platform owner to have your account elevated.
        </p>
        <a href="/dashboard" className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
          ← Back to dashboard
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex">

      {/* Sidebar */}
      <div className="w-56 bg-gray-900 flex flex-col flex-shrink-0 border-r border-gray-800">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="font-serif text-white text-lg">Pro<span className="text-teal-400">Guild</span><span className="font-sans font-medium text-sm text-teal-300">.ai</span></div>
          <div className="text-xs text-gray-500 mt-0.5">Admin Panel</div>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors text-left ${
                section === item.id ? 'bg-teal-600/20 text-teal-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}>
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 mb-2">{session?.name}</div>
          <Link href="/admin/setup" className="text-xs text-gray-500 hover:text-teal-400 transition-colors mb-1 block">👥 Manage admins</Link>
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-teal-400 transition-colors">← Back to site</Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto">

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg z-50">
            {toast}
          </div>
        )}

        <div className="p-8">

          {/* ── DASHBOARD ── */}
          {section === 'dashboard' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-6">Platform Overview</h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Pros"     value={data?.totalPros}    sub={`${data?.claimedPros} claimed`} />
                <StatCard label="Unclaimed Pros" value={data?.unclaimedPros} color="amber" sub="Not yet registered" />
                <StatCard label="Total Leads"    value={data?.totalLeads}   color="purple" />
                <StatCard label="New Leads"      value={data?.newLeads}     color="red"    sub="Uncontacted" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-100 rounded-2xl p-6">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Top cities (claimed pros)</div>
                  {(data?.topCities || []).map((c: any) => (
                    <div key={c.city} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{c.city}</span>
                      <span className="text-sm font-semibold text-teal-600">{c.count}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-6">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Pros by trade</div>
                  {(data?.topTrades || []).map((t: any) => (
                    <div key={t.trade} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{t.trade}</span>
                      <span className="text-sm font-semibold text-teal-600">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PROS ── */}
          {section === 'pros' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-6">Pro Management</h1>
              <div className="flex gap-3 mb-5">
                <input value={proSearch} onChange={e => setProSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadSection('pros', `&search=${proSearch}&claimed=${proClaimed}`)}
                  placeholder="Search name, email, city..."
                  className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500" />
                <select value={proClaimed} onChange={e => setProClaimed(e.target.value)}
                  className="px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500">
                  <option value="">All pros</option>
                  <option value="true">Claimed only</option>
                  <option value="false">Unclaimed only</option>
                </select>
                <button onClick={() => loadSection('pros', `&search=${proSearch}&claimed=${proClaimed}`)}
                  className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                  Search
                </button>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <div className="col-span-3">Name</div>
                  <div className="col-span-2">Trade</div>
                  <div className="col-span-2">City</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-3">Actions</div>
                </div>
                {loading ? (
                  <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
                ) : (data?.pros || []).map((pro: any) => (
                  <div key={pro.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-gray-50 items-center hover:bg-stone-50">
                    <div className="col-span-3">
                      <div className="text-sm font-medium text-gray-900 truncate">{pro.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">{pro.email}</div>
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">{pro.trade_category?.category_name || '—'}</div>
                    <div className="col-span-2 text-xs text-gray-500">{pro.city || '—'}</div>
                    <div className="col-span-2">
                      <div className="flex flex-wrap gap-1">
                        {pro.is_claimed && <span className="text-xs px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">Claimed</span>}
                        {pro.is_verified && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">Verified</span>}
                        {pro.profile_status === 'Suspended' && <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">Suspended</span>}
                      </div>
                    </div>
                    <div className="col-span-3 flex gap-1 flex-wrap">
                      <button onClick={() => updatePro(pro.id, { is_verified: !pro.is_verified })}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-colors">
                        {pro.is_verified ? 'Unverify' : 'Verify'}
                      </button>
                      <button onClick={() => updatePro(pro.id, {
                        profile_status: pro.profile_status === 'Suspended' ? 'Active' : 'Suspended'
                      })} className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors">
                        {pro.profile_status === 'Suspended' ? 'Reinstate' : 'Suspend'}
                      </button>
                      <Link href={`/pro/${pro.id}`} target="_blank"
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-500 transition-colors">
                        View
                      </Link>
                    </div>
                  </div>
                ))}
                {data?.total > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                    Showing {(data?.pros || []).length} of {data?.total} pros
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── LEADS ── */}
          {section === 'leads' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-6">Leads Overview</h1>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <div className="col-span-2">From</div>
                  <div className="col-span-2">To (Pro)</div>
                  <div className="col-span-3">Message</div>
                  <div className="col-span-2">Trade</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1">When</div>
                </div>
                {(data?.leads || []).map((lead: any) => (
                  <div key={lead.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-gray-50 text-xs text-gray-600">
                    <div className="col-span-2">
                      <div className="font-medium text-gray-900">{lead.contact_name}</div>
                      <div className="text-gray-400 truncate">{lead.contact_email}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="font-medium text-gray-900 truncate">{lead.pro?.full_name || '—'}</div>
                      <div className="text-gray-400">{lead.pro?.city}</div>
                    </div>
                    <div className="col-span-3 text-gray-500 truncate">{lead.message}</div>
                    <div className="col-span-2 text-gray-500">{lead.pro?.trade_category?.category_name || '—'}</div>
                    <div className="col-span-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        lead.status === 'New' ? 'bg-blue-50 text-blue-700' :
                        lead.status === 'Contacted' ? 'bg-amber-50 text-amber-700' :
                        'bg-teal-50 text-teal-700'
                      }`}>{lead.status}</span>
                    </div>
                    <div className="col-span-1 text-gray-400">{timeAgo(lead.created_at)}</div>
                  </div>
                ))}
                {!(data?.leads?.length) && !loading && (
                  <div className="py-12 text-center text-gray-400 text-sm">No leads yet</div>
                )}
              </div>
            </div>
          )}

          {/* ── MODERATION ── */}
          {section === 'moderation' && (
            <div className="space-y-6">
              <h1 className="font-serif text-2xl text-white">Content Moderation</h1>

              {/* Reviews pending approval */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Reviews pending approval ({(data?.reviews || []).length})
                </div>
                {!(data?.reviews?.length) ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-8 text-center">
                    <div className="text-2xl mb-2">✓</div>
                    <div className="text-gray-400 text-sm">No reviews pending</div>
                  </div>
                ) : (data?.reviews || []).map((rev: any) => (
                  <div key={rev.id} className="bg-white border border-gray-100 rounded-2xl p-5 mb-3">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{rev.reviewer_name}</span>
                          <span className="text-amber-400 text-sm">{'★'.repeat(rev.rating)}{'☆'.repeat(5-rev.rating)}</span>
                          <span className="text-sm text-gray-400">for {rev.pro?.full_name}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{rev.comment}</p>
                        <div className="text-sm text-gray-400">{rev.reviewer_email} · {timeAgo(rev.reviewed_at)}</div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={async () => {
                          await fetch('/api/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-pro-id': session!.id }, body: JSON.stringify({ approve_review_id: rev.id }) })
                          showToast('Review approved ✓'); loadSection('moderation')
                        }} className="px-3 py-1.5 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold rounded-lg hover:bg-teal-100 transition-colors">
                          Approve
                        </button>
                        <button onClick={async () => {
                          if (!confirm('Delete this review?')) return
                          await fetch('/api/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-pro-id': session!.id }, body: JSON.stringify({ delete_review_id: rev.id }) })
                          showToast('Review deleted'); loadSection('moderation')
                        }} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Approved reviews — can delete if abusive */}
              <div className="mt-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Live reviews ({(data?.approvedReviews || []).length}) — delete abusive content
                </div>
                {!(data?.approvedReviews?.length) ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-6 text-center">
                    <div className="text-gray-400 text-sm">No approved reviews yet</div>
                  </div>
                ) : (data?.approvedReviews || []).map((rev: any) => (
                  <div key={rev.id} className="bg-white border border-gray-100 rounded-2xl p-4 mb-2">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{rev.reviewer_name}</span>
                          <span className="text-amber-400 text-sm">{'★'.repeat(rev.rating)}{'☆'.repeat(5-rev.rating)}</span>
                          <span className="text-sm text-gray-400">for {rev.pro?.full_name}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{rev.comment}</p>
                        <div className="text-sm text-gray-400">{rev.reviewer_email}</div>
                      </div>
                      <button onClick={async () => {
                        if (!confirm('Delete this review permanently?')) return
                        await fetch('/api/admin', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-pro-id': session!.id }, body: JSON.stringify({ delete_review_id: rev.id }) })
                        showToast('Review deleted'); loadSection('moderation')
                      }} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors flex-shrink-0">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Flagged posts */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Flagged posts ({(data?.posts || []).length})
                </div>
                {!(data?.posts?.length) ? (
                  <div className="bg-white border border-gray-100 rounded-2xl py-8 text-center">
                    <div className="text-2xl mb-2">✓</div>
                    <div className="text-gray-400 text-sm">No flagged posts</div>
                  </div>
                ) : (data?.posts || []).map((post: any) => (
                  <div key={post.id} className="bg-white border border-gray-100 rounded-2xl p-5 mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">{post.pro?.full_name} · {timeAgo(post.created_at)}</div>
                        <p className="text-sm text-gray-900 mb-2">{post.content}</p>
                        {post.flag_reason && <div className="text-xs text-red-500">Reason: {post.flag_reason}</div>}
                      </div>
                      <button onClick={() => deletePost(post.id)}
                        className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors flex-shrink-0">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CONFIG ── */}
          {section === 'config' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-6">Site Configuration</h1>

              <div className="space-y-5">
                {/* Maintenance mode */}
                <div className="bg-white border border-gray-100 rounded-2xl p-7">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 pb-3 border-b border-gray-100">
                    🔧 Maintenance Mode
                  </div>
                  <Toggle
                    value={cfg.maintenance_mode === 'true'}
                    onChange={v => updateConfig('maintenance_mode', String(v))}
                    label="Site maintenance mode"
                    sub="Takes the site offline for all non-admin users"
                  />
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Maintenance message</label>
                      <input defaultValue={cfg.maintenance_message} key={cfg.maintenance_message}
                        onBlur={e => updateConfig('maintenance_message', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Message type</label>
                      <select defaultValue={cfg.maintenance_type} key={cfg.maintenance_type}
                        onChange={e => updateConfig('maintenance_type', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400">
                        <option value="info">Info (blue)</option>
                        <option value="warning">Warning (amber)</option>
                        <option value="critical">Critical (red)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Upgrade section */}
                <div className="bg-white border border-gray-100 rounded-2xl p-7">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 pb-3 border-b border-gray-100">
                    💳 Upgrade / Subscriptions
                  </div>
                  <Toggle
                    value={cfg.upgrades_enabled === 'true'}
                    onChange={v => updateConfig('upgrades_enabled', String(v))}
                    label="Upgrade section enabled"
                    sub="When disabled, upgrade page shows Coming Soon and all upgrade buttons are hidden"
                  />
                </div>

                {/* Pricing */}
                <div className="bg-white border border-gray-100 rounded-2xl p-7">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 pb-3 border-b border-gray-100">
                    💰 Pricing (display only — connect Stripe to enable billing)
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { key: 'price_pro_monthly',    label: 'Pro monthly ($)'    },
                      { key: 'price_elite_monthly',  label: 'Elite monthly ($)'  },
                      { key: 'price_pro_annual',     label: 'Pro annual ($)'     },
                      { key: 'price_elite_annual',   label: 'Elite annual ($)'   },
                      { key: 'price_pro_founding',   label: 'Pro founding ($)'   },
                      { key: 'price_elite_founding', label: 'Elite founding ($)' },
                    ].map(item => (
                      <div key={item.key}>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{item.label}</label>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">$</span>
                          <input type="number" defaultValue={cfg[item.key]} key={cfg[item.key]}
                            onBlur={e => updateConfig(item.key, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400" />
                          {saving === item.key && <span className="text-xs text-teal-600">Saving...</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Platform settings */}
                <div className="bg-white border border-gray-100 rounded-2xl p-7">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 pb-3 border-b border-gray-100">
                    🌐 Platform Settings
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'platform_name', label: 'Platform name' },
                      { key: 'support_email', label: 'Support email' },
                    ].map(item => (
                      <div key={item.key}>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{item.label}</label>
                        <input defaultValue={cfg[item.key]} key={cfg[item.key]}
                          onBlur={e => updateConfig(item.key, e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── EMAILS ── */}
          {section === 'emails' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-6">Email Campaigns</h1>
              <div className="bg-white border border-gray-100 rounded-2xl p-7 max-w-lg">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                  Send claim emails to unclaimed pros
                </div>
                <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                  Sends personalised claim emails to unclaimed pro profiles who haven't been emailed yet.
                  Each pro receives a link to claim their free profile.
                </p>
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Filter by city <span className="text-gray-300 font-normal normal-case tracking-normal">(optional — leave blank for all FL)</span>
                  </label>
                  <input value={emailCity} onChange={e => setEmailCity(e.target.value)}
                    placeholder="e.g. Jacksonville"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400" />
                </div>
                <div className="mb-6">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Batch size</label>
                  <select value={emailLimit} onChange={e => setEmailLimit(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400">
                    <option value="10">10 emails</option>
                    <option value="20">20 emails</option>
                    <option value="50">50 emails</option>
                    <option value="100">100 emails</option>
                  </select>
                </div>
                {emailResult && (
                  <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-700 text-sm rounded-xl">{emailResult}</div>
                )}
                <button onClick={sendEmails} disabled={emailSending}
                  className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                  {emailSending ? 'Sending...' : 'Send claim emails →'}
                </button>
                <p className="text-xs text-gray-400 mt-3 text-center">
                  Only sends to pros where email_sent = false
                </p>
              </div>
            </div>
          )}


          {/* ── CATEGORIES ── */}
          {section === 'categories' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-6">Trade Categories</h1>

              {/* Add new */}
              <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Add new category</div>
                <div className="flex gap-3">
                  <input value={newCatName} onChange={e => { setNewCatName(e.target.value); setNewCatSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')) }}
                    placeholder="Category name" className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400" />
                  <input value={newCatSlug} onChange={e => setNewCatSlug(e.target.value)}
                    placeholder="slug" className="w-48 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 font-mono" />
                  <button onClick={async () => {
                    if (!newCatName || !newCatSlug) return
                    const r = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_name: newCatName, slug: newCatSlug }) })
                    if (r.ok) { setNewCatName(''); setNewCatSlug(''); fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || [])); showToast('Category added ✓') }
                  }} className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors whitespace-nowrap">
                    + Add
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-stone-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  <div className="col-span-4">Name</div><div className="col-span-3">Slug</div><div className="col-span-2">Status</div><div className="col-span-3">Actions</div>
                </div>
                {cats.map(cat => (
                  <div key={cat.id} className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-gray-50 last:border-0 items-center">
                    <div className="col-span-4">
                      {editCatId === cat.id ? (
                        <input value={editCatName} onChange={e => setEditCatName(e.target.value)} autoFocus
                          className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-sm focus:outline-none" />
                      ) : (
                        <span className="text-sm font-medium text-gray-900">{cat.category_name}</span>
                      )}
                    </div>
                    <div className="col-span-3 font-mono text-xs text-gray-500">{cat.slug}</div>
                    <div className="col-span-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cat.is_active !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {cat.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="col-span-3 flex gap-2">
                      {editCatId === cat.id ? (
                        <>
                          <button onClick={async () => {
                            await fetch('/api/categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cat.id, category_name: editCatName }) })
                            setEditCatId(null); fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || [])); showToast('Saved ✓')
                          }} className="px-3 py-1 text-xs bg-teal-600 text-white rounded-lg">Save</button>
                          <button onClick={() => setEditCatId(null)} className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-500">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditCatId(cat.id); setEditCatName(cat.category_name) }} className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-teal-300 hover:text-teal-600">Edit</button>
                          <button onClick={async () => {
                            const active = cat.is_active !== false
                            await fetch('/api/categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cat.id, is_active: !active }) })
                            fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || []))
                          }} className={`px-3 py-1 text-xs border rounded-lg ${cat.is_active !== false ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                            {cat.is_active !== false ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CRON & OUTREACH ── */}
          {section === 'cron' && (
            <div>
              <h1 className="font-serif text-2xl text-white mb-2">Cron & Outreach</h1>
              <p className="text-gray-400 text-sm mb-6">Preview what would be sent before triggering any emails. Vercel schedule is disabled until launch.</p>

              {/* License expiry alerts */}
              <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-5">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">License expiry alerts</div>
                <p className="text-sm text-gray-500 mb-4">Checks all claimed pros for expiring/expired licenses, OSHA cards. Dry-run shows what would be sent — no emails fired.</p>
                <div className="flex gap-3 mb-4">
                  <button onClick={async () => {
                    setCronLoading(true); setCronResult(null)
                    const r = await fetch('/api/cron/license-check?dry_run=true', { headers: { 'authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_PREVIEW || 'preview'}` } })
                    const d = await r.json(); setCronResult({ type: 'license', ...d }); setCronLoading(false)
                  }} disabled={cronLoading} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-teal-300 hover:text-teal-600 disabled:opacity-50">
                    {cronLoading ? 'Running...' : '🔍 Preview license alerts'}
                  </button>
                  <button onClick={async () => {
                    if (!confirm('This will send real emails. Continue?')) return
                    setCronSending(true)
                    const r = await fetch('/api/cron/license-check', { headers: { 'authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_PREVIEW || 'preview'}` } })
                    const d = await r.json(); setCronResult({ type: 'license', ...d }); setCronSending(false); showToast(`Sent ${d.emailsSent || 0} emails`)
                  }} disabled={cronSending} className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50">
                    {cronSending ? 'Sending...' : '📧 Send alerts now'}
                  </button>
                </div>
                {cronResult?.type === 'license' && (
                  <div className="bg-stone-50 border border-gray-100 rounded-xl p-4 text-sm">
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="text-center"><div className="text-xl font-semibold text-amber-600">{cronResult.expiring || 0}</div><div className="text-sm text-gray-400">Expiring (30d)</div></div>
                      <div className="text-center"><div className="text-xl font-semibold text-red-600">{cronResult.expired || 0}</div><div className="text-sm text-gray-400">Expired</div></div>
                      <div className="text-center"><div className="text-xl font-semibold text-teal-600">{cronResult.emailsSent ?? (cronResult.wouldSend || 0)}</div><div className="text-sm text-gray-400">{cronResult.emailsSent !== undefined ? 'Emails sent' : 'Would send'}</div></div>
                    </div>
                    {cronResult.preview && cronResult.preview.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Would send to:</div>
                        {cronResult.preview.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                            <span className="text-sm text-gray-800">{p.full_name}</span>
                            <span className="text-xs text-gray-500">{p.email}</span>
                            <span className={`text-xs font-semibold ${p.daysLeft <= 7 ? 'text-red-600' : p.daysLeft <= 14 ? 'text-amber-600' : 'text-gray-500'}`}>{p.daysLeft}d left — {p.alert}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Claim outreach */}
              <div className="bg-white border border-gray-100 rounded-2xl p-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Claim outreach campaign</div>
                <p className="text-sm text-gray-500 mb-4">Emails unclaimed pros with real email addresses to claim their free profile. One-time per pro — won't re-send.</p>
                <div className="flex gap-3 mb-4">
                  <button onClick={async () => {
                    setCronLoading(true); setCronResult(null)
                    const r = await fetch('/api/cron/claim-outreach?dry_run=true', { headers: { 'authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_PREVIEW || 'preview'}` } })
                    const d = await r.json(); setCronResult({ type: 'claim', ...d }); setCronLoading(false)
                  }} disabled={cronLoading} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-teal-300 hover:text-teal-600 disabled:opacity-50">
                    {cronLoading ? 'Running...' : '🔍 Preview claim outreach'}
                  </button>
                  <button onClick={async () => {
                    if (!confirm('This will send real emails to unclaimed pros. Continue?')) return
                    setCronSending(true)
                    const r = await fetch('/api/cron/claim-outreach', { headers: { 'authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_PREVIEW || 'preview'}` } })
                    const d = await r.json(); setCronResult({ type: 'claim', ...d }); setCronSending(false); showToast(`Sent ${d.emailsSent || 0} claim emails`)
                  }} disabled={cronSending} className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50">
                    {cronSending ? 'Sending...' : '📧 Send claim emails'}
                  </button>
                </div>
                {cronResult?.type === 'claim' && (
                  <div className="bg-stone-50 border border-gray-100 rounded-xl p-4 text-sm">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-center"><div className="text-xl font-semibold text-teal-600">{cronResult.eligible || 0}</div><div className="text-sm text-gray-400">Eligible pros</div></div>
                      <div className="text-center"><div className="text-xl font-semibold text-teal-600">{(cronResult.emailsSent ?? cronResult.wouldSend) || 0}</div><div className="text-sm text-gray-400">{cronResult.emailsSent !== undefined ? 'Sent' : 'Would send'}</div></div>
                    </div>
                    {cronResult.sample && cronResult.sample.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Sample:</div>
                        {cronResult.sample.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                            <span className="text-sm text-gray-800">{p.full_name}</span>
                            <span className="text-xs text-gray-500">{p.trade} · {p.city}</span>
                            <span className="text-sm text-gray-400">{p.email}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
