'use client'

// /dashboard/settings/team
// Owner: sees member list + invite link generator + remove buttons.
// Member: sees member list (read-only).

import { useState, useEffect, useCallback } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { apiFetch } from '@/lib/api-fetch'
import { theme } from '@/lib/tokens'

type Member = {
  id: string
  role: 'owner' | 'member'
  joined_at: string
  pro: {
    id: string
    full_name: string
    email: string
    profile_photo_url: string | null
    is_verified: boolean
    trade_slug: string | null
  }
}

type Invite = {
  id: string
  token: string
  invite_url: string
  expires_at: string
  created_at: string
}

export default function TeamPage() {
  const { session } = useProSession()
  const dk = typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  const t = theme(dk)

  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  // Company profile editing
  const [companyName, setCompanyName] = useState('')
  const [companyBusinessName, setCompanyBusinessName] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyState, setCompanyState] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileErr, setProfileErr] = useState('')

  const isOwner = members.find(m => m.pro.id === session?.id)?.role === 'owner'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [membersData, profileData] = await Promise.all([
        apiFetch('/api/company/members') as any,
        apiFetch('/api/company/profile') as any,
      ])
      if (membersData?.members) setMembers(membersData.members)
      if (membersData?.invites) setInvites(membersData.invites)
      if (profileData?.company) {
        const c = profileData.company
        setCompanyName(c.name ?? '')
        setCompanyBusinessName(c.business_name ?? '')
        setCompanyCity(c.city ?? '')
        setCompanyState(c.state ?? '')
        setCompanyPhone(c.phone_cell ?? '')
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function generateInvite() {
    setInviting(true)
    setErr('')
    try {
      const data = await apiFetch('/api/company/invite', { method: 'POST', body: JSON.stringify({}) }) as any
      if (data?.invite_url) {
        await navigator.clipboard.writeText(data.invite_url).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
        await load()
      } else {
        setErr(data?.error ?? 'Could not generate invite link')
      }
    } catch {
      setErr('Something went wrong')
    } finally {
      setInviting(false)
    }
  }

  async function saveProfile() {
    setSavingProfile(true)
    setProfileErr('')
    try {
      const data = await apiFetch('/api/company/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name:          companyName.trim() || undefined,
          business_name: companyBusinessName.trim() || null,
          city:          companyCity.trim() || null,
          state:         companyState.trim() || null,
          phone_cell:    companyPhone.trim() || null,
        }),
      }) as any
      if (data?.company) {
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 3000)
      } else {
        setProfileErr(data?.error ?? 'Could not save')
      }
    } catch {
      setProfileErr('Something went wrong')
    } finally {
      setSavingProfile(false)
    }
  }

  async function copyInviteUrl(url: string) {
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function revokeInvite(token: string) {
    await apiFetch(`/api/company/invite?token=${token}`, { method: 'DELETE' })
    await load()
  }

  async function removeMember(membershipId: string) {
    setRemoveId(membershipId)
    try {
      const data = await apiFetch(`/api/company/members/${membershipId}`, { method: 'DELETE' }) as any
      if (data?.ok) await load()
      else setErr(data?.error ?? 'Could not remove member')
    } catch {
      setErr('Something went wrong')
    } finally {
      setRemoveId(null)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const s = {
    page:    { padding: '24px 20px', maxWidth: 700 } as React.CSSProperties,
    h1:      { fontSize: 20, fontWeight: 700, color: t.textPri, marginBottom: 4 } as React.CSSProperties,
    sub:     { fontSize: 13, color: t.textMuted, marginBottom: 28 } as React.CSSProperties,
    section: { marginBottom: 32 } as React.CSSProperties,
    sHead:   { fontSize: 13, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12 },
    card:    { background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 10, overflow: 'hidden' } as React.CSSProperties,
    row:     { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${t.cardBorder}` } as React.CSSProperties,
    avatar:  { width: 36, height: 36, borderRadius: '50%', background: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 } as React.CSSProperties,
    name:    { fontSize: 14, fontWeight: 600, color: t.textPri } as React.CSSProperties,
    email:   { fontSize: 12, color: t.textMuted } as React.CSSProperties,
    badge:   (role: string): React.CSSProperties => ({
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: role === 'owner' ? (dk ? '#164E63' : '#E0F2FE') : (dk ? '#1E3A2F' : '#DCFCE7'),
      color: role === 'owner' ? (dk ? '#7DD3FC' : '#0369A1') : (dk ? '#86EFAC' : '#15803D'),
    }),
    inviteBox: {
      background: dk ? '#1A2130' : '#F0FDF9',
      border: `1px solid ${dk ? '#2D3A4A' : '#99F6E4'}`,
      borderRadius: 10,
      padding: '16px',
    } as React.CSSProperties,
    inviteUrl: {
      fontSize: 12, color: t.textMuted, wordBreak: 'break-all' as const,
      background: dk ? '#0F172A' : '#F8F8F7', borderRadius: 6,
      padding: '8px 10px', marginTop: 8, marginBottom: 12, fontFamily: 'monospace',
    } as React.CSSProperties,
    btn:  (variant: 'primary'|'ghost'|'danger'): React.CSSProperties => ({
      padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', border: 'none',
      background: variant === 'primary' ? '#0d9488' : variant === 'danger' ? 'transparent' : 'transparent',
      color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#DC2626' : t.textMuted,
      textDecoration: variant === 'ghost' || variant === 'danger' ? 'underline' : 'none',
    }),
    err: { fontSize: 13, color: '#DC2626', marginTop: 8 } as React.CSSProperties,
    inp: { width: '100%', padding: '10px 12px', borderRadius: 7, border: `1px solid ${t.cardBorder}`,
           background: dk ? '#0F172A' : '#FFFFFF', color: t.textPri, fontSize: 14,
           outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  }

  if (!session) return null

  return (
    <DashboardShell session={session}>
      <div style={s.page}>
        <div style={s.h1}>Team</div>
        <div style={s.sub}>{session.company_name ?? 'Your company'}</div>

        {err && <div style={s.err}>{err}</div>}

        {/* ── Invite link section (owner only) ── */}
        {isOwner && (
          <div style={s.section}>
            <div style={s.sHead}>Invite link</div>
            <div style={s.inviteBox}>
              <div style={{ fontSize: 13, color: t.textBody, marginBottom: 8 }}>
                Share this link with anyone you want to add to your team. Each link expires in 7 days.
              </div>

              {invites.length > 0 ? (
                <>
                  {invites.slice(0, 1).map(inv => (
                    <div key={inv.id}>
                      <div style={s.inviteUrl}>{inv.invite_url}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                        <button onClick={() => copyInviteUrl(inv.invite_url)} style={s.btn('primary')}>
                          {copied ? '✓ Copied!' : 'Copy link'}
                        </button>
                        <button onClick={() => revokeInvite(inv.token)} style={s.btn('danger')}>
                          Revoke
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 6 }}>
                        Expires {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <button onClick={generateInvite} disabled={inviting} style={s.btn('primary')}>
                  {inviting ? 'Generating…' : 'Generate invite link'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Company profile (owner only) ── */}
        {isOwner && (
          <div style={s.section}>
            <div style={s.sHead}>Company profile</div>
            <div style={{ ...s.card, padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>COMPANY NAME</div>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Your company name" style={s.inp} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>BUSINESS NAME (DBA)</div>
                  <input value={companyBusinessName} onChange={e => setCompanyBusinessName(e.target.value)}
                    placeholder="Trading name (if different)" style={s.inp} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>CITY</div>
                  <input value={companyCity} onChange={e => setCompanyCity(e.target.value)}
                    placeholder="City" style={s.inp} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>STATE</div>
                  <input value={companyState} onChange={e => setCompanyState(e.target.value)}
                    placeholder="State" style={s.inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>BUSINESS PHONE</div>
                  <input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)}
                    placeholder="(555) 000-0000" style={s.inp} type="tel" />
                </div>
              </div>
              {profileErr && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{profileErr}</div>}
              <button onClick={saveProfile} disabled={savingProfile} style={s.btn('primary')}>
                {savingProfile ? 'Saving…' : profileSaved ? '✓ Saved' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Member list ── */}
        <div style={s.section}>
          <div style={s.sHead}>Members ({members.length})</div>
          {loading ? (
            <div style={{ fontSize: 13, color: t.textMuted, padding: '20px 0' }}>Loading…</div>
          ) : (
            <div style={s.card}>
              {members.map((m, i) => {
                const initials = m.pro.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const isMe = m.pro.id === session.id
                const isLast = i === members.length - 1
                return (
                  <div key={m.id} style={{ ...s.row, borderBottom: isLast ? 'none' : `1px solid ${t.cardBorder}` }}>
                    {m.pro.profile_photo_url ? (
                      <img src={m.pro.profile_photo_url} alt="" style={{ ...s.avatar, objectFit: 'cover' }} />
                    ) : (
                      <div style={s.avatar}>{initials}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.name}>{m.pro.full_name}{isMe && <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 6 }}>(you)</span>}</div>
                      <div style={s.email}>{m.pro.email}</div>
                    </div>
                    <span style={s.badge(m.role)}>{m.role}</span>
                    {isOwner && !isMe && (
                      <button
                        onClick={() => removeMember(m.id)}
                        disabled={removeId === m.id}
                        style={s.btn('danger')}
                      >
                        {removeId === m.id ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
