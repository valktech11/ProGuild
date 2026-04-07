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
  const [activeTab, setActiveTab] = useState<'posts' | 'portfolio' | 'skills'>('posts')
  const [lightbox, setLightbox]       = useState<PortfolioItem | null>(null)
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null)
  const [followList, setFollowList]   = useState<any[]>([])
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [skills, setSkills]           = useState<any[]>([])
  const [tradeScore, setTradeScore]   = useState<number | null>(null)
  const [newSkill, setNewSkill]       = useState('')
  const [addingSkill, setAddingSkill] = useState(false)

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

    // Fetch skills and trade score
    Promise.all([
      fetch(`/api/skills?pro_id=${id}&viewer_id=${s?.id || ''}`).then(r => r.json()),
      fetch(`https://bzfauzqqxwtqqskjhrgq.supabase.co/rest/v1/trade_score?id=eq.${id}&select=trade_score`, {
        headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZmF1enFxeHd0cXFza2pocmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQwMTksImV4cCI6MjA5MDk5MDAxOX0.3q_LydQPbCoPDw_6N0Q9F1-Dgt_RGH4Whh_cffZwzNg' }
      }).then(r => r.json()),
    ]).then(([skillsData, scoreData]) => {
      setSkills(skillsData.skills || [])
      setTradeScore(scoreData?.[0]?.trade_score ?? null)
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

  async function addSkill() {
    if (!newSkill.trim() || !session || !isOwn) return
    setAddingSkill(true)
    const r = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, skill_name: newSkill.trim() }),
    })
    const d = await r.json()
    if (r.ok) { setSkills(prev => [...prev, { ...d.skill, endorsement_count: 0, endorsed_by_me: false }]); setNewSkill('') }
    setAddingSkill(false)
  }

  async function removeSkill(skillId: string) {
    if (!session) return
    await fetch(`/api/skills?id=${skillId}&pro_id=${session.id}`, { method: 'DELETE' })
    setSkills(prev => prev.filter(s => s.id !== skillId))
  }

  async function endorseSkill(skillId: string) {
    if (!session || isOwn) return
    const r = await fetch('/api/skills/endorse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: skillId, endorsed_by: session.id }),
    })
    const d = await r.json()
    if (r.ok) {
      setSkills(prev => prev.map(s => s.id === skillId ? {
        ...s,
        endorsed_by_me: d.endorsed,
        endorsement_count: s.endorsement_count + (d.endorsed ? 1 : -1)
      } : s))
    }
  }

  async function openFollowModal(type: 'followers' | 'following') {
    setFollowModal(type)
    setLoadingFollow(true)
    const r = await fetch(`/api/follows?pro_id=${id}`)
    const d = await r.json()
    setFollowList(type === 'followers' ? (d.followers || []) : (d.following || []))
    setLoadingFollow(false)
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

          {/* TradeScore badge */}
          {tradeScore !== null && (
            <div className="flex items-center gap-2 mt-4 mb-2">
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2">
                <div className="text-2xl font-serif font-bold text-teal-700">{tradeScore}</div>
                <div>
                  <div className="text-xs font-bold text-teal-700 uppercase tracking-wide">TradeScore</div>
                  <div className="text-xs text-teal-500">Credibility rating</div>
                </div>
              </div>
              {pro.available_for_work && (
                <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs font-semibold text-green-700">Available for work</span>
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-8 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <div className="font-serif text-xl text-gray-900">{posts.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">Posts</div>
            </div>
            <div className="text-center">
              <div className="font-serif text-xl text-gray-900">{portfolio.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">Portfolio</div>
            </div>
            <button onClick={() => openFollowModal('followers')} className="text-center hover:opacity-70 transition-opacity">
              <div className="font-serif text-xl text-gray-900">{stats.followers}</div>
              <div className="text-xs text-teal-600 mt-0.5 font-medium">Followers</div>
            </button>
            <button onClick={() => openFollowModal('following')} className="text-center hover:opacity-70 transition-opacity">
              <div className="font-serif text-xl text-gray-900">{stats.following}</div>
              <div className="text-xs text-teal-600 mt-0.5 font-medium">Following</div>
            </button>
            {rating > 0 && (
              <div className="text-center">
                <div className="font-serif text-xl text-gray-900">{rating.toFixed(1)} ★</div>
                <div className="text-xs text-gray-400 mt-0.5">Rating</div>
              </div>
            )}
          </div>

          {/* Bio */}
          {pro.bio && <p className="mt-5 text-sm text-gray-600 leading-relaxed font-light">{pro.bio}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white border border-gray-100 rounded-xl p-1 w-fit">
          {(['posts', 'portfolio', 'skills'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2 text-sm font-medium rounded-lg capitalize transition-all ${activeTab === tab ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
              {tab === 'posts' ? `Posts (${posts.length})` : tab === 'portfolio' ? `Portfolio (${portfolio.length})` : `Skills (${skills.length})`}
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
                    <img src={post.photo_url} alt="Post" className="w-full rounded-xl object-contain bg-stone-50" style={{ maxHeight: '500px' }} />
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
                    <img src={item.photo_url} alt={item.title} className="w-full h-48 object-cover" />
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

      {/* Skills tab */}
      {activeTab === 'skills' && (
        <div className="space-y-4">
          {/* Add skill — owner only */}
          {isOwn && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Add a skill</div>
              <div className="flex gap-2">
                <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSkill()}
                  placeholder="e.g. Panel upgrades, EV charger installation..."
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 bg-stone-50" />
                <button onClick={addSkill} disabled={addingSkill || !newSkill.trim()}
                  className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Skills list */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            {skills.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2 opacity-20">🔧</div>
                <div className="text-sm text-gray-400">{isOwn ? 'Add your first skill above.' : 'No skills listed yet.'}</div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {skills.map(skill => (
                  <div key={skill.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
                    skill.endorsed_by_me ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-stone-50'
                  }`}>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{skill.skill_name}</div>
                      {skill.endorsement_count > 0 && (
                        <div className="text-xs text-teal-600 font-medium">
                          {skill.endorsement_count} endorsement{skill.endorsement_count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    {!isOwn && session && (
                      <button onClick={() => endorseSkill(skill.id)}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg transition-all ${
                          skill.endorsed_by_me
                            ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                            : 'bg-white border border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600'
                        }`}>
                        {skill.endorsed_by_me ? '✓ Endorsed' : '+ Endorse'}
                      </button>
                    )}
                    {isOwn && (
                      <button onClick={() => removeSkill(skill.id)}
                        className="text-gray-300 hover:text-red-400 text-xs transition-colors ml-1">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Followers / Following modal */}
      {followModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setFollowModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex gap-1">
                <button onClick={() => openFollowModal('followers')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${followModal === 'followers' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  Followers ({stats.followers})
                </button>
                <button onClick={() => openFollowModal('following')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${followModal === 'following' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  Following ({stats.following})
                </button>
              </div>
              <button onClick={() => setFollowModal(null)} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">✕</button>
            </div>
            {/* Modal body */}
            <div className="overflow-y-auto flex-1 p-4">
              {loadingFollow ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="flex gap-3 items-center"><div className="w-10 h-10 rounded-full animate-shimmer flex-shrink-0" /><div className="flex-1 space-y-1"><div className="h-3 w-1/2 animate-shimmer rounded" /><div className="h-3 w-1/3 animate-shimmer rounded" /></div></div>)}
                </div>
              ) : followList.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-3xl mb-2 opacity-20">👥</div>
                  <div className="text-sm text-gray-400">{followModal === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</div>
                </div>
              ) : (
                <div className="space-y-1">
                  {followList.filter(Boolean).map((person: any) => (
                    <Link key={person.id} href={`/community/profile/${person.id}`}
                      onClick={() => setFollowModal(null)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors">
                      {person.profile_photo_url ? (
                        <img src={person.profile_photo_url} alt={person.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm flex-shrink-0 bg-teal-50 text-teal-700">
                          {(person.full_name || 'A').split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{person.full_name}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {person.trade_category?.category_name}{person.city ? ` · ${person.city}` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-teal-600 font-medium">View →</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.photo_url} alt={lightbox.title} className="w-full object-contain bg-stone-900" style={{ maxHeight: '70vh' }} />
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
