'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminSetupPage() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [admins, setAdmins]   = useState<any[]>([])
  const [email, setEmail]     = useState('')
  const [adding, setAdding]   = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [msg, setMsg]         = useState('')
  const [error, setError]     = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/admin-login'); return }
    const s = JSON.parse(raw)
    setSession(s)
    loadAdmins(s.id)
  }, [])

  async function loadAdmins(proId: string) {
    const r = await fetch('/api/admin/admins', { headers: { 'x-pro-id': proId } })
    if (r.status === 403) { setAccessDenied(true); setLoading(false); return }
    const d = await r.json()
    setAdmins(d.admins || [])
    setLoading(false)
  }

  async function addAdmin() {
    if (!email.trim() || !session) return
    setAdding(true); setMsg(''); setError('')
    const r = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pro-id': session.id },
      body: JSON.stringify({ email: email.trim(), grant: true }),
    })
    const d = await r.json()
    setAdding(false)
    if (r.ok) { setMsg(`✓ Admin access granted to ${email}`); setEmail(''); loadAdmins(session.id) }
    else setError(d.error || 'Could not grant admin access')
  }

  async function removeAdmin(proId: string, name: string) {
    if (!session || !confirm(`Remove admin access from ${name}?`)) return
    setRemoving(proId)
    await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pro-id': session.id },
      body: JSON.stringify({ pro_id: proId, grant: false }),
    })
    setRemoving(null)
    loadAdmins(session.id)
  }

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
        <p className="text-gray-400 text-sm mb-7">Only existing admins can manage admin accounts.</p>
        <a href="/dashboard" className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">← Back to dashboard</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-teal-400 transition-colors">← Admin panel</Link>
            <h1 className="font-serif text-2xl text-white mt-2">Admin management</h1>
            <p className="text-gray-400 text-sm mt-1">Grant or revoke admin access by email address</p>
          </div>
        </div>

        {/* Add admin */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 mb-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Grant admin access</div>
          {msg && <div className="mb-4 p-3 bg-teal-900/50 border border-teal-700 text-teal-300 text-sm rounded-xl">{msg}</div>}
          {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl">{error}</div>}
          <p className="text-sm text-gray-400 mb-4 leading-relaxed">
            Enter the email address of a registered ProGuild.ai pro account.
            They must already have a pro account before being granted admin access.
          </p>
          <div className="flex gap-3">
            <input value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addAdmin()}
              placeholder="email@example.com"
              className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500" />
            <button onClick={addAdmin} disabled={adding || !email.trim()}
              className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {adding ? 'Granting...' : 'Grant access'}
            </button>
          </div>
        </div>

        {/* Current admins */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-7 py-4 border-b border-gray-800">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Current admins ({admins.length})</div>
          </div>
          {loading ? (
            <div className="p-6 text-gray-500 text-sm text-center">Loading...</div>
          ) : admins.length === 0 ? (
            <div className="p-6 text-gray-500 text-sm text-center">No admins found</div>
          ) : admins.map(admin => (
            <div key={admin.id} className="flex items-center justify-between px-7 py-4 border-b border-gray-800 last:border-0">
              <div>
                <div className="text-sm font-medium text-white">{admin.full_name}</div>
                <div className="text-sm text-gray-400">{admin.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-2 py-0.5 bg-teal-900/50 text-teal-400 rounded-full border border-teal-800">Admin</span>
                {admin.id !== session?.id && (
                  <button onClick={() => removeAdmin(admin.id, admin.full_name)}
                    disabled={removing === admin.id}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-50">
                    {removing === admin.id ? 'Removing...' : 'Revoke'}
                  </button>
                )}
                {admin.id === session?.id && (
                  <span className="text-xs text-gray-600">(you)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
