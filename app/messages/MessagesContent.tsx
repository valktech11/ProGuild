'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Session } from '@/types'
import { initials, avatarColor, timeAgo } from '@/lib/utils'

function Avatar({ name, photo, size = 10 }: { name: string; photo?: string | null; size?: number }) {
  const [bg, fg] = avatarColor(name)
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0`
  if (photo) return <img src={photo} alt={name} className={`${cls} object-cover`} />
  return <div className={`${cls} flex items-center justify-center font-serif text-sm`} style={{ background: bg, color: fg }}>{initials(name)}</div>
}

export default function MessagesContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const withId       = searchParams.get('with')
  const bottomRef    = useRef<HTMLDivElement>(null)

  const [session, setSession]       = useState<Session | null>(null)
  const [threads, setThreads]       = useState<any[]>([])
  const [messages, setMessages]     = useState<any[]>([])
  const [activeWith, setActiveWith] = useState<any>(null)
  const [text, setText]             = useState('')
  const [sending, setSending]       = useState(false)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    fetch(`/api/messages?pro_id=${s.id}`)
      .then(r => r.json())
      .then(d => {
        // Use server-computed threads with proper unread counts
        setThreads(d.threads || [])
        setLoading(false)
      })
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
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Dashboard</Link>
        </div>
        <div className="text-sm font-medium text-gray-700">{session.name}</div>
      </nav>

      <div className="flex-1 flex max-w-6xl mx-auto w-full">
        {/* Thread list */}
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1 className="font-serif text-lg text-gray-900">Messages</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1,2,3].map(i => <div key={i} className="flex gap-3"><div className="w-10 h-10 rounded-full animate-shimmer flex-shrink-0" /><div className="flex-1 space-y-1"><div className="h-3 w-2/3 animate-shimmer rounded" /><div className="h-3 w-1/2 animate-shimmer rounded" /></div></div>)}
              </div>
            ) : threads.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="text-3xl mb-2 opacity-20">💬</div>
                <div className="text-sm text-gray-400">No messages yet.</div>
                <div className="text-xs text-gray-400 mt-1">Visit a pro's community profile to start a conversation.</div>
              </div>
            ) : threads.map(thread => (
              <Link key={thread.otherId} href={`/messages?with=${thread.otherId}`}
                className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-stone-50 transition-colors ${withId === thread.otherId ? 'bg-teal-50 border-l-2 border-l-teal-500' : ''}`}>
                <Avatar name={thread.lastMsg?.sender?.full_name || 'Pro'} photo={thread.lastMsg?.sender?.profile_photo_url} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{thread.lastMsg?.sender?.full_name || 'Pro'}</div>
                  <div className="text-xs text-gray-400 truncate">{thread.lastMsg?.content}</div>
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
        <div className="flex-1 flex flex-col">
          {!withId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-10">💬</div>
                <div className="font-serif text-xl text-gray-400">Select a conversation</div>
                <div className="text-sm text-gray-400 mt-2">Or visit a pro's community profile to start one</div>
                <Link href="/community" className="mt-4 inline-block text-sm text-teal-600 font-medium hover:underline">Browse community →</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
                {activeWith && (
                  <>
                    <Avatar name={activeWith.full_name} photo={activeWith.profile_photo_url} />
                    <div>
                      <Link href={`/community/profile/${withId}`} className="text-sm font-semibold text-gray-900 hover:text-teal-600 transition-colors">{activeWith.full_name}</Link>
                      <div className="text-xs text-gray-400">{activeWith.trade_category?.category_name || activeWith.city || ''}</div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">No messages yet — say hello!</div>
                ) : messages.map(msg => {
                  const isMe = msg.sender_id === session.id
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <Avatar name={isMe ? session.name : (activeWith?.full_name || 'Pro')} photo={isMe ? null : activeWith?.profile_photo_url} size={8} />
                      <div className={`max-w-xs lg:max-w-md flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'}`}>
                          {msg.content}
                        </div>
                        <div className="text-xs text-gray-400">{timeAgo(msg.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="bg-white border-t border-gray-100 px-6 py-4">
                <div className="flex gap-3 items-end">
                  <textarea value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }}}
                    placeholder="Write a message... (Enter to send)" rows={1}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />
                  <button onClick={sendMessage} disabled={sending || !text.trim()}
                    className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors flex-shrink-0">
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
