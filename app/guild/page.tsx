'use client'
/**
 * The Guild — ProGuild's professional community feed
 * LinkedIn-for-trades: 3-col layout, typed post composer, sidebar widgets
 *
 * Route: /guild
 * Auth: public (read-only) | logged-in (full interaction)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import Link from 'next/link'
import { Session, Post, Pro, PostType } from '@/types'
import { useProSession } from '@/lib/hooks/useProSession'
import { initials, avatarColor, timeAgo, isPaid } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ pro, size = 10 }: { pro: { full_name?: string | null; profile_photo_url?: string | null } | null; size?: number }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const dim = size * 4
  const cls = `rounded-full flex items-center justify-center font-sans font-semibold flex-shrink-0 object-cover`
  if (pro?.profile_photo_url)
    return <img src={pro.profile_photo_url} alt={pro.full_name || ''} className={cls} style={{ width: dim, height: dim }} />
  return (
    <div className={cls} style={{ width: dim, height: dim, background: bg, color: fg, fontSize: size < 8 ? 11 : 13 }}>
      {initials(pro?.full_name || 'A')}
    </div>
  )
}

function VerifiedBadge({ small }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'}`}>
      <svg width={small ? 8 : 9} height={small ? 8 : 9} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
      </svg>
      Verified
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightbox
// ─────────────────────────────────────────────────────────────────────────────

function Lightbox({ imgs, startIndex, onClose }: { imgs: string[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % imgs.length)
      if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + imgs.length) % imgs.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imgs.length, onClose])

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20 }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      {imgs.length > 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length) }} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)' }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      )}
      <div style={{ maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <img src={imgs[idx]} alt={`Photo ${idx + 1}`} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 30px 60px rgba(0,0,0,0.6)' }} />
      </div>
      {imgs.length > 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length) }} style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)' }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      )}
      {imgs.length > 1 && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)' }} className="text-white/50 text-sm tabular-nums">
          {idx + 1} / {imgs.length}
        </div>
      )}
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Before/After Slider
// ─────────────────────────────────────────────────────────────────────────────

function BeforeAfterSlider({ afterUrl, beforeUrl }: { afterUrl: string; beforeUrl: string }) {
  const [pos, setPos] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function updatePos(clientX: number) {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos(Math.min(95, Math.max(5, ((clientX - r.left) / r.width) * 100)))
  }

  const w = ref.current?.offsetWidth || 0

  return (
    <div ref={ref} className="relative w-full select-none overflow-hidden rounded-xl cursor-ew-resize" style={{ aspectRatio: '16/9' }}
      onMouseDown={() => { dragging.current = true }}
      onMouseUp={() => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
      onMouseMove={e => { if (dragging.current) updatePos(e.clientX) }}
      onTouchMove={e => updatePos(e.touches[0].clientX)}>
      <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute top-0 left-0 bottom-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img src={beforeUrl} alt="Before" className="absolute top-0 left-0 h-full object-cover" style={{ width: w > 0 ? `${w}px` : '100%' }} />
      </div>
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-xl pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-500">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 15 12 9 6" transform="translate(0,0)" style={{display:'none'}}/></svg>
          <span className="text-[10px] font-bold absolute">↔</span>
        </div>
      </div>
      <span className="absolute top-2 left-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full pointer-events-none font-medium">Before</span>
      <span className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full pointer-events-none font-medium">After</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Post type config
// ─────────────────────────────────────────────────────────────────────────────

const POST_TYPES: Record<PostType, { label: string; color: string; bg: string; border: string; dot: string; placeholder: string; icon: string }> = {
  work: {
    label: 'Project',
    color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200', dot: '#0F766E',
    placeholder: 'Share a project — what did you build or fix?',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  },
  tip: {
    label: 'Question',
    color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', dot: '#7C3AED',
    placeholder: 'Ask the Guild — what do you want to know from licensed pros?',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  },
  update: {
    label: 'Discussion',
    color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', dot: '#6B7280',
    placeholder: 'Start a discussion — share a thought, tip, or industry news...',
    icon: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  },
  milestone: {
    label: 'Milestone',
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: '#D97706',
    placeholder: 'Share a milestone — years in business, a big job, a certification...',
    icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Post Composer
// ─────────────────────────────────────────────────────────────────────────────

function PostComposer({ session, onPost }: { session: Session; onPost: (post: Post) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [postType, setPostType] = useState<PostType>('work')
  const [content, setContent] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg = POST_TYPES[postType]

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[]
    if (!files.length) return
    if (photos.length + files.length > 5) { setError('Maximum 5 photos.'); return }
    setUploading(true)
    const uploaded: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('file', file); form.append('pro_id', session.id)
      form.append('bucket', 'portfolio'); form.append('folder', `posts/${session.id}`)
      const r = await fetch('/api/upload', { method: 'POST', body: form })
      const d = await r.json()
      if (r.ok) uploaded.push(d.url)
    }
    setPhotos(prev => [...prev, ...uploaded])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handlePost() {
    if (!content.trim() && photos.length === 0) return
    setPosting(true); setError('')
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, content, photo_urls: photos, post_type: postType }),
    })
    const d = await r.json()
    if (r.ok) {
      onPost(d.post)
      setContent(''); setPhotos([]); setExpanded(false)
    } else {
      setError(d.error || 'Could not post. Please try again.')
    }
    setPosting(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-3 shadow-sm">
      {/* Collapsed prompt */}
      {!expanded && (
        <div className="flex items-center gap-3 px-4 py-3 cursor-text" onClick={() => setExpanded(true)}>
          <Avatar pro={{ full_name: session.name, profile_photo_url: session.photo_url }} size={10} />
          <div className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 hover:bg-gray-150 transition-colors text-[14px] text-gray-400 select-none">
            Share a project, question, or update...
          </div>
        </div>
      )}

      {/* Expanded composer */}
      {expanded && (
        <div>
          {/* Type tabs */}
          <div className="flex border-b border-gray-100">
            {(Object.entries(POST_TYPES) as [PostType, typeof POST_TYPES[PostType]][]).map(([type, c]) => (
              <button key={type} onClick={() => setPostType(type)}
                className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${postType === type ? `${c.color} border-b-2 border-current bg-white` : 'text-gray-400 hover:text-gray-600'}`}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Author row */}
            <div className="flex items-start gap-3 mb-3">
              <Avatar pro={{ full_name: session.name, profile_photo_url: session.photo_url }} size={10} />
              <div>
                <div className="text-[14px] font-semibold text-gray-900">{session.name}</div>
                <div className="text-[12px] text-gray-400">{session.trade}{session.city ? ` · ${session.city}` : ''}</div>
              </div>
            </div>

            {/* Text area */}
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={cfg.placeholder}
              rows={4}
              autoFocus
              className="w-full text-[14px] text-gray-900 bg-transparent border-none outline-none resize-none placeholder-gray-400 leading-relaxed mb-3"
            />

            {/* Photo previews */}
            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {photos.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center leading-none hover:bg-red-600 transition-colors">✕</button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-teal-400 hover:text-teal-400 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                )}
              </div>
            )}

            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

            {/* Bottom bar */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1">
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading || photos.length >= 5}
                  title="Add photos"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors text-[12px] font-medium disabled:opacity-40">
                  {uploading
                    ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  }
                  <span>Photo{photos.length > 0 ? ` (${photos.length}/5)` : ''}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { setExpanded(false); setContent(''); setPhotos([]) }}
                  className="px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
                  Cancel
                </button>
                <button onClick={handlePost} disabled={posting || (!content.trim() && photos.length === 0)}
                  className={`px-5 py-1.5 text-[13px] font-semibold rounded-lg text-white transition-colors disabled:opacity-40 ${cfg.bg.replace('bg-', 'bg-')} ${
                    postType === 'work' ? 'bg-teal-600 hover:bg-teal-700' :
                    postType === 'tip' ? 'bg-violet-600 hover:bg-violet-700' :
                    postType === 'milestone' ? 'bg-amber-500 hover:bg-amber-600' :
                    'bg-gray-700 hover:bg-gray-800'
                  }`}>
                  {posting ? 'Posting...' : postType === 'tip' ? 'Ask' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick-action row (always visible when collapsed) */}
      {!expanded && (
        <div className="flex border-t border-gray-100">
          {([
            { type: 'work' as PostType,      label: 'Project',    color: 'hover:text-teal-600 hover:bg-teal-50' },
            { type: 'tip' as PostType,       label: 'Question',   color: 'hover:text-violet-600 hover:bg-violet-50' },
            { type: 'update' as PostType,    label: 'Discussion', color: 'hover:text-gray-700 hover:bg-gray-50' },
            { type: 'milestone' as PostType, label: 'Milestone',  color: 'hover:text-amber-600 hover:bg-amber-50' },
          ] as const).map(btn => (
            <button key={btn.type} onClick={() => { setPostType(btn.type); setExpanded(true) }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-gray-400 transition-colors ${btn.color}`}>
              {btn.type === 'work' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              )}
              {btn.type === 'tip' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              )}
              {btn.type === 'update' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              )}
              {btn.type === 'milestone' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              )}
              <span className="hidden sm:inline">{btn.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow button
// ─────────────────────────────────────────────────────────────────────────────

function FollowButton({ proId, followerId, compact }: { proId: string; followerId: string; compact?: boolean }) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(false)
  async function toggle() {
    setLoading(true)
    const r = await fetch('/api/follows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower_id: followerId, following_id: proId }),
    })
    const d = await r.json()
    if (r.ok) setFollowing(d.following)
    setLoading(false)
  }
  return (
    <button onClick={toggle} disabled={loading}
      className={`font-semibold transition-all border rounded-lg ${compact ? 'text-[11px] px-2.5 py-1' : 'text-[12px] px-3 py-1.5'} ${
        following
          ? 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
          : 'border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100'
      }`}>
      {loading ? '…' : following ? 'Following' : '+ Follow'}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Post Card
// ─────────────────────────────────────────────────────────────────────────────

function PostCard({ post, session, onLike, onDelete, liking }: {
  post: Post & { liked_by_me: boolean }
  session: Session | null
  onLike: (id: string) => void
  onDelete: (id: string) => void
  liking: boolean
}) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null)

  const pro = post.pro as any
  const isOwn = session?.id === post.pro_id
  const isQuestion = post.post_type === 'tip'
  const isMilestone = post.post_type === 'milestone'
  const cfg = POST_TYPES[post.post_type] || POST_TYPES['update']

  async function loadComments() {
    if (comments.length > 0) { setShowComments(s => !s); return }
    setLoadingComments(true)
    const r = await fetch(`/api/comments?post_id=${post.id}`)
    const d = await r.json()
    setComments(d.comments || [])
    setLoadingComments(false)
    setShowComments(true)
  }

  async function submitComment() {
    if (!commentText.trim() || !session) return
    setSubmittingComment(true)
    const r = await fetch('/api/comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: post.id, pro_id: session.id, content: commentText }),
    })
    const d = await r.json()
    if (r.ok) { setComments(c => [...c, d.comment]); setCommentText('') }
    setSubmittingComment(false)
  }

  const imgs: string[] = (post as any).photo_urls?.length
    ? (post as any).photo_urls
    : post.photo_url ? [post.photo_url] : []

  return (
    <article className={`bg-white rounded-xl border overflow-hidden shadow-sm ${isMilestone ? 'border-amber-200' : isQuestion ? 'border-violet-200' : 'border-gray-200'}`}>

      {/* Milestone accent */}
      {isMilestone && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
          <span className="text-base">🏆</span>
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-widest">Milestone Achievement</span>
        </div>
      )}

      {/* Post header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <Link href={`/pro/${post.pro_id}`} className="flex-shrink-0">
          <Avatar pro={pro} size={10} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/pro/${post.pro_id}`} className="text-[14px] font-semibold text-gray-900 hover:text-teal-600 transition-colors leading-tight">
              {pro?.full_name}
            </Link>
            {pro?.is_verified && <VerifiedBadge small />}
            {isPaid(pro?.plan_tier) && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-600 text-white">PRO</span>
            )}
            {/* Post type badge */}
            {post.post_type !== 'update' && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                {cfg.label}
              </span>
            )}
            {isOwn && (
              <button onClick={() => onDelete(post.id)} className="ml-auto text-gray-200 hover:text-red-400 transition-colors text-xs px-1" title="Delete post">✕</button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[12px] text-gray-400 leading-tight">
              {pro?.trade_category?.category_name}
              {pro?.city ? ` · ${pro.city}` : ''}
              {pro?.state ? `, ${pro.state}` : ''}
              {` · ${timeAgo(post.created_at)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <div className="px-4 pb-3">
          <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${isQuestion ? 'font-medium text-violet-900' : 'text-gray-700'}`}>
            {post.content}
          </p>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox imgs={lightbox.imgs} startIndex={lightbox.idx} onClose={() => setLightbox(null)} />}

      {/* Media */}
      {post.is_before_after && post.before_photo_url && post.photo_url ? (
        <div className="px-4 pb-3">
          <BeforeAfterSlider afterUrl={post.photo_url} beforeUrl={post.before_photo_url} />
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-teal-600 font-medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Before &amp; After
          </div>
        </div>
      ) : imgs.length > 0 ? (
        <div className="px-4 pb-3">
          {imgs.length === 1 ? (
            <img src={imgs[0]} alt="Post" className="w-full rounded-xl object-cover cursor-pointer hover:opacity-97 transition-opacity bg-stone-50" style={{ maxHeight: 320 }} onClick={() => setLightbox({ imgs, idx: 0 })} />
          ) : imgs.length === 2 ? (
            <div className="grid grid-cols-2 gap-1">
              {imgs.map((url, i) => <img key={i} src={url} alt="" className="w-full h-36 rounded-xl object-cover cursor-pointer hover:opacity-97 transition-opacity" onClick={() => setLightbox({ imgs, idx: i })} />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {imgs.slice(0, 3).map((url, i) => (
                <div key={i} className="relative cursor-pointer" onClick={() => setLightbox({ imgs, idx: i })}>
                  <img src={url} alt="" className="w-full h-28 rounded-xl object-cover hover:opacity-97 transition-opacity" />
                  {i === 2 && imgs.length > 3 && (
                    <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">+{imgs.length - 3}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Trade/location tags */}
      {(pro?.trade_category?.category_name || pro?.city) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {pro?.trade_category?.category_name && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-gray-500 font-medium">{pro.trade_category.category_name}</span>
          )}
          {pro?.city && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-gray-500 font-medium">{pro.city}</span>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-t border-gray-100">
        {/* Helpful */}
        <button
          onClick={() => session ? onLike(post.id) : (window.location.href = '/login')}
          disabled={isOwn || liking}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
            isOwn ? 'text-gray-200 cursor-default' :
            post.liked_by_me ? 'text-teal-600 font-semibold' :
            'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={post.liked_by_me ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
            <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
          </svg>
          <span>Helpful</span>
          {post.like_count > 0 && <span className="text-[11px] font-semibold tabular-nums">{post.like_count}</span>}
        </button>

        {/* Comment / Answer */}
        <button onClick={loadComments}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
            isQuestion ? 'text-violet-500 hover:bg-violet-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>{isQuestion ? (post.comment_count > 0 ? `${post.comment_count} ${post.comment_count === 1 ? 'Answer' : 'Answers'}` : 'Answer') : (post.comment_count > 0 ? `${post.comment_count} ${post.comment_count === 1 ? 'Comment' : 'Comments'}` : 'Comment')}</span>
        </button>

        {/* Right actions */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 ml-auto">
            <Link href={`/pro/${post.pro_id}`} title="View Profile"
              className="flex items-center justify-center w-7 h-7 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-teal-600 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </Link>
            <Link href={`/post-job?pro=${post.pro_id}`} title="Request Quote"
              className="flex items-center justify-center w-7 h-7 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </Link>
          </div>
        )}
      </div>

      {/* Comments / Answers section */}
      {showComments && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          {loadingComments ? (
            <div className="text-[12px] text-gray-400 py-1">Loading…</div>
          ) : (
            <div className="space-y-2.5 mb-3">
              {comments.length === 0 && (
                <div className="text-[12px] text-gray-400">
                  {isQuestion ? 'No answers yet — be the first verified pro to answer.' : 'No comments yet.'}
                </div>
              )}
              {comments.map(cm => {
                const cmVerified = cm.pro?.is_verified
                return (
                  <div key={cm.id} className="flex gap-2.5 items-start">
                    <Avatar pro={cm.pro} size={8} />
                    <div className={`flex-1 rounded-xl px-3 py-2 border ${isQuestion && cmVerified ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-gray-800">{cm.pro?.full_name}</span>
                        {cmVerified && <VerifiedBadge small />}
                        {isQuestion && cmVerified && (
                          <span className="text-[10px] font-bold text-emerald-700">Best Answer</span>
                        )}
                      </div>
                      <p className="text-[13px] text-gray-600 leading-relaxed">{cm.content}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {session ? (
            <div className="flex gap-2 items-center">
              <Avatar pro={{ full_name: session.name, profile_photo_url: session.photo_url }} size={7} />
              <div className="flex-1 flex gap-2">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submitComment()}
                  placeholder={isQuestion ? 'Share your expert answer…' : 'Write a comment…'}
                  className="flex-1 px-3 py-2 text-[13px] border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400 transition-colors placeholder-gray-400"
                />
                <button onClick={submitComment} disabled={submittingComment || !commentText.trim()}
                  className={`px-3 py-2 text-white text-[12px] font-bold rounded-xl disabled:opacity-40 transition-colors ${isQuestion ? 'bg-violet-600 hover:bg-violet-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
                  {isQuestion ? 'Answer' : 'Post'}
                </button>
              </div>
            </div>
          ) : (
            <a href="/login" className="text-[12px] text-teal-600 font-semibold hover:underline">
              Log in to {isQuestion ? 'answer' : 'comment'} →
            </a>
          )}
        </div>
      )}
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade filter pills
// ─────────────────────────────────────────────────────────────────────────────

const TRADES = [
  { label: 'Roofing',     slug: 'roofing-contractor' },
  { label: 'HVAC',        slug: 'hvac-technician' },
  { label: 'Electrical',  slug: 'electrician' },
  { label: 'Plumbing',    slug: 'plumber' },
  { label: 'General',     slug: 'general-contractor' },
  { label: 'Pool & Spa',  slug: 'pool-spa' },
  { label: 'Painting',    slug: 'painter' },
  { label: 'Flooring',    slug: 'carpenter' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Left Profile Card (logged in)
// ─────────────────────────────────────────────────────────────────────────────

function ProfileCard({ session }: { session: Session }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Banner */}
      <div className="h-16 bg-gradient-to-r from-teal-600 to-teal-800" />
      <div className="px-4 pb-4 -mt-8">
        <div className="flex items-end gap-3 mb-3">
          <div className="ring-4 ring-white rounded-full">
            <Avatar pro={{ full_name: session.name, profile_photo_url: session.photo_url }} size={14} />
          </div>
        </div>
        <div className="text-[15px] font-bold text-gray-900 leading-tight">{session.name}</div>
        {session.is_verified && <div className="mt-0.5"><VerifiedBadge /></div>}
        <div className="text-[12px] text-gray-500 mt-1">{session.trade}{session.city ? ` · ${session.city}, ${session.state}` : ''}</div>
        <Link href={`/pro/${session.slug || session.id}`}
          className="block mt-3 w-full py-1.5 text-center text-[12px] font-semibold border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors">
          View my profile
        </Link>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild Page — main component
// ─────────────────────────────────────────────────────────────────────────────

type FeedFilter = 'all' | 'following' | 'questions' | 'network'

export default function GuildPage() {
  const { session: _real } = useProSession()
  const searchParams = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [suggested, setSuggested] = useState<Pro[]>([])
  const [trendingQuestions, setTrendingQuestions] = useState<Post[]>([])
  const [jobAlerts, setJobAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())
  const [tradeFilter, setTradeFilter] = useState('')

  // URL-driven tab — ?tab=discover|questions|following|network
  const tabParam = searchParams.get('tab') as FeedFilter | null
  const feedFilter: FeedFilter = tabParam && ['all','following','questions','network'].includes(tabParam) ? tabParam : 'all'

  function buildUrl(s: Session | null, ff: FeedFilter) {
    const base = s ? `/api/posts?feed_for=${s.id}&limit=30` : `/api/posts?limit=30`
    const p = new URLSearchParams()
    if (tradeFilter) p.set('trade_slug', tradeFilter)
    if (ff === 'questions') p.set('post_type', 'tip')
    const qs = p.toString()
    return qs ? `${base}&${qs}` : base
  }

  useEffect(() => {
    const s = _real
    setSession(s)

    const safe = (p: Promise<Response>): Promise<any> => p.then(r => r.ok ? r.json() : {}).catch(() => ({}))

    Promise.all([
      safe(fetch(buildUrl(s, feedFilter))),
      safe(fetch('/api/pros?limit=8&sort=rating&status=all')),
      s ? safe(fetch(`/api/posts/likes?pro_id=${s.id}`)) : Promise.resolve({ likes: [] }),
      safe(fetch('/api/jobs?status=Open&limit=3')),
      safe(fetch('/api/posts?limit=5&post_type=tip')),
    ]).then(([postsData, prosData, likesData, jobsData, qData]) => {
      setPosts(postsData.posts || [])
      const allPros = (prosData.pros || []).filter((p: Pro) => p.id !== s?.id)
      setSuggested(allPros.slice(0, 5))
      setLikedIds(new Set(likesData.likes || []))
      setJobAlerts(jobsData.jobs || [])
      setTrendingQuestions(qData.posts || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [tradeFilter, feedFilter, _real])

  const postsWithLikes = posts.map(p => ({ ...p, liked_by_me: likedIds.has(p.id) }))

  async function handleLike(postId: string) {
    if (!session || likingIds.has(postId)) return
    setLikingIds(prev => { const n = new Set(prev); n.add(postId); return n })
    const r = await fetch('/api/posts/likes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, pro_id: session.id }),
    })
    const d = await r.json()
    if (r.ok) {
      setLikedIds(prev => { const n = new Set(prev); d.liked ? n.add(postId) : n.delete(postId); return n })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: p.like_count + (d.liked ? 1 : -1) } : p))
    }
    setLikingIds(prev => { const n = new Set(prev); n.delete(postId); return n })
  }

  async function handleDelete(postId: string) {
    if (!session) return
    await fetch(`/api/posts?id=${postId}&pro_id=${session.id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  return (
    <DashboardShell session={session} newLeads={0} noSidebar={!!session}>
      <div className="min-h-screen" style={{ backgroundColor: '#F3F2EF' }}>

        {/* ── Logged-in Guild header ── */}
        {session && (
          <div className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between sticky top-0 z-40 shadow-sm">
            <div className="flex items-center gap-2">
              <Link href="/guild" className="flex items-center gap-2">
                <div className="w-7 h-7">
                  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#g2)"/>
                    <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                    <defs><linearGradient id="g2" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
                  </svg>
                </div>
                <span className="font-serif text-[15px] font-bold text-gray-900">The Guild</span>
              </Link>
            </div>
            <Link href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              My Business →
            </Link>
          </div>
        )}

        {/* ── Public nav ── */}
        {!session && (
          <nav className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between sticky top-0 z-40 shadow-sm">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-7 h-7">
                  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#g1)"/>
                    <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                    <defs><linearGradient id="g1" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
                  </svg>
                </div>
                <span className="font-serif text-lg font-bold text-gray-900">ProGuild</span>
                <span className="font-sans font-medium text-sm text-teal-600">.ai</span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                <Link href="/" className="text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Find Pros</Link>
                <Link href="/guild" className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700">The Guild</Link>
                <Link href="/jobs" className="text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Projects</Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm text-gray-600 px-3 py-1.5 hover:text-gray-900 transition-colors">Log in</Link>
              <Link href="/login?tab=signup" className="text-sm font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Join Free</Link>
            </div>
          </nav>
        )}

        {/* ── Trade filter bar ── */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30" style={{ top: session ? 0 : 56 }}>
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setTradeFilter('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${!tradeFilter ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              All Trades
            </button>
            {TRADES.map(t => (
              <button key={t.slug}
                onClick={() => setTradeFilter(tradeFilter === t.slug ? '' : t.slug)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap ${tradeFilter === t.slug ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 3-col layout ── */}
        <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-5 items-start">

          {/* ── LEFT SIDEBAR ── */}
          <div className="hidden lg:block space-y-3 sticky top-24">
            {session ? (
              <ProfileCard session={session} />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="text-[15px] font-bold text-gray-900 mb-1">Join The Guild</div>
                <p className="text-[13px] text-gray-500 mb-4 leading-relaxed">Connect with licensed professionals, share your work, and grow your reputation.</p>
                <Link href="/login?tab=signup" className="block w-full py-2 text-center text-[13px] font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors mb-2">
                  Join Free
                </Link>
                <Link href="/login" className="block w-full py-2 text-center text-[13px] font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Log in
                </Link>
              </div>
            )}

            {/* Navigation */}
            {session ? (
              /* ── Logged-in full nav ── */
              <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm space-y-0.5">
                {/* Main */}
                {[
                  { href: '/guild',              tab: null,        label: 'Home',      icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
                  { href: '/guild?tab=questions', tab: 'questions', label: 'Questions', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { href: '/jobs',               tab: null,        label: 'Projects',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
                  { href: '/guild?tab=network',  tab: 'network',   label: 'Network',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
                ].map(item => {
                  const active = item.tab ? feedFilter === item.tab : (feedFilter === 'all' && item.href === '/guild')
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${active ? 'text-teal-700 bg-teal-50 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
                      {item.label}
                    </Link>
                  )
                })}
                {/* My Activity */}
                <div className="pt-2 pb-1 px-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">My Activity</p>
                </div>
                {[
                  { href: '/guild?tab=following', tab: 'following', label: 'Following', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
                  { href: `/pro/${session.slug || session.id}?tab=posts`, tab: null, label: 'My Posts', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
                ].map(item => {
                  const active = item.tab ? feedFilter === item.tab : false
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${active ? 'text-teal-700 bg-teal-50 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
                      {item.label}
                    </Link>
                  )
                })}
                {/* My Profile */}
                <div className="pt-2 pb-1 px-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">My Profile</p>
                </div>
                {[
                  { href: `/pro/${session.slug || session.id}`, label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                  { href: `/pro/${session.slug || session.id}#reputation`, label: 'Reputation', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
                ].map(item => (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : (
              /* ── Logged-out minimal nav ── */
              <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                {[
                  { href: '/guild',          label: 'The Guild',      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: true },
                  { href: '/jobs',           label: 'Open Projects',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                  { href: '/verify-license', label: 'License Lookup', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                  { href: '/guides',         label: 'Guides',         icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
                ].map(item => (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${(item as any).active ? 'text-teal-700 bg-teal-50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── MAIN FEED ── */}
          <div className="min-w-0">
            {/* Feed type tabs */}
            <div className="bg-white rounded-xl border border-gray-200 mb-3 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100">
                {([
                  { key: 'all', label: 'All Posts' },
                  { key: 'questions', label: 'Questions' },
                  ...(session ? [{ key: 'following', label: 'Following' }] : []),
                ] as { key: typeof feedFilter; label: string }[]).map(tab => (
                  <Link key={tab.key} href={tab.key === 'all' ? '/guild' : `/guild?tab=${tab.key}`}
                    className={`flex-1 py-3 text-[13px] font-semibold transition-colors text-center ${feedFilter === tab.key ? 'text-teal-700 border-b-2 border-teal-600 bg-teal-50/30' : 'text-gray-500 hover:text-gray-700'}`}>
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Composer */}
            {session && <PostComposer session={session} onPost={post => setPosts(p => [post as Post, ...p])} />}

            {/* Login prompt for guests */}
            {!session && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 shadow-sm flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-gray-900 mb-0.5">Share your work with the Guild</p>
                  <p className="text-[12px] text-gray-500">Licensed pros post projects, answer questions, and build reputation.</p>
                </div>
                <Link href="/login?tab=signup" className="flex-shrink-0 px-4 py-2 bg-teal-600 text-white text-[12px] font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                  Join Free
                </Link>
              </div>
            )}

            {/* Posts */}
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                        <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : postsWithLikes.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-16 text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <div className="font-semibold text-gray-700 mb-1">Nothing here yet</div>
                <div className="text-[13px] text-gray-400">
                  {tradeFilter ? 'No posts in this trade. Try a different filter.' : 'Be the first to post in The Guild.'}
                </div>
                {tradeFilter && (
                  <button onClick={() => setTradeFilter('')} className="mt-3 text-[13px] text-teal-600 font-semibold hover:underline">
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {postsWithLikes.map(post => (
                  <PostCard
                    key={post.id}
                    post={post as Post & { liked_by_me: boolean }}
                    session={session}
                    onLike={handleLike}
                    onDelete={handleDelete}
                    liking={likingIds.has(post.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="hidden lg:block space-y-4 sticky top-24">

            {/* Top Pros */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-bold text-gray-900">Top Pros{session?.city ? ` in ${session.city}` : ''}</div>
                <Link href="/" className="text-[11px] text-teal-600 hover:underline font-medium">See all</Link>
              </div>
              {suggested.length === 0 ? (
                <div className="text-[12px] text-gray-400">No suggestions yet.</div>
              ) : suggested.map((pro, i) => (
                <div key={pro.id} className={`flex items-center gap-3 py-2.5 ${i < suggested.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <Link href={`/pro/${(pro as any).slug || pro.id}`} className="flex-shrink-0">
                    <Avatar pro={pro} size={9} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/pro/${(pro as any).slug || pro.id}`} className="text-[13px] font-semibold text-gray-900 hover:text-teal-600 truncate">
                        {pro.full_name}
                      </Link>
                      {pro.is_verified && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a" className="flex-shrink-0">
                          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                        </svg>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">{pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}</div>
                  </div>
                  {session && session.id !== pro.id && (
                    <FollowButton proId={pro.id} followerId={session.id} compact />
                  )}
                </div>
              ))}
            </div>

            {/* Trending Questions */}
            {trendingQuestions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-bold text-gray-900">Trending Questions</div>
                  <Link href="/guild?tab=questions" className="text-[11px] text-teal-600 hover:underline font-medium">See all</Link>
                </div>
                <div className="space-y-3">
                  {trendingQuestions.slice(0, 4).map((post, i, arr) => (
                    <div key={post.id} className={`pb-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <p className="text-[12px] text-gray-800 font-medium leading-snug line-clamp-2 mb-1.5">{post.content}</p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400">
                        <span className="flex items-center gap-0.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                          {post.comment_count || 0} answers
                        </span>
                        <span>·</span>
                        <span>{(post.pro as any)?.trade_category?.category_name || 'General'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open Projects */}
            {jobAlerts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-bold text-gray-900">Open Projects</div>
                  <Link href="/jobs" className="text-[11px] text-teal-600 hover:underline font-medium">Browse all</Link>
                </div>
                <div className="space-y-2">
                  {jobAlerts.map(job => (
                    <Link key={job.id} href="/jobs"
                      className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors -mx-1">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{job.title}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {job.city || job.state || 'Florida'}{job.budget_range ? ` · ${job.budget_range}` : ''}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="text-[11px] text-gray-400 px-1 leading-relaxed">
              <div className="flex flex-wrap gap-x-2 gap-y-1 mb-2">
                <Link href="/guides" className="hover:text-teal-600">Guides</Link>
                <Link href="/verify-license" className="hover:text-teal-600">License Lookup</Link>
                <Link href="/fl" className="hover:text-teal-600">Find Pros</Link>
                <Link href="/post-job" className="hover:text-teal-600">Post a Project</Link>
              </div>
              <div className="text-[10px] text-gray-300">© 2026 ProGuild.ai · Licensed professionals only</div>
            </div>
          </div>
        </div>

        {/* ── Mobile bottom bar ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-stretch h-14">
            {(session ? [
              { href: '/dashboard', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { href: '/jobs', label: 'Projects', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
              { href: '/guild', label: 'The Guild', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: true },
              { href: '/messages', label: 'Messages', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
            ] : [
              { href: '/', label: 'Find Pros', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
              { href: '/post-job', label: 'Post Job', icon: 'M12 4v16m8-8H4' },
              { href: '/guild', label: 'The Guild', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: true },
              { href: '/login', label: 'Log in', icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1' },
            ]).map((item: any) => {
              const active = item.active || false
              return (
                <a key={item.href} href={item.href}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
                  style={{ color: active ? '#0F766E' : '#9CA3AF' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon}/>
                  </svg>
                  <span className="text-[10px] font-medium leading-none">{item.label}</span>
                </a>
              )
            })}
          </div>
        </nav>
      </div>
    </DashboardShell>
  )
}
