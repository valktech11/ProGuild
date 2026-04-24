'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Session } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

function Avatar({ name, photo, size = 10 }: { name: string; photo?: string | null; size?: number }) {
  const [bg, fg] = avatarColor(name)
  const px = size * 4
  if (photo) return <img src={photo} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: px, height: px }} />
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

  const [session, setSession]   = useState<Session | null>(null)
  const [threads, setThreads]   = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [activeWith, setActiveWith] = useState<any>(null)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [loading, setLoading]   = useState(true)

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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

      {/* NAV */}
      <nav className="bg-white border-b sticky top-0 z-50 px-6 h-14 flex items-center justify-between"
        style={{ borderColor: '#E5E0D8' }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#mg)"/>
              <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
              <defs><linearGradient id="mg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
                <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/>
              </linearGradient></defs></svg>
            </div>
            <span className="font-bold text-sm" style={{ color: '#1C1917' }}>
              ProGuild<span style={{ color: '#0F766E', fontWeight: 300 }}>.ai</span>
            </span>
          </Link>
          <Link href="/dashboard" className="text-sm transition-colors" style={{ color: '#A89F93' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#1C1917')}
            onMouseLeave={e => (e.currentTarget.style.color = '#A89F93')}>
            ← Dashboard
          </Link>
        </div>
        <div className="text-sm font-medium" style={{ color: '#6B7280' }}>{session.name}</div>
      </nav>

      <div className="flex-1 flex max-w-6xl mx-auto w-full">

        {/* Thread list */}
        <div className="w-72 bg-white border-r flex flex-col flex-shrink-0" style={{ borderColor: '#E5E0D8' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#E5E0D8' }}>
            <h1 className="font-bold text-base" style={{ color: '#1C1917', fontFamily: "'DM Serif Display', serif" }}>
              Messages
            </h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: '#FAF9F6' }} />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-2/3 rounded" style={{ background: '#FAF9F6' }} />
                      <div className="h-3 w-1/2 rounded" style={{ background: '#FAF9F6' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="text-3xl mb-2 opacity-20">💬</div>
                <div className="text-sm font-semibold mb-1" style={{ color: '#1C1917' }}>No messages yet</div>
                <div className="text-xs mb-4" style={{ color: '#A89F93' }}>
                  Start a conversation from a pro's profile.
                </div>
                <Link href="/search" className="text-xs font-semibold transition-colors" style={{ color: '#0F766E' }}>
                  Find a pro →
                </Link>
              </div>
            ) : threads.map(thread => (
              <Link key={thread.otherId} href={`/messages?with=${thread.otherId}`}
                className="flex items-center gap-3 px-4 py-3 border-b transition-colors"
                style={{
                  borderColor: '#F5F0ED',
                  background: withId === thread.otherId ? 'rgba(13,148,136,0.06)' : 'transparent',
                  borderLeft: withId === thread.otherId ? '2px solid #0F766E' : '2px solid transparent',
                }}>
                <Avatar name={thread.lastMsg?.sender?.full_name || 'Pro'} photo={thread.lastMsg?.sender?.profile_photo_url} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: '#1C1917' }}>
                    {thread.lastMsg?.sender?.full_name || 'Pro'}
                  </div>
                  <div className="text-xs truncate" style={{ color: '#A89F93' }}>
                    {thread.lastMsg?.content}
                  </div>
                </div>
                {thread.unread > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                    {thread.unread > 9 ? '9+' : thread.unread}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {!withId ? (
            <div className="flex-1 flex items-center justify-center">
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
              <div className="bg-white border-b px-6 py-3 flex items-center gap-3" style={{ borderColor: '#E5E0D8' }}>
                {activeWith && (
                  <>
                    <Avatar name={activeWith.full_name} photo={activeWith.profile_photo_url} />
                    <div>
                      <Link href={`/pro/${withId}`}
                        className="text-sm font-bold transition-colors"
                        style={{ color: '#1C1917' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#1C1917')}>
                        {activeWith.full_name}
                      </Link>
                      <div className="text-xs" style={{ color: '#A89F93' }}>
                        {activeWith.trade_category?.category_name || activeWith.city || ''}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: '#A89F93' }}>
                    No messages yet — say hello!
                  </div>
                ) : messages.map(msg => {
                  const isMe = msg.sender_id === session.id
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <Avatar
                        name={isMe ? session.name : (activeWith?.full_name || 'Pro')}
                        photo={isMe ? null : activeWith?.profile_photo_url}
                        size={8}
                      />
                      <div className={`max-w-xs lg:max-w-md flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                          style={isMe
                            ? { background: '#0F766E', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                            : { background: '#fff', color: '#1C1917', border: '1px solid #E5E0D8', borderRadius: '18px 18px 18px 4px' }}>
                          {msg.content}
                        </div>
                        <div className="text-xs" style={{ color: '#A89F93' }}>{timeAgo(msg.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="bg-white border-t px-6 py-4" style={{ borderColor: '#E5E0D8' }}>
                <div className="flex gap-3 items-end">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }}}
                    placeholder="Write a message... (Enter to send)"
                    rows={1}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm resize-none outline-none transition-colors"
                    style={{ border: '1px solid #E5E0D8', background: '#FAF9F6', color: '#1C1917' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#0F766E')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D8')}
                  />
                  <button onClick={sendMessage} disabled={sending || !text.trim()}
                    className="px-5 py-2.5 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-40 flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
