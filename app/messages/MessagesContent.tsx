'use client'
import Navbar from '@/components/layout/Navbar'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Session } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

function Avatar({ name, photo, size = 10 }: { name: string; photo?: string | null; size?: number }) {
  const [bg, fg] = avatarColor(name)
  const px = size * 4
  if (photo) return (
    <img src={photo} alt={name} className="rounded-full object-cover flex-shrink-0"
      style={{ width: px, height: px }} />
  )
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0 text-sm"
      style={{ width: px, height: px, background: bg, color: fg }}>
      {initials(name)}
    </div>
  )
}

export default function MessagesContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const withId       = searchParams.get('with')
  const bottomRef    = useRef<HTMLDivElement>(null)

  const [session,    setSession]    = useState<Session | null>(null)
  const [threads,    setThreads]    = useState<any[]>([])
  const [messages,   setMessages]   = useState<any[]>([])
  const [activeWith, setActiveWith] = useState<any>(null)
  const [text,       setText]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [loading,    setLoading]    = useState(true)

  // On mobile, track which panel is visible: 'threads' | 'conversation'
  const [mobileView, setMobileView] = useState<'threads' | 'conversation'>('threads')

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    fetch(`/api/messages?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => { setThreads(d.threads || []); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!withId || !session) return
    // When a thread is selected on mobile, switch to conversation view
    setMobileView('conversation')
    fetch(`/api/messages?pro_id=${session.id}&with_id=${withId}`)
      .then(r => r.json())
      .then(d => {
        setMessages(d.messages || [])
        const other = (d.messages || []).find((m: any) => m.sender_id === withId)?.sender
        if (other) setActiveWith(other)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      })
    fetch(`/api/pros/${withId}`).then(r => r.json()).then(d => { if (d.pro) setActiveWith(d.pro) })
  }, [withId, session])

  async function sendMessage() {
    if (!text.trim() || !session || !withId || sending) return
    setSending(true)
    const r = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: session.id, receiver_id: withId, content: text.trim() }),
    })
    const d = await r.json()
    setSending(false)
    if (r.ok) {
      setMessages(prev => [...prev, d.message])
      setText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  if (!session) return null

  // ── Thread list panel ──────────────────────────────────────────────────────
  const ThreadList = (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#E5E0D8' }}>
        <h1 className="font-bold text-lg" style={{ color: '#1C1917', fontFamily: "'DM Serif Display', serif" }}>
          Messages
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full flex-shrink-0 bg-gray-100" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-2/3 rounded bg-gray-100" />
                  <div className="h-3 w-1/2 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="text-5xl mb-3 opacity-20">💬</div>
            <div className="text-base font-semibold mb-1" style={{ color: '#1C1917' }}>No messages yet</div>
            <div className="text-sm mb-5" style={{ color: '#A89F93' }}>
              Start a conversation from a pro's profile.
            </div>
            <Link href="/search" className="text-sm font-semibold" style={{ color: '#0F766E' }}>
              Find a pro →
            </Link>
          </div>
        ) : threads.map(thread => (
          <Link
            key={thread.otherId}
            href={`/messages?with=${thread.otherId}`}
            className="flex items-center gap-4 px-5 py-4 border-b transition-colors active:bg-gray-50"
            style={{
              borderColor: '#F5F0ED',
              background: withId === thread.otherId ? 'rgba(13,148,136,0.06)' : 'transparent',
              borderLeft: withId === thread.otherId ? '3px solid #0F766E' : '3px solid transparent',
            }}
          >
            <Avatar
              name={thread.lastMsg?.sender?.full_name || 'Pro'}
              photo={thread.lastMsg?.sender?.profile_photo_url}
              size={11}
            />
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold truncate" style={{ color: '#1C1917' }}>
                {thread.lastMsg?.sender?.full_name || 'Pro'}
              </div>
              <div className="text-sm truncate mt-0.5" style={{ color: '#A89F93' }}>
                {thread.lastMsg?.content}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {thread.unread > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {thread.unread > 9 ? '9+' : thread.unread}
                </span>
              )}
              {thread.lastMsg?.created_at && (
                <span className="text-xs" style={{ color: '#C4BCAF' }}>
                  {timeAgo(thread.lastMsg.created_at)}
                </span>
              )}
              {/* Mobile: show chevron to indicate tap */}
              <svg className="md:hidden" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#C4BCAF" strokeWidth="2" strokeLinecap="round">
                <path d="M5 3l4 4-4 4" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )

  // ── Conversation panel ─────────────────────────────────────────────────────
  const ConversationPanel = (
    <div className="flex flex-col h-full bg-white md:bg-transparent">
      {!withId ? (
        // Desktop empty state — hidden on mobile
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-4 opacity-10">💬</div>
            <div className="text-xl font-bold mb-2" style={{ color: '#A89F93', fontFamily: "'DM Serif Display', serif" }}>
              Select a conversation
            </div>
            <div className="text-sm" style={{ color: '#A89F93' }}>
              Choose a thread on the left to start messaging
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Conversation header */}
          <div className="bg-white border-b px-4 md:px-6 py-4 flex items-center gap-3 flex-shrink-0"
            style={{ borderColor: '#E5E0D8' }}>
            {/* Mobile back button */}
            <button
              onClick={() => {
                setMobileView('threads')
                router.push('/messages')
              }}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Back to messages"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#1C1917" strokeWidth="2.5" strokeLinecap="round">
                <path d="M13 4l-6 6 6 6" />
              </svg>
            </button>

            {activeWith && (
              <>
                <Avatar name={activeWith.full_name} photo={activeWith.profile_photo_url} size={10} />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/pro/${withId}`}
                    className="text-base font-bold truncate block"
                    style={{ color: '#1C1917' }}
                  >
                    {activeWith.full_name}
                  </Link>
                  <div className="text-sm truncate" style={{ color: '#A89F93' }}>
                    {activeWith.trade_category?.category_name || activeWith.city || ''}
                  </div>
                </div>
                <Link href={`/pro/${withId}`}
                  className="hidden md:block text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(15,118,110,0.08)', color: '#0F766E' }}>
                  View profile →
                </Link>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-4"
            style={{ background: '#FAF9F6' }}>
            {messages.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: '#A89F93' }}>
                No messages yet — say hello!
              </div>
            ) : messages.map(msg => {
              const isMe = msg.sender_id === session.id
              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <Avatar
                    name={isMe ? session.name : (activeWith?.full_name || 'Pro')}
                    photo={isMe ? null : activeWith?.profile_photo_url}
                    size={9}
                  />
                  <div className={`max-w-[75%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className="px-4 py-3 text-sm leading-relaxed"
                      style={isMe
                        ? { background: '#0F766E', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                        : { background: '#fff', color: '#1C1917', border: '1px solid #E5E0D8', borderRadius: '18px 18px 18px 4px' }
                      }
                    >
                      {msg.content}
                    </div>
                    <div className="text-xs" style={{ color: '#A89F93' }}>{timeAgo(msg.created_at)}</div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Message input — tall enough for thumbs */}
          <div className="bg-white border-t px-4 md:px-6 py-4 flex-shrink-0"
            style={{ borderColor: '#E5E0D8' }}>
            <div className="flex gap-3 items-end">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                }}
                placeholder="Write a message..."
                rows={1}
                className="flex-1 px-4 py-3.5 rounded-2xl text-base resize-none outline-none"
                style={{ border: '1.5px solid #E5E0D8', background: '#FAF9F6', color: '#1C1917', minHeight: 52 }}
                onFocus={e => (e.currentTarget.style.borderColor = '#0F766E')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D8')}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !text.trim()}
                className="flex-shrink-0 flex items-center justify-center text-white font-bold rounded-2xl transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #0F766E, #0C5F57)',
                  minWidth: 52,
                  minHeight: 52,
                  padding: '0 20px',
                }}
              >
                {sending ? (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
                    <circle cx="9" cy="9" r="7" strokeDasharray="20 24" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 2L2 8l5 3 3 5 6-14z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
      <Navbar />
      {/* Mobile: spacer for bottom nav */}
      <div className="h-16 md:hidden" />

      {/* ── MOBILE: single panel, switch between threads and conversation ── */}
      <div className="md:hidden flex-1 flex flex-col" style={{ height: 'calc(100vh - 64px - 64px)' }}>
        {mobileView === 'threads' || !withId ? ThreadList : ConversationPanel}
      </div>

      {/* ── DESKTOP: two-column layout ── */}
      <div className="hidden md:flex flex-1 max-w-6xl mx-auto w-full" style={{ minHeight: 'calc(100vh - 56px)' }}>
        {/* Thread list — fixed width sidebar */}
        <div className="w-80 border-r flex-shrink-0 flex flex-col" style={{ borderColor: '#E5E0D8' }}>
          {ThreadList}
        </div>
        {/* Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {ConversationPanel}
        </div>
      </div>
    </div>
  )
}
