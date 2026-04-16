'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Session, Post, Pro } from '@/types'
import { initials, avatarColor, timeAgo, isPaid } from '@/lib/utils'

const POST_TYPES = [
  { value: 'update',    label: 'Update',    emoji: '💬' },
  { value: 'work',      label: 'Work',      emoji: '🔧' },
  { value: 'tip',       label: 'Tip',       emoji: '💡' },
  { value: 'milestone', label: 'Milestone', emoji: '🏆' },
]

function Avatar({ pro, size = 10 }: { pro: any; size?: number }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0`
  if (pro?.profile_photo_url) return <img src={pro.profile_photo_url} alt={pro.full_name} className={`${cls} object-cover`} />
  return <div className={cls} style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
}

function PostCard({ post, session, onLike, onDelete }: {
  post: Post & { liked_by_me: boolean }
  session: Session | null
  onLike: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments]         = useState<any[]>([])
  const [commentText, setCommentText]   = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const isOwn    = session?.id === post.pro_id
  const typeInfo = POST_TYPES.find(t => t.value === post.post_type)
  const isVerifiedPro = (post.pro as any)?.is_verified

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: post.id, pro_id: session.id, content: commentText }),
    })
    const d = await r.json()
    if (r.ok) { setComments(c => [...c, d.comment]); setCommentText('') }
    setSubmittingComment(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Post header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <Link href={`/community/profile/${post.pro_id}`}>
          <Avatar pro={post.pro} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/community/profile/${post.pro_id}`}
              className="font-semibold text-sm text-gray-900 hover:text-teal-600 transition-colors">
              {post.pro?.full_name}
            </Link>
            {/* Verified badge on post author */}
            {isVerifiedPro && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                </svg>
                Verified
              </span>
            )}
            {isPaid((post.pro?.plan_tier ?? 'Free') as any) && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Pro</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {typeInfo?.emoji} {typeInfo?.label}
            </span>
            {session && session.id !== post.pro_id && (
              <a href={`/messages?with=${post.pro_id}`} className="text-xs text-gray-400 hover:text-teal-600 transition-colors ml-auto">💬</a>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {post.pro?.trade_category?.category_name}
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
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Photo */}
      {post.photo_url && (
        <div className="px-4 pb-3">
          <img src={post.photo_url} alt="Post"
            className="w-full rounded-xl object-contain bg-stone-50" style={{ maxHeight: '560px' }} />
        </div>
      )}

      {/* Actions — Respect + Comments */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-t border-gray-100">
        <button onClick={() => session && onLike(post.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            post.liked_by_me
              ? 'bg-teal-50 text-teal-700 font-semibold'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
          }`}>
          <span>{post.liked_by_me ? '✊' : '✊'}</span>
          <span>Respect</span>
          {post.like_count > 0 && <span className="font-semibold">{post.like_count}</span>}
        </button>
        <button onClick={loadComments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
          <span>💬</span>
          <span>{post.comment_count > 0 ? post.comment_count : 'Comment'}</span>
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="border-t border-gray-100 px-4 py-3 bg-stone-50/60">
          {loadingComments ? (
            <div className="text-xs text-gray-400 py-2">Loading...</div>
          ) : (
            <div className="space-y-2.5 mb-3">
              {comments.length === 0 && (
                <div className="text-xs text-gray-400">No comments yet — be the first.</div>
              )}
              {comments.map(cm => {
                const cmVerified = cm.pro?.is_verified
                return (
                  <div key={cm.id} className="flex gap-2 items-start">
                    <Avatar pro={cm.pro} size={7} />
                    <div className="flex-1 bg-white rounded-xl px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-gray-800">{cm.pro?.full_name}</span>
                        {cmVerified && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                            </svg>
                            Verified
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">{cm.content}</div>
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
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400 transition-colors" />
                <button onClick={submitComment} disabled={submittingComment || !commentText.trim()}
                  className="px-3 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
                  Post
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Action bar shortcuts above composer ───────────────────────────────────────
function ActionBar({ active, onSelect }: { active: string; onSelect: (type: string) => void }) {
  const actions = [
    { type: 'work',      icon: '📸', label: 'Post work' },
    { type: 'tip',       icon: '❓', label: 'Ask a pro' },
    { type: 'milestone', icon: '🏆', label: 'Milestone' },
  ]
  return (
    <div className="flex gap-2 mb-3">
      {actions.map(a => (
        <button key={a.type} onClick={() => onSelect(a.type)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
            active === a.type
              ? 'bg-teal-600 border-teal-600 text-white'
              : 'border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50'
          }`}>
          <span style={{fontSize:'14px'}}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  )
}

function PostComposer({ session, onPost }: { session: Session; onPost: (post: Post) => void }) {
  const [content, setContent]     = useState('')
  const [postType, setPostType]   = useState<string>('update')
  const [photo, setPhoto]         = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
    setPosting(true)
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, content, photo_url: photo, post_type: postType }),
    })
    const d = await r.json()
    if (r.ok) { onPost(d.post); setContent(''); setPhoto(null); setPostType('update') }
    setPosting(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <ActionBar active={postType} onSelect={type => setPostType(type)} />
      <div className="flex gap-3">
        <Avatar pro={{ full_name: session.name, profile_photo_url: null }} />
        <div className="flex-1">
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Share a work update, tip, or ask the community..."
            rows={3}
            className="w-full text-sm text-gray-900 bg-stone-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />
          {photo && (
            <div className="relative mt-2 inline-block">
              <img src={photo} alt="Preview" className="h-20 rounded-lg object-cover" />
              <button onClick={() => setPhoto(null)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center">✕</button>
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
                {uploading ? 'Uploading...' : '📷 Photo'}
              </button>
            </div>
            <button onClick={handlePost} disabled={posting || (!content.trim() && !photo)}
              className="px-5 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors">
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
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
        following
          ? 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-400'
          : 'border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100'
      }`}>
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  )
}

export default function CommunityPage() {
  const [session, setSession]   = useState<Session | null>(null)
  const [posts, setPosts]       = useState<Post[]>([])
  const [suggested, setSuggested] = useState<Pro[]>([])
  const [jobAlerts, setJobAlerts] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [localOnly, setLocalOnly] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    const s   = raw ? JSON.parse(raw) : null
    setSession(s)

    const feedUrl = s ? `/api/posts?feed_for=${s.id}&limit=30` : `/api/posts?limit=30`

    Promise.all([
      fetch(feedUrl).then(r => r.json()),
      fetch('/api/pros?limit=12&sort=rating').then(r => r.json()),
      s ? fetch(`/api/posts/likes?pro_id=${s.id}`).then(r => r.json()) : Promise.resolve({ likes: [] }),
      fetch('/api/jobs?status=Open&limit=4').then(r => r.json()),
    ]).then(([postsData, prosData, likesData, jobsData]) => {
      setPosts(postsData.posts || [])
      const allPros = (prosData.pros || []).filter((p: Pro) => p.id !== s?.id)
      if (s?.trade) {
        const sameTrade = allPros.filter((p: any) => p.trade_category?.category_name === s.trade)
        const others    = allPros.filter((p: any) => p.trade_category?.category_name !== s.trade)
        setSuggested([...sameTrade, ...others].slice(0, 5))
      } else {
        setSuggested(allPros.slice(0, 5))
      }
      setLikedIds(new Set(likesData.likes || []))
      setJobAlerts(jobsData.jobs || [])
      setLoading(false)
    })
  }, [])

  const postsWithLikes = posts
    .map(p => ({ ...p, liked_by_me: likedIds.has(p.id) }))
    .filter(p => {
      if (!localOnly) return true
      const state = (p.pro as any)?.state
      return !state || state === 'FL'
    })

  async function handleLike(postId: string) {
    if (!session) return
    const r = await fetch('/api/posts/likes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, pro_id: session.id }),
    })
    const d = await r.json()
    if (r.ok) {
      setLikedIds(prev => {
        const next = new Set(prev)
        d.liked ? next.add(postId) : next.delete(postId)
        return next
      })
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, like_count: p.like_count + (d.liked ? 1 : -1) } : p
      ))
    }
  }

  async function handleDelete(postId: string) {
    if (!session) return
    await fetch(`/api/posts?id=${postId}&pro_id=${session.id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 h-[56px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
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
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
                  localOnly === opt.v ? 'bg-white text-gray-900 border border-gray-200' : 'text-gray-500 hover:text-gray-700'
                }`}>
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
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-serif text-xl text-gray-900">Community feed</h1>
            <div className="flex items-center gap-2">
              {/* Mobile local toggle */}
              <div className="sm:hidden flex items-center bg-stone-100 border border-gray-200 rounded-lg p-0.5">
                {[{ v: false, l: 'All' }, { v: true, l: 'FL' }].map(opt => (
                  <button key={String(opt.v)} onClick={() => setLocalOnly(opt.v)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all ${
                      localOnly === opt.v ? 'bg-white text-gray-900 border border-gray-200' : 'text-gray-500'
                    }`}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400">{postsWithLikes.length} posts</span>
            </div>
          </div>

          {session && <PostComposer session={session} onPost={post => setPosts(p => [post, ...p])} />}

          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 h-40 animate-pulse" />
              ))}
            </div>
          ) : postsWithLikes.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <div className="text-4xl mb-3 opacity-20">🔧</div>
              <div className="font-semibold text-gray-700 mb-2">No posts yet</div>
              <div className="text-sm text-gray-400">
                {localOnly ? 'No Florida posts yet. Try switching to All.' : 'Be the first to share something with the community.'}
              </div>
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
        <div className="space-y-4 lg:sticky lg:top-20">

          {/* Job Alerts */}
          {jobAlerts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-widest">Job alerts</div>
                <Link href="/jobs" className="text-xs text-teal-600 hover:underline">See all →</Link>
              </div>
              <div className="space-y-0">
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
            </div>
          )}

          {/* Pros to follow */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Pros to follow</div>
            {suggested.length === 0 ? (
              <div className="text-sm text-gray-400">No suggestions yet.</div>
            ) : suggested.map(pro => (
              <div key={pro.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                <Link href={`/community/profile/${pro.id}`}>
                  <Avatar pro={pro} size={9} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/community/profile/${pro.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-teal-600 block truncate">{pro.full_name}</Link>
                  <div className="text-xs text-gray-400 truncate">
                    {pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}
                  </div>
                </div>
                {session && session.id !== pro.id && (
                  <FollowButton proId={pro.id} followerId={session.id} />
                )}
              </div>
            ))}
          </div>

          {/* Quick nav */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Quick links</div>
            {[
              { href: '/',              label: '🔍 Find a pro' },
              { href: '/post-job',      label: '📋 Post a job' },
              { href: '/jobs',          label: '💼 Browse jobs' },
              session ? { href: `/community/profile/${session.id}`, label: '👤 My profile' } : { href: '/login', label: '👤 Log in' },
              session ? { href: '/community/edit', label: '✏️ Edit portfolio' } : null,
            ].filter(Boolean).map(item => (
              <Link key={item!.href} href={item!.href}
                className="block text-sm text-gray-600 hover:text-teal-600 py-2 border-b border-gray-100 last:border-0 transition-colors">
                {item!.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
