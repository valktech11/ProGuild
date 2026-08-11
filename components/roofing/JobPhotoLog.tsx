// components/roofing/JobPhotoLog.tsx
// Photo upload with phase labels, grid view, share link, ZIP for adjuster.
// Used on lead detail page for all trades (roofing has insurance-specific phases).
// Uploads to Cloudflare R2 via /api/leads/[id]/photos
'use client'
import { apiFetch } from '@/lib/api-fetch'
import { useState, useCallback, useRef, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
export type PhotoPhase =
  | 'Before'
  | 'Decking'
  | 'Installation'
  | 'Completion'
  | 'Damage'
  | 'Insurance'

export interface JobPhoto {
  id:             string
  url:            string
  annotated_url?: string
  has_annotation?: boolean
  phase:          PhotoPhase
  caption:        string
  uploadedAt:     string
  filename:       string
}

interface Props {
  leadId:           string
  proId:            string
  isRoofing:        boolean
  darkMode:         boolean
  onPhotosLoaded?:  (count: number) => void
}

const PHASES: PhotoPhase[] = [
  'Before', 'Decking', 'Installation', 'Completion', 'Damage', 'Insurance',
]

const PHASE_COLORS: Record<PhotoPhase, { bg: string; text: string }> = {
  Before:       { bg: '#FEF3C7', text: '#B45309' },
  Decking:      { bg: '#EFF6FF', text: '#1D4ED8' },
  Installation: { bg: '#F5F3FF', text: '#6D28D9' },
  Completion:   { bg: '#F0FDF4', text: '#15803D' },
  Damage:       { bg: '#FEF2F2', text: '#DC2626' },
  Insurance:    { bg: '#FFF7ED', text: '#C2410C' },
}

const MAX_BYTES = 10 * 1024 * 1024

// ── Annotation tool types ─────────────────────────────────────────────────
type AnnotTool = 'paint' | 'arrow' | 'line' | 'rect' | 'circle' | 'text'
type AnnotColor = '#DC2626' | '#0F766E' | '#F59E0B' | '#2563EB' | '#FFFFFF' | '#000000'

interface AnnotPoint { x: number; y: number }
interface AnnotShape {
  tool: AnnotTool
  color: AnnotColor
  strokeWidth: number
  points?: AnnotPoint[]   // paint
  start?: AnnotPoint      // arrow, line, rect, circle
  end?: AnnotPoint
  text?: string           // text
}

// ── Annotation Editor Component ───────────────────────────────────────────
function AnnotationEditor({
  photo, proId, leadId, darkMode, onSave, onCancel
}: {
  photo: JobPhoto
  proId: string
  leadId: string
  darkMode: boolean
  onSave: (updated: JobPhoto) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<AnnotTool>('paint')
  const [color, setColor] = useState<AnnotColor>('#DC2626')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [shapes, setShapes] = useState<AnnotShape[]>([])
  const [current, setCurrent] = useState<AnnotShape | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textPos, setTextPos] = useState<AnnotPoint | null>(null)
  const [saving, setSaving] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Load and draw image + shapes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const src = photo.has_annotation && photo.annotated_url ? photo.annotated_url : photo.url
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      setImgLoaded(true)
      redraw(ctx, img, shapes, current)
    }
    img.src = src
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.url, photo.annotated_url])

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    redraw(ctx, img, shapes, current)
  }, [shapes, current, imgLoaded])

  function redraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, allShapes: AnnotShape[], cur: AnnotShape | null) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.drawImage(img, 0, 0)
    ;[...allShapes, ...(cur ? [cur] : [])].forEach(s => drawShape(ctx, s))
  }

  function drawShape(ctx: CanvasRenderingContext2D, s: AnnotShape) {
    ctx.save()
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (s.tool === 'paint' && s.points && s.points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
    } else if ((s.tool === 'line' || s.tool === 'arrow') && s.start && s.end) {
      ctx.beginPath()
      ctx.moveTo(s.start.x, s.start.y)
      ctx.lineTo(s.end.x, s.end.y)
      ctx.stroke()
      if (s.tool === 'arrow') {
        const angle = Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x)
        const hw = s.strokeWidth * 3
        ctx.beginPath()
        ctx.moveTo(s.end.x, s.end.y)
        ctx.lineTo(s.end.x - hw * Math.cos(angle - 0.45), s.end.y - hw * Math.sin(angle - 0.45))
        ctx.lineTo(s.end.x - hw * Math.cos(angle + 0.45), s.end.y - hw * Math.sin(angle + 0.45))
        ctx.closePath()
        ctx.fill()
      }
    } else if (s.tool === 'rect' && s.start && s.end) {
      ctx.strokeRect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y)
    } else if (s.tool === 'circle' && s.start && s.end) {
      const rx = Math.abs(s.end.x - s.start.x) / 2
      const ry = Math.abs(s.end.y - s.start.y) / 2
      const cx = (s.start.x + s.end.x) / 2
      const cy = (s.start.y + s.end.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.tool === 'text' && s.start && s.text) {
      ctx.font = `bold ${s.strokeWidth * 6}px sans-serif`
      ctx.fillText(s.text, s.start.x, s.start.y)
    }
    ctx.restore()
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement>): AnnotPoint {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!imgLoaded) return
    const pos = getPos(e)
    if (tool === 'text') { setTextPos(pos); return }
    setCurrent({ tool, color, strokeWidth, ...(tool === 'paint' ? { points: [pos] } : { start: pos, end: pos }) })
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!current || !imgLoaded) return
    const pos = getPos(e)
    if (tool === 'paint') {
      setCurrent((c: AnnotShape | null) => c ? { ...c, points: [...(c.points ?? []), pos] } : c)
    } else {
      setCurrent((c: AnnotShape | null) => c ? { ...c, end: pos } : c)
    }
  }

  function onMouseUp() {
    if (!current) return
    setShapes((s: AnnotShape[]) => [...s, current])
    setCurrent(null)
  }

  function commitText() {
    if (!textInput.trim() || !textPos) return
    setShapes((s: AnnotShape[]) => [...s, { tool: 'text' as AnnotTool, color, strokeWidth, start: textPos, text: textInput }])
    setTextInput('')
    setTextPos(null)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || !imgLoaded) return
    setSaving(true)
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b: Blob | null) => b ? res(b) : rej(new Error('Canvas export failed')), 'image/jpeg', 0.92))
      const fd = new FormData()
      fd.append('annotated_file', blob, `annotated_${photo.filename}`)
      fd.append('has_annotation', 'true')
      fd.append('pro_id', proId)
      const res = await apiFetch(`/api/leads/${leadId}/photos/${photo.id}`, { method: 'PATCH', body: fd })
      if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`)
      const updated = await res.json() as JobPhoto
      onSave(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const COLORS: AnnotColor[] = ['#DC2626', '#0F766E', '#F59E0B', '#2563EB', '#FFFFFF', '#000000']
  const TOOLS: { id: AnnotTool; label: string }[] = [
    { id: 'paint', label: '✏️' },
    { id: 'arrow', label: '➡️' },
    { id: 'line',  label: '╱' },
    { id: 'rect',  label: '▭' },
    { id: 'circle',label: '◯' },
    { id: 'text',  label: 'T' },
  ]

  const toolbarBg = darkMode ? '#1E293B' : '#F8FAFC'
  const border = darkMode ? '#334155' : '#E2E8F0'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ background: toolbarBg, borderBottom: `1px solid ${border}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Tools */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} style={{
              width: 36, height: 36, borderRadius: 8, border: `2px solid ${tool === t.id ? '#0F766E' : border}`,
              background: tool === t.id ? (darkMode ? '#0F766E22' : '#F0FDFA') : 'transparent',
              cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Colors */}
        <div style={{ display: 'flex', gap: 6 }}>
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: 24, height: 24, borderRadius: '50%', background: c,
              border: color === c ? '3px solid #0F766E' : `2px solid ${border}`,
              cursor: 'pointer',
            }} />
          ))}
        </div>

        {/* Stroke width */}
        <input type="range" min={2} max={16} value={strokeWidth} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStrokeWidth(+e.target.value)}
          style={{ width: 80 }} title="Stroke width" />

        {/* Undo */}
        <button onClick={() => setShapes((s: AnnotShape[]) => s.slice(0, -1))} style={{
          padding: '6px 12px', borderRadius: 8, border: `1px solid ${border}`,
          background: 'transparent', color: darkMode ? '#94A3B8' : '#6B7280',
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>Undo</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '7px 16px', borderRadius: 8, border: `1px solid ${border}`,
            background: 'transparent', color: darkMode ? '#F1F5F9' : '#0A1628',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: saving ? '#9CA3AF' : '#0F766E', color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700,
          }}>{saving ? 'Saving…' : 'Save annotation'}</button>
        </div>
      </div>

      {/* Text input overlay */}
      {textPos && (
        <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 1300, display: 'flex', gap: 8, background: toolbarBg, padding: '8px 12px', borderRadius: 10, border: `1px solid ${border}` }}>
          <input autoFocus value={textInput} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') { setTextPos(null); setTextInput('') } }}
            placeholder="Type text, press Enter"
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${border}`, fontSize: 14, width: 220, background: darkMode ? '#0F172A' : '#fff', color: darkMode ? '#F1F5F9' : '#0A1628' }} />
          <button onClick={commitText} style={{ padding: '6px 12px', borderRadius: 6, background: '#0F766E', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Add</button>
        </div>
      )}

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ maxWidth: '100%', maxHeight: '100%', cursor: tool === 'text' ? 'text' : 'crosshair', display: 'block', borderRadius: 6 }}
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function JobPhotoLog({ leadId, proId, isRoofing, darkMode, onPhotosLoaded }: Props) {
  const [photos,        setPhotos]        = useState<JobPhoto[]>([])
  const [loading,       setLoading]       = useState(true)
  const [uploading,     setUploading]     = useState(false)
  const [selectedPhase, setSelectedPhase] = useState<PhotoPhase>('Before')
  const [filterPhase,   setFilterPhase]   = useState<PhotoPhase | 'All'>('All')
  const [error,         setError]         = useState<string | null>(null)
  const [zipping,       setZipping]       = useState(false)
  const [lightboxIdx,   setLightboxIdx]   = useState<number | null>(null)
  const [annotatingPhoto, setAnnotatingPhoto] = useState<JobPhoto | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const phases = isRoofing ? PHASES : PHASES.filter(p => p !== 'Insurance' && p !== 'Decking')

  // Helper: display URL — prefer annotated variant
  const displayUrl = (p: JobPhoto) =>
    p.has_annotation && p.annotated_url ? p.annotated_url : p.url

  // ── Load photos ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/leads/${leadId}/photos?pro_id=${proId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { photos: JobPhoto[] }) => {
        if (!cancelled) { const p: JobPhoto[] = data.photos ?? []; setPhotos(p); onPhotosLoaded?.(p.length) }
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load photos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leadId, proId])

  // ── Upload ───────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? [])
    if (all.length === 0) return
    const files = all.filter((file): file is File => file instanceof File && file.type.startsWith('image/'))
    if (files.length === 0) { setError('No image files found in that selection'); return }
    for (const file of files) {
      if ((file as File).size > MAX_BYTES) { setError(`${(file as File).name} exceeds 10MB limit`); return }
    }
    setUploading(true); setError(null)
    try {
      const uploads = await Promise.all(files.map(async file => {
        const fd = new FormData()
        fd.append('file', file); fd.append('phase', selectedPhase)
        fd.append('pro_id', proId); fd.append('caption', '')
        const res = await apiFetch(`/api/leads/${leadId}/photos`, { method: 'POST', body: fd })
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as {error?: string}).error ?? `Upload failed: HTTP ${res.status}`) }
        return res.json() as Promise<JobPhoto>
      }))
      setPhotos((prev: JobPhoto[]) => [...prev, ...uploads])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [leadId, proId, selectedPhase])

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (photo: JobPhoto) => {
    const critical = photo.phase === 'Damage' || photo.phase === 'Insurance'
    const message = critical
      ? `This is a ${photo.phase} photo and may be part of the insurance record for this claim. Deleting it is permanent.\n\nDelete this photo?`
      : 'This photo will be permanently deleted and cannot be recovered.\n\nDelete this photo?'
    if (!window.confirm(message)) return
    const photoId = photo.id
    setPhotos((prev: JobPhoto[]) => prev.filter((p: JobPhoto) => p.id !== photoId))
    const res = await apiFetch(`/api/leads/${leadId}/photos/${photoId}?pro_id=${proId}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Failed to delete photo — please try again')
      apiFetch(`/api/leads/${leadId}/photos?pro_id=${proId}`).then(r => r.json())
        .then((d: { photos: JobPhoto[] }) => setPhotos(d.photos ?? [] as JobPhoto[])).catch(() => {})
    }
  }, [leadId, proId])

  // ── ZIP download ─────────────────────────────────────────────────────────
  const handleDownloadZip = useCallback(async () => {
    setZipping(true); setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/photos/zip?pro_id=${proId}${filterPhase !== 'All' ? `&phase=${filterPhase}` : ''}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `photos-${leadId.slice(0, 8)}${filterPhase !== 'All' ? `-${filterPhase}` : ''}.zip`
      a.click(); URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ZIP download failed')
    } finally { setZipping(false) }
  }, [leadId, proId, filterPhase])

  // ── Styles ───────────────────────────────────────────────────────────────
  const cardBg      = darkMode ? '#1E293B' : '#FFFFFF'
  const cardBorder  = darkMode ? '#334155' : '#E8E2D9'
  const textPrimary = darkMode ? '#F1F5F9' : '#0A1628'
  const textMuted   = darkMode ? '#94A3B8' : '#6B7280'
  const inputBg     = darkMode ? '#0F172A' : '#F8FAFC'
  const inputBorder = darkMode ? '#334155' : '#CBD5E1'
  const teal        = '#0F766E'

  const visible = filterPhase === 'All' ? photos : photos.filter((p: JobPhoto) => p.phase === filterPhase)

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null)
      else if (e.key === 'ArrowRight') setLightboxIdx((i: number | null) => i === null ? i : Math.min(i + 1, visible.length - 1))
      else if (e.key === 'ArrowLeft')  setLightboxIdx((i: number | null) => i === null ? i : Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightboxIdx, visible.length])

  useEffect(() => {
    if (lightboxIdx !== null && lightboxIdx >= visible.length)
      setLightboxIdx(visible.length > 0 ? visible.length - 1 : null)
  }, [visible.length, lightboxIdx])

  // Annotation save handler
  // PATCH returns only {id, annotated_url, has_annotation} — merge into
  // existing photo record to preserve url, phase, caption, filename etc.
  const handleAnnotationSave = useCallback((updated: JobPhoto) => {
    setPhotos((prev: JobPhoto[]) => prev.map((p: JobPhoto) => p.id === updated.id ? { ...p, ...updated } : p))
    setAnnotatingPhoto(null)
  }, [])

  return (
    <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <style>{`
        .pg-del{opacity:1;transition:opacity .15s ease}
        @media (hover:hover){.pg-photo-cell .pg-del{opacity:0}.pg-photo-cell:hover .pg-del{opacity:1}}
        .pg-annot-btn{opacity:0;transition:opacity .15s ease}
        @media (hover:hover){.pg-photo-cell:hover .pg-annot-btn{opacity:1}}
      `}</style>

      <h3 style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 18, letterSpacing: '-0.01em' }}>
        Job photos ({photos.length})
      </h3>

      {/* Upload row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedPhase} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPhase(e.target.value as PhotoPhase)}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${inputBorder}`, background: inputBg, color: textPrimary, fontSize: 14 }}>
          {phases.map(phase => <option key={phase} value={phase}>{phase}</option>)}
        </select>

        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ padding: '8px 16px', borderRadius: 8, background: uploading ? '#9CA3AF' : teal, color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading…' : '+ Add photos'}
        </button>

        <button onClick={() => folderRef.current?.click()} disabled={uploading}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: teal, fontWeight: 600, fontSize: 14, border: `1.5px solid ${teal}`, cursor: uploading ? 'not-allowed' : 'pointer' }}>
          Upload folder
        </button>

        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
        {/* @ts-expect-error non-standard directory picker */}
        <input ref={folderRef} type="file" accept="image/*" multiple webkitdirectory="" directory="" onChange={handleFileChange} style={{ display: 'none' }} />

        {photos.length > 0 && (
          <button onClick={handleDownloadZip} disabled={zipping}
            style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', color: teal, fontWeight: 500, fontSize: 14, border: `1.5px solid ${teal}`, cursor: zipping ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}>
            {zipping ? 'Preparing ZIP…' : '⬇ ZIP for adjuster'}
          </button>
        )}
      </div>

      {/* Phase filter */}
      {photos.length > 0 && (
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, marginBottom: 16, background: darkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderRadius: 10, flexWrap: 'wrap' }}>
          {(['All', ...phases] as const).map(phase => {
            const count = phase === 'All' ? photos.length : photos.filter((p: JobPhoto) => p.phase === phase).length
            if (phase !== 'All' && count === 0) return null
            const active = filterPhase === phase
            return (
              <button key={phase} onClick={() => setFilterPhase(phase)} style={{
                padding: '5px 13px', borderRadius: 7, fontSize: 12.5,
                fontWeight: active ? 700 : 500, border: 'none',
                background: active ? (darkMode ? '#0F172A' : '#fff') : 'transparent',
                color: active ? textPrimary : textMuted,
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
              }}>
                {phase}{count > 0 && <span style={{ opacity: 0.6, marginLeft: 4, fontWeight: 600 }}>{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {error && <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ padding: 24, textAlign: 'center', color: textMuted, fontSize: 14 }}>Loading photos…</div>}
      {!loading && photos.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: textMuted, fontSize: 14, background: darkMode ? '#0F172A' : '#F8FAFC', borderRadius: 8 }}>
          No photos yet. Add Before photos first.
        </div>
      )}

      {/* Photo grid */}
      {!loading && visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {visible.map((photo: JobPhoto, idx: number) => {
            const colors = PHASE_COLORS[photo.phase]
            return (
              <div key={photo.id} className="pg-photo-cell" style={{ position: 'relative' }}>
                <div onClick={() => setLightboxIdx(idx)} style={{
                  paddingTop: '75%', position: 'relative', borderRadius: 8,
                  overflow: 'hidden', background: darkMode ? '#0F172A' : '#F1F5F9', cursor: 'zoom-in',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={displayUrl(photo)} alt={`${photo.phase} photo`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy" />
                </div>

                {/* Phase label */}
                <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: colors.bg, color: colors.text }}>
                  {photo.phase}
                </div>

                {/* Annotation sparkle badge */}
                {photo.has_annotation && (
                  <div title="Annotated" style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 14, lineHeight: 1 }}>✨</div>
                )}

                {/* Annotate button — appears on hover */}
                <button className="pg-annot-btn" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setAnnotatingPhoto(photo) }}
                  style={{
                    position: 'absolute', bottom: 6, right: 30,
                    padding: '3px 8px', borderRadius: 5,
                    background: 'rgba(0,0,0,0.65)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  }}>
                  {photo.has_annotation ? 'Re-annotate' : 'Annotate'}
                </button>

                {/* Delete button */}
                <button className="pg-del" onClick={() => handleDelete(photo)} aria-label="Delete photo"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && visible[lightboxIdx] && (() => {
        const photo = visible[lightboxIdx]
        const colors = PHASE_COLORS[photo.phase as PhotoPhase]
        const atStart = lightboxIdx <= 0
        const atEnd = lightboxIdx >= visible.length - 1
        return (
          <div onClick={() => setLightboxIdx(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Top bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'linear-gradient(180deg,rgba(0,0,0,0.55),transparent)' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{lightboxIdx + 1} / {visible.length}</span>
                <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: colors.bg, color: colors.text }}>{photo.phase}</span>
                {photo.has_annotation && <span title="Annotated" style={{ fontSize: 14 }}>✨</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setLightboxIdx(null); setAnnotatingPhoto(photo) }}
                  style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(15,118,110,0.85)', border: '1px solid #0F766E', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {photo.has_annotation ? '✏️ Re-annotate' : '✏️ Annotate'}
                </button>
                <button onClick={() => setLightboxIdx(null)} aria-label="Close"
                  style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            {!atStart && (
              <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx((i: number | null) => i === null ? i : i - 1) }} aria-label="Previous"
                style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            )}
            {!atEnd && (
              <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setLightboxIdx((i: number | null) => i === null ? i : i + 1) }} aria-label="Next"
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img onClick={(e: React.MouseEvent) => e.stopPropagation()} src={displayUrl(photo)} alt={`${photo.phase} photo`}
              style={{ maxWidth: '90vw', maxHeight: '84vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
          </div>
        )
      })()}

      {/* Annotation editor */}
      {annotatingPhoto && (
        <AnnotationEditor
          photo={annotatingPhoto}
          proId={proId}
          leadId={leadId}
          darkMode={darkMode}
          onSave={handleAnnotationSave}
          onCancel={() => setAnnotatingPhoto(null)}
        />
      )}
    </div>
  )
}
