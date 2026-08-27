'use client'
// Notification bell — shown in the top nav.
// Fetches /api/notifications, shows unread badge, opens a dropdown drawer.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { theme } from '@/lib/tokens'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  lead_id: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function typeIcon(type: string) {
  switch (type) {
    case 'lead_assigned':    return '👤'
    case 'job_won':          return '🏆'
    case 'estimate_approved':return '✅'
    case 'new_lead_created': return '📋'
    default:                 return '🔔'
  }
}

export default function NotificationBell({ dk = false }: { dk?: boolean }) {
  const t = theme(dk)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/notifications')
      const d = await r.json()
      setNotifications(d.notifications ?? [])
      setUnread(d.unreadCount ?? 0)
    } catch {}
  }, [])

  useEffect(() => {
    load()
    // Poll every 60 seconds
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleOpen() {
    setOpen(o => !o)
    if (!open && unread > 0) {
      // Mark all as read
      try {
        await apiFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) })
        setUnread(0)
        setNotifications(ns => ns.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
      } catch {}
    }
  }

  function handleClick(n: Notification) {
    setOpen(false)
    if (n.lead_id) router.push(`/dashboard/pipeline/${n.lead_id}`)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button onClick={handleOpen} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        position: 'relative', padding: '6px', borderRadius: 8,
        color: t.textMuted, display: 'flex', alignItems: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#EF4444', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 20,
            minWidth: 14, height: 14, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: t.cardBg, border: `1px solid ${t.cardBorder}`,
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 1000,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${t.cardBorder}`,
            fontSize: 13, fontWeight: 700, color: t.textPri,
          }}>
            Notifications
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: t.textMuted }}>
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${t.cardBorder}`,
                  cursor: n.lead_id ? 'pointer' : 'default',
                  background: !n.read_at ? (dk ? 'rgba(13,148,136,0.08)' : 'rgba(13,148,136,0.05)') : 'transparent',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  transition: 'background 0.15s',
                }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{typeIcon(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read_at ? 400 : 600, color: t.textPri, lineHeight: 1.4 }}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.body}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 4 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                {!n.read_at && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%',
                    background: '#0d9488', flexShrink: 0, marginTop: 5 }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
