'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Session, PortfolioItem, TradeCategory } from '@/types'

export default function CommunityEditPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [session, setSession]         = useState<Session | null>(null)
  const [portfolio, setPortfolio]     = useState<PortfolioItem[]>([])
  const [categories, setCategories]   = useState<TradeCategory[]>([])
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)

  // New item form
  const [newPhoto, setNewPhoto]   = useState('')
  const [newTitle, setNewTitle]   = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [newTrade, setNewTrade]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [markAsJobSite, setMarkAsJobSite] = useState(false)
  const [isBeforeAfter, setIsBeforeAfter] = useState(false)
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null)
  const [uploadingBefore, setUploadingBefore] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.replace('/login'); return }
    const s: Session = JSON.parse(raw)
    setSession(s)
    Promise.all([
      fetch(`/api/portfolio?pro_id=${s.id}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch(`/api/pros/${s.id}`).then(r => r.json()),
    ]).then(([portData, catsData, proData]) => {
      setPortfolio(portData.items || [])
      setCategories(catsData.categories || [])
      // Pre-select pro's own trade — no need to choose another
      if (proData.pro?.trade_category?.category_name) {
        setNewTrade(proData.pro.trade_category.category_name)
      }
      setLoading(false)
    })
  }, [])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('pro_id', session.id)
    form.append('bucket', 'portfolio')
    form.append('folder', session.id)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    setUploading(false)
    if (r.ok) setNewPhoto(d.url)
    else setError(d.error || 'Upload failed')
  }

  async function uploadBeforePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploadingBefore(true)
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id)
    form.append('bucket', 'portfolio'); form.append('folder', `portfolio/${session.id}`)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    if (r.ok) setBeforePhoto(d.url)
    setUploadingBefore(false)
  }

  async function addItem() {
    if (!newPhoto || !newTitle.trim() || !session) { setError('Please add a photo and title'); return }
    setSaving(true); setError('')

    // Post the item immediately — geo enrichment happens in background after
    const r = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: session.id, photo_url: newPhoto, title: newTitle,
        description: newDesc || null, trade: newTrade || null,
        is_job_site: markAsJobSite,
        captured_at: markAsJobSite ? new Date().toISOString() : null,
        is_before_after: isBeforeAfter,
        before_photo_url: isBeforeAfter ? beforePhoto : null,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) {
      setPortfolio(p => [d.item, ...p])
      setNewPhoto(''); setNewTitle(''); setNewDesc(''); setMarkAsJobSite(false); setIsBeforeAfter(false); setBeforePhoto(null)
      // Geo enrichment — non-blocking, runs after UI is already updated
      if (markAsJobSite && navigator.geolocation && d.item?.id) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          try {
            let location_label = ''
            try {
              const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
              const gd = await geoRes.json()
              location_label = [gd.address?.city || gd.address?.town || gd.address?.village, gd.address?.state].filter(Boolean).join(', ')
            } catch {}
            await fetch('/api/portfolio', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: d.item.id, pro_id: session!.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude, location_label }),
            })
            // Update local state with geo label
            if (location_label) setPortfolio(prev => prev.map(p => p.id === d.item.id ? { ...p, location_label } : p))
          } catch {}
        }, () => { /* GPS denied — silently ignore, item already saved */ }, { timeout: 10000, maximumAge: 60000 })
      }
    } else {
      setError(d.error || 'Could not add item')
    }
  }

  async function deleteItem(id: string) {
    if (!session) return
    await fetch(`/api/portfolio?id=${id}&pro_id=${session.id}`, { method: 'DELETE' })
    setPortfolio(p => p.filter(i => i.id !== id))
  }

  if (loading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-3">
          <Link href={`/community/profile/${session?.id}`} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← My profile</Link>
          <Link href="/edit-profile" className="text-sm text-gray-400 hover:text-teal-600 transition-colors">Account settings</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-gray-900 mb-1">Community profile</h1>
          <p className="text-gray-400 font-light">Manage your portfolio and community presence.</p>
        </div>

        {/* Add portfolio item */}
        <div className="bg-white border border-gray-100 rounded-2xl p-7 mb-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
            Add portfolio item
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{error}</div>}

          {/* Photo upload */}
          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Project photo</label>
            {newPhoto ? (
              <div className="relative inline-block">
                <img src={newPhoto} alt="Preview" className="h-40 rounded-xl object-cover" />
                <button onClick={() => setNewPhoto('')} className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center">✕</button>
              </div>
            ) : (
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-teal-300 hover:bg-teal-50/30 transition-all">
                <div className="text-2xl mb-2 opacity-30">📷</div>
                <div className="text-sm font-medium text-gray-500">{uploading ? 'Uploading...' : 'Click to upload photo'}</div>
                <div className="text-xs text-gray-400 mt-1">JPG, PNG or WebP · Max 5MB</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Project title</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Full panel upgrade — Miami Beach residence"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors" />
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Trade</label>
            {newTrade ? (
              <div className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 text-gray-700 flex items-center justify-between">
                <span>{newTrade}</span>
                <span className="text-xs text-gray-400">Your trade</span>
              </div>
            ) : (
              <select value={newTrade} onChange={e => setNewTrade(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors">
                <option value="">Select trade...</option>
                {categories.map(c => <option key={c.id} value={c.category_name}>{c.category_name}</option>)}
              </select>
            )}
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Description (optional)</label>
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
              placeholder="Describe the project — scope of work, materials used, challenges solved..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setMarkAsJobSite(j => !j)}
              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-all ${markAsJobSite ? 'bg-teal-50 text-teal-700 border-teal-300' : 'border-gray-200 text-gray-500'}`}>
              <span>{markAsJobSite ? '📍' : '📷'}</span>
              {markAsJobSite ? 'Job site photo — will capture GPS' : 'Mark as job site photo'}
            </button>
            {markAsJobSite && <span className="text-xs text-gray-400">GPS captured at upload time</span>}
            <button type="button" onClick={() => { setIsBeforeAfter(v => !v); setBeforePhoto(null) }}
              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-all ${isBeforeAfter ? 'bg-amber-50 text-amber-700 border-amber-300' : 'border-gray-200 text-gray-500'}`}>
              <span>{isBeforeAfter ? '↔' : '↔'}</span>
              {isBeforeAfter ? 'Before/After mode on' : 'Before/After project'}
            </button>
            {isBeforeAfter && (
              <div className="w-full mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-semibold text-amber-700 mb-2">Upload the BEFORE photo</div>
                <div className="text-xs text-amber-600 mb-2">The photo above is the AFTER. Upload the before state here.</div>
                {beforePhoto ? (
                  <div className="relative inline-block">
                    <img src={beforePhoto} alt="Before" className="h-20 rounded-lg object-cover" />
                    <button onClick={() => setBeforePhoto(null)} className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed border-amber-300 rounded-xl text-xs text-amber-700 hover:bg-amber-100 transition-colors w-fit">
                    <input type="file" accept="image/*" className="hidden" onChange={uploadBeforePhoto} disabled={uploadingBefore} />
                    {uploadingBefore ? 'Uploading...' : '📷 Upload before photo'}
                  </label>
                )}
              </div>
            )}
          </div>

          <button onClick={addItem} disabled={saving || uploading || !newPhoto || !newTitle.trim()}
            className="px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
            {saving ? 'Adding...' : 'Add to portfolio'}
          </button>
        </div>

        {/* Existing portfolio */}
        <div className="bg-white border border-gray-100 rounded-2xl p-7">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
            Your portfolio ({portfolio.length} items)
          </div>

          {portfolio.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2 opacity-20">📸</div>
              <div className="text-sm text-gray-400">No portfolio items yet. Add your first project above.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {portfolio.map(item => (
                <div key={item.id} className="flex gap-4 items-start border border-gray-100 rounded-xl p-4 hover:bg-stone-50 transition-colors">
                  <img src={item.photo_url} alt={item.title} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900 mb-0.5">{item.title}</div>
                    {item.trade && <div className="text-xs text-teal-600 mb-1">{item.trade}</div>}
                    {item.description && <div className="text-xs text-gray-400 line-clamp-2">{item.description}</div>}
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors px-2 py-1 flex-shrink-0">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-between items-center">
          <Link href={`/community/profile/${session?.id}`} className="text-sm text-gray-400 hover:text-teal-600 transition-colors">
            View my community profile →
          </Link>
          <Link href="/community" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            Go to feed →
          </Link>
        </div>
      </div>
    </div>
  )
}
