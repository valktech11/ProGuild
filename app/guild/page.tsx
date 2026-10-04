'use client'
/**
 * The Guild — ProGuild's professional community feed
 * LinkedIn-for-trades: 3-col layout, typed post composer, sidebar widgets
 *
 * Route: /guild
 * Auth: public (read-only) | logged-in (full interaction)
 */

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
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
    label: 'Post',
    color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', dot: '#0284C7',
    placeholder: 'Share a tip, an opinion, or industry news — no question needed.',
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
  const [beforePhoto, setBeforePhoto] = useState<string>('')
  const [isBeforeAfter, setIsBeforeAfter] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingSlot, setUploadingSlot] = useState<'before' | 'after' | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const beforeRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const cfg = POST_TYPES[postType]

  // App-bar "Post" / empty-state buttons open the composer (optionally in a type)
  useEffect(() => {
    function open(e: Event) {
      const t = (e as CustomEvent).detail?.type as PostType | undefined
      if (t) setPostType(t)
      setExpanded(true)
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener('guild:compose', open)
    return () => window.removeEventListener('guild:compose', open)
  }, [])

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[]
    if (!files.length) return
    if (photos.length + files.length > 5) { setError('Maximum 5 photos.'); return }
    setUploading(true); setUploadingSlot('after')
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
    setUploading(false); setUploadingSlot(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleBeforePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setUploadingSlot('before')
    const form = new FormData()
    form.append('file', file); form.append('pro_id', session.id)
    form.append('bucket', 'portfolio'); form.append('folder', `posts/${session.id}`)
    const r = await fetch('/api/upload', { method: 'POST', body: form })
    const d = await r.json()
    if (r.ok) setBeforePhoto(d.url)
    setUploading(false); setUploadingSlot(null)
    if (beforeRef.current) beforeRef.current.value = ''
  }

  async function handlePost() {
    if (!content.trim() && photos.length === 0) return
    setPosting(true); setError('')
    const payload: any = { pro_id: session.id, content, photo_urls: photos, post_type: postType }
    if (postType === 'work' && isBeforeAfter && beforePhoto && photos.length > 0) {
      payload.is_before_after = true
      payload.before_photo_url = beforePhoto
      // Use the first uploaded photo as the "after"
    }
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json()
    if (r.ok) {
      onPost(d.post)
      setContent(''); setPhotos([]); setBeforePhoto(''); setIsBeforeAfter(false); setExpanded(false)
    } else {
      setError(d.error || 'Could not post. Please try again.')
    }
    setPosting(false)
  }

  return (
    <div ref={rootRef} id="guild-composer" className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4 shadow-sm" style={{ scrollMarginTop: 72 }}>
      {/* Collapsed prompt — full-width, no avatar (keeps one face on the page) */}
      {!expanded && (
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 cursor-text" onClick={() => setExpanded(true)}>
          <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gray-50 border border-gray-200 hover:border-teal-300 hover:bg-white transition-colors text-[14px] text-gray-500 select-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Share your work or ask the Guild a question…
          </div>
        </div>
      )}

      {/* Expanded composer */}
      {expanded && (
        <div>
          {/* Type selector — filled pills in each type's color */}
          <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-3 overflow-x-auto border-b border-gray-100"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
            {(Object.entries(POST_TYPES) as [PostType, typeof POST_TYPES[PostType]][]).map(([type, c]) => {
              const on = postType === type
              return (
                <button key={type} onClick={() => setPostType(type)}
                  className="flex-shrink-0 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full border transition-all"
                  style={on
                    ? { background: c.dot, color: '#fff', borderColor: c.dot, boxShadow: `0 2px 8px -3px ${c.dot}` }
                    : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                  {c.label}
                </button>
              )
            })}
          </div>

          <div className="p-4">
            {/* Author line — name only, avatar lives in the profile card */}
            <div className="mb-2">
              <span className="text-[14px] font-bold text-gray-900">{session.name}</span>
              <span className="text-[12px] text-gray-500"> · {session.trade}{session.city ? ` · ${session.city}` : ''}</span>
            </div>

            {/* Text area */}
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={cfg.placeholder}
              rows={3}
              autoFocus
              className="w-full text-[15px] text-gray-900 bg-transparent border-none outline-none resize-none placeholder-gray-400 leading-relaxed mb-3"
            />

            {/* Before/After preview — replaces generic grid when B/A mode is on */}
            {isBeforeAfter && postType === 'work' ? (
              <div className="flex gap-2 mb-3">
                {/* Before slot */}
                <div className="flex-1 relative">
                  {uploadingSlot === 'before' ? (
                    <div className="w-full rounded-lg border-2 border-teal-200 bg-teal-50 flex flex-col items-center justify-center gap-2" style={{ aspectRatio: '4/3' }}>
                      <svg className="animate-spin w-6 h-6 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="28 8" strokeLinecap="round"/></svg>
                      <span className="text-[11px] font-semibold text-teal-600">Uploading…</span>
                    </div>
                  ) : beforePhoto ? (
                    <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                      <img src={beforePhoto} alt="Before" className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 py-1 text-center text-[10px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.45)' }}>BEFORE</div>
                      <button onClick={() => setBeforePhoto('')}
                        className="absolute top-1 right-1 w-5 h-5 bg-gray-900/70 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => beforeRef.current?.click()} disabled={uploading}
                      className="w-full rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors disabled:opacity-50"
                      style={{ aspectRatio: '4/3' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <span className="text-[11px] font-semibold">Before</span>
                    </button>
                  )}
                </div>
                {/* After slot */}
                <div className="flex-1 relative">
                  {uploadingSlot === 'after' ? (
                    <div className="w-full rounded-lg border-2 border-teal-200 bg-teal-50 flex flex-col items-center justify-center gap-2" style={{ aspectRatio: '4/3' }}>
                      <svg className="animate-spin w-6 h-6 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="28 8" strokeLinecap="round"/></svg>
                      <span className="text-[11px] font-semibold text-teal-600">Uploading…</span>
                    </div>
                  ) : photos[0] ? (
                    <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                      <img src={photos[0]} alt="After" className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 py-1 text-center text-[10px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.45)' }}>AFTER</div>
                      <button onClick={() => setPhotos([])}
                        className="absolute top-1 right-1 w-5 h-5 bg-gray-900/70 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="w-full rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors disabled:opacity-50"
                      style={{ aspectRatio: '4/3' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <span className="text-[11px] font-semibold">After</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Normal photo grid */
              photos.length > 0 && (
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
              )
            )}

            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

            {/* Bottom bar */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1 flex-wrap">
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
                <input ref={beforeRef} type="file" accept="image/*" className="hidden" onChange={handleBeforePhoto} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading || photos.length >= 5}
                  title="Add photos"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 hover:text-teal-600 hover:bg-teal-50 transition-colors text-[12px] font-medium disabled:opacity-40 ${isBeforeAfter && postType === 'work' ? 'hidden' : ''}`}>
                  {uploading
                    ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  }
                  <span>Photo{photos.length > 0 ? ` (${photos.length}/5)` : ''}</span>
                </button>
                {/* Before/After toggle — only for Project posts */}
                {postType === 'work' && (
                  <button
                    type="button"
                    onClick={() => setIsBeforeAfter(b => !b)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${isBeforeAfter ? 'text-teal-700 bg-teal-50 hover:bg-teal-100' : 'text-gray-500 hover:text-teal-600 hover:bg-teal-50'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="10" height="18" rx="1"/><rect x="12" y="3" width="10" height="18" rx="1"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                    Before &amp; After
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { setExpanded(false); setContent(''); setPhotos([]); setBeforePhoto(''); setIsBeforeAfter(false) }}
                  className="px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
                  Cancel
                </button>
                <button onClick={handlePost} disabled={posting || (!content.trim() && photos.length === 0)}
                  className="px-6 py-2 text-[13px] font-bold rounded-full text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:hover:opacity-40"
                  style={{ background: `linear-gradient(135deg, ${cfg.dot}, ${cfg.dot}dd)`, boxShadow: `0 2px 10px -3px ${cfg.dot}` }}>
                  {posting ? 'Posting…' : postType === 'tip' ? 'Ask the Guild' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick-action row — crisp, color-coded entry points (not grey ghosts) */}
      {!expanded && (
        <div className="flex items-stretch border-t border-gray-100 px-1.5 py-1.5">
          {([
            { type: 'work' as PostType,      label: 'Project',    fg: '#0F766E', bg: '#E6F5F1', hov: 'hover:bg-teal-50',   icon: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></> },
            { type: 'tip' as PostType,       label: 'Question',   fg: '#6D28D9', bg: '#F1EBFE', hov: 'hover:bg-violet-50', icon: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
            { type: 'update' as PostType,    label: 'Post',       fg: '#0369A1', bg: '#E5F2FB', hov: 'hover:bg-sky-50',    icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/> },
            { type: 'milestone' as PostType, label: 'Milestone',  fg: '#B45309', bg: '#FDF0DC', hov: 'hover:bg-amber-50',  icon: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/> },
          ]).map(btn => (
            <button key={btn.type} onClick={() => { setPostType(btn.type); setExpanded(true) }}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl transition-colors ${btn.hov}`}>
              <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 9, background: btn.bg }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={btn.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{btn.icon}</svg>
              </span>
              <span className="text-[12.5px] font-semibold text-gray-600 hidden sm:inline">{btn.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Follow button + Message button
// ─────────────────────────────────────────────────────────────────────────────

function FollowButton({ proId, followerId, compact, onToggle }: { proId: string; followerId: string; compact?: boolean; onToggle?: (nowFollowing: boolean) => void }) {
  const [following, setFollowing] = useState<boolean | null>(null) // null = loading from server
  const [toggling, setToggling] = useState(false)

  // Fetch server state on mount
  useEffect(() => {
    fetch(`/api/follows?follower_id=${followerId}&following_id=${proId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFollowing(d.following) })
      .catch(() => setFollowing(false))
  }, [proId, followerId])

  async function toggle() {
    setToggling(true)
    const r = await fetch('/api/follows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower_id: followerId, following_id: proId }),
    })
    const d = await r.json()
    if (r.ok) {
      setFollowing(d.following)
      onToggle?.(d.following)
    }
    setToggling(false)
  }

  const [hovered, setHovered] = useState(false)
  const isLoading = following === null || toggling
  return (
    <button onClick={toggle} disabled={isLoading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`inline-flex items-center gap-1.5 font-semibold transition-all border rounded-lg ${compact ? 'text-[11px] px-2.5 py-1' : 'text-[12px] px-3 py-1.5'} ${
        following
          ? hovered ? 'border-red-200 text-red-500 bg-red-50' : 'border-gray-200 text-gray-500'
          : 'border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100'
      }`}>
      {isLoading ? (
        <svg width={compact ? 9 : 11} height={compact ? 9 : 11} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin"><circle cx="9" cy="9" r="7" strokeDasharray="20 24"/></svg>
      ) : following ? (
        hovered ? (
          /* Unfollow — person with X */
          <svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            <line x1="20" y1="14" x2="24" y2="18"/>
            <line x1="24" y1="14" x2="20" y2="18"/>
          </svg>
        ) : (
          /* Following — person with check */
          <svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            <polyline points="17 13 19.5 15.5 24 11"/>
          </svg>
        )
      ) : (
        /* Follow — person with + */
        <svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="17" y1="11" x2="23" y2="11"/>
        </svg>
      )}
      {isLoading ? '…' : following ? (hovered ? 'Unfollow' : 'Following') : 'Follow'}
    </button>
  )
}

// Message button — only shown when session user and target are mutually connected
function MessageButton({ proId, followerId, compact }: { proId: string; followerId: string; compact?: boolean }) {
  const [canMessage, setCanMessage] = useState<boolean | null>(null)

  useEffect(() => {
    // Check both directions: does session follow target AND does target follow session?
    Promise.all([
      fetch(`/api/follows?follower_id=${followerId}&following_id=${proId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/follows?follower_id=${proId}&following_id=${followerId}`).then(r => r.ok ? r.json() : null),
    ]).then(([a, b]) => {
      setCanMessage(!!(a?.following && b?.following))
    }).catch(() => setCanMessage(false))
  }, [proId, followerId])

  if (!canMessage) return null

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('guild:dm', { detail: { proId } }))}
      className={`inline-flex items-center gap-1.5 font-semibold border rounded-lg transition-colors hover:bg-gray-50 ${compact ? 'text-[11px] px-2.5 py-1' : 'text-[12px] px-3 py-1.5'} border-gray-200 text-gray-600`}>
      <svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      Message
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild DM Panel — slide-over for pro-to-pro messaging
// Stays inside the Guild shell; /messages remains for CRM lead conversations.
// ─────────────────────────────────────────────────────────────────────────────

function GuildDMPanel({ session, withId, onClose }: { session: Session; withId: string | null; onClose: () => void }) {
  const [view, setView] = useState<'threads' | 'convo'>(withId ? 'convo' : 'threads')
  const [threads, setThreads] = useState<any[]>([])
  const [activeWithId, setActiveWithId] = useState<string | null>(withId)
  const [activeWith, setActiveWith] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Panel is fixed-position; no body scroll lock needed

  // Load thread list on mount
  useEffect(() => {
    fetch(`/api/messages?pro_id=${session.id}`)
      .then(r => r.ok ? r.json() : {} as any)
      .then((d: any) => { setThreads(d.threads || []); setLoadingThreads(false) })
      .catch(() => setLoadingThreads(false))
  }, [session.id])

  // Load conversation when activeWithId changes
  useEffect(() => {
    if (!activeWithId) return
    setLoadingMsgs(true)
    fetch(`/api/messages?pro_id=${session.id}&with_id=${activeWithId}`)
      .then(r => r.ok ? r.json() : {} as any)
      .then((d: any) => {
        setMessages(d.messages || [])
        setLoadingMsgs(false)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
      })
      .catch(() => setLoadingMsgs(false))
    // Fetch pro profile for header
    fetch(`/api/pros/${activeWithId}`)
      .then(r => r.ok ? r.json() : {} as any)
      .then((d: any) => { if (d.pro) setActiveWith(d.pro) })
  }, [activeWithId, session.id])

  // When a thread is tapped
  function openThread(id: string) {
    setActiveWithId(id)
    setView('convo')
    setMessages([])
    setActiveWith(null)
  }

  async function sendMessage() {
    if (!text.trim() || !activeWithId || sending) return
    setSending(true)
    const r = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: session.id, receiver_id: activeWithId, content: text.trim() }),
    })
    const d = await r.json()
    setSending(false)
    if (r.ok) {
      setMessages(prev => [...prev, d.message])
      setText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 40)
    }
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const panelW = 380

  return createPortal(
    <>
      {/* Backdrop — only on mobile */}
      <div
        className="fixed inset-0 z-[998] bg-black/40 sm:hidden"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed z-[999] bg-white flex flex-col"
        style={{
          // Mobile: full screen; Desktop: anchored bottom-right
          bottom: 0,
          right: 0,
          width: '100%',
          height: '100%',
          boxShadow: '0 0 0 1px rgba(10,22,40,0.08), -6px 0 30px -6px rgba(10,22,40,0.2)',
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 0,
          // Desktop override via inline style tag below
        }}
      >
        <style>{`@media(min-width:640px){[data-pg-dm]{width:${panelW}px!important;height:580px!important;bottom:0!important;right:0!important;border-radius:16px 16px 0 0!important;}}`}</style>
        <div data-pg-dm className="fixed z-[999] bg-white flex flex-col w-full h-full sm:w-[380px] sm:h-[580px] sm:bottom-0 sm:right-0 sm:rounded-tl-2xl"
          style={{ boxShadow: '0 0 0 1px rgba(10,22,40,0.08), -6px 0 30px -6px rgba(10,22,40,0.2)' }}>

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0 border-b border-gray-100">
            {view === 'convo' && (
              <button onClick={() => { setView('threads'); setActiveWithId(null); setActiveWith(null) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {view === 'convo' && activeWith ? (
              <>
                <div className="w-8 h-8 flex-shrink-0">
                  <Avatar pro={activeWith} size={8} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-gray-900 truncate">{activeWith.full_name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{activeWith.trade_category?.category_name || activeWith.city || ''}</div>
                </div>
                <Link href={`/pro/${activeWith.slug || activeWithId}`} onClick={onClose}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-colors hover:bg-teal-50"
                  style={{ color: '#0F766E', border: '1px solid rgba(15,118,110,0.2)' }}>
                  Profile →
                </Link>
              </>
            ) : (
              <div className="flex-1">
                <div className="text-[14px] font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>Messages</div>
              </div>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0 transition-colors ml-auto">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">

            {/* Thread list */}
            {view === 'threads' && (
              <div className="flex-1 overflow-y-auto">
                {loadingThreads ? (
                  <div className="p-4 space-y-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="h-3 w-2/3 rounded bg-gray-100" />
                          <div className="h-2.5 w-1/2 rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : threads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
                    <div className="text-4xl mb-3 opacity-20">💬</div>
                    <div className="text-[14px] font-semibold text-gray-800 mb-1">No messages yet</div>
                    <div className="text-[12.5px] text-gray-500">Start a conversation from a pro's profile.</div>
                    <Link href="/search" onClick={onClose} className="mt-4 text-[12.5px] font-bold" style={{ color: '#0F766E' }}>Find a pro →</Link>
                  </div>
                ) : threads.map(thread => {
                  const name = thread.otherName || thread.lastMsg?.sender?.full_name || 'Pro'
                  const photo = thread.otherPhoto || thread.lastMsg?.sender?.profile_photo_url || null
                  const otherId = thread.otherId
                  return (
                    <button key={otherId} onClick={() => openThread(otherId)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left hover:bg-gray-50 transition-colors"
                      style={{ background: activeWithId === otherId ? 'rgba(13,148,136,0.04)' : undefined }}>
                      <div className="w-10 h-10 flex-shrink-0">
                        <Avatar pro={{ full_name: name, profile_photo_url: photo }} size={10} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-900 truncate">{name}</div>
                        <div className="text-[12px] text-gray-500 truncate mt-0.5">{thread.lastMsg?.content}</div>
                      </div>
                      {thread.unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {thread.unread > 9 ? '9+' : thread.unread}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Conversation */}
            {view === 'convo' && (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ background: '#FAF9F6' }}>
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 rounded-full border-2 border-teal-200 border-t-teal-600 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-10 text-[12.5px] text-gray-400">Say hello — start the conversation.</div>
                  ) : messages.map(msg => {
                    const isMe = msg.sender_id === session.id
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <div className="w-7 h-7 flex-shrink-0">
                          <Avatar
                            pro={isMe
                              ? { full_name: session.name, profile_photo_url: session.photo_url }
                              : { full_name: activeWith?.full_name || 'Pro', profile_photo_url: activeWith?.profile_photo_url }
                            }
                            size={7}
                          />
                        </div>
                        <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className="px-3 py-2 text-[13px] leading-relaxed"
                            style={isMe
                              ? { background: '#0F766E', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                              : { background: '#fff', color: '#1C1917', border: '1px solid #E5E0D8', borderRadius: '16px 16px 16px 4px' }
                            }>
                            {msg.content}
                          </div>
                          <div className="text-[10px] text-gray-400">{timeAgo(msg.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="flex-shrink-0 px-3 py-3 border-t border-gray-100 bg-white">
                  <div className="flex gap-2 items-end">
                    <textarea
                      ref={inputRef}
                      value={text}
                      onChange={e => setText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                      placeholder="Write a message…"
                      rows={1}
                      className="flex-1 px-3.5 py-2.5 rounded-xl text-[13px] resize-none outline-none leading-snug"
                      style={{ border: '1.5px solid #E5E0D8', minHeight: 44, maxHeight: 100, background: '#FAFAF8' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#0F766E')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D8')}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !text.trim()}
                      className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)', boxShadow: '0 2px 8px -2px rgba(15,118,110,0.5)' }}>
                      {sending
                        ? <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" className="animate-spin"><circle cx="9" cy="9" r="7" strokeDasharray="20 24"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Post Card
// ─────────────────────────────────────────────────────────────────────────────

function PostCard({ post, session, onLike, onDelete, onEdit, liking }: {
  post: Post & { liked_by_me: boolean }
  session: Session | null
  onLike: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, content: string) => void
  liking: boolean
}) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content || '')
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function saveEdit() {
    if (!editContent.trim()) return
    setSaving(true)
    const r = await fetch('/api/posts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, pro_id: session!.id, content: editContent }),
    })
    if (r.ok) { onEdit(post.id, editContent); setEditing(false) }
    setSaving(false)
  }

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
              <div className="ml-auto relative" ref={menuRef}>
                <button onClick={() => setMenuOpen(o => !o)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Post options">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl border border-gray-200 py-1 z-50"
                    style={{ boxShadow: '0 8px 24px rgba(15,23,22,0.14)' }}>
                    <button onClick={() => { setMenuOpen(false); setEditContent(post.content || ''); setEditing(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button onClick={() => { setMenuOpen(false); setShowDeleteModal(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[12px] text-gray-500 leading-tight">
              {pro?.trade_category?.category_name}
              {pro?.city ? ` · ${pro.city}` : ''}
              {pro?.state ? `, ${pro.state}` : ''}
              {` · ${timeAgo(post.created_at)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </div>
              <div>
                <div className="text-[15px] font-bold text-gray-900">Delete post?</div>
                <div className="text-[12px] text-gray-500">This cannot be undone.</div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => { setShowDeleteModal(false); onDelete(post.id) }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content — editable inline when editing */}
      {editing ? (
        <div className="px-4 pb-3">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            rows={4}
            autoFocus
            className="w-full text-[15px] text-gray-900 border border-teal-300 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 leading-relaxed"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
              Cancel
            </button>
            <button onClick={saveEdit} disabled={saving || !editContent.trim()}
              className="px-5 py-1.5 rounded-full text-[13px] font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : post.content ? (
        <div className="px-4 pb-3">
          <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${isQuestion ? 'font-medium text-violet-900' : 'text-gray-700'}`}>
            {post.content}
          </p>
        </div>
      ) : null}

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
            'text-gray-500 hover:text-gray-600 hover:bg-gray-50'
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
            isQuestion ? 'text-violet-500 hover:bg-violet-50' : 'text-gray-500 hover:text-gray-600 hover:bg-gray-50'
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>{isQuestion ? (post.comment_count > 0 ? `${post.comment_count} ${post.comment_count === 1 ? 'Answer' : 'Answers'}` : 'Answer') : (post.comment_count > 0 ? `${post.comment_count} ${post.comment_count === 1 ? 'Comment' : 'Comments'}` : 'Comment')}</span>
        </button>

        {/* Right actions */}
        {!isOwn && session && (
          <div className="flex items-center gap-1.5 ml-auto">
            <Link href={`/messages?to=${post.pro_id}`} title="Message"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Message
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
            <div className="text-[12px] text-gray-500 py-1">Loading…</div>
          ) : (
            <div className="space-y-2.5 mb-3">
              {comments.length === 0 && (
                <div className="text-[12px] text-gray-500">
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

// Slugs MUST match trade_categories.slug in the DB (see HomeClient PRIMARY_TRADES)
const TRADES = [
  { label: 'Roofing',     slug: 'roofing' },
  { label: 'HVAC',        slug: 'hvac-technician' },
  { label: 'Electrical',  slug: 'electrician' },
  { label: 'Plumbing',    slug: 'plumber' },
  { label: 'General',     slug: 'general-contractor' },
  { label: 'Pool & Spa',  slug: 'pool-spa' },
  { label: 'Painting',    slug: 'painter' },
  { label: 'Flooring',    slug: 'flooring' },
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
// Notification Bell — polls /api/notifications, shows unread count badge
// ─────────────────────────────────────────────────────────────────────────────

type AppNotification = { id: string; type: string; title: string; body: string; read_at: string | null; created_at: string }

function NotificationBell({ proId }: { proId: string }) {
  const [notifs, setNotifs] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // All notification API calls need a Bearer token — get it from Supabase client
  async function authHeaders(): Promise<Record<string, string>> {
    try {
      const { getSupabaseBrowser } = await import('@/lib/supabase-browser')
      const { data } = await getSupabaseBrowser().auth.getSession()
      const token = data.session?.access_token
      if (token) return { 'Authorization': `Bearer ${token}` }
    } catch {}
    return {}
  }

  const fetchNotifs = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/notifications', { headers })
      if (r.ok) {
        const d = await r.json()
        setNotifs(d.notifications || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchNotifs()
    const id = setInterval(fetchNotifs, 30000)
    return () => clearInterval(id)
  }, [fetchNotifs])

  useEffect(() => {
    if (!open) return
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [open])

  async function markRead() {
    const unreadIds = notifs.filter(n => !n.read_at).map(n => n.id)
    if (!unreadIds.length) return
    const headers = await authHeaders()
    await fetch('/api/notifications/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ids: unreadIds }),
    })
    setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  function handleOpen() {
    setOpen(v => !v)
    if (!open) markRead()
  }

  const unread = notifs.filter(n => !n.read_at).length

  return (
    <div ref={ref} className="relative">
      <button onClick={handleOpen}
        className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[10px] font-bold text-white rounded-full"
            style={{ background: '#0F766E' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ borderColor: '#E4E8E6', boxShadow: '0 20px 40px -12px rgba(10,22,40,0.22), 0 0 0 1px rgba(10,22,40,0.05)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F2F0' }}>
            <span className="text-[13px] font-bold text-gray-900">Notifications</span>
            {notifs.length > 0 && (
              <button onClick={() => setNotifs([])} className="text-[11px] text-gray-400 hover:text-gray-600">Clear all</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-gray-400">No notifications yet</div>
            ) : notifs.map(n => (
              <div key={n.id} className={`px-4 py-3 flex gap-3 items-start transition-colors ${n.read_at ? '' : 'bg-teal-50/50'}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: n.type === 'follow' ? '#E6F5F1' : '#F3F4F6' }}>
                  {n.type === 'follow' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B5D4E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                      <line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-gray-800 leading-snug">{n.body}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read_at && <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#0F766E' }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Account menu (app-bar, right) — visible avatar + real dropdown
// ─────────────────────────────────────────────────────────────────────────────

function UserMenu({ session, onSignOut }: { session: Session; onSignOut?: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])
  const profileHref = `/pro/${session.slug || session.id}`
  const items: { href: string; label: string; icon: string }[] = [
    { href: profileHref,            label: 'View profile',       icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z' },
    { href: '/guild?tab=mine',      label: 'My posts',           icon: 'M4 6h16M4 12h16M4 18h11' },
    { href: '/dashboard',                label: 'Business dashboard', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
    { href: '/dashboard/settings',       label: 'Settings',           icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
  ]
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-label="Account menu" aria-expanded={open}
        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full border transition-colors hover:bg-gray-50"
        style={{ borderColor: open ? '#5DCAA5' : '#E5E7EB' }}>
        <span className="text-[13px] font-bold text-gray-800 max-w-[96px] truncate">{session.name?.split(' ')[0] || 'Account'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 py-1.5 z-50"
          style={{ boxShadow: '0 14px 40px rgba(15,23,22,0.16)' }}>
          <div className="px-3.5 pb-2.5 pt-1 mb-1 border-b border-gray-100">
            <div className="text-[13.5px] font-bold text-gray-900 truncate">{session.name}</div>
            <div className="text-[11.5px] text-gray-500 truncate">{session.trade}{session.city ? ` · ${session.city}` : ''}</div>
          </div>
          {items.map(it => (
            <Link key={it.label} href={it.href} onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={it.icon}/></svg>
              {it.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button onClick={() => { setOpen(false); onSignOut?.() }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty feed — never a blank void. A branded hero + "people to follow" grid.
// ─────────────────────────────────────────────────────────────────────────────

// Recommended-pros strip — horizontal, modern scroll (hidden bar + chevrons + snap + edge fades)
function FollowStrip({ pros, session, tradeLabel, onFollowToggle }: { pros: Pro[]; session: Session; tradeLabel: string | null; onFollowToggle?: (nowFollowing: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const update = useCallback(() => {
    const el = ref.current; if (!el) return
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
  }, [])
  useEffect(() => {
    update()
    const el = ref.current; if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [update, pros.length])
  const nudge = (dir: number) => ref.current?.scrollBy({ left: dir * 330, behavior: 'smooth' })
  const seeAll = pros[0]?.trade_category?.slug ? `/search?trade=${pros[0].trade_category.slug}` : '/search'
  const chevBtn = 'absolute top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors'
  const chevStyle = { boxShadow: '0 3px 12px -3px rgba(10,22,40,0.28)', border: '1px solid #E4E8E6' }

  return (
    <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: '#E4E8E6' }}>
      <style>{`.pg-hscroll::-webkit-scrollbar{display:none}`}</style>
      <div className="flex items-center gap-1.5 mb-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        <span className="text-[13px] font-bold text-gray-800">People to follow{tradeLabel ? ` in ${tradeLabel}` : ''}</span>
        <Link href={seeAll} className="ml-auto text-[11.5px] font-semibold hover:underline" style={{ color: '#0F766E' }}>See all</Link>
      </div>
      <div className="relative">
        {!atStart && <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10 rounded-l-2xl" style={{ background: 'linear-gradient(90deg,#fff 35%,rgba(255,255,255,0))' }} />}
        {!atEnd && <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 rounded-r-2xl" style={{ background: 'linear-gradient(270deg,#fff 35%,rgba(255,255,255,0))' }} />}
        {!atStart && (
          <button onClick={() => nudge(-1)} aria-label="Scroll left" className={`${chevBtn} left-0`} style={chevStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        {!atEnd && (
          <button onClick={() => nudge(1)} aria-label="Scroll right" className={`${chevBtn} right-0`} style={chevStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
        <div ref={ref} className="pg-hscroll flex gap-3 overflow-x-auto"
          style={{ scrollbarWidth: 'none', scrollSnapType: 'x proximity' } as React.CSSProperties}>
          {pros.map(pro => (
            <div key={pro.id} className="relative flex-shrink-0 rounded-2xl border text-center p-4"
              style={{ width: 158, borderColor: '#EEF1F0', scrollSnapAlign: 'start' }}>
              <Link href={`/pro/${(pro as any).slug || pro.id}`} className="inline-flex">
                <span style={{ display: 'inline-flex', borderRadius: '50%', padding: 3, background: '#fff', boxShadow: '0 2px 6px -2px rgba(10,22,40,0.18)' }}>
                  <Avatar pro={pro} size={16} />
                </span>
              </Link>
              <div className="flex items-center justify-center gap-1 mt-2.5">
                <Link href={`/pro/${(pro as any).slug || pro.id}`} className="text-[13px] font-bold text-gray-900 hover:text-teal-700 truncate max-w-[112px]">{pro.full_name}</Link>
                {pro.is_verified && <svg width="11" height="11" viewBox="0 0 24 24" fill="#0F766E" className="flex-shrink-0"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>}
              </div>
              <div className="text-[11.5px] text-gray-500 truncate mt-0.5 mb-3">{pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}</div>
              {session.id !== pro.id && (
                <div className="flex items-center justify-center gap-1.5">
                  <FollowButton proId={pro.id} followerId={session.id} compact onToggle={onFollowToggle} />
                  <MessageButton proId={pro.id} followerId={session.id} compact />
                </div>
              )}
            </div>
          ))}
          <Link href={seeAll} className="flex-shrink-0 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center p-4 hover:bg-gray-50 transition-colors"
            style={{ width: 158, borderColor: '#D7DEDB', scrollSnapAlign: 'start' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ background: '#E6F5F1' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <span className="text-[12px] font-bold text-gray-700 leading-tight">See all<br/>{tradeLabel || 'pros'}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function EmptyFeed({ mode, tradeLabel, suggested, session, hasPosted, followingCount, followingPros, onCompose, onAsk, onShowAll, onFollowToggle }: {
  mode: 'following' | 'trade' | 'all' | 'mine'
  tradeLabel: string | null
  suggested: Pro[]
  session: Session | null
  hasPosted: boolean
  followingCount: number | null
  followingPros: Pro[]
  onCompose: () => void
  onAsk: () => void
  onShowAll: () => void
  onFollowToggle?: (nowFollowing: boolean) => void
}) {
  // followingCount === null: still fetching — defer hero to avoid flash of wrong state
  // followingCount === 0: user follows nobody → onboarding
  // followingCount > 0 + mode=following: user follows people but no posts yet
  const followingLoading = mode === 'following' && followingCount === null && !!session
  const followingHasNetwork = mode === 'following' && followingCount !== null && followingCount > 0

  // The big welcome hero is onboarding — it disappears once the pro has posted.
  const showWelcome = mode === 'following' || mode === 'mine' || !hasPosted
  const hero = followingHasNetwork
    ? { title: 'Your network is quiet right now', sub: 'The pros you follow haven\'t posted yet. Check back soon, or browse all posts.' }
    : mode === 'following'
    ? { title: "You're not following anyone yet", sub: 'Follow pros below to build your Guild feed. Their projects and answers will appear here.' }
    : mode === 'mine'
      ? { title: 'Your posts live here', sub: 'Share a project, ask a question, or post a milestone to get started.' }
      : { title: 'Start your Guild presence', sub: 'Share a project, ask a question, or introduce yourself.' }

  if (followingLoading) {
    return (
      <div className="bg-white rounded-2xl border p-5 shadow-sm flex items-center gap-3" style={{ borderColor: '#E4E8E6' }}>
        <div className="w-8 h-8 rounded-full border-2 border-teal-200 border-t-teal-600 animate-spin flex-shrink-0" />
        <span className="text-[13px] text-gray-500">Loading your feed…</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showWelcome ? (
        /* Branded hero — compact, with a clearly-illustrative SVG (not a photo) */
        <div className="relative overflow-hidden rounded-2xl shadow-sm">
          <div className="px-5 py-5 flex items-center gap-4 text-left" style={{ background: 'linear-gradient(125deg, #0B5D4E 0%, #0F766E 55%, #0D9488 100%)' }}>
            <div className="min-w-0 flex-1">
              <h3 className="text-[16px] font-extrabold text-white leading-tight">{hero.title}</h3>
              <p className="text-[12.5px] text-white/80 leading-snug mt-0.5">{hero.sub}</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {session && mode !== 'following' && (
                  <>
                    <button onClick={onCompose}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-bold bg-white hover:opacity-90 transition-opacity" style={{ color: '#0B5D4E' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Share a post
                    </button>
                    <button onClick={onAsk}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-bold text-white transition-colors" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.28)' }}>
                      Ask a question
                    </button>
                    {mode === 'trade' && (
                      <button onClick={onShowAll}
                        className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-white/85 hover:text-white transition-colors">
                        See all trades →
                      </button>
                    )}
                  </>
                )}
                {session && mode === 'following' && !followingHasNetwork && (
                  <span className="text-[12.5px] text-white/80">Find pros to follow in the "People to follow" section below.</span>
                )}
                {session && followingHasNetwork && (
                  <button onClick={onShowAll}
                    className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold bg-white hover:opacity-90 transition-opacity" style={{ color: '#0B5D4E' }}>
                    Browse all posts →
                  </button>
                )}
                {!session && (
                  <Link href="/login?tab=signup"
                    className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold bg-white hover:opacity-90 transition-opacity" style={{ color: '#0B5D4E' }}>
                    Join the Guild
                  </Link>
                )}
              </div>
            </div>
            <div className="hidden sm:block flex-shrink-0 self-stretch" aria-hidden="true">
              <svg width="140" height="104" viewBox="0 0 150 120" fill="none">
                <rect x="26" y="30" width="92" height="74" rx="10" transform="rotate(-7 72 67)" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5"/>
                <rect x="34" y="20" width="94" height="82" rx="11" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"/>
                <circle cx="51" cy="37" r="7" fill="rgba(255,255,255,0.35)"/>
                <rect x="63" y="33" width="40" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>
                <rect x="63" y="41" width="26" height="3.5" rx="1.75" fill="rgba(255,255,255,0.28)"/>
                <rect x="44" y="53" width="74" height="38" rx="6" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
                <circle cx="81" cy="72" r="11" fill="rgba(255,255,255,0.94)"/>
                <path d="M78 67.5 L87 72 L78 76.5 Z" fill="#0F766E"/>
                <g transform="translate(103,13)">
                  <rect x="0" y="0" width="27" height="27" rx="8" fill="rgba(255,255,255,0.92)"/>
                  <circle cx="9.5" cy="9.5" r="2.6" fill="#0D9488"/>
                  <path d="M4 21 L11.5 13.5 L16 18 L20 14 L23 17 L23 22 Q23 23 22 23 L5 23 Q4 23 4 22 Z" fill="#0F766E"/>
                </g>
              </svg>
            </div>
          </div>
        </div>
      ) : (
        /* Returning pro, this view just happens to be empty — quiet, not promotional */
        <div className="bg-white rounded-2xl border p-5 text-center shadow-sm" style={{ borderColor: '#E4E8E6' }}>
          <div className="text-[14px] font-bold text-gray-800 mb-0.5">No {tradeLabel ? `${tradeLabel} ` : ''}posts yet</div>
          <div className="text-[12.5px] text-gray-500 mb-3">Be the first to share{tradeLabel ? ` in ${tradeLabel}` : ''}{mode === 'trade' ? ' — or broaden to all trades.' : '.'}</div>
          <div className="flex items-center justify-center gap-2">
            <button onClick={onCompose} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Share a post
            </button>
            {mode === 'trade' && (
              <button onClick={onShowAll} className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold hover:underline" style={{ color: '#0F766E' }}>See all trades →</button>
            )}
          </div>
        </div>
      )}

      {/* When network is quiet: show who the user follows so they can visit profiles */}
      {followingHasNetwork && followingPros.length > 0 && session && (
        <div className="bg-white rounded-2xl border shadow-sm" style={{ borderColor: '#E4E8E6' }}>
          <div className="px-4 pt-4 pb-2 flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <span className="text-[13px] font-bold text-gray-800">People you follow</span>
          </div>
          <div className="divide-y" style={{ borderColor: '#F0F2F1' }}>
            {followingPros.map(pro => (
              <div key={pro.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/pro/${(pro as any).slug || pro.id}`} className="flex-shrink-0">
                  <Avatar pro={pro} size={9} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <Link href={`/pro/${(pro as any).slug || pro.id}`} className="text-[13px] font-bold text-gray-900 hover:text-teal-700 truncate">{pro.full_name}</Link>
                    {pro.is_verified && <svg width="10" height="10" viewBox="0 0 24 24" fill="#0F766E" className="flex-shrink-0"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>}
                  </div>
                  <div className="text-[11.5px] text-gray-500 truncate">{pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}</div>
                </div>
                <FollowButton proId={pro.id} followerId={session.id} compact onToggle={onFollowToggle} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discover strip — only when user follows nobody */}
      {session && suggested.length > 0 && !followingHasNetwork && (
        <FollowStrip pros={suggested} session={session} tradeLabel={tradeLabel} onFollowToggle={onFollowToggle} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild Page — main component
// ─────────────────────────────────────────────────────────────────────────────

type FeedFilter = 'all' | 'following' | 'questions' | 'projects' | 'mine'
type MineTypeFilter = '' | 'work' | 'tip' | 'update' | 'milestone'

function GuildPageInner() {
  const { session: _real, loading: authLoading, signOut } = useProSession()
  const searchParams = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [suggested, setSuggested] = useState<Pro[]>([])
  const [followingCount, setFollowingCount] = useState<number | null>(null)
  const [followingPros, setFollowingPros] = useState<Pro[]>([])
  const [trendingQuestions, setTrendingQuestions] = useState<Post[]>([])
  const [jobAlerts, setJobAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())
  const [hasPosted, setHasPosted] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mineTypeFilter, setMineTypeFilter] = useState<MineTypeFilter>('')
  const moreRef = useRef<HTMLDivElement>(null)
  const [dmOpen, setDmOpen] = useState(false)
  const [dmWithId, setDmWithId] = useState<string | null>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  // Listen for DM open requests from MessageButton components
  useEffect(() => {
    function onDM(e: Event) {
      if (!session) { window.location.href = '/login'; return }
      const proId = (e as CustomEvent).detail?.proId as string | undefined
      if (proId) { setDmWithId(proId); setDmOpen(true) }
    }
    window.addEventListener('guild:dm', onDM)
    return () => window.removeEventListener('guild:dm', onDM)
  }, [session])
  // null = not yet initialised; '' = All trades (explicit); slug = a trade.
  // A logged-in pro's feed DEFAULTS to their own trade.
  const [tradeFilter, setTradeFilter] = useState<string | null>(null)

  // URL-driven tab — feed is default; left-nav adds projects|mine
  const tabParam = searchParams.get('tab') as FeedFilter | null
  const feedFilter: FeedFilter = tabParam && ['all','following','questions','projects','mine'].includes(tabParam) ? tabParam : 'all'

  // Reset mineTypeFilter when leaving Mine view
  useEffect(() => {
    if (feedFilter !== 'mine') setMineTypeFilter('')
  }, [feedFilter])

  // Seed the trade filter once auth resolves: a pro lands on their own trade.
  useEffect(() => {
    if (authLoading || tradeFilter !== null) return
    setTradeFilter(_real?.trade_slug || '')
  }, [authLoading, _real?.id, _real?.trade_slug, tradeFilter])

  function buildUrl(s: Session | null, ff: FeedFilter, trade: string, mineType: MineTypeFilter = '') {
    // My Posts — only this pro's own posts, no trade/feed filter
    if (ff === 'mine' && s) {
      const base = `/api/posts?pro_id=${s.id}&limit=30`
      return mineType ? `${base}&post_type=${mineType}` : base
    }
    const base = s ? `/api/posts?feed_for=${s.id}&limit=30` : `/api/posts?limit=30`
    const p = new URLSearchParams()
    // Following shows everyone you follow, across trades — so no trade filter there.
    if (trade && ff !== 'following') p.set('trade_slug', trade)
    if (ff === 'questions') p.set('post_type', 'tip')
    if (ff === 'projects')  p.set('post_type', 'work')
    if (ff === 'following')  p.set('following', '1')
    const qs = p.toString()
    return qs ? `${base}&${qs}` : base
  }

  const safe = useCallback(
    (p: Promise<Response>): Promise<any> => p.then(r => r.ok ? r.json() : {}).catch(() => ({})),
    []
  )

  // Feed stream — reloads only when the filter/tab/identity changes
  useEffect(() => {
    if (tradeFilter === null) return // wait for trade seed
    const s = _real
    setLoading(true)
    safe(fetch(buildUrl(s, feedFilter, tradeFilter, mineTypeFilter)))
      .then(d => { setPosts(d.posts || []); setLoading(false) })
      .catch(() => setLoading(false))
    // When on the Following tab, fetch how many pros this user follows so the
    // empty-feed hero can distinguish "follows nobody" vs "follows people, no posts yet"
    if (feedFilter === 'following' && s?.id) {
      safe(fetch(`/api/follows?pro_id=${s.id}`))
        .then(d => {
          setFollowingCount(typeof d.following_count === 'number' ? d.following_count : 0)
          setFollowingPros(Array.isArray(d.following) ? d.following.filter(Boolean) : [])
        })
    } else if (feedFilter !== 'following') {
      setFollowingCount(null) // reset so it re-fetches next time Following tab is opened
      setFollowingPros([])
    }
    // Keyed on _real?.id (not the object) so a silent re-resolve on tab refocus
    // doesn't retrigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeFilter, feedFilter, mineTypeFilter, _real?.id])

  // Rail widgets + likes — loaded once per identity, personalised to the pro's trade
  useEffect(() => {
    const s = _real
    setSession(s)
    const trade = s?.trade_slug ? `&trade_slug=${s.trade_slug}` : ''
    Promise.all([
      safe(fetch(`/api/pros?limit=8&sort=rating&status=all${trade}`)),
      s ? safe(fetch(`/api/posts/likes?pro_id=${s.id}`)) : Promise.resolve({ likes: [] }),
      safe(fetch('/api/jobs?status=Open&limit=3')),
      safe(fetch(`/api/posts?limit=5&post_type=tip${trade}`)),
      s ? safe(fetch(`/api/posts?pro_id=${s.id}&limit=1`)) : Promise.resolve({ posts: [] }),
    ]).then(([prosData, likesData, jobsData, qData, mineData]) => {
      let pros = (prosData.pros || []).filter((p: Pro) => p.id !== s?.id)
      // If the pro's own trade is too thin, backfill with top pros from any trade
      if (s?.trade_slug && pros.length < 6) {
        safe(fetch('/api/pros?limit=12&sort=rating&status=all')).then((all: any) => {
          const extra = (all.pros || []).filter((p: Pro) => p.id !== s?.id && !pros.some((x: Pro) => x.id === p.id))
          setSuggested([...pros, ...extra].slice(0, 6))
        })
      } else {
        setSuggested(pros.slice(0, 6))
      }
      setLikedIds(new Set(likesData.likes || []))
      setJobAlerts(jobsData.jobs || [])
      setTrendingQuestions(qData.posts || [])
      setHasPosted((mineData.posts || []).length > 0) // welcome card disappears after first post
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_real?.id])

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

  function handleEdit(postId: string, content: string) {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p))
  }

  // Single white app bar is 56px tall; sticky rails + pill strip sit just under it
  const HEADER_H = 56
  const STICKY_TOP = HEADER_H + 16

  const TABS: { key: FeedFilter; label: string; desc: string }[] = [
    { key: 'all',       label: 'Feed',      desc: 'Latest work from every trade' },
    { key: 'questions', label: 'Q&A',       desc: 'Questions answered by licensed pros' },
    ...(session ? [{ key: 'following' as FeedFilter, label: 'Following', desc: 'Posts from pros you follow' }] : []),
  ]
  const isStaging = process.env.NEXT_PUBLIC_ENV === 'staging'

  // The pro's own trade is the DEFAULT selection and labels the personalised rails
  // (pills stay in fixed order — no reordering, so no duplicate chip).
  const myTrade = session?.trade_slug
    ? (TRADES.find(t => t.slug === session.trade_slug) || { label: session.trade || 'My trade', slug: session.trade_slug })
    : null
  const myTradeLabel = myTrade?.label || null
  // Pro's own trade leads the pill row; the rest fall into a "More" menu so it stays one line.
  const orderedPills = myTrade ? [myTrade, ...TRADES.filter(t => t.slug !== myTrade.slug)] : TRADES
  const VISIBLE_PILLS = 6
  const inlinePills = orderedPills.slice(0, VISIBLE_PILLS)
  const morePills = orderedPills.slice(VISIBLE_PILLS)
  const pillOn = { background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', borderColor: 'transparent', boxShadow: '0 2px 8px -2px rgba(15,118,110,0.5)' }
  const pillOff = { background: '#fff', color: '#4B5563', borderColor: '#E4E8E6' }
  const moreActive = morePills.some(t => t.slug === tradeFilter)

  // Shared segmented feed-tab control (matches homepage nav language)
  const TabPills = ({ size = 'md' }: { size?: 'md' | 'sm' }) => (
    <div className="inline-flex items-center rounded-full p-1"
      style={{ background: '#EFEAE1', boxShadow: 'inset 0 0 0 1px rgba(10,22,40,0.06)' }}>
      {TABS.map(tab => {
        const active = feedFilter === tab.key
        return (
          <Link key={tab.key} href={tab.key === 'all' ? '/guild' : `/guild?tab=${tab.key}`} title={tab.desc}
            className={`relative font-semibold rounded-full transition-colors whitespace-nowrap ${size === 'sm' ? 'text-[12.5px] px-3.5 py-1' : 'text-[13px] px-4 py-1.5'}`}
            style={active
              ? { background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', boxShadow: '0 2px 8px -2px rgba(15,118,110,0.5)' }
              : { color: '#5B6472' }}>
            {tab.label}
          </Link>
        )
      })}
    </div>
  )

  // While auth resolves, show a neutral skeleton — never the logged-out chrome
  // (prevents the guest → logged-in flash on load).
  if (authLoading && !session) {
    return (
      <DashboardShell session={null} newLeads={0} noSidebar>
        <div className="min-h-screen" style={{ backgroundColor: '#F4F2EC' }}>
          <header className="sticky top-0 z-40">
            <div className="max-w-[1128px] mx-auto px-4 pt-3">
              <div className="h-12 flex items-center gap-2.5 rounded-full bg-white/95 backdrop-blur pl-3 pr-2"
                style={{ boxShadow: '0 10px 30px -14px rgba(10,22,40,0.30), 0 0 0 1px rgba(10,22,40,0.05)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="ProGuild" className="w-8 h-8 rounded-lg" />
                <span className="font-serif text-[17px]" style={{ color: '#0A1628' }}>The&nbsp;Guild</span>
              </div>
            </div>
          </header>
          <div className="max-w-[1128px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[212px_1fr_280px] gap-5 items-start">
            <div className="hidden lg:block bg-white rounded-2xl border h-72 animate-pulse" style={{ borderColor: '#E4E8E6' }} />
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border h-24 animate-pulse" style={{ borderColor: '#E4E8E6' }} />
              <div className="bg-white rounded-2xl border h-40 animate-pulse" style={{ borderColor: '#E4E8E6' }} />
              <div className="bg-white rounded-2xl border h-40 animate-pulse" style={{ borderColor: '#E4E8E6' }} />
            </div>
            <div className="hidden lg:block bg-white rounded-2xl border h-64 animate-pulse" style={{ borderColor: '#E4E8E6' }} />
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell session={session} newLeads={0} noSidebar>
      <div className="min-h-screen" style={{ backgroundColor: '#F4F2EC' }}>

        {/* ════════════════════════════════════════════════════════════════
            APP BAR — floating pill nav, matched to the ProGuild homepage:
            real logo + serif wordmark, warm-sand segmented tabs, deep-green
            gradient accents, bordered account chip.
        ════════════════════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-40">
          <div className="max-w-[1128px] mx-auto px-4 pt-3">
            <div className="h-12 flex items-center justify-between gap-3 rounded-full bg-white/95 backdrop-blur pl-3 pr-2"
              style={{ boxShadow: '0 10px 30px -14px rgba(10,22,40,0.30), 0 0 0 1px rgba(10,22,40,0.05)' }}>

              {/* Brand — ProGuild mark + "The Guild" lockup.
                  DM Serif Display has no bold weight, so no font-bold (avoids faux-bold). */}
              <Link href="/guild" className="flex items-center gap-2.5 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="ProGuild" className="w-8 h-8 rounded-lg flex-shrink-0" />
                <span className="font-serif text-[19px] leading-none" style={{ color: '#0A1628', letterSpacing: '-0.01em' }}>The&nbsp;Guild</span>
                {isStaging && (
                  <span className="hidden sm:inline ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide"
                    style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D' }}>STAGING</span>
                )}
              </Link>

              {/* Right — compose + account chip, or auth CTAs.
                  Desktop section nav lives in the left rail (primary); no top tabs. */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {session ? (
                  <>
                    <button onClick={() => window.dispatchEvent(new Event('guild:compose'))}
                      className="hidden sm:flex items-center gap-1.5 text-[13px] font-bold text-white px-4 py-1.5 rounded-full transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', boxShadow: '0 2px 10px -3px rgba(15,118,110,0.6)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Post
                    </button>
                    <NotificationBell proId={session.id} />
                    <UserMenu session={session} onSignOut={signOut} />
                  </>
                ) : (
                  <>
                    <Link href="/login" className="text-[13px] font-semibold px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ color: '#5B6472' }}>Log in</Link>
                    <Link href="/login?tab=signup"
                      className="text-[13px] font-bold text-white px-4 py-1.5 rounded-full transition-all hover:opacity-90 whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', boxShadow: '0 2px 10px -3px rgba(15,118,110,0.6)' }}>
                      Join Free
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Section tabs below the pill — shown whenever the left rail is hidden
                (< lg). On lg+ the left rail is the primary nav, so no top tabs. */}
            <div className="lg:hidden flex justify-center mt-2">
              <TabPills size="sm" />
            </div>
          </div>
        </header>

        {/* ════════════════════════════════════════════════════════════════
            3-col layout: left sidebar | feed | right sidebar
        ════════════════════════════════════════════════════════════════ */}
        <div className="max-w-[1200px] mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[212px_1fr_280px] gap-5 items-start">

          {/* ── LEFT SIDEBAR ── */}
          <aside className="hidden lg:block" style={{ position: 'sticky', top: STICKY_TOP }}>
            {session ? (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor: '#E4E8E6' }}>
                {/* Trade cover + identity */}
                <div className="h-16" style={{ background: 'linear-gradient(120deg, #0B5D4E 0%, #0F766E 55%, #0D9488 100%)' }} />
                <div className="px-4 pb-4">
                  <div className="-mt-14 mb-3">
                    {/* Enlarged DP — 88px with thick white ring, reads clearly against cover */}
                    <span style={{ display: 'inline-flex', borderRadius: '50%', padding: 5, background: '#fff', boxShadow: '0 4px 16px -4px rgba(10,22,40,0.32)' }}>
                      <Avatar pro={{ full_name: session.name, profile_photo_url: session.photo_url }} size={22} />
                    </span>
                  </div>
                  <div className="text-[16px] font-extrabold text-gray-900 leading-tight truncate">{session.name}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {myTradeLabel && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#E6F5F1', color: '#0B5D4E' }}>{myTradeLabel}</span>
                    )}
                    {session.city && <span className="text-[12px] font-medium text-gray-500">{session.city}{session.state ? `, ${session.state}` : ''}</span>}
                  </div>
                  {session.is_verified && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#0F766E"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                      <span className="text-[11px] font-bold" style={{ color: '#0B5D4E' }}>Guild Verified</span>
                    </div>
                  )}
                  <Link href={`/pro/${session.slug || session.id}`}
                    className="flex items-center justify-center gap-1.5 w-full mt-3.5 py-2 text-[12.5px] font-bold text-white rounded-xl transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', boxShadow: '0 4px 12px -4px rgba(15,118,110,0.6)' }}>
                    View profile
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </Link>
                </div>

                {/* Navigation — active item fills with the brand gradient */}
                <nav className="px-2 pb-2 pt-1.5 border-t" style={{ borderColor: '#EEF1F0' }}>
                  {([
                    { href: '/guild?tab=all',        tab: null,         label: 'Home',       icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
                    { href: '/guild?tab=questions',  tab: 'questions',  label: 'Q&A',        icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                    { href: '/guild?tab=following',  tab: 'following',  label: 'Following',  icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
                    { href: '/guild?tab=projects',   tab: 'projects',   label: 'Projects',   icon: 'M2 3h20v4H2zM4 7v13a1 1 0 001 1h14a1 1 0 001-1V7M10 11h4' },
                    { href: '/guild?tab=mine',       tab: 'mine',       label: 'My Posts',   icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
                  ] as { href: string; tab: string | null; label: string; icon: string }[]).map(item => {
                    const active = item.tab
                      ? feedFilter === item.tab
                      : (item.href === '/guild?tab=all' && feedFilter === 'all')
                    return (
                      <Link key={item.href} href={item.href}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-all"
                        style={active
                          ? { background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', fontWeight: 700, boxShadow: '0 3px 10px -4px rgba(15,118,110,0.6)' }
                          : { color: '#374151', fontWeight: 600 }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth={active ? 2.3 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d={item.icon}/>
                        </svg>
                        {item.label}
                      </Link>
                    )
                  })}
                </nav>

                {/* Switch context — a deliberate Guild → Business control */}
                <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: '#EEF1F0' }}>
                  <Link href="/dashboard"
                    className="group flex items-center gap-2.5 py-2 px-2.5 rounded-xl transition-colors hover:bg-gray-50"
                    style={{ border: '1px solid #E4E8E6' }}>
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0" style={{ background: '#EEF2F6' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01"/></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-bold text-gray-800 leading-tight">Switch to My Business</span>
                      <span className="block text-[11px] text-gray-500 leading-tight">CRM, leads &amp; jobs</span>
                    </span>
                    <svg className="flex-shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </Link>
                </div>
              </div>
            ) : (
              /* Guest sidebar */
              <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="ProGuild" className="w-6 h-6 rounded-md flex-shrink-0" />
                    <div className="font-serif text-[15px] font-bold" style={{ color: '#0A1628' }}>The Guild</div>
                  </div>
                  <p className="text-[12px] text-gray-500 mb-3 leading-relaxed">Connect with licensed tradespeople, share your work, and build your reputation.</p>
                  <Link href="/login?tab=signup" className="block w-full py-2 text-center text-[12px] font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors mb-2">
                    Join Free
                  </Link>
                  <Link href="/login" className="block w-full py-2 text-center text-[12px] font-semibold border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors">
                    Log in
                  </Link>
                </div>
                <nav className="py-2">
                  {([
                    { href: '/guild',          label: 'The Guild',     icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: true },
                    { href: '/jobs',           label: 'Open Projects', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', active: false },
                    { href: '/verify-license', label: 'License Check', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', active: false },
                  ]).map(item => (
                    <Link key={item.href} href={item.href}
                      className="flex items-center gap-3 mx-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all"
                      style={item.active ? { color: '#0F766E', background: '#F0FDF9', fontWeight: 600 } : { color: '#6B7280' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={item.active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
          </aside>

          {/* ── MAIN FEED ── */}
          <div className="min-w-0">

            {/* Contextual trade filter — one row: All Trades + the pro's trade (pinned)
                + key trades, with the rest under a "More" menu so it never wraps.
                min-w-0 + overflow-hidden keeps pills from bleeding into the right rail. */}
            {(feedFilter === 'all' || feedFilter === 'questions' || feedFilter === 'projects') && (
              <div className="pg-hscroll flex items-center gap-2 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                <button onClick={() => setTradeFilter('')}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-all whitespace-nowrap border"
                  style={tradeFilter === '' ? pillOn : pillOff}>
                  All Trades
                </button>
                {inlinePills.map(t => {
                  const on = tradeFilter === t.slug
                  return (
                    <button key={t.slug} onClick={() => setTradeFilter(on ? '' : t.slug)}
                      className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-all whitespace-nowrap border"
                      style={on ? pillOn : pillOff}>
                      {t.label}
                    </button>
                  )
                })}
                {morePills.length > 0 && (
                  <div className="relative flex-shrink-0" ref={moreRef}>
                    <button onClick={() => setMoreOpen(o => !o)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-all whitespace-nowrap border"
                      style={moreActive ? pillOn : pillOff}>
                      More
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {moreOpen && (
                      <div className="absolute left-0 mt-2 w-44 bg-white rounded-xl border border-gray-200 py-1.5 z-50" style={{ boxShadow: '0 14px 40px rgba(15,23,22,0.16)' }}>
                        {morePills.map(t => {
                          const on = tradeFilter === t.slug
                          return (
                            <button key={t.slug} onClick={() => { setTradeFilter(on ? '' : t.slug); setMoreOpen(false) }}
                              className="w-full flex items-center justify-between px-3.5 py-2 text-[13px] font-semibold hover:bg-gray-50 transition-colors"
                              style={{ color: on ? '#0F766E' : '#374151' }}>
                              {t.label}
                              {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* My Posts sub-tabs — shown only in Mine view */}
            {feedFilter === 'mine' && session && (
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {([
                  { key: '' as MineTypeFilter,           label: 'All' },
                  { key: 'work' as MineTypeFilter,       label: 'Projects' },
                  { key: 'tip' as MineTypeFilter,        label: 'Questions' },
                  { key: 'update' as MineTypeFilter,     label: 'Posts' },
                  { key: 'milestone' as MineTypeFilter,  label: 'Milestones' },
                ]).map(t => {
                  const on = mineTypeFilter === t.key
                  return (
                    <button key={t.key} onClick={() => setMineTypeFilter(t.key)}
                      className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-all whitespace-nowrap border"
                      style={on ? pillOn : pillOff}>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            )}

            {session && feedFilter !== 'following' && <PostComposer session={session} onPost={post => { setPosts(p => [post as Post, ...p]); setHasPosted(true) }} />}

            {!session && (
              <div className="bg-white rounded-2xl border border-gray-200/60 p-4 mb-3 shadow-sm flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-gray-900 mb-0.5">Share your work with the Guild</p>
                  <p className="text-[12px] text-gray-500">Licensed pros post projects, answer questions, build reputation.</p>
                </div>
                <Link href="/login?tab=signup" className="flex-shrink-0 px-4 py-2 bg-teal-600 text-white text-[12px] font-bold rounded-xl hover:bg-teal-700 transition-colors">
                  Join Free
                </Link>
              </div>
            )}

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
              <EmptyFeed
                mode={feedFilter === 'following' ? 'following' : feedFilter === 'mine' ? 'mine' : (tradeFilter ? 'trade' : 'all')}
                tradeLabel={myTradeLabel}
                suggested={suggested}
                session={session}
                hasPosted={hasPosted}
                followingCount={followingCount}
                followingPros={followingPros}
                onCompose={() => window.dispatchEvent(new CustomEvent('guild:compose', { detail: { type: 'work' } }))}
                onAsk={() => window.dispatchEvent(new CustomEvent('guild:compose', { detail: { type: 'tip' } }))}
                onShowAll={() => { window.location.href = '/guild' }}
                onFollowToggle={(nowFollowing) => setFollowingCount(c => c !== null ? c + (nowFollowing ? 1 : -1) : null)}
              />
            ) : (
              <div className="space-y-3">
                {postsWithLikes.map(post => (
                  <PostCard
                    key={post.id}
                    post={post as Post & { liked_by_me: boolean }}
                    session={session}
                    onLike={handleLike}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    liking={likingIds.has(post.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <aside className="hidden lg:block space-y-3" style={{ position: 'sticky', top: STICKY_TOP }}>

            {/* Top Pros — personalised to the pro's own trade.
                Hidden when the feed is empty: the FollowStrip in the center column
                already shows the same people, so surfacing them twice is redundant. */}
            {postsWithLikes.length > 0 && <div className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: '#3B4452' }}>
                  {myTradeLabel ? `Top ${myTradeLabel} Pros` : 'Top Pros'}
                </span>
                <Link href={myTrade ? `/search?trade=${myTrade.slug}` : '/search'} className="text-[11px] font-semibold hover:underline" style={{ color: '#0F766E' }}>See all</Link>
              </div>
              {suggested.length === 0 ? (
                <div className="text-[12px] text-gray-500">No suggestions yet.</div>
              ) : suggested.slice(0, 5).map((pro, i, arr) => (
                <div key={pro.id} className={`flex items-center gap-2.5 py-2 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <Link href={`/pro/${(pro as any).slug || pro.id}`} className="flex-shrink-0">
                    <Avatar pro={pro} size={8} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Link href={`/pro/${(pro as any).slug || pro.id}`} className="text-[12px] font-semibold text-gray-900 hover:text-teal-600 truncate">{pro.full_name}</Link>
                      {pro.is_verified && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#16a34a" className="flex-shrink-0">
                          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                        </svg>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{pro.trade_category?.category_name}{pro.city ? ` · ${pro.city}` : ''}</div>
                  </div>
                  {session && session.id !== pro.id && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <FollowButton proId={pro.id} followerId={session.id} compact />
                      <MessageButton proId={pro.id} followerId={session.id} compact />
                    </div>
                  )}
                </div>
              ))}
            </div>}

            {/* Trending Q&A — scoped to the pro's trade */}
            {trendingQuestions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/70 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: '#3B4452' }}>{myTradeLabel ? `${myTradeLabel} Q&A` : 'Trending Q&A'}</span>
                  <Link href="/guild?tab=questions" className="text-[11px] font-semibold hover:underline" style={{ color: '#0F766E' }}>See all</Link>
                </div>
                <div className="space-y-3">
                  {trendingQuestions.slice(0, 4).map((post, i, arr) => (
                    <Link key={post.id} href={`/guild?tab=questions`}
                      className={`block pb-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''} hover:opacity-80 transition-opacity`}>
                      <p className="text-[12px] text-gray-800 font-medium leading-snug line-clamp-2 mb-1">{post.content}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        <span>{post.comment_count || 0} answers</span>
                        <span>·</span>
                        <span>{(post.pro as any)?.trade_category?.category_name || 'General'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Open Projects */}
            {jobAlerts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">Open Projects</span>
                  <Link href="/jobs" className="text-[11px] text-teal-600 hover:underline font-medium">Browse</Link>
                </div>
                <div className="space-y-1.5">
                  {jobAlerts.map(job => (
                    <Link key={job.id} href="/jobs"
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors -mx-1">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-gray-800 truncate">{job.title}</div>
                        <div className="text-[11px] text-gray-500">
                          {job.city || job.state || 'Florida'}{job.budget_range ? ` · ${job.budget_range}` : ''}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Resources — a small branded card, not loose vanilla links */}
            <div className="rounded-2xl border p-3.5 shadow-sm" style={{ borderColor: '#E4E8E6', background: 'linear-gradient(170deg, #FFFFFF 0%, #F6FBF9 100%)' }}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="ProGuild" className="w-5 h-5 rounded-md flex-shrink-0" />
                <span className="font-serif text-[13px] font-bold" style={{ color: '#0A1628' }}>ProGuild</span>
                <span className="text-[11px] font-semibold text-gray-500">· Resources</span>
              </div>
              {([
                { href: '/jobs',           label: 'Find Work' },
                { href: '/guides',         label: 'Trade Guides' },
                { href: '/verify-license', label: 'License Lookup' },
                { href: '/search',         label: 'Find Pros' },
              ]).map(l => (
                <Link key={l.href} href={l.href}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors hover:bg-white"
                  style={{ color: '#374151' }}>
                  {l.label}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              ))}
              <div className="mt-2 pt-2.5 border-t px-2 text-[10.5px] font-medium text-gray-500" style={{ borderColor: '#EEF1F0' }}>
                © 2026 ProGuild.ai · Florida's verified trades
              </div>
            </div>
          </aside>
        </div>

        {/* DM slide-over panel */}
        {dmOpen && session && (
          <GuildDMPanel
            session={session}
            withId={dmWithId}
            onClose={() => { setDmOpen(false); setDmWithId(null) }}
          />
        )}

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-stretch h-14">
            {(session ? [
              { href: '/dashboard', label: 'Home',     icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', active: false },
              { href: '/jobs',      label: 'Projects', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', active: false },
              { href: '/guild',     label: 'The Guild',icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: true },
            ] : [
              { href: '/',          label: 'Find Pros',icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', active: false },
              { href: '/post-job',  label: 'Post Job', icon: 'M12 4v16m8-8H4', active: false },
              { href: '/guild',     label: 'The Guild',icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: true },
              { href: '/login',     label: 'Log in',   icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1', active: false },
            ]).map(item => (
              <a key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: item.active ? '#0F766E' : '#9CA3AF' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={item.active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon}/>
                </svg>
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
    </DashboardShell>
  )
}

export default function GuildPage() {
  return (
    <Suspense fallback={null}>
      <GuildPageInner />
    </Suspense>
  )
}
