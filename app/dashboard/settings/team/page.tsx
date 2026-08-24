'use client'

// /dashboard/settings/team
// Owner: company profile + invite link + member list with remove.
// Member: read-only member list.

import { useState, useEffect, useCallback } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { apiFetch } from '@/lib/api-fetch'
import { theme } from '@/lib/tokens'

type Pro = {
  id: string
  full_name: string
  email: string
  profile_photo_url: string | null
  is_verified: boolean
  trade_slug: string | null
}

type Member = {
  id: string
  role: 'owner' | 'member'
  joined_at: string
  pro: Pro | null
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
  const [loadErr, setLoadErr] = useState('')

  // Company profile
  const [companyName, setCompanyName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [city, setCity] = useState('')
  const [companyState, setCompanyState] = useState('')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileErr, setProfileErr] = useState('')

  // Invite
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inviteErr, setInviteErr] = useState('')

  // Remove
  const [removingId, setRemovingId] = useState<string | null>(null)

  const myProId = session?.id ?? null
  // isOwner: check by pro id match OR by email match as fallback
  const myEmail = session?.email ?? null
  const isOwner = members.some(m =>
    m.role === 'owner' && (
      (myProId && m.pro?.id === myProId) ||
      (myEmail && m.pro?.email === myEmail)
    )
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const [md, pd] = await Promise.all([
        apiFetch('/api/company/members') as any,
        apiFetch('/api/company/profile').catch(() => null) as any,
      ])
      if (md?.error) {
        setLoadErr(md.error)
      } else {
        setMembers(md?.members ?? [])
        setInvites(md?.invites ?? [])
      }
      if (pd?.company) {
        const c = pd.company
        setCompanyName(c.name ?? '')
        setBusinessName(c.business_name ?? '')
        setCity(c.city ?? '')
        setCompanyState(c.state ?? '')
        setPhone(c.phone_cell ?? '')
      }
    } catch (e: any) {
      setLoadErr(e?.message ?? 'Could not load team')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveProfile() {
    setSavingProfile(true)
    setProfileErr('')
    try {
      const d = await apiFetch('/api/company/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name:          companyName.trim() || undefined,
          business_name: businessName.trim() || null,
          city:          city.trim() || null,
          state:         companyState.trim() || null,
          phone_cell:    phone.trim() || null,
        }),
      }) as any
      if (d?.company) { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 3000) }
      else setProfileErr(d?.error ?? 'Could not save')
    } catch { setProfileErr('Something went wrong') }
    finally { setSavingProfile(false) }
  }

  async function generateInvite() {
    setInviting(true)
    setInviteErr('')
    try {
      const d = await apiFetch('/api/company/invite', { method: 'POST', body: JSON.stringify({}) }) as any
      if (d?.invite_url) {
        await navigator.clipboard.writeText(d.invite_url).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
        await load()
      } else setInviteErr(d?.error ?? 'Could not generate invite')
    } catch { setInviteErr('Something went wrong') }
    finally { setInviting(false) }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function revokeInvite(token: string) {
    await apiFetch(`/api/company/invite?token=${token}`, { method: 'DELETE' })
    await load()
  }

  async function removeMember(membershipId: string, name: string) {
    if (!confirm(`Remove ${name} from your team? They will lose access to company data.`)) return
    setRemovingId(membershipId)
    try {
      const d = await apiFetch(`/api/company/members/${membershipId}`, { method: 'DELETE' }) as any
      if (d?.ok) await load()
      else setLoadErr(d?.error ?? 'Could not remove member')
    } catch { setLoadErr('Something went wrong') }
    finally { setRemovingId(null) }
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
    borderRadius: 10, overflow: 'hidden',
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    border: `1px solid ${t.cardBorder}`, background: dk ? '#0F172A' : '#fff',
    color: t.textPri, fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: t.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block',
  }
  const tealBtn = (disabled = false): React.CSSProperties => ({
    padding: '9px 18px', borderRadius: 7, border: 'none',
    background: disabled ? '#6B7280' : '#0d9488', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  })
  const sectionHead: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: t.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
  }
  const divRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 16px', borderBottom: `1px solid ${t.cardBorder}`,
  }

  function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
    const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0d9488',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {photoUrl
          ? <img src={photoUrl} alt={name} style={{ width: 36, height: 36, objectFit: 'cover' }} />
          : <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{initials}</span>}
      </div>
    )
  }

  function RoleBadge({ role }: { role: string }) {
    const isOwnerRole = role === 'owner'
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
        background: isOwnerRole ? (dk ? '#1E3A5F' : '#DBEAFE') : (dk ? '#1E3A2F' : '#DCFCE7'),
        color: isOwnerRole ? (dk ? '#93C5FD' : '#1D4ED8') : (dk ? '#86EFAC' : '#15803D'),
      }}>{role}</span>
    )
  }

  if (!session) return null

  return (
    <DashboardShell session={session}>
      <div style={{ padding: '28px 24px', maxWidth: 680 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: t.textPri, marginBottom: 2 }}>Team</div>
          <div style={{ fontSize: 13, color: t.textMuted }}>{session.company_name ?? (companyName || 'Your company')}</div>
        </div>

        {loadErr && (
          <div style={{ background: dk ? '#2D1B1B' : '#FEF2F2', border: '1px solid #FCA5A5',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 20 }}>
            {loadErr}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 14, color: t.textMuted, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        ) : (
          <>
            {/* ── Company profile (owner only) ── */}
            {isOwner && (
              <div style={{ marginBottom: 28 }}>
                <div style={sectionHead}>Company profile</div>
                <div style={{ ...card, padding: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={label}>Company name</label>
                      <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" style={inp} />
                    </div>
                    <div>
                      <label style={label}>DBA / Business name</label>
                      <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Trading name (optional)" style={inp} />
                    </div>
                    <div>
                      <label style={label}>City</label>
                      <input value={city} onChange={e => setCity(e.target.value)} placeholder="City" style={inp} />
                    </div>
                    <div>
                      <label style={label}>State</label>
                      <input value={companyState} onChange={e => setCompanyState(e.target.value)} placeholder="FL" style={inp} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={label}>Business phone</label>
                      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" style={inp} type="tel" />
                    </div>
                  </div>
                  {profileErr && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>{profileErr}</div>}
                  <button onClick={saveProfile} disabled={savingProfile} style={tealBtn(savingProfile)}>
                    {savingProfile ? 'Saving…' : profileSaved ? '✓ Saved' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Invite link (owner only) ── */}
            {isOwner && (
              <div style={{ marginBottom: 28 }}>
                <div style={sectionHead}>Invite link</div>
                <div style={{ ...card, padding: 18 }}>
                  <div style={{ fontSize: 13, color: t.textBody, lineHeight: 1.6, marginBottom: 14 }}>
                    Share this link to add someone to your team. Links expire in 7 days and are single-use.
                  </div>

                  {invites.length > 0 ? (
                    <>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: t.textMuted, wordBreak: 'break-all',
                        background: dk ? '#0F172A' : '#F8F7F5', borderRadius: 6, padding: '8px 10px',
                        border: `1px solid ${t.cardBorder}`, marginBottom: 12 }}>
                        {invites[0].invite_url}
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => copyUrl(invites[0].invite_url)} style={tealBtn()}>
                          {copied ? '✓ Copied!' : 'Copy link'}
                        </button>
                        <button onClick={() => revokeInvite(invites[0].token)}
                          style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                          Revoke
                        </button>
                        <span style={{ fontSize: 11, color: t.textSubtle }}>
                          Expires {new Date(invites[0].expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      {inviteErr && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{inviteErr}</div>}
                      <button onClick={generateInvite} disabled={inviting} style={tealBtn(inviting)}>
                        {inviting ? 'Generating…' : 'Generate invite link'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Members ── */}
            <div>
              <div style={sectionHead}>Members ({members.length})</div>
              {members.length === 0 ? (
                <div style={{ ...card, padding: '24px 16px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
                  No members found.{isOwner ? ' Generate an invite link above to add your team.' : ''}
                </div>
              ) : (
                <div style={card}>
                  {members.map((m, i) => {
                    const pro = m.pro
                    const isMe = (myProId && pro?.id === myProId) || (myEmail && pro?.email === myEmail)
                    const isLast = i === members.length - 1
                    return (
                      <div key={m.id} style={{ ...divRow, borderBottom: isLast ? 'none' : `1px solid ${t.cardBorder}` }}>
                        <Avatar name={pro?.full_name ?? '?'}  photoUrl={pro?.profile_photo_url} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>
                              {pro?.full_name ?? '—'}
                            </span>
                            {isMe && <span style={{ fontSize: 11, color: t.textMuted }}>(you)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: t.textMuted }}>{pro?.email ?? ''}</div>
                        </div>
                        <RoleBadge role={m.role} />
                        {isOwner && !isMe && (
                          <button
                            onClick={() => removeMember(m.id, pro?.full_name ?? 'this member')}
                            disabled={removingId === m.id}
                            style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 12,
                              cursor: removingId === m.id ? 'not-allowed' : 'pointer', textDecoration: 'underline', marginLeft: 8 }}>
                            {removingId === m.id ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
