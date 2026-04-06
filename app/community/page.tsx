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

function PostCard({ post, session, onLike, onDelete }: { post: Post; session: Session | null; onLike: (id: string) => void; onDelete: (id: string) => void }) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const isOwn = session?.id === post.pro_id
  const typeInfo = POST_TYPES.find(t => t.value === post.post_type)

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
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      {/* Post header */}
      <div className="flex items-start gap-3 p-5 pb-3">
        <Link href={`/community/profile/${post.pro_id}`}>
          <Avatar pro={post.pro} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/community/profile/${post.pro_id}`} className="font-semibold text-sm text-gray-900 hover:text-teal-600 transition-colors">
              {post.pro?.full_name}
            </Link>
            {isPaid((post.pro?.plan_tier ?? 'Free') as any) && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Pro</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{typeInfo?.emoji} {typeInfo?.label}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {post.pro?.trade_category?.category_name} · {post.pro?.city}{post.pro?.state ? `, ${post.pro.state}` : ''} · {timeAgo(post.created_at)}
          </div>
        </div>
        {isOwn && (
          <button onClick={() => onDelete(post.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors px-2 py-1">✕</button>
        )}
      </div>

      {/* Content */}
      <div className="px-5 pb-4">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Photo */}
      {post.photo_url && (
        <div className="px-5 pb-4">
          <img src={post.photo_url} alt="Post" className="w-full rounded-xl object-cover max-h-80" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-5 py-3 border-t border-gray-50">
        <button onClick={() => session && onLike(post.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            post.liked_by_me ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          }`}>
          <span>{post.liked_by_me ? '♥' : '♡'}</span>
          <span>{post.like_count}</span>
        </button>
        <button onClick={loadComments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
          <span>💬</span>
          <span>{post.comment_count}</span>
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="border-t border-gray-50 px-5 py-4 bg-stone-50/50">
          {loadingComments ? (
            <div className="text-xs text-gray-400 py-2">Loading...</div>
          ) : (
            <div className="space-y-3 mb-4">
              {comments.length === 0 && <div className="text-xs text-gray-400">No comments yet — be the first.</div>}
              {comments.map(c => (
                <div key={c.id} className="flex gap-2 items-start">
                  <Avatar pro={c.pro} size={7} />
                  <div className="flex-1 bg-white rounded-xl px-3 py-2 border border-gray-100">
                    <div className="text-xs font-semibold text-gray-700 mb-0.5">{c.pro?.full_name}</div>
                    <div className="text-xs text-gray-600 leading-relaxed">{c.content}</div>
                  </div>
                </div>
              ))}
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

function PostComposer({ session, onPost }: { session: Session; onPost: (post: Post) => void }) {
  const [content, setContent]   = useState('')
  const [postType, setPostType] = useState<string>('update')
  const [photo, setPhoto]       = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    form.append('bucket', 'portfolio')
    form.append('folder', `posts/${session.id}`)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    if (r.ok) setPhoto(d.url)
    setUploading(false)
  }

  async function handlePost() {
    if (!content.trim()) return
    setPosting(true)
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, content, photo_url: photo, post_type: postType }),
    })
    const d = await r.json()
    if (r.ok) {
      onPost(d.post)
      setContent(''); setPhoto(null); setPostType('update')
    }
    setPosting(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-5">
      <div className="flex gap-3">
        <Avatar pro={{ full_name: session.name, profile_photo_url: null }} />
        <div className="flex-1">
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Share a work update, tip, or milestone..."
            rows={3}
            className="w-full text-sm text-gray-900 bg-stone-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />

          {photo && (
            <div className="relative mt-2 inline-block">
              <img src={photo} alt="Preview" className="h-24 rounded-lg object-cover" />
              <button onClick={() => setPhoto(null)} className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center">✕</button>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              {/* Post type */}
              <select value={postType} onChange={e => setPostType(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none">
                {POST_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
              </select>
              {/* Photo upload */}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
                {uploading ? 'Uploading...' : '📷 Photo'}
              </button>
            </div>
            <button onClick={handlePost} disabled={posting || !content.trim()}
              className="px-5 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors">
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CommunityPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [posts, setPosts]     = useState<Post[]>([])
  const [suggested, setSuggested] = useState<Pro[]>([])
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    const s = raw ? JSON.parse(raw) : null
    setSession(s)

    const feedUrl = s ? `/api/posts?feed_for=${s.id}&limit=30` : '/api/posts?limit=30'

    Promise.all([
      fetch(feedUrl).then(r => r.json()),
      fetch('/api/pros?limit=6').then(r => r.json()),
      s ? fetch(`/api/posts/likes?pro_id=${s.id}`).then(r => r.json()) : Promise.resolve({ likes: [] }),
    ]).then(([postsData, prosData, likesData]) => {
      setPosts(postsData.posts || [])
      setSuggested((prosData.pros || []).filter((p: Pro) => p.id !== s?.id).slice(0, 5))
      setLikedIds(new Set(likesData.likes || []))
      setLoading(false)
    })
  }, [])

  const postsWithLikes = posts.map(p => ({ ...p, liked_by_me: likedIds.has(p.id) }))

  async function handleLike(postId: string) {
    if (!session) return
    const r = await fetch('/api/posts/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, pro_id: session.id }),
    })
    const d = await r.json()
    if (r.ok) {
      setLikedIds(prev => {
        const next = new Set(prev)
        d.liked ? next.add(postId) : next.delete(postId)
        return next
      })
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, like_count: p.like_count + (d.liked ? 1 : -1) }
        : p
      ))
    }
  }

  async function handleDelete(postId: string) {
    if (!session) return
    await fetch(`/api/posts?id=${postId}&pro_id=${session.id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
          <div className="hidden md:flex items-center gap-1">
            <Link href="/community" className="text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700">Feed</Link>
            <Link href="/" className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Marketplace</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link href={`/community/profile/${session.id}`} className="text-sm text-gray-500 hover:text-teal-600 transition-colors">My profile</Link>
              <Link href="/dashboard" className="text-sm font-medium px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Dashboard</Link>
            </>
          ) : (
            <Link href="/login" className="text-sm font-medium px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Log in</Link>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* FEED */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h1 className="font-serif text-2xl text-gray-900">Trade feed</h1>
            <span className="text-xs text-gray-400">{posts.length} posts</span>
          </div>

          {/* Composer — logged in pros only */}
          {session && <PostComposer session={session} onPost={post => setPosts(p => [post, ...p])} />}

          {/* Posts */}
          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-shimmer h-40" />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center">
              <div className="text-4xl mb-3 opacity-20">🔧</div>
              <div className="font-semibold text-gray-700 mb-2">No posts yet</div>
              <div className="text-sm text-gray-400">Be the first to share something with the community.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {postsWithLikes.map(post => (
                <PostCard key={post.id} post={post} session={session} onLike={handleLike} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div className="space-y-5 sticky top-20">
          {/* Who to follow */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Pros to follow</div>
            {suggested.length === 0 ? (
              <div className="text-sm text-gray-400">No suggestions yet.</div>
            ) : suggested.map(pro => (
              <div key={pro.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <Link href={`/community/profile/${pro.id}`}>
                  <Avatar pro={pro} size={9} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/community/profile/${pro.id}`} className="text-sm font-medium text-gray-900 hover:text-teal-600 block truncate">{pro.full_name}</Link>
                  <div className="text-xs text-gray-400 truncate">{pro.trade_category?.category_name} · {pro.city}</div>
                </div>
                {session && session.id !== pro.id && (
                  <FollowButton proId={pro.id} followerId={session.id} />
                )}
              </div>
            ))}
          </div>

          {/* Community links */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Community</div>
            {[
              { href: '/community', label: '🏠 Feed' },
              { href: '/', label: '🔍 Find a pro' },
              { href: '/post-job', label: '📋 Post a job' },
              session ? { href: `/community/profile/${session?.id}`, label: '👤 My profile' } : { href: '/login', label: '👤 Log in' },
              session ? { href: '/community/edit', label: '✏️ Edit profile' } : null,
            ].filter(Boolean).map(item => (
              <Link key={item!.href} href={item!.href} className="block text-sm text-gray-600 hover:text-teal-600 py-2 border-b border-gray-50 last:border-0 transition-colors">
                {item!.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FollowButton({ proId, followerId }: { proId: string; followerId: string }) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading]    = useState(false)

  async function toggle() {
    setLoading(true)
    const r = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
