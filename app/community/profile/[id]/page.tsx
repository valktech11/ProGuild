'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Session, Pro, Post, PortfolioItem } from '@/types'
import { initials, avatarColor, starsHtml, timeAgo, isPaid, isElite, planLabel } from '@/lib/utils'

const POST_TYPES: Record<string, string> = { update: '💬', work: '🔧', tip: '💡', milestone: '🏆' }

function Avatar({ pro, size = 'md' }: { pro: any; size?: 'sm' | 'md' | 'lg' }) {
  const [bg, fg] = avatarColor(pro?.full_name || 'A')
  const sizeClass = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (pro?.profile_photo_url) return <img src={pro.profile_photo_url} alt={pro.full_name} className={`${sizeClass} rounded-full object-cover flex-shrink-0`} />
  return <div className={`${sizeClass} rounded-full flex items-center justify-center font-serif flex-shrink-0`} style={{ background: bg, color: fg }}>{initials(pro?.full_name || 'A')}</div>
}

export default function CommunityProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession]     = useState<Session | null>(null)
  const [pro, setPro]             = useState<Pro | null>(null)
  const [posts, setPosts]         = useState<Post[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [stats, setStats]         = useState({ followers: 0, following: 0 })
  const [isFollowing, setIsFollowing] = useState(false)
  const [likedIds, setLikedIds]   = useState<Set<string>>(new Set())
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<'posts' | 'portfolio'>('posts')
  const [lightbox, setLightbox]   = useState<PortfolioItem | null>(null)

  const isOwn = session?.id === id

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    const s = raw ? JSON.parse(raw) : null
    setSession(s)

    Promise.all([
      fetch(`/api/pros/${id}`).then(r => r.json()),
      fetch(`/api/posts?pro_id=${id}`).then(r => r.json()),
      fetch(`/api/portfolio?pro_id=${id}`).then(r => r.json()),
      fetch(`/api/follows?pro_id=${id}`).then(r => r.json()),
      s ? fetch(`/api/posts/likes?pro_id=${s.id}`).then(r => r.json()) : Promise.resolve({ likes: [] }),
    ]).then(([proData, postsData, portfolioData, followData, likesData]) => {
      setPro(proData.pro)
      setPosts(postsData.posts || [])
      setPortfolio(portfolioData.items || [])
      setStats({ followers: followData.follower_count || 0, following: followData.following_count || 0 })
      setLikedIds(new Set(likesData.likes || []))

      // Check if session user is following this pro
      if (s && followData.followers) {
        setIsFollowing((followData.followers || []).some((f: any) => f?.id === s.id))
      }
      setLoading(false)
    })
  }, [id])

  async function toggleFollow() {
    if (!session) return
    const r = await fetch('/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower_id: session.id, following_id: id }),
    })
    const d = await r.json()
    if (r.ok) {
      setIsFollowing(d.following)
      setStats(s => ({ ...s, followers: s.followers + (d.following ? 1 : -1) }))
    }
  }

  async function handleLike(postId: string) {
    if (!session) return
    const r = await fetch('/api/posts/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, pro_id: session.id }),
    })
    const d = await r.json()
    if (r.ok) {
      setLikedIds(prev => { const n = new Set(prev); d.liked ? n.add(postId) : n.delete(postId); return n })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: p.like_count + (d.liked ? 1 : -1) } : p))
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )

  if (!pro) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center"><div className="font-serif text-2xl text-gray-900 mb-2">Pro not found</div><Link href="/community" className="text-teal-600 text-sm">← Back to feed</Link></div>
    </div>
  )

  const rating = pro.avg_rating || 0
  const trade  = (pro as any).trade_category?.category_name || '—'
  const location = [pro.city, pro.state].filter(Boolean).join(', ')

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
          <Link href="/community" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">← Feed</Link>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            {isOwn ? (
              <Link href="/community/edit" className="text-sm font-medium px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Edit profile</Link>
            ) : (
              <button onClick={toggleFollow} className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-all ${isFollowing ? 'border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500' : 'bg-teal-600 text-white hover:bg-teal-700 border-teal-600'}`}>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Profile header */}
        <div className="bg-white border border-gray-100 rounded-2xl p-8 mb-6">
          <div className="flex gap-6 items-start">
            <Avatar pro={pro} size="lg" />
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-serif text-2xl text-gray-900 mb-1">{pro.full_name}</h1>
                  <div className="text-base font-medium text-teal-700 mb-1">{trade}</div>
                  <div className="text-sm text-gray-400 mb-3">{location}{pro.years_experience ? ` · ${pro.years_experience} yrs exp` : ''}</div>
                  <div className="flex flex-wrap gap-2">
                    {pro.is_verified && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-teal-50 text-teal-800">✓ Verified</span>}
                    {isElite(pro.plan_tier) && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-50 text-purple-800">Elite</span>}
                    {isPaid(pro.plan_tier) && !isElite(pro.plan_tier) && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-800">Pro</span>}
                    {pro.license_number && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800">Licensed</span>}
                  </div>
                </div>
                <Link href={`/pro/${pro.id}`} className="text-xs text-gray-400 hover:text-teal-600 whitespace-nowrap transition-colors">Marketplace profile →</Link>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-8 mt-6 pt-6 border-t border-gray-100">
            {[
              { n: posts.length, l: 'Posts' },
              { n: portfolio.length, l: 'Portfolio' },
              { n: stats.followers, l: 'Followers' },
              { n: stats.following, l: 'Following' },
              rating > 0 ? { n: `${rating.toFixed(1)} ★`, l: 'Rating' } : null,
            ].filter(Boolean).map(s => (
              <div key={s!.l} className="text-center">
                <div className="font-serif text-xl text-gray-900">{s!.n}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s!.l}</div>
              </div>
            ))}
          </div>

          {/* Bio */}
          {pro.bio && <p className="mt-5 text-sm text-gray-600 leading-relaxed font-light">{pro.bio}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white border border-gray-100 rounded-xl p-1 w-fit">
          {(['posts', 'portfolio'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-sm font-medium rounded-lg capitalize transition-all ${activeTab === tab ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
              {tab} {tab === 'posts' ? `(${posts.length})` : `(${portfolio.length})`}
            </button>
          ))}
        </div>

        {/* Posts tab */}
        {activeTab === 'posts' && (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
                <div className="text-3xl mb-2 opacity-20">📝</div>
                <div className="text-sm text-gray-400">{isOwn ? 'Share your first post on the feed.' : 'No posts yet.'}</div>
                {isOwn && <Link href="/community" className="mt-3 inline-block text-sm text-teal-600 font-medium">Go to feed →</Link>}
              </div>
            ) : posts.map(post => (
              <div key={post.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="flex items-start gap-3 p-5">
                  <Avatar pro={pro} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{pro.full_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{POST_TYPES[post.post_type]} {post.post_type}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{timeAgo(post.created_at)}</div>
                  </div>
                </div>
                <div className="px-5 pb-4">
                  <p className="text-sm text-gray-700 leading-relaxed">{post.content}</p>
                </div>
                {post.photo_url && (
                  <div className="px-5 pb-4">
                    <img src={post.photo_url} alt="Post" className="w-full rounded-xl object-cover max-h-72" />
                  </div>
                )}
                <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-50">
                  <button onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${likedIds.has(post.id) ? 'text-teal-600 font-medium' : 'text-gray-400'}`}>
                    {likedIds.has(post.id) ? '♥' : '♡'} {post.like_count}
                  </button>
                  <span className="text-sm text-gray-400">💬 {post.comment_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Portfolio tab */}
        {activeTab === 'portfolio' && (
          <>
            {portfolio.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
                <div className="text-3xl mb-2 opacity-20">📸</div>
                <div className="text-sm text-gray-400">{isOwn ? 'Add your first project to your portfolio.' : 'No portfolio items yet.'}</div>
                {isOwn && <Link href="/community/edit" className="mt-3 inline-block text-sm text-teal-600 font-medium">Add portfolio →</Link>}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {portfolio.map(item => (
                  <div key={item.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
                    onClick={() => setLightbox(item)}>
                    <img src={item.photo_url} alt={item.title} className="w-full h-44 object-cover" />
                    <div className="p-3">
                      <div className="text-sm font-semibold text-gray-900 truncate">{item.title}</div>
                      {item.trade && <div className="text-xs text-teal-600 mt-0.5">{item.trade}</div>}
                      {item.description && <div className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.photo_url} alt={lightbox.title} className="w-full max-h-96 object-cover" />
            <div className="p-5">
              <div className="font-semibold text-gray-900 mb-1">{lightbox.title}</div>
              {lightbox.trade && <div className="text-xs text-teal-600 mb-2">{lightbox.trade}</div>}
              {lightbox.description && <p className="text-sm text-gray-600 leading-relaxed">{lightbox.description}</p>}
              <div className="text-xs text-gray-400 mt-3">{timeAgo(lightbox.created_at)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
