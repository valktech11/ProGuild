'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import DashboardShell from '@/components/layout/DashboardShell'
import Link from 'next/link'
import { Session, Post, Pro } from '@/types'
import { initials, avatarColor, timeAgo, isPaid } from '@/lib/utils'


function Avatar({ pro, size = 10 }: { pro: any; size?: number }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0`
  if (pro?.profile_photo_url) return <img src={pro.profile_photo_url} alt={pro.full_name} className={`${cls} object-cover`} />
  return <div className={cls} style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ imgs, startIndex, onClose }: { imgs: string[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex)

  useEffect(() => {
    // Lock body scroll
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % imgs.length)
      if (e.key === 'ArrowLeft')  setIdx(i => (i - 1 + imgs.length) % imgs.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imgs.length, onClose])

  // Use a portal so the overlay escapes DashboardShell
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const el = document.body

  const overlay = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
               display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>

      {/* Close */}
      <button onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16 }}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      {/* Prev */}
      {imgs.length > 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length) }}
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      )}

      {/* Image */}
      <div style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={e => e.stopPropagation()}>
        <img src={imgs[idx]} alt={`Photo ${idx + 1}`}
          style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }} />
      </div>

      {/* Next */}
      {imgs.length > 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length) }}
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      )}

      {/* Counter */}
      {imgs.length > 1 && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}
          className="text-white/60 text-sm">
          {idx + 1} / {imgs.length}
        </div>
      )}
    </div>
  )

  return createPortal(overlay, el)
}

// ── Before/After Slider ───────────────────────────────────────────────────────
function BeforeAfterSlider({ afterUrl, beforeUrl }: { afterUrl: string; beforeUrl: string }) {
  const [pos, setPos] = useState(50)
  const containerRef  = useRef<HTMLDivElement>(null)
  const dragging      = useRef(false)

  function updatePos(clientX: number) {
    if (!containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    setPos(Math.min(95, Math.max(5, ((clientX - r.left) / r.width) * 100)))
  }

  const containerW = containerRef.current?.offsetWidth || 0

  return (
    <div ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-xl cursor-ew-resize"
      style={{ aspectRatio: '16/9' }}
      onMouseDown={() => { dragging.current = true }}
      onMouseUp={() => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
      onMouseMove={e => { if (dragging.current) updatePos(e.clientX) }}
      onTouchMove={e => updatePos(e.touches[0].clientX)}>

      {/* After image — full */}
      <img src={afterUrl} alt="After"
        className="absolute inset-0 w-full h-full object-cover" />

      {/* Before image — clipped */}
      <div className="absolute top-0 left-0 bottom-0 overflow-hidden"
        style={{ width: `${pos}%` }}>
        <img src={beforeUrl} alt="Before"
          className="absolute top-0 left-0 h-full object-cover"
          style={{ width: containerW > 0 ? `${containerW}px` : '100%' }} />
      </div>

      {/* Divider handle */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
        style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-xs font-bold text-gray-500">
          ↔
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">Before</div>
      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">After</div>

      {/* Drag hint — fades after first interaction */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
        ← drag to compare →
      </div>
    </div>
  )
}

// ── Post card with functional type rendering ──────────────────────────────────
function PostCard({ post, session, onLike, onDelete }: {
  post: Post & { liked_by_me: boolean }
  session: Session | null
  onLike: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments]         = useState<any[]>([])
  const [commentText, setCommentText]   = useState('')
  const [loadingComments, setLoadingComments]   = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [lightbox, setLightbox]         = useState<{ imgs: string[]; idx: number } | null>(null)
  const isOwn         = session?.id === post.pro_id
  const isVerifiedPro = (post.pro as any)?.is_verified
  const isAskAPro     = post.post_type === 'tip'
  const isMilestone   = post.post_type === 'milestone'
  const isWork        = post.post_type === 'work'

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

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${isMilestone ? 'border-amber-300' : isAskAPro ? 'border-blue-200' : 'border-gray-200'}`}>

      {/* Milestone banner */}
      {isMilestone && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
          <span className="text-lg">🏆</span>
          <span className="text-xs font-bold text-amber-800 uppercase tracking-widest">Milestone Achievement</span>
        </div>
      )}

      {/* Post type pill — shown for all post types */}
      <div className="px-4 pt-3 pb-0">
        {isAskAPro ? null : (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
            isMilestone ? 'bg-amber-50 text-amber-600 border-amber-100' :
            isWork      ? 'bg-teal-50 text-teal-600 border-teal-100' :
                          'bg-gray-50 text-gray-500 border-gray-100'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: isMilestone ? '#D97706' : isWork ? '#0F766E' : '#9CA3AF' }} />
            {isMilestone ? 'Milestone' : isWork ? 'Project Update' : 'Update'}
          </span>
        )}
      </div>

      {/* Ask a Pro banner */}
      {isAskAPro && (
        <div className="px-4 pt-3 pb-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Question for the Community
          </span>
        </div>
      )}

      {/* Post header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <Link href={`/community/profile/${post.pro_id}`}>
          <Avatar pro={post.pro} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/community/profile/${post.pro_id}`}
              className="font-semibold text-base text-gray-900 hover:text-teal-600 transition-colors">
              {post.pro?.full_name}
            </Link>
            {isVerifiedPro && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                </svg>
                Verified
              </span>
            )}
            {isPaid((post.pro?.plan_tier ?? 'Free') as any) && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Pro</span>
            )}
            {/* Only show type badge for non-default types */}
            {post.post_type !== 'update' && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isMilestone ? 'bg-amber-50 text-amber-700' :
                isAskAPro   ? 'bg-blue-50 text-blue-700' :
                isWork      ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {isMilestone ? '🏆 Milestone' : isAskAPro ? '❓ Ask a pro' : isWork ? '🔧 Work' : ''}
              </span>
            )}
            {session && session.id !== post.pro_id && (
              <a href={`/messages?with=${post.pro_id}`} className="text-xs text-gray-400 hover:text-teal-600 transition-colors ml-auto">💬</a>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400">
              {(post.pro as any)?.trade_category?.category_name}
              {post.pro?.city ? ` · ${post.pro.city}` : ''}
              {post.pro?.state ? `, ${post.pro.state}` : ''}
              {` · ${timeAgo(post.created_at)}`}
            </span>
            {(post.pro as any)?.review_count > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-amber-500 font-medium">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                {((post.pro as any)?.rating || 4.9).toFixed(1)}
                <span className="text-gray-400">({(post.pro as any)?.review_count})</span>
              </span>
            )}
          </div>
        </div>
        {isOwn && (
          <button onClick={() => onDelete(post.id)}
            className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1 py-1 flex-shrink-0">✕</button>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <div className="px-4 pb-3">
          <p className={`text-base leading-relaxed whitespace-pre-wrap ${isAskAPro ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
            {post.content}
          </p>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox imgs={lightbox.imgs} startIndex={lightbox.idx} onClose={() => setLightbox(null)} />}

      {/* Photos — before/after slider, single, or grid */}
      {(post.is_before_after && post.before_photo_url && post.photo_url) ? (
        <div className="px-4 pb-3">
          <BeforeAfterSlider afterUrl={post.photo_url} beforeUrl={post.before_photo_url} />
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-sm text-teal-600 font-medium">📸 Before & After</span>
            {(post.pro as any)?.trade_category?.category_name && (
              <span className="text-sm text-gray-400">· {(post.pro as any).trade_category.category_name}</span>
            )}
          </div>
        </div>
      ) : (() => {
        const imgs: string[] = (post as any).photo_urls?.length
          ? (post as any).photo_urls
          : post.photo_url ? [post.photo_url] : []
        if (imgs.length === 0) return null
        return (
          <div className="px-4 pb-3">
            {imgs.length === 1 ? (
              <img src={imgs[0]} alt="Post"
                className="w-full rounded-xl object-cover bg-stone-50 cursor-pointer hover:opacity-95 transition-opacity"
                style={{ maxHeight: '280px' }}
                onClick={() => setLightbox({ imgs, idx: 0 })} />
            ) : imgs.length === 2 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {imgs.map((url, i) => (
                  <img key={i} src={url} alt={`Photo ${i + 1}`}
                    className="w-full h-32 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => setLightbox({ imgs, idx: i })} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {imgs.slice(0, 3).map((url, i) => (
                  <div key={i} className="relative cursor-pointer" onClick={() => setLightbox({ imgs, idx: i })}>
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-24 rounded-xl object-cover hover:opacity-95 transition-opacity" />
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
        )
      })()}

      {/* Trade tags */}
      {(post.pro as any)?.trade_category?.category_name && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-gray-500 font-medium">
            {(post.pro as any).trade_category.category_name}
          </span>
          {post.pro?.city && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-gray-500 font-medium">
              {post.pro.city}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-gray-100">
        {isOwn ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-300 select-none">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
            {post.like_count > 0 && <span className="text-xs font-semibold">{post.like_count}</span>}
          </div>
        ) : (
          <button onClick={() => session && onLike(post.id)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
              post.liked_by_me ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'
            }`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={post.liked_by_me ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
            {post.like_count > 0 && <span className="text-xs font-semibold">{post.like_count}</span>}
          </button>
        )}
        <button onClick={loadComments}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
            isAskAPro ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-400 hover:text-gray-600'
          }`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          {post.comment_count > 0 && <span className="text-xs font-semibold">{post.comment_count}</span>}
          <span className="text-xs">{isAskAPro ? (post.comment_count > 0 ? 'answers' : 'Answer') : 'Comment'}</span>
        </button>
      </div>

      {/* View Profile + Request Quote */}
      {!isOwn && (
        <div className="flex gap-2 px-4 pb-3">
          <Link href={`/community/profile/${post.pro_id}`}
            className="flex-1 text-center text-xs font-semibold py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            View Profile
          </Link>
          <Link href={`/post-job?pro=${post.pro_id}`}
            className="flex-1 text-center text-xs font-semibold py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            Request Quote
          </Link>
        </div>
      )}

      {/* Comments / Answers */}
      {showComments && (
        <div className="border-t border-gray-100 px-4 py-3 bg-stone-50/60">
          {loadingComments ? (
            <div className="text-xs text-gray-400 py-2">Loading...</div>
          ) : (
            <div className="space-y-2.5 mb-3">
              {comments.length === 0 && (
                <div className="text-sm text-gray-400">
                  {isAskAPro ? 'No answers yet — be the first verified pro to answer.' : 'No comments yet — be the first.'}
                </div>
              )}
              {comments.map(cm => {
                const cmVerified = cm.pro?.is_verified
                return (
                  <div key={cm.id} className="flex gap-2 items-start">
                    <Avatar pro={cm.pro} size={7} />
                    <div className={`flex-1 rounded-xl px-3 py-2 border ${isAskAPro && cmVerified ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-semibold text-gray-800">{cm.pro?.full_name}</span>
                        {cmVerified && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                            </svg>
                            {isAskAPro ? 'Verified Answer' : 'Verified'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 leading-relaxed">{cm.content}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {session && (
            <div className="flex gap-2 items-center">
              <Avatar pro={{ full_name: session.name, profile_photo_url: null }} size={7} />
              <div className="flex-1 flex gap-2">
                <input value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submitComment()}
                  placeholder={isAskAPro ? 'Share your expert answer...' : 'Write a comment...'}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400 transition-colors" />
                <button onClick={submitComment} disabled={submittingComment || !commentText.trim()}
                  className="px-3 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
                  {isAskAPro ? 'Answer' : 'Post'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Composer — plain text + up to 5 photos ───────────────────────────────────
function PostComposer({ session, onPost }: { session: Session; onPost: (post: Post) => void }) {
  const [content, setContent]     = useState('')
  const [photos, setPhotos]       = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]     = useState(false)
  const [error, setError]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[]
    if (!files.length) return
    if (photos.length + files.length > 5) {
      setError('Maximum 5 photos per post.'); return
    }
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
    // reset input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handlePost() {
    if (!content.trim() && photos.length === 0) return
    setPosting(true); setError('')
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, content, photo_urls: photos, post_type: 'update' }),
    })
    const d = await r.json()
    if (r.ok) { onPost(d.post); setContent(''); setPhotos([]) }
    else setError(d.error || 'Could not post. Please try again.')
    setPosting(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <Avatar pro={{ full_name: session.name, profile_photo_url: null }} />
        <div className="flex-1">
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Share your work, ask a question, or post an update..."
            rows={3}
            className="w-full text-sm text-gray-900 bg-stone-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />
        </div>
      </div>

      {photos.length > 0 && (
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          {photos.map((url, i) => (
            <div key={i} className="relative">
              <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
              <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center">✕</button>
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
      {error && <div className="px-4 pb-2 text-xs text-red-600">{error}</div>}

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || photos.length >= 5}
            title={photos.length >= 5 ? 'Maximum 5 photos' : 'Add photo'}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50">
            {uploading
              ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            }
          </button>
          {photos.length > 0 && (
            <span className="text-xs text-gray-400">{photos.length}/5</span>
          )}
        </div>
        <button onClick={handlePost} disabled={posting || (!content.trim() && photos.length === 0)}
          className="px-5 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors">
          {posting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  )
}

function FollowButton({ proId, followerId }: { proId: string; followerId: string }) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading]     = useState(false)
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
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
        following ? 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-400'
                  : 'border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100'
      }`}>
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CommunityPage() {
  const [session,      setSession]      = useState<Session | null>(null)
  const [posts,        setPosts]        = useState<Post[]>([])
  const [suggested,    setSuggested]    = useState<Pro[]>([])
  const [jobAlerts,    setJobAlerts]    = useState<any[]>([])
  const [trendingPosts,setTrendingPosts]= useState<Post[]>([])
  const [trendingOpen, setTrendingOpen] = useState(true)
  const [loading,      setLoading]      = useState(true)
  const [likedIds,     setLikedIds]     = useState<Set<string>>(new Set())
  const [localOnly,    setLocalOnly]    = useState(false)
  const [tradeFilter,  setTradeFilter]  = useState('')
  const [search,       setSearch]       = useState('')
  const [searchInput,  setSearchInput]  = useState('')
  const searchRef     = useRef<HTMLInputElement>(null)

  // Build fetch URL from current filters
  function buildFeedUrl(s: Session | null) {
    const base = s ? `/api/posts?feed_for=${s.id}&limit=40` : `/api/posts?limit=40`
    const params = new URLSearchParams()
    if (tradeFilter) params.set('trade_slug', tradeFilter)
    if (search)      params.set('search', search)
    if (localOnly)   params.set('state', 'FL')
    const qs = params.toString()
    return qs ? base + '&' + qs : base
  }

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    const s   = raw ? JSON.parse(raw) : null
    setSession(s)

    const city = s?.city || ''
    const trendingUrl = city
      ? `/api/posts?limit=3&city=${encodeURIComponent(city)}`
      : `/api/posts?limit=3`

    Promise.all([
      fetch(buildFeedUrl(s)).then(r => r.json()),
      fetch('/api/pros?limit=12&sort=rating').then(r => r.json()),
      s ? fetch(`/api/posts/likes?pro_id=${s.id}`).then(r => r.json()) : Promise.resolve({ likes: [] }),
      fetch('/api/jobs?status=Open&limit=4').then(r => r.json()),
      fetch(trendingUrl).then(r => r.json()),
    ]).then(([postsData, prosData, likesData, jobsData, trendingData]) => {
      setPosts(postsData.posts || [])
      const allPros = (prosData.pros || []).filter((p: Pro) => p.id !== s?.id)
      if (s?.trade) {
        const same   = allPros.filter((p: any) => p.trade_category?.category_name === s.trade)
        const others = allPros.filter((p: any) => p.trade_category?.category_name !== s.trade)
        setSuggested([...same, ...others].slice(0, 5))
      } else {
        setSuggested(allPros.slice(0, 5))
      }
      setLikedIds(new Set(likesData.likes || []))
      setJobAlerts(jobsData.jobs || [])
      setTrendingPosts(trendingData.posts || [])
      setLoading(false)
    })
  }, [tradeFilter, search, localOnly])

  // Local filter still applied client-side for instant FL toggle
  const postsWithLikes = posts
    .map(p => ({ ...p, liked_by_me: likedIds.has(p.id) }))
    .filter(p => {
      if (localOnly) {
        const state = (p.pro as any)?.state
        if (state && state !== 'FL') return false
      }
      return true
    })

  async function handleLike(postId: string) {
    if (!session) return
    const r = await fetch('/api/posts/likes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, pro_id: session.id }),
    })
    const d = await r.json()
    if (r.ok) {
      setLikedIds(prev => { const n = new Set(prev); d.liked ? n.add(postId) : n.delete(postId); return n })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: p.like_count + (d.liked ? 1 : -1) } : p))
    }
  }

  async function handleDelete(postId: string) {
    if (!session) return
    await fetch(`/api/posts?id=${postId}&pro_id=${session.id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  function applySearch() { setSearch(searchInput) }

  return (
    <DashboardShell session={session} newLeads={0}>
      <div className="min-h-screen" style={{ backgroundColor: '#ECEAE5' }}>
      {/* ── Main nav — logged-out only; logged-in shell provides its own header ── */}
      {!session && <nav className="bg-white/95 backdrop-blur border-b px-6 h-14 flex items-center justify-between sticky top-0 z-40" style={{ borderColor: '#E8E2D9' }}>
        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#cb2)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                <defs><linearGradient id="cb2" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-serif text-lg font-bold" style={{ color: '#0A1628' }}>ProGuild</span>
              <span className="font-sans font-medium text-sm" style={{ color: '#0F766E' }}>.ai</span>
            </div>
          </Link>
          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            <Link href="/" className="text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Find Pros</Link>
            <Link href="/community" className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border-b-2 border-teal-600">Community</Link>
            <Link href="/jobs" className="text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Projects</Link>
            {/* Resources dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1 text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                Resources
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <Link href="/blog" className="block px-4 py-2 text-sm text-gray-700 hover:bg-stone-50">Blog</Link>
                <Link href="/guides" className="block px-4 py-2 text-sm text-gray-700 hover:bg-stone-50">Guides</Link>
                <Link href="/license-lookup" className="block px-4 py-2 text-sm text-gray-700 hover:bg-stone-50">License Lookup</Link>
              </div>
            </div>
          </div>
        </div>
        {/* Right side */}
        <div className="flex items-center gap-3">
          <>
            <Link href="/login" className="text-sm text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors hidden sm:block">Log in</Link>
            <Link href="/login?tab=signup" className="text-sm font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Join Free</Link>
          </>
        </div>
      </nav>}

      {/* ── Hero Banner — logged out only ── */}
      {!session && (
        <div className="relative bg-white overflow-hidden" style={{ minHeight: 280 }}>
          {/* Background photo — right half */}
          <div className="absolute inset-0 left-[35%] right-[10%]">
            <img
              src="https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=1200&fit=crop"
              alt="Kitchen remodel"
              className="w-full h-full object-cover"
            />
            {/* Fade from white on the left */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, white 0%, white 5%, transparent 30%, transparent 80%, white 95%, white 100%)' }} />
          </div>

          {/* Content */}
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 flex items-start">
            {/* Left — headline + search */}
            <div className="flex-1 max-w-lg">
              <h1 className="font-serif text-4xl font-bold leading-tight mb-3" style={{ color: '#0A1628' }}>
                Real work from<br />licensed pros.
              </h1>
              <p className="text-gray-700 font-medium text-base mb-5 leading-relaxed">
                See projects, ask questions, and connect<br />with trusted professionals near you.
              </p>
              {/* Search bar */}
              <div className="flex gap-2 mb-5">
                <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    placeholder="What project are you planning?"
                    className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"
                    onKeyDown={e => { if (e.key === 'Enter') { setSearchInput((e.target as HTMLInputElement).value); setSearch((e.target as HTMLInputElement).value) } }}
                  />
                </div>
                <button
                  onClick={() => {}}
                  className="px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span className="text-sm text-gray-600">{session ? (session as any).city || 'Florida' : 'Florida'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
              {/* Trust badges */}
              <div className="flex flex-wrap gap-4">
                {[
                  { icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', label: 'Licensed Pros' },
                  { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Background Checked' },
                  { icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', label: 'Real Reviews' },
                  { icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636', label: 'No Lead Fees' },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={b.icon}/></svg>
                    <span>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Get Matched card */}
            <div className="hidden lg:block flex-shrink-0 bg-white rounded-2xl shadow-lg p-5 mt-2 ml-auto" style={{ width: "calc(33.333% - 10px)" }}>
              <div className="text-base font-bold text-gray-900 mb-1">Need help with your project?</div>
              <p className="text-sm text-gray-700 font-medium mb-4 leading-relaxed">Get matched with verified local pros.</p>
              <Link href="/post-job"
                className="block w-full py-2.5 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors mb-3">
                Get Matched Now
              </Link>
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>100% free</span>
                <span>·</span>
                <span>No obligation</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Popular Categories ── */}
      <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <h2 className="text-sm font-bold text-gray-700 mb-2">Popular Categories</h2>
          <div className="flex gap-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {[
              { label: 'Roofing',       img: 'https://images.unsplash.com/photo-1605450099279-533bd3ce379a?w=120&h=120&fit=crop', slug: 'roofer' },
              { label: 'Bathroom',      img: 'https://plus.unsplash.com/premium_photo-1676320514136-5a15d9f97dfa?w=120&h=120&fit=crop', slug: 'plumber' },
              { label: 'Kitchen',       img: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=120&h=120&fit=crop', slug: 'general-contractor' },
              { label: 'HVAC',          img: 'https://images.unsplash.com/photo-1651474738521-efacfb201039?w=120&h=120&fit=crop', slug: 'hvac-technician' },
              { label: 'Storm Damage',  img: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=120&h=120&fit=crop', slug: 'roofer' },
              { label: 'Flooring',      img: 'https://images.unsplash.com/photo-1575204015311-0fe377370780?w=120&h=120&fit=crop', slug: 'carpenter' },
              { label: 'Painting',      img: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=120&h=120&fit=crop', slug: 'painter' },
              { label: 'Electrical',    img: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=120&h=120&fit=crop', slug: 'electrician' },
            ].map(cat => {
              const active = tradeFilter === cat.slug
              return (
                <button key={cat.label} onClick={() => setTradeFilter(active ? '' : cat.slug)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
                  <div className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all ${active ? 'border-teal-500 scale-105' : 'border-gray-100 group-hover:border-teal-400'}`}>
                    <img src={cat.img} alt={cat.label} className="w-full h-full object-cover" />
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap transition-colors ${active ? 'text-teal-700 font-semibold' : 'text-gray-700 group-hover:text-teal-700'}`}>{cat.label}</span>
                </button>
              )
            })}
            {/* View all — circle matching category style */}
            <Link href="/search" className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
              <div className="w-14 h-14 rounded-full border-2 border-gray-100 group-hover:border-teal-400 flex items-center justify-center bg-gray-50 transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-teal-600 transition-colors"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
              <span className="text-xs font-medium text-gray-700 group-hover:text-teal-700 transition-colors whitespace-nowrap">View all</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ── FEED ── */}
        <div className="lg:col-span-2">
          {/* Search bar — logged in only */}
          {session && <div className="flex gap-2 mb-3">
            <div className="flex-1 flex gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <input ref={searchRef} value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applySearch()}
                placeholder="Search posts..."
                className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400" />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearch('') }} className="text-gray-300 hover:text-gray-500">×</button>
              )}
            </div>
            <button onClick={applySearch}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Search
            </button>
          </div>}

          {session && <PostComposer session={session} onPost={post => setPosts(p => [post, ...p])} />}

          {loading ? (
            <div className="columns-1 sm:columns-2 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="break-inside-avoid mb-4 bg-white border border-gray-200 rounded-xl p-5 h-40 animate-pulse" />)}
            </div>
          ) : postsWithLikes.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <div className="text-4xl mb-3 opacity-20">🔧</div>
              <div className="font-semibold text-gray-700 mb-2">No posts found</div>
              <div className="text-sm text-gray-400">
                {tradeFilter || search ? 'Try clearing your filters.' : localOnly ? 'No local posts yet. Try switching to All.' : 'Be the first to share something.'}
              </div>
              {(tradeFilter || search) && (
                <button onClick={() => { setTradeFilter(''); setSearch(''); setSearchInput('') }}
                  className="mt-3 text-sm text-teal-600 hover:underline">Clear filters</button>
              )}
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 gap-4">
              {postsWithLikes.map(post => (
                <div key={post.id} className="break-inside-avoid mb-4">
                  <PostCard post={post} session={session} onLike={handleLike} onDelete={handleDelete} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pb-4 scrollbar-hide">

          {/* ── Projects Near You ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-900">Projects Near You</div>
              <Link href="/post-job" className="text-xs text-teal-600 hover:underline">View all →</Link>
            </div>
            {jobAlerts.length === 0 ? (
              <div className="text-xs text-gray-400">No open projects nearby.</div>
            ) : jobAlerts.map((job, i) => (
              <Link key={job.id} href="/jobs"
                className={`flex gap-3 py-2.5 ${i < jobAlerts.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-stone-50 -mx-2 px-2 rounded-lg transition-colors`}>
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{job.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {job.city ? `${job.city}, ${job.state}` : job.state || 'Florida'}
                    {job.budget_range ? ` · ${job.budget_range}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* ── Top Rated Pros ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-900">Top Rated Pros{session?.city ? ` in ${session.city}` : ''}</div>
              <Link href="/" className="text-xs text-teal-600 hover:underline">View all →</Link>
            </div>
            {suggested.length === 0 ? (
              <div className="text-xs text-gray-400">No suggestions yet.</div>
            ) : suggested.map(pro => (
              <div key={pro.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                <Link href={`/community/profile/${pro.id}`}><Avatar pro={pro} size={9} /></Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/community/profile/${pro.id}`} className="text-sm font-medium text-gray-900 hover:text-teal-600 truncate">{pro.full_name}</Link>
                    {(pro as any).is_verified && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#16a34a" className="flex-shrink-0"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {(pro as any).rating && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-500 font-medium">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {(pro as any).rating.toFixed(1)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 truncate">{pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}</span>
                  </div>
                </div>
                {session && session.id !== pro.id && <FollowButton proId={pro.id} followerId={session.id} />}
              </div>
            ))}
          </div>

          {/* ── Trending Questions ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-900">Trending Questions</div>
              <Link href="/community" className="text-xs text-teal-600 hover:underline">View all →</Link>
            </div>
            {trendingPosts.filter(p => p.post_type === 'tip').length === 0 ? (
              <div className="text-xs text-gray-400">No trending questions yet.</div>
            ) : trendingPosts.filter(p => p.post_type === 'tip').map((post, i, arr) => (
              <div key={post.id} className={`py-2.5 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <p className="text-sm text-gray-800 font-medium leading-snug line-clamp-2">{post.content}</p>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                  <span>{post.comment_count || 0} answers</span>
                  <span>·</span>
                  <span>{(post.pro as any)?.trade_category?.category_name || 'General'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY BOTTOM NAV ──────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t"
        style={{ borderColor: '#E8E2D9', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch h-16">
          {(session ? [
            { href: '/dashboard',  label: 'Home',      icon: '⊞' },
            { href: '/jobs',       label: 'Find Work', icon: '💼' },
            { href: '/community',  label: 'Community', icon: '◎' },
            { href: '/messages',   label: 'Messages',  icon: '✉' },
          ] : [
            { href: '/',           label: 'Home',      icon: '⊞' },
            { href: '/post-job',   label: 'Request',   icon: '+' },
            { href: '/community',  label: 'Community', icon: '◎' },
            { href: '/search',     label: 'Search',    icon: '🔍' },
          ]).map(item => {
            const active = item.href === '/community'
            return (
              <a key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: active ? '#0F766E' : '#9CA3AF' }}>
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-xs font-medium leading-none">{item.label}</span>
              </a>
            )
          })}
        </div>
      </nav>
      </div>
    </DashboardShell>
  )
}
