'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Session, Post, Pro } from '@/types'
import { initials, avatarColor, timeAgo, isPaid } from '@/lib/utils'

const POST_TYPES = [
  { value: 'update',    label: 'Update',    emoji: '💬' },
  { value: 'work',      label: 'Work',      emoji: '🔧' },
  { value: 'tip',       label: 'Ask a pro', emoji: '❓' },
  { value: 'milestone', label: 'Milestone', emoji: '🏆' },
]

const TRADE_CHIPS = [
  { label: 'Electrical', slug: 'electrician' },
  { label: 'Plumbing',   slug: 'plumber' },
  { label: 'HVAC',       slug: 'hvac-technician' },
  { label: 'Carpentry',  slug: 'carpenter' },
  { label: 'Roofing',    slug: 'roofer' },
  { label: 'Painting',   slug: 'painter' },
  { label: 'GC',         slug: 'general-contractor' },
  { label: 'Drywall',    slug: 'drywall' },
]

function Avatar({ pro, size = 10 }: { pro: any; size?: number }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0`
  if (pro?.profile_photo_url) return <img src={pro.profile_photo_url} alt={pro.full_name} className={`${cls} object-cover`} />
  return <div className={cls} style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
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
  const isOwn         = session?.id === post.pro_id
  const typeInfo      = POST_TYPES.find(t => t.value === post.post_type)
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

      {/* Ask a Pro banner */}
      {isAskAPro && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
          <span className="text-lg">❓</span>
          <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">Question for the Community</span>
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
                {typeInfo?.emoji} {typeInfo?.label}
              </span>
            )}
            {session && session.id !== post.pro_id && (
              <a href={`/messages?with=${post.pro_id}`} className="text-xs text-gray-400 hover:text-teal-600 transition-colors ml-auto">💬</a>
            )}
          </div>
          <div className="text-sm text-gray-400 mt-0.5">
            {(post.pro as any)?.trade_category?.category_name}
            {post.pro?.city ? ` · ${post.pro.city}` : ''}
            {post.pro?.state ? `, ${post.pro.state}` : ''}
            {` · ${timeAgo(post.created_at)}`}
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

      {/* Work post photo — or before/after slider */}
      {post.photo_url && (
        <div className="px-4 pb-3">
          {post.is_before_after && post.before_photo_url ? (
            <>
              <BeforeAfterSlider afterUrl={post.photo_url} beforeUrl={post.before_photo_url} />
              <div className="mt-1.5 flex items-center gap-1">
                <span className="text-sm text-teal-600 font-medium">📸 Before & After</span>
                {(post.pro as any)?.trade_category?.category_name && (
                  <span className="text-sm text-gray-400">· {(post.pro as any).trade_category.category_name}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <img src={post.photo_url} alt="Post"
                className="w-full rounded-xl object-contain bg-stone-50" style={{ maxHeight: '560px' }} />
              {isWork && (
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-sm text-teal-600 font-medium">📸 Project work</span>
                  {(post.pro as any)?.trade_category?.category_name && (
                    <span className="text-sm text-gray-400">· {(post.pro as any).trade_category.category_name}</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-t border-gray-100">
        {isOwn ? (
          /* Own post — show respect count read-only, no button */
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 select-none">
            <span>✊</span>
            <span>Respect</span>
            {post.like_count > 0 && <span className="font-semibold">{post.like_count}</span>}
          </div>
        ) : (
          <button onClick={() => session && onLike(post.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              post.liked_by_me ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
            }`}>
            <span>✊</span>
            <span>Respect</span>
            {post.like_count > 0 && <span className="font-semibold">{post.like_count}</span>}
          </button>
        )}
        <button onClick={loadComments}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            isAskAPro ? 'text-blue-600 hover:bg-blue-50 font-medium' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}>
          <span>💬</span>
          <span>{isAskAPro ? (post.comment_count > 0 ? `${post.comment_count} answers` : 'Answer this') : (post.comment_count > 0 ? post.comment_count : 'Comment')}</span>
        </button>
      </div>

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

