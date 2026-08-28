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
  const [inviteEmail, setInviteEmail] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState('')
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
      const [membRes, profRes] = await Promise.all([
        apiFetch('/api/company/members'),
        apiFetch('/api/company/profile').catch(() => null),
      ])
      const md = membRes ? await membRes.json() : null
      const pd = profRes ? await profRes.json().catch(() => null) : null
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
      } else if (session) {
        // Fallback: pre-populate from session (e.g. fresh signup before cache refresh)
        setCompanyName(session.company_name ?? '')
      }
    } catch (e: any) {
      setLoadErr(e?.message ?? 'Could not load team')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { load() }, [load])

  async function saveProfile() {
    setSavingProfile(true)
    setProfileErr('')
    try {
      const res = await apiFetch('/api/company/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name:          companyName.trim() || undefined,
          business_name: businessName.trim() || null,
          city:          city.trim() || null,
          state:         companyState.trim() || null,
          phone_cell:    phone.trim() || null,
        }),
      })
      const d = await res.json().catch(() => null)
      if (d?.company) { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 3000) }
      else setProfileErr(d?.error ?? 'Could not save')
    } catch { setProfileErr('Something went wrong') }
    finally { setSavingProfile(false) }
  }

  async function generateInvite() {
    setInviting(true)
    setInviteErr('')
    try {
      const invRes = await apiFetch('/api/company/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim() || undefined }),
      })
      const d = await invRes.json().catch(() => null)
      if (d?.invite_url) {
        setGeneratedUrl(d.invite_url)
        await load()  // refresh invites list
      } else {
        setInviteErr(d?.error ?? 'Could not generate invite link')
      }
    } catch { setInviteErr('Something went wrong') }
    finally { setInviting(false) }
  }

  async function copyToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select a temp input
      const el = document.createElement('input')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  async function copyUrl(url: string) {
    await copyToClipboard(url)
  }

  async function revokeInvite(token: string) {
    await apiFetch(`/api/company/invite?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
    await load()
  }

  async function removeMember(membershipId: string, name: string) {
    if (!confirm(`Remove ${name} from your team? They will lose access to company data.`)) return
    setRemovingId(membershipId)
    try {
      const rmRes = await apiFetch(`/api/company/members/${membershipId}`, { method: 'DELETE' })
      const d = await rmRes.json().catch(() => null)
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
    const src = photoUrl ? `${photoUrl}?v=${Math.floor(Date.now()/60000)}` : null
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0d9488',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {src
          ? <img src={src} alt={name} style={{ width: 36, height: 36, objectFit: 'cover' }} />
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
                <div style={sectionHead}>Invite to team</div>
                <div style={{ ...card, padding: 18 }}>
                  <div style={{ fontSize: 13, color: t.textBody, lineHeight: 1.6, marginBottom: 16 }}>
                    Enter an email address to send an invite, or generate a link to share manually.
                    Links expire in 7 days.
                  </div>

                  {/* Email input */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@example.com (optional)"
                      style={{ ...inp, flex: 1, minWidth: 200 }}
                    />
                    <button onClick={generateInvite} disabled={inviting} style={tealBtn(inviting)}>
                      {inviting ? 'Generating…' : inviteEmail.trim() ? 'Send invite' : 'Generate link'}
                    </button>
                  </div>

                  {inviteErr && (
                    <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{inviteErr}</div>
                  )}

                  {/* Show active invite link */}
                  {(invites.length > 0 || generatedUrl) && (() => {
                    const activeUrl = invites[0]?.invite_url ?? generatedUrl
                    const activeToken = invites[0]?.token ?? ''
                    const expiresAt = invites[0]?.expires_at
                    return (
                      <div style={{ background: dk ? '#0F172A' : '#F0FDF9', border: `1px solid ${dk ? '#2D3A4A' : '#99F6E4'}`,
                        borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#0d9488', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Active invite link
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: t.textMuted,
                          wordBreak: 'break-all', marginBottom: 12, lineHeight: 1.5 }}>
                          {activeUrl}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button onClick={() => copyUrl(activeUrl)} style={tealBtn()}>
                            {copied ? '✓ Copied!' : 'Copy link'}
                          </button>
                          {activeToken && (
                            <button onClick={() => revokeInvite(activeToken)}
                              style={{ background: 'none', border: 'none', color: '#DC2626',
                                fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                              Revoke
                            </button>
                          )}
                          {expiresAt && (
                            <span style={{ fontSize: 11, color: t.textSubtle }}>
                              Expires {new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })()}
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