// ── Composer with functional type selection ───────────────────────────────────
function PostComposer({ session, onPost }: { session: Session; onPost: (post: Post) => void }) {
  const [content, setContent]     = useState('')
  const [postType, setPostType]   = useState<string>('update')
  const [photo, setPhoto]         = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]     = useState(false)
  const [error, setError]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const typeConfig: Record<string, { placeholder: string; requirePhoto?: boolean }> = {
    update:    { placeholder: 'Share an update with the community...' },
    work:      { placeholder: 'Describe the project — what trade, what was the challenge?', requirePhoto: false },
    tip:       { placeholder: 'What question do you have for the community? Be specific about the trade and situation.' },
    milestone: { placeholder: 'What milestone are you celebrating? Years in business, certification achieved, biggest project?' },
  }

  const current = typeConfig[postType] || typeConfig.update

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id)
    form.append('bucket', 'portfolio'); form.append('folder', `posts/${session.id}`)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    if (r.ok) setPhoto(d.url)
    setUploading(false)
  }

  async function handlePost() {
    if (!content.trim() && !photo) return
    setPosting(true); setError('')
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, content, photo_url: photo, post_type: postType }),
    })
    const d = await r.json()
    if (r.ok) { onPost(d.post); setContent(''); setPhoto(null); setPostType('update') }
    else setError(d.error || 'Could not post. Please try again.')
    setPosting(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">

      {/* Post type + composer row */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-0">
        <Avatar pro={{ full_name: session.name, profile_photo_url: null }} />
        <div className="flex-1">
          {/* Type dropdown */}
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-400 font-medium flex-shrink-0">Post type:</label>
            <div className="relative">
              <select
                value={postType}
                onChange={e => { setPostType(e.target.value); setError('') }}
                className="appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-teal-400 cursor-pointer transition-colors"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
              >
                {POST_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </div>
            {/* Active type pill */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              postType === 'tip'       ? 'bg-blue-50 text-blue-700' :
              postType === 'milestone' ? 'bg-amber-50 text-amber-700' :
              postType === 'work'      ? 'bg-teal-50 text-teal-700' :
                                         'bg-gray-100 text-gray-500'
            }`}>
              {postType === 'tip'       ? 'Verified pros will answer' :
               postType === 'milestone' ? 'Career achievement' :
               postType === 'work'      ? 'Appears in Top Craftsmanship' :
                                          'General update'}
            </span>
          </div>

          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder={current.placeholder}
            rows={3}
            className="w-full text-sm text-gray-900 bg-stone-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />
        </div>
      </div>

      {photo && (
        <div className="px-4 pb-0 mt-2">
          <div className="relative inline-block">
            <img src={photo} alt="Preview" className="h-20 rounded-lg object-cover" />
            <button onClick={() => setPhoto(null)}
              className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center">✕</button>
          </div>
        </div>
      )}
      {error && <div className="px-4 mt-2 text-xs text-red-600">{error}</div>}

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-3">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {uploading ? 'Uploading...' : '📷 Photo'}
          </button>
        </div>
        <button onClick={handlePost} disabled={posting || (!content.trim() && !photo)}
          className="px-5 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors">
          {posting ? 'Posting...' : postType === 'tip' ? 'Ask' : postType === 'milestone' ? 'Share milestone' : 'Post'}
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
  const [session,    setSession]    = useState<Session | null>(null)
  const [posts,      setPosts]      = useState<Post[]>([])
  const [suggested,  setSuggested]  = useState<Pro[]>([])
  const [jobAlerts,  setJobAlerts]  = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [likedIds,   setLikedIds]   = useState<Set<string>>(new Set())
  const [localOnly,  setLocalOnly]  = useState(false)
  const [tradeFilter,setTradeFilter]= useState('')
  const [search,     setSearch]     = useState('')
  const [searchInput,setSearchInput]= useState('')
  const searchRef    = useRef<HTMLInputElement>(null)
  const chipScrollRef = useRef<HTMLDivElement>(null)

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

    Promise.all([
      fetch(buildFeedUrl(s)).then(r => r.json()),
      fetch('/api/pros?limit=12&sort=rating').then(r => r.json()),
      s ? fetch(`/api/posts/likes?pro_id=${s.id}`).then(r => r.json()) : Promise.resolve({ likes: [] }),
      fetch('/api/jobs?status=Open&limit=4').then(r => r.json()),
    ]).then(([postsData, prosData, likesData, jobsData]) => {
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
    <div className="min-h-screen bg-stone-100">
      {/* Nav */}
      <nav className="bg-white/95 backdrop-blur border-b px-6 h-14 flex items-center justify-between sticky top-0 z-50" style={{ borderColor: '#E8E2D9' }}>
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#cb)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                <defs><linearGradient id="cb" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-serif text-lg font-bold" style={{ color: '#0A1628' }}>ProGuild</span>
              <span className="font-sans font-medium text-sm" style={{ color: '#0F766E' }}>.ai</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            <Link href="/community" className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700">Feed</Link>
            <Link href="/" className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Find a pro</Link>
            <Link href="/jobs" className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Jobs</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Local / National toggle */}
          <div className="hidden sm:flex items-center bg-stone-100 border border-gray-200 rounded-lg p-0.5">
            {[{ v: false, l: 'All' }, { v: true, l: 'Florida' }].map(opt => (
              <button key={String(opt.v)} onClick={() => setLocalOnly(opt.v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${localOnly === opt.v ? 'bg-white text-gray-900 border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                {opt.l}
              </button>
            ))}
          </div>
          {session ? (
            <>
              <Link href={`/community/profile/${session.id}`} className="text-sm text-gray-500 hover:text-teal-600 hidden sm:block">My profile</Link>
              <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Dashboard</Link>
            </>
          ) : (
            <Link href="/login" className="text-sm font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Log in</Link>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ── FEED ── */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-serif text-xl text-gray-900">Community feed</h1>
            <div className="flex items-center gap-2">
              <div className="sm:hidden flex items-center bg-stone-100 border border-gray-200 rounded-lg p-0.5">
                {[{ v: false, l: 'All' }, { v: true, l: 'FL' }].map(opt => (
                  <button key={String(opt.v)} onClick={() => setLocalOnly(opt.v)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all ${localOnly === opt.v ? 'bg-white text-gray-900 border border-gray-200' : 'text-gray-500'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <span className="text-sm text-gray-400">{postsWithLikes.length} posts</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex gap-2 mb-3">
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
          </div>

          {/* Trade filter chips — swipe on mobile, arrow buttons on desktop */}
          <div className="relative mb-3">
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to right, #FAF9F6 60%, transparent)' }} />
            <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to left, #FAF9F6 60%, transparent)' }} />

            {/* Arrow buttons — desktop only */}
            <button onClick={() => chipScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-teal-600 hover:border-teal-400 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={() => chipScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-teal-600 hover:border-teal-400 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            {/* Chip row — native swipe on mobile, padded for desktop arrows */}
            <div ref={chipScrollRef}
              className="flex gap-2 overflow-x-auto md:px-8"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <button onClick={() => setTradeFilter('')}
                className={'flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ' + (!tradeFilter ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-700')}
                style={!tradeFilter ? {} : { background: 'rgba(15,118,110,0.06)' }}>
                All trades
              </button>
              {TRADE_CHIPS.map(chip => (
                <button key={chip.slug} onClick={() => setTradeFilter(tradeFilter === chip.slug ? '' : chip.slug)}
                  className={'flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ' + (tradeFilter === chip.slug ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-700')}
                  style={tradeFilter === chip.slug ? {} : { background: 'rgba(15,118,110,0.06)' }}>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logged-out CTA */}
          {!session && (
            <div className="bg-white border border-teal-200 rounded-xl p-5 mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-0.5">Join Florida's verified trades community</div>
                <div className="text-xs text-gray-500">Share work, ask questions, find local pros — free forever.</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link href="/login" className="text-xs font-semibold px-3 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Log in</Link>
                <Link href="/login?tab=signup" className="text-xs font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Join free</Link>
              </div>
            </div>
          )}

          {session && <PostComposer session={session} onPost={post => setPosts(p => [post, ...p])} />}

          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 h-40 animate-pulse" />)}
            </div>
          ) : postsWithLikes.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <div className="text-4xl mb-3 opacity-20">🔧</div>
              <div className="font-semibold text-gray-700 mb-2">No posts found</div>
              <div className="text-sm text-gray-400">
                {tradeFilter || search ? 'Try clearing your filters.' : localOnly ? 'No Florida posts yet. Try switching to All.' : 'Be the first to share something.'}
              </div>
              {(tradeFilter || search) && (
                <button onClick={() => { setTradeFilter(''); setSearch(''); setSearchInput('') }}
                  className="mt-3 text-sm text-teal-600 hover:underline">Clear filters</button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {postsWithLikes.map(post => (
                <PostCard key={post.id} post={post} session={session} onLike={handleLike} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pb-4 scrollbar-hide">

          {/* Job Alerts */}
          {jobAlerts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-widest">Job alerts</div>
                <Link href="/jobs" className="text-xs text-teal-600 hover:underline">See all →</Link>
              </div>
              {jobAlerts.map((job, i) => (
                <Link key={job.id} href="/jobs"
                  className={`block py-2.5 ${i < jobAlerts.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-stone-50 -mx-2 px-2 rounded-lg transition-colors`}>
                  <div className="text-sm font-medium text-gray-900 truncate">{job.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                    {job.city ? `${job.city}, ${job.state}` : job.state || 'Florida'}
                    {job.budget_range ? ` · ${job.budget_range}` : ''}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pros to follow */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Pros to follow</div>
            {suggested.length === 0
              ? <div className="text-sm text-gray-400">No suggestions yet.</div>
              : suggested.map(pro => (
                <div key={pro.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                  <Link href={`/community/profile/${pro.id}`}><Avatar pro={pro} size={9} /></Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/community/profile/${pro.id}`} className="text-sm font-medium text-gray-900 hover:text-teal-600 block truncate">{pro.full_name}</Link>
                    <div className="text-xs text-gray-400 truncate">{pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}</div>
                  </div>
                  {session && session.id !== pro.id && <FollowButton proId={pro.id} followerId={session.id} />}
                </div>
              ))
            }
          </div>

          {/* Logged-out signup */}
          {!session && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm font-bold text-gray-900 mb-1">New to ProGuild.ai?</div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Florida's verified trades community. Share your work, connect with GCs, find jobs — free forever.
              </p>
              <Link href="/login?tab=signup"
                className="block w-full py-2.5 text-center bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors mb-2">
                Join as a pro — free
              </Link>
              <Link href="/login"
                className="block w-full py-2.5 text-center border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                Log in
              </Link>
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
                {[['🔍','Find a pro','/'],['📋','Post a job','/post-job'],['💼','Browse jobs','/jobs']].map(([icon,label,href]) => (
                  <Link key={href as string} href={href as string}
                    className="flex items-center gap-2 py-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors">
                    <span>{icon}</span>{label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Logged-in quick links */}
          {session && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Quick links</div>
              {[
                { href: '/',                                    label: '🔍 Find a pro' },
                { href: '/post-job',                            label: '📋 Post a job' },
                { href: '/jobs',                                label: '💼 Browse jobs' },
                { href: `/community/profile/${session.id}`,    label: '👤 My profile' },
                { href: '/community/edit',                      label: '✏️ Edit portfolio' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="block text-sm text-gray-600 hover:text-teal-600 py-2 border-b border-gray-100 last:border-0 transition-colors">
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
