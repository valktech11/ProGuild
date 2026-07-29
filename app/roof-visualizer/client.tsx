'use client'
// app/roof-visualizer/client.tsx — v2 with all improvements

import React, { useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { theme, BRAND, T } from '@/lib/tokens'
import Link from 'next/link'

interface Sku {
  id: string; slug: string; name: string; hex_preview: string
  is_default: boolean; sort_order: number; swatch_url?: string | null
  viz_product_lines: { id: string; slug: string; name: string
    viz_manufacturers: { id: string; slug: string; name: string } }
}
interface RenderResult {
  skuId: string; renderUrl: string | null; skuName: string
  hexPreview: string; mfgName?: string; error?: string
  lowContrast?: boolean
}
type Step = 'upload' | 'preview' | 'segmenting' | 'confirm' | 'pick' | 'touchup' | 'rendering' | 'results' | 'gate' | 'share'

function groupSkusByManufacturer(skus: Sku[]) {
  const map: Record<string, { manufacturer: string; skus: Sku[] }> = {}
  for (const sku of skus) {
    const mfg = sku.viz_product_lines?.viz_manufacturers?.name ?? 'Other'
    if (!map[mfg]) map[mfg] = { manufacturer: mfg, skus: [] }
    map[mfg].skus.push(sku)
  }
  return Object.values(map)
}
function getMfgName(sku: Sku) { return sku.viz_product_lines?.viz_manufacturers?.name ?? '' }

// Good / Better / Best tier by product line — based on impact rating and market positioning.
// Good  = GAF Timberline HDZ (entry premium, highest market share)
// Better = OC Duration, CertainTeed Landmark (mid-premium, contractor preferred)
// Best  = IKO Dynasty (Class 3/4 impact), Atlas Pinnacle Pristine (impact-rated, algae resistant)
const MFG_TIER: Record<string, { label: string; color: string; description: string }> = {
  'GAF':          { label: 'Good',   color: '#6B7280', description: 'Standard' },
  'Owens Corning':{ label: 'Better', color: '#0F766E', description: 'Contractor preferred' },
  'CertainTeed':  { label: 'Better', color: '#0F766E', description: 'Contractor preferred' },
  'IKO':          { label: 'Best',   color: '#7C3AED', description: 'Impact-rated Class 3/4' },
  'Atlas':        { label: 'Best',   color: '#7C3AED', description: 'Impact-rated' },
}
function getMfgTier(mfgName: string) { return MFG_TIER[mfgName] ?? null }

// Default SKU picker — maximise visible difference between the three starting colours.
// Rule-based colour recommendation: given the measured roof mean RGB, return 3 SKUs
// whose colours are maximally different from the current roof AND from each other.
// This gives the homeowner contrast rather than confirming what they already have.
// Pure client-side — zero API cost.
function pickRecommended(all: Sku[], roofRgb: { r: number; g: number; b: number }): string[] {
  if (all.length === 0) return []
  const feat = (s: Sku) => {
    const hx = (s.hex_preview || '#888888').replace('#', '')
    return {
      r: parseInt(hx.slice(0,2),16),
      g: parseInt(hx.slice(2,4),16),
      b: parseInt(hx.slice(4,6),16),
    }
  }
  const distRgb = (a: {r:number;g:number;b:number}, b: {r:number;g:number;b:number}) =>
    Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2)

  // Score each SKU: high score = far from current roof (contrast) + not too similar to each other
  const pool = [...all]
  const chosen: Sku[] = []

  // Seed: pick the chip most different from the existing roof colour
  let best = pool[0], bestD = -1
  for (const s of pool) {
    const d = distRgb(feat(s), roofRgb)
    if (d > bestD) { bestD = d; best = s }
  }
  chosen.push(best)

  // Greedy farthest-point from both the roof colour AND already chosen chips
  while (chosen.length < 3) {
    let next: Sku | null = null, nextScore = -1
    for (const cand of pool) {
      if (chosen.some(c => c.id === cand.id)) continue
      const distToRoof  = distRgb(feat(cand), roofRgb)
      const distToChosen = Math.min(...chosen.map(c => distRgb(feat(cand), feat(c))))
      // Weight: 40% contrast with roof, 60% spread among recommendations
      const score = 0.4 * distToRoof + 0.6 * distToChosen
      if (score > nextScore) { nextScore = score; next = cand }
    }
    if (!next) break
    chosen.push(next)
  }
  return chosen.map(s => s.id)
}

// `is_default … slice(0,3)` used to hand out three near-identical greys, so the first
// render a roofer ever sees looked like three copies of the same roof. Greedy
// farthest-point selection over (luminance, chroma) guarantees dark / mid / warm spread.
function pickSpreadDefaults(all: Sku[]): string[] {
  // Always spread across the full catalogue — never pre-filter to is_default.
  // The is_default subset often has only 3 items, which triggers the early-return
  // shortcut and means the spread algorithm never runs (it just returns whatever
  // 3 happen to be flagged, regardless of whether they look different from each other).
  const pool = all.length > 0 ? all : []
  if (pool.length <= 3) return pool.map(s => s.id)

  const feat = (s: Sku) => {
    const hx = (s.hex_preview || '#888888').replace('#', '')
    const r = parseInt(hx.slice(0, 2), 16), g = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16)
    return { lum: (r + g + b) / 3, chroma: Math.max(r, g, b) - Math.min(r, g, b) }
  }
  // Chroma weighted higher: a grey and a brown at equal luminance still read as
  // clearly different roofs, which is the point of the comparison.
  const dist = (a: Sku, b: Sku) => {
    const fa = feat(a), fb = feat(b)
    return Math.abs(fa.lum - fb.lum) + 1.6 * Math.abs(fa.chroma - fb.chroma)
  }

  // Seed with the darkest chip — dark roofs are the most common real-world starting point.
  const sorted = [...pool].sort((a, b) => feat(a).lum - feat(b).lum)
  const chosen: Sku[] = [sorted[0]]
  while (chosen.length < 3) {
    let best: Sku | null = null
    let bestScore = -1
    for (const cand of pool) {
      if (chosen.some(c => c.id === cand.id)) continue
      // farthest-point: maximise distance to the NEAREST already-chosen chip
      const score = Math.min(...chosen.map(c => dist(cand, c)))
      if (score > bestScore) { bestScore = score; best = cand }
    }
    if (!best) break
    chosen.push(best)
  }
  return chosen.map(s => s.id)
}

function downloadRender(url: string, label: string) {
  const a = document.createElement('a')
  a.href = `/api/roof-visualizer/download?url=${encodeURIComponent(url)}&name=proguild-${label.toLowerCase().replace(/\s+/g, '-')}.jpg`
  a.click()
}

// ── Render result card (static — original card above is the baseline) ────────
function RenderResultCard({ rendered, label, hex, mfg, onOpen }: {
  rendered: string; label: string; hex: string; mfg: string; onOpen: () => void
}) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
      <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={onOpen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rendered} alt={`${mfg} ${label} shingles`} style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.65)', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>proguild.ai</div>
        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.45)', color: '#fff', borderRadius: 4, padding: '3px 8px', fontSize: 11, pointerEvents: 'none' }}>⤢</div>
      </div>
      <div style={{ padding: '10px 14px', background: t.cardBg, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: hex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {mfg && <span style={{ color: t.textSubtle, fontSize: 11, marginRight: 6 }}>{mfg}</span>}
          <span style={{ fontWeight: 700, color: t.textPri, fontSize: 13 }}>{label}</span>
        </div>
        <button onClick={() => downloadRender(rendered, label)} title="Download"
          style={{ background: 'none', border: `1px solid ${t.cardBorder}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          ↓ Download
        </button>
      </div>
    </div>
  )
}

function OriginalCard({ photoUrl }: { photoUrl: string }) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `2px solid ${t.cardBorder}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="Original" style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
      <div style={{ padding: '10px 14px', background: t.cardBg, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#888', border: '1px solid rgba(0,0,0,0.15)' }} />
        <span style={{ fontWeight: 700, color: t.textPri, fontSize: 13 }}>Original</span>
        <span style={{ color: t.textSubtle, fontSize: 11, marginLeft: 4 }}>Current roof</span>
      </div>
    </div>
  )
}

function SkeletonCard({ label }: { label?: string }) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
      <div style={{ aspectRatio: '4/3', background: t.cardBgAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 12, color: t.textMuted }}>{label ? `Rendering ${label}…` : 'Generating…'}</span>
      </div>
      <div style={{ padding: '10px 14px', background: t.cardBg, height: 38 }} />
    </div>
  )
}

function ErrorCard({ label, retrying, onRetry }: { label: string; retrying: boolean; onRetry: () => void }) {
  const t = theme(false)
  return (
    <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px dashed ${t.cardBorder}` }}>
      <div style={{ aspectRatio: '4/3', background: t.cardBgAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        {retrying ? (
          <>
            <div style={{ width: 28, height: 28, border: `3px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 12, color: t.textMuted }}>Retrying {label}…</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 26 }}>⚠️</span>
            <span style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', padding: '0 16px' }}>This render didn&apos;t complete.</span>
            <button onClick={onRetry}
              style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radSm, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ↻ Retry
            </button>
          </>
        )}
      </div>
      <div style={{ padding: '10px 14px', background: t.cardBg }}>
        <span style={{ fontSize: 13, color: t.textSubtle }}>{label}</span>
      </div>
    </div>
  )
}

function SkuSwatch({ sku, selected, onClick }: { sku: Sku; selected: boolean; onClick: () => void }) {
  const t = theme(false)
  return (
    <button onClick={onClick} title={`${getMfgName(sku)} — ${sku.name}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0,
        padding: 0, borderRadius: 12, overflow: 'hidden',
        border: `2px solid ${selected ? BRAND.teal : t.cardBorder}`,
        background: t.cardBg, cursor: 'pointer', textAlign: 'left',
        boxShadow: selected ? `0 4px 14px ${BRAND.tealAlpha}` : '0 1px 2px rgba(0,0,0,0.05)',
        transform: selected ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease',
      }}>
      <div style={{ position: 'relative', height: 76, background: sku.hex_preview }}>
        {/* subtle shingle-course texture so it reads as a roof material, not paint */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 1px, rgba(255,255,255,0.05) 1px 9px)' }} />
        <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 -10px 18px rgba(0,0,0,0.18)' }} />
        {selected && (
          <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: BRAND.teal, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>✓</div>
        )}
      </div>
      <div style={{ padding: '7px 9px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textPri, lineHeight: 1.25 }}>{sku.name}</div>
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 1 }}>{getMfgName(sku)}</div>
      </div>
    </button>
  )
}

const CLIENT_BUILD = 'verify-v100'

export default function RoofVisualizerClient({ skus }: { skus: Sku[] }) {
  React.useEffect(() => { console.log('[visualizer] client build:', CLIENT_BUILD) }, [])
  const t = theme(false)
  const searchParams = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]             = useState<Step>('upload')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [sessionId, setSessionId]   = useState<string | null>(null)
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>(() => pickSpreadDefaults(skus))
  const [renders, setRenders]       = useState<RenderResult[]>([])
  const [roofMeanRgb, setRoofMeanRgb] = useState<{ r: number; g: number; b: number } | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [shareUrl, setShareUrl]     = useState<string | null>(null)
  const [gateEmail, setGateEmail]   = useState('')
  const [gateBusy, setGateBusy]     = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // Declared early: handleAnalyze lists proId in its deps, so it must exist above it.
  const [proId, setProId]         = useState<string | null>(null)
  const [gridData, setGridData]   = useState<Uint8Array | null>(null)
  const [gridDims, setGridDims]   = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [selected, setSelected]   = useState<Set<number>>(new Set())
  const [history, setHistory]     = useState<Set<number>[]>([])
  const [tapCount, setTapCount]   = useState(0)
  const [confirmStart, setConfirmStart] = useState(0)
  const [confirmBusy, setConfirmBusy]   = useState(false)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // Restore session after signup redirect (?session=<id>&ready=report)
  // The roofer signed up from the visualizer — their session is already linked to
  // their new pro account. Load the renders and drop them on the results screen.
  React.useEffect(() => {
    const restoredSession = searchParams.get('session')
    const ready = searchParams.get('ready')
    if (!restoredSession || ready !== 'report') return
    setSessionId(restoredSession)
    // Fetch completed renders and the original photo for this session
    fetch(`/api/roof-visualizer/session?sessionId=${restoredSession}`)
      .then(r => r.json())
      .then(d => {
        if (d.renders && d.renders.length > 0) {
          setRenders(d.renders.map((r: any) => ({
            skuId: r.sku_id,
            skuName: r.viz_skus?.name ?? '',
            hexPreview: r.viz_skus?.hex_preview ?? '#888',
            renderUrl: r.render_url,
            mfgName: r.viz_skus?.viz_product_lines?.viz_manufacturers?.name ?? '',
            lowContrast: r.low_contrast ?? false,
          })))
          setHeroIdx(1)
        }
        // Restore the original photo so the thumbnail strip shows "Original"
        if (d.photoUrl) setPhotoPreview(d.photoUrl)
        setStep('results')
      })
      .catch(() => { /* fail silently, show upload screen */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const confirmImgRef = useRef<HTMLImageElement>(null)
  const photoPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const customIdxRef   = useRef(200)   // traced regions get indices 200+
  const [traceHint, setTraceHint] = useState<string | null>(null)
  const [pxReady, setPxReady]     = useState(false)
  const [elapsed, setElapsed]     = useState(0)
  const [showPickMask, setShowPickMask] = useState(true)
  const [confirmedMaskUrl, setConfirmedMaskUrl] = useState<string | null>(null)
  const pickOverlayRef = useRef<HTMLCanvasElement>(null)
  const sweeping    = useRef(false)
  const sweptThisDrag = useRef<Set<number>>(new Set())
  const [lightbox, setLightbox]   = useState<{ url: string; label: string } | null>(null)
  const [mfgFilter, setMfgFilter] = useState<string | null>(null)
  const [retrying, setRetrying]   = useState<Set<string>>(new Set())
  const [occlusionLevel, setOcclusionLevel] = useState<'clear' | 'partial' | 'heavy'>('clear')
  const [candidates, setCandidates] = useState<Array<{ index: number; areaPct: number }>>([])
  const [superMaskWarning, setSuperMaskWarning] = useState(false)
  const [eraseMode, setEraseMode] = useState(false)
  const [eraseRadius, setEraseRadius] = useState<8|14|22>(14)
  // Touchup step — full-resolution post-confirm edge cleanup
  const touchupCanvasRef  = useRef<HTMLCanvasElement>(null)
  const touchupImgRef     = useRef<HTMLImageElement>(null)
  const touchupMaskPixels = useRef<Uint8Array | null>(null)  // white pixels from mask PNG
  const touchupPhotoImg   = useRef<HTMLImageElement | null>(null)
  const touchupMaskW      = useRef(0)
  const touchupMaskH      = useRef(0)
  const touchupEraseSet   = useRef<Set<number>>(new Set())   // pixel indices erased by user
  const touchupErasing    = useRef(false)
  const [touchupRadius, setTouchupRadius] = useState<4|8|14|22>(8)
  const [touchupBusy, setTouchupBusy]     = useState(false)
  const [touchupReady, setTouchupReady]   = useState(false)
  const [erasePixels, setErasePixels] = useState<Set<number>>(new Set())
  const erasing = useRef(false)
  const groups = groupSkusByManufacturer(skus)
  const skuMap = Object.fromEntries(skus.map(s => [s.id, s]))

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload a photo (JPG or PNG)'); return }
    if (file.size > 10 * 1024 * 1024)   { setError('Photo must be under 10MB'); return }
    const reader = new FileReader()
    reader.onload = e => setPhotoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    setPendingFile(file)
    setError(null)
    setStep('preview')
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!pendingFile) return
    setError(null); setStep('segmenting')
    try {
      const form = new FormData()
      form.append('photo', pendingFile)
      // Link this session to the pro if one is signed in — required for the PDF report
      if (proId) form.append('proId', proId)
      const res  = await fetch('/api/roof-visualizer/segment', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.detail ? `${data.error} — ${data.detail}` : (data.error || 'Could not detect roof.')); setStep('preview'); return }
      setSessionId(data.sessionId)
      // Decode index grid (base64 PNG → Uint8Array) for client-side hit-testing
      const img = new Image()
      img.onload = () => {
        const cv = document.createElement('canvas')
        cv.width = data.gridW; cv.height = data.gridH
        const ctx = cv.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const px = ctx.getImageData(0, 0, data.gridW, data.gridH).data
        const grid = new Uint8Array(data.gridW * data.gridH)
        for (let i = 0; i < grid.length; i++) grid[i] = px[i * 4]  // R channel = index
        console.log('[confirm] grid decoded', { w: data.gridW, h: data.gridH, candidates: data.candidates?.length, occlusion: data.occlusionLevel })
        setGridData(grid)
        setGridDims({ w: data.gridW, h: data.gridH })
        setOcclusionLevel(data.occlusionLevel ?? 'clear')
        setCandidates(data.candidates ?? [])
        setSelected(new Set<number>())   // NO preselection — user taps/sweeps their roof
        setHistory([])
        setTapCount(0)
        setConfirmStart(Date.now())
        setStep('confirm')
      }
      img.src = `data:image/png;base64,${data.gridB64}`
    } catch { setError('Upload failed. Please try again.'); setStep('preview') }
  }, [pendingFile, proId])   // proId resolves async — must be a dep or the session never links

  // Pick screen: draw the SERVER's confirmed mask, fetched through the same-origin
  // proxy. The R2 public bucket sends no CORS headers, so the PNG cannot be loaded
  // directly by <img>, CSS mask-image or fetch — it must go through /download.
  // Single source of truth: no client-side reconstruction to drift from the server.
  React.useEffect(() => {
    if (step !== 'pick' || !showPickMask || !confirmedMaskUrl) return
    let cancelled = false
    ;(async () => {
      try {
        const proxied = `/api/roof-visualizer/download?url=${encodeURIComponent(confirmedMaskUrl)}&name=mask.png`
        const res = await fetch(proxied)
        if (!res.ok) { console.warn('[pick] mask proxy failed:', res.status); return }
        const bmp = await createImageBitmap(await res.blob())
        if (cancelled) return
        const cv = pickOverlayRef.current
        if (!cv) { console.warn('[pick] overlay canvas not mounted'); return }

        // Canvas matches the mask's own pixel grid; CSS stretches it over the photo box.
        const w = bmp.width, h = bmp.height
        cv.width = w; cv.height = h

        // Read the mask through an offscreen canvas
        const off = document.createElement('canvas')
        off.width = w; off.height = h
        const octx = off.getContext('2d')!
        octx.drawImage(bmp, 0, 0)
        const maskPx = octx.getImageData(0, 0, w, h).data

        const ctx = cv.getContext('2d')!
        const out = ctx.createImageData(w, h)
        let white = 0
        for (let i = 0; i < w * h; i++) {
          if (maskPx[i * 4] > 128) {              // mask is white-on-black
            out.data[i * 4]     = 13
            out.data[i * 4 + 1] = 148
            out.data[i * 4 + 2] = 136
            out.data[i * 4 + 3] = 110
            white++
          }
        }
        ctx.putImageData(out, 0, 0)
        console.log(`[pick] mask loaded: ${white} white px of ${w}x${h}`)
      } catch (err) {
        console.warn('[pick] mask draw failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [step, showPickMask, confirmedMaskUrl])

  // Elapsed-time ticker for the two slow server steps
  React.useEffect(() => {
    if (step !== 'segmenting' && !confirmBusy) { setElapsed(0); return }
    setElapsed(0)
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [step, confirmBusy])

  // Decode photo pixels at grid resolution (for tap-to-trace flood fill)
  React.useEffect(() => {
    if (step !== 'confirm' || !photoPreview || photoPixelsRef.current) return
    const { w, h } = gridDims
    if (!w || !h) return
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      photoPixelsRef.current = ctx.getImageData(0, 0, w, h).data
      setPxReady(true)
      console.log('[confirm] photo pixels ready for trace + display veto')
    }
    img.src = photoPreview
  }, [step, photoPreview, gridDims])

  // Redraw teal/amber overlay whenever selection changes
  React.useEffect(() => {
    const cv = overlayRef.current
    if (!cv || !gridData || step !== 'confirm') return
    const { w, h } = gridDims
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(w, h)
    const px = photoPixelsRef.current
    const isVeg = (p: number) => {
      if (!px) return false
      const rr = px[p * 4], gg = px[p * 4 + 1], bb = px[p * 4 + 2]
      return 2 * gg - rr - bb > 40 || 2 * bb - rr - gg > 50  // veg (ExG) + sky (ExB)
    }
    // Outline = true region boundary (veto-blind); tint = veto-aware (shows real paint area)
    const isSel = (p: number) => { const v = gridData[p]; return v > 0 && selected.has(v) && !erasePixels.has(p) }
    for (let i = 0; i < w * h; i++) {
      const idx = gridData[i]
      const isErased = erasePixels.has(i)
      if (idx > 0 && selected.has(idx) && !isVeg(i)) {
        if (isErased) {
          // amber: marks pixels that will be subtracted from the mask on confirm
          img.data[i * 4] = 234; img.data[i * 4 + 1] = 88; img.data[i * 4 + 2] = 12; img.data[i * 4 + 3] = 160
        } else {
          // white outline where selection borders non-selection → visible over any background
          const x = i % w, y = Math.floor(i / w)
          const edge = (x > 0 && !isSel(i - 1)) || (x < w - 1 && !isSel(i + 1)) ||
                       (y > 0 && !isSel(i - w)) || (y < h - 1 && !isSel(i + w))
          if (edge) {
            img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 235
          } else {
            img.data[i * 4] = 13; img.data[i * 4 + 1] = 148; img.data[i * 4 + 2] = 136; img.data[i * 4 + 3] = 150  // teal, stronger
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [gridData, gridDims, selected, erasePixels, step, pxReady])

  // Flood fill from seed across similar-colored, unowned pixels → new custom region
  const traceRegion = useCallback((sx: number, sy: number): number => {
    const px = photoPixelsRef.current
    if (!px || !gridData) return 0
    const { w, h } = gridDims
    const MAXPX = Math.floor(w * h * 0.30), MINPX = Math.floor(w * h * 0.003)
    const TH2 = 45 * 45
    const seed = (sy * w + sx) * 4
    let ar = px[seed], ag = px[seed + 1], ab = px[seed + 2], n = 1
    const visited = new Uint8Array(w * h)
    const region: number[] = []
    const queue: number[] = [sy * w + sx]
    visited[sy * w + sx] = 1
    while (queue.length && region.length < MAXPX) {
      const p = queue.pop()!
      const pr = px[p * 4], pg = px[p * 4 + 1], pb = px[p * 4 + 2]
      const dr = pr - ar / 1, dg = pg - ag, db = pb - ab
      // distance to running average
      const d2 = (pr - ar) * (pr - ar) + (pg - ag) * (pg - ag) + (pb - ab) * (pb - ab)
      if (p !== sy * w + sx && d2 > TH2) continue
      region.push(p)
      // update running average
      ar = (ar * n + pr) / (n + 1); ag = (ag * n + pg) / (n + 1); ab = (ab * n + pb) / (n + 1); n++
      const x = p % w, y = Math.floor(p / w)
      const neigh = [p - 1, p + 1, p - w, p + w]
      for (let k = 0; k < 4; k++) {
        const q = neigh[k]
        if (q < 0 || q >= w * h) continue
        if (k === 0 && x === 0) continue
        if (k === 1 && x === w - 1) continue
        if (visited[q] || gridData[q] !== 0) continue
        visited[q] = 1
        queue.push(q)
      }
    }
    if (region.length < MINPX) { console.log('[confirm] trace too small:', region.length); return 0 }
    if (region.length >= MAXPX) { console.log('[confirm] trace too large, rejected'); return 0 }

    // Morphological close: fill shingle shadow-row holes (dilate 2 into UNOWNED pixels, erode 2)
    let bin = new Uint8Array(w * h)
    for (const p of region) bin[p] = 1
    const pass = (src: Uint8Array, grow: boolean) => {
      const dst = new Uint8Array(src)
      for (let p = 0; p < w * h; p++) {
        const x = p % w
        const n = (x > 0 && src[p - 1]) || (x < w - 1 && src[p + 1]) || (p >= w && src[p - w]) || (p < w * h - w && src[p + w])
        if (grow) { if (!src[p] && n && gridData[p] === 0) dst[p] = 1 }
        else      { if (src[p] && !((x === 0 || src[p-1]) && (x === w-1 || src[p+1]) && (p < w || src[p-w]) && (p >= w*h-w || src[p+w]))) dst[p] = 0 }
      }
      return dst
    }
    bin = pass(pass(bin, true), true)   // dilate ×2
    bin = pass(pass(bin, false), false) // erode ×2 (closing: interior holes stay filled)

    const idx = customIdxRef.current++
    const next = new Uint8Array(gridData)
    let finalPx = 0
    for (let p = 0; p < w * h; p++) {
      if (bin[p] && gridData[p] === 0) { next[p] = idx; finalPx++ }
    }
    console.log('[confirm] trace closed:', region.length, '→', finalPx, 'px')
    setGridData(next)
    return idx
  }, [gridData, gridDims])

  // Resolve a pointer event to a candidate index (radial snap on miss)
  const indexAtPointer = useCallback((clientX: number, clientY: number): { idx: number; gx: number; gy: number } | null => {
    const imgEl = confirmImgRef.current
    if (!gridData || !imgEl) return null
    const rect = imgEl.getBoundingClientRect()
    const { w, h } = gridDims
    const gx = Math.floor(((clientX - rect.left) / rect.width) * w)
    const gy = Math.floor(((clientY - rect.top) / rect.height) * h)
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null
    let idx = gridData[gy * w + gx]
    if (idx === 0) {
      let best = 0, bestD = 65
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        const nx = gx + dx, ny = gy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const v = gridData[ny * w + nx]
        if (v > 0) { const d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = v } }
      }
      idx = best
    }
    return { idx, gx, gy }
  }, [gridData, gridDims])

  const pushHistory = useCallback(() => {
    setHistory(h => [...h.slice(-19), new Set(selected)])
  }, [selected])

  const handleUndo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setSelected(new Set(prev))
      return h.slice(0, -1)
    })
    // Always reset erase state on undo — user is going backwards, return them to Select mode
    setEraseMode(false)
    setErasePixels(new Set())
    setSuperMaskWarning(false)
  }, [])

  const handleSweepStart = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault()
    sweeping.current = true
    sweptThisDrag.current = new Set()
    pushHistory()
    const hit = indexAtPointer(e.clientX, e.clientY)
    if (!hit) return
    if (hit.idx === 0) {
      // No candidate here — trace the surface (flood fill)
      setTraceHint('Tracing surface…')
      const traced = traceRegion(hit.gx, hit.gy)
      setTraceHint(traced ? null : "Couldn't trace a surface here — try tapping the middle of the area")
      if (traced) {
        setTapCount(t => t + 1)
        setSelected(prev => new Set(prev).add(traced))
        sweptThisDrag.current.add(traced)
      }
      return
    }
    sweptThisDrag.current.add(hit.idx)
    setTapCount(t => t + 1)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(hit.idx)) {
        next.delete(hit.idx)
        setTraceHint(null)
        setSuperMaskWarning(false)
      } else {
        next.add(hit.idx)
        const cand = candidates.find(c => c.index === hit.idx)
        if (cand && cand.areaPct > 0.30) {
          setSuperMaskWarning(true)
          setTraceHint(null)
        } else {
          setTraceHint(null)
        }
      }
      console.log('[confirm] tap', { gx: hit.gx, gy: hit.gy, idx: hit.idx, selected: [...next] })
      return next
    })
  }, [indexAtPointer, pushHistory, traceRegion, candidates])

  const handleSweepMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!sweeping.current) return
    const hit = indexAtPointer(e.clientX, e.clientY)
    if (!hit || hit.idx === 0) return
    if (sweptThisDrag.current.has(hit.idx)) return   // each plane toggles once per drag
    sweptThisDrag.current.add(hit.idx)
    setSelected(prev => new Set(prev).add(hit.idx))  // sweep only ADDS — predictable
  }, [indexAtPointer])

  const handleSweepEnd = useCallback(() => {
    if (!sweeping.current) return
    sweeping.current = false
    if (sweptThisDrag.current.size > 1) {
      console.log('[confirm] swept', sweptThisDrag.current.size, 'planes')
    }
  }, [])

  // Erase mode: drag paints a variable-radius negative mask over selected pixels.
  // Radius is user-controlled: Fine (8px) for eave edges, Normal (14px) default,
  // Large (22px) for open wall areas.
  const handleEraseStart = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault()
    if (!gridData) return
    erasing.current = true
    pushHistory()
    const imgEl = confirmImgRef.current
    if (!imgEl) return
    const rect = imgEl.getBoundingClientRect()
    const { w, h } = gridDims
    const R = eraseRadius
    const gx = Math.floor(((e.clientX - rect.left) / rect.width) * w)
    const gy = Math.floor(((e.clientY - rect.top) / rect.height) * h)
    const next = new Set<number>()
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue
      const nx = gx + dx, ny = gy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      next.add(ny * w + nx)
    }
    setErasePixels(prev => { const n = new Set(prev); next.forEach(p => n.add(p)); return n })
    console.log('[confirm] erase start at', gx, gy, 'radius', R)
  }, [gridData, gridDims, pushHistory, eraseRadius])

  const handleEraseMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!erasing.current || !gridData) return
    const imgEl = confirmImgRef.current
    if (!imgEl) return
    const rect = imgEl.getBoundingClientRect()
    const { w, h } = gridDims
    const R = eraseRadius
    const gx = Math.floor(((e.clientX - rect.left) / rect.width) * w)
    const gy = Math.floor(((e.clientY - rect.top) / rect.height) * h)
    const next = new Set<number>()
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue
      const nx = gx + dx, ny = gy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      next.add(ny * w + nx)
    }
    setErasePixels(prev => { const n = new Set(prev); next.forEach(p => n.add(p)); return n })
  }, [gridData, gridDims, eraseRadius])

  const handleEraseEnd = useCallback(() => {
    if (!erasing.current) return
    erasing.current = false
    console.log('[confirm] erase stroke committed')
  }, [])

  // Reset erase state when user leaves the confirm step
  React.useEffect(() => {
    if (step !== 'confirm') { setEraseMode(false); setErasePixels(new Set()); setSuperMaskWarning(false) }
  }, [step])

  // ── Touchup step handlers ────────────────────────────────────────────────
  const redrawTouchup = () => {
    const cv = touchupCanvasRef.current
    const photo = touchupPhotoImg.current
    const maskPx = touchupMaskPixels.current
    const W = touchupMaskW.current, H = touchupMaskH.current
    if (!cv || !photo || !maskPx || !W || !H) return
    cv.width = W; cv.height = H
    const ctx = cv.getContext('2d')!
    // 1. Draw original photo
    ctx.drawImage(photo, 0, 0, W, H)
    // 2. Draw teal mask overlay (excluding erased pixels)
    const overlay = ctx.createImageData(W, H)
    for (let i = 0; i < W * H; i++) {
      if (maskPx[i] > 128 && !touchupEraseSet.current.has(i)) {
        overlay.data[i * 4]     = 13
        overlay.data[i * 4 + 1] = 148
        overlay.data[i * 4 + 2] = 136
        overlay.data[i * 4 + 3] = 110
      }
      // Erased pixels: amber to show what was removed
      if (maskPx[i] > 128 && touchupEraseSet.current.has(i)) {
        overlay.data[i * 4]     = 234
        overlay.data[i * 4 + 1] = 88
        overlay.data[i * 4 + 2] = 12
        overlay.data[i * 4 + 3] = 140
      }
    }
    ctx.putImageData(overlay, 0, 0)
  }

  const getTouchupPos = (e: React.PointerEvent) => {
    const cv = touchupCanvasRef.current
    if (!cv) return null
    const rect = cv.getBoundingClientRect()
    const W = touchupMaskW.current, H = touchupMaskH.current
    const x = Math.floor(((e.clientX - rect.left) / rect.width)  * W)
    const y = Math.floor(((e.clientY - rect.top)  / rect.height) * H)
    return { x, y }
  }

  const paintTouchupCircle = (cx: number, cy: number) => {
    const W = touchupMaskW.current, H = touchupMaskH.current
    const maskPx = touchupMaskPixels.current
    if (!maskPx) return
    // Scale radius: touchupRadius is in "800px reference" units
    const cv = touchupCanvasRef.current
    const displayW = cv?.getBoundingClientRect().width ?? 800
    const scale = W / displayW
    const R = Math.max(4, Math.round(touchupRadius * scale))
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        touchupEraseSet.current.add(ny * W + nx)
      }
    }
    redrawTouchup()
  }

  const handleTouchupStart = (e: React.PointerEvent) => {
    e.preventDefault()
    if (!touchupReady) return
    touchupErasing.current = true
    const pos = getTouchupPos(e)
    if (pos) paintTouchupCircle(pos.x, pos.y)
  }

  const handleTouchupMove = (e: React.PointerEvent) => {
    if (!touchupErasing.current) return
    const pos = getTouchupPos(e)
    if (pos) paintTouchupCircle(pos.x, pos.y)
  }

  const handleTouchupEnd = () => { touchupErasing.current = false }

  const handleApplyTouchup = async () => {
    if (!sessionId || touchupBusy) return
    const W = touchupMaskW.current, H = touchupMaskH.current
    if (!W || !H || touchupEraseSet.current.size === 0) { setStep('pick'); return }
    setTouchupBusy(true)
    try {
      // Build erase mask PNG from the pixel Set
      const buf = new Uint8ClampedArray(W * H * 4)
      touchupEraseSet.current.forEach(i => {
        buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255
      })
      // Non-erased pixels: opaque black
      for (let i = 0; i < W * H; i++) {
        if (!touchupEraseSet.current.has(i)) buf[i * 4 + 3] = 255
      }
      const offCv = document.createElement('canvas')
      offCv.width = W; offCv.height = H
      offCv.getContext('2d')!.putImageData(new ImageData(buf, W, H), 0, 0)
      const eraseMaskB64 = offCv.toDataURL('image/png').split(',')[1]

      const res = await fetch('/api/roof-visualizer/refine-mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, eraseMaskB64 }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Refinement failed.'); return }
      setConfirmedMaskUrl(data.maskUrl)
      setStep('pick')
    } catch { setError('Could not refine mask. Try again.') }
    finally { setTouchupBusy(false) }
  }

  // Init touchup: fetch mask PNG, decode into pixel array, draw photo+overlay
  React.useEffect(() => {
    if (step !== 'touchup' || !confirmedMaskUrl || !photoPreview) return
    let cancelled = false
    setTouchupReady(false)
    touchupEraseSet.current = new Set()
    ;(async () => {
      try {
        // Fetch mask through proxy
        const proxied = `/api/roof-visualizer/download?url=${encodeURIComponent(confirmedMaskUrl)}&name=mask.png`
        const res = await fetch(proxied)
        if (!res.ok || cancelled) return
        const bmp = await createImageBitmap(await res.blob())
        if (cancelled) return

        const W = bmp.width, H = bmp.height
        touchupMaskW.current = W
        touchupMaskH.current = H

        // Decode mask into a flat Uint8Array (white pixel = roof)
        const off = document.createElement('canvas')
        off.width = W; off.height = H
        const octx = off.getContext('2d')!
        octx.drawImage(bmp, 0, 0)
        const raw = octx.getImageData(0, 0, W, H).data
        const maskPx = new Uint8Array(W * H)
        for (let i = 0; i < W * H; i++) maskPx[i] = raw[i * 4]
        touchupMaskPixels.current = maskPx

        // Load photo
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.src = photoPreview
        await new Promise<void>((resolve, reject) => {
          img.onload  = () => resolve()
          img.onerror = reject
        })
        if (cancelled) return
        touchupPhotoImg.current = img

        if (!cancelled) {
          setTouchupReady(true)
          // Initial draw happens after state update via the radius/ready effect below
        }
      } catch (err) {
        console.warn('[touchup] init failed:', err)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, confirmedMaskUrl, photoPreview])

  // Redraw whenever ready or radius changes
  React.useEffect(() => {
    if (touchupReady) redrawTouchup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchupReady, touchupRadius])

  const handleConfirmMask = useCallback(async () => {
    if (!sessionId || selected.size === 0 || !gridData) return
    setConfirmBusy(true)
    try {
      // Bake selected TRACED regions (idx >= 200) into a binary PNG for the server
      let customMaskB64: string | null = null
      const hasCustom = [...selected].some(i => i >= 200)
      if (hasCustom) {
        const { w, h } = gridDims
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')!
        const imgD = ctx.createImageData(w, h)
        for (let i = 0; i < w * h; i++) {
          const v = gridData[i]
          if (v >= 200 && selected.has(v)) {
            imgD.data[i * 4] = 255; imgD.data[i * 4 + 1] = 255; imgD.data[i * 4 + 2] = 255; imgD.data[i * 4 + 3] = 255
          } else {
            imgD.data[i * 4 + 3] = 255  // opaque black
          }
        }
        ctx.putImageData(imgD, 0, 0)
        customMaskB64 = cv.toDataURL('image/png').split(',')[1]
      }

      const res = await fetch('/api/roof-visualizer/confirm-mask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          selectedIndices: [...selected].filter(i => i < 200),
          customMaskB64,
          eraseMaskB64: (() => {
            if (erasePixels.size === 0) return null
            const { w, h } = gridDims
            const cv2 = document.createElement('canvas')
            cv2.width = w; cv2.height = h
            const ctx2 = cv2.getContext('2d')!
            const imgD2 = ctx2.createImageData(w, h)
            erasePixels.forEach(p => {
              imgD2.data[p * 4] = 255; imgD2.data[p * 4 + 1] = 255
              imgD2.data[p * 4 + 2] = 255; imgD2.data[p * 4 + 3] = 255
            })
            // fill alpha for non-erase pixels (opaque black)
            for (let i = 0; i < w * h; i++) if (!erasePixels.has(i)) imgD2.data[i * 4 + 3] = 255
            ctx2.putImageData(imgD2, 0, 0)
            return cv2.toDataURL('image/png').split(',')[1]
          })(),
          tapCount, msToConfirm: Date.now() - confirmStart,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not confirm selection.'); return }
      if (data.maskUrl) setConfirmedMaskUrl(data.maskUrl)
      // Sync client gridData with server erase: zero out erased pixels so the pick
      // screen preview matches the mask the server actually confirmed.
      if (erasePixels.size > 0) {
        setGridData(prev => {
          if (!prev) return prev
          const next = new Uint8Array(prev)
          erasePixels.forEach(p => { if (p < next.length) next[p] = 0 })
          return next
        })
        setErasePixels(new Set())
      }
      setShowPickMask(true)
      setStep('pick')
    } catch { setError('Could not confirm selection. Try again.') }
    finally { setConfirmBusy(false) }
  }, [sessionId, selected, erasePixels, gridData, gridDims, tapCount, confirmStart])

  const handleRetry = useCallback(async (skuId: string) => {
    if (!sessionId) return
    setRetrying(prev => new Set(prev).add(skuId))
    try {
      const res  = await fetch('/api/roof-visualizer/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, skuIds: [skuId] }),
      })
      const data = await res.json()
      const fresh = data?.renders?.[0]
      if (res.ok && fresh) {
        setRenders(prev => prev.map(r => r.skuId === skuId
          ? { ...fresh, mfgName: skuMap[skuId] ? getMfgName(skuMap[skuId]) : '' } : r))
      }
    } catch { /* card stays in error state, retry again */ }
    finally { setRetrying(prev => { const n = new Set(prev); n.delete(skuId); return n }) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  React.useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const [hoveredSkuId, setHoveredSkuId] = useState<string | null>(null)

  const toggleSku = (id: string) => setSelectedSkuIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 10 ? [...prev.slice(1), id] : [...prev, id])

  const handleRender = async () => {
    if (!sessionId || selectedSkuIds.length === 0) return
    setStep('rendering'); setRenders([])
    try {
      const res  = await fetch('/api/roof-visualizer/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, skuIds: selectedSkuIds }),
      })
      const data = await res.json()
      if (data.gate)  { setStep('gate'); return }
      if (!res.ok)    { setError(data.error || 'Render failed.'); setStep('pick'); return }
      setRenders((data.renders as RenderResult[]).map(r => ({ ...r, mfgName: skuMap[r.skuId] ? getMfgName(skuMap[r.skuId]) : '' })))
      if (data.roofMeanRgb) setRoofMeanRgb(data.roofMeanRgb)
      setHeroIdx(1) // default to first render (index 0 = original)
      setStep('results')
    } catch { setError('Render failed. Please try again.'); setStep('pick') }
  }

  const handleGateSubmit = async () => {
    if (!gateEmail || !sessionId) return; setGateBusy(true)
    try { await fetch('/api/roof-visualizer/session', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, email: gateEmail }) }); await handleRender() }
    finally { setGateBusy(false) }
  }

  const [shareEmail, setShareEmail]     = useState('')
  const [shareEmailStep, setShareEmailStep] = useState(false)
  const [shareBusy, setShareBusy]       = useState(false)
  const [heroIdx, setHeroIdx]           = useState<number>(1) // 0=original, 1+=renders
  const [reportBusy, setReportBusy]     = useState(false)

  // Resolve the logged-in pro for the PDF report feature.
  // IMPORTANT: pros.id !== auth.users.id — they are linked via pros.auth_user_id.
  // /api/auth/me does that lookup and returns session.id = pros.id.
  // Using getUser().id here would be truthy for any auth session (even one with no
  // linked pro), which hides the signup teaser and 404s the report endpoint.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('@/lib/supabase-browser')
        const sb  = mod.getSupabaseBrowser()
        const { data: sess } = await sb.auth.getSession()
        const token = sess?.session?.access_token
        if (!token) return
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled && d?.session?.id) setProId(d.session.id as string)
      } catch { /* anonymous — teaser stays locked */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Self-healing session link. Whenever we know BOTH the pro and the session, make
  // sure the session is attributed to them. Idempotent, so it's safe to fire on every
  // change. Deliberately not dependent on the signup redirect path: a roofer who signs
  // up from the teaser, lands on /complete-profile, finishes their profile and
  // navigates back still ends up with a linked session and a working report.
  // The server derives pro_id from the bearer token — the body is not trusted.
  React.useEffect(() => {
    if (!proId || !sessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('@/lib/supabase-browser')
        const { data: sess } = await mod.getSupabaseBrowser().auth.getSession()
        const token = sess?.session?.access_token
        if (!token || cancelled) return
        await fetch('/api/roof-visualizer/session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, action: 'link' }),
        })
      } catch { /* non-fatal — report 404s and the user can retry */ }
    })()
    return () => { cancelled = true }
  }, [proId, sessionId])

  const handleDownloadReport = async () => {
    if (!sessionId || !proId) return
    setReportBusy(true)
    try {
      // requirePro reads Authorization: Bearer <token> — without it the route 401s.
      const mod = await import('@/lib/supabase-browser')
      const { data: sess } = await mod.getSupabaseBrowser().auth.getSession()
      const token = sess?.session?.access_token
      if (!token) { window.location.href = '/login'; return }

      const res = await fetch(
        `/api/roof-visualizer/report?sessionId=${sessionId}&proId=${proId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return }
      if (!res.ok) { setError('Could not generate report. Try again.'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ProGuild-Roof-Report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
    } catch { setError('Report download failed.') }
    finally { setReportBusy(false) }
  }

  const handleShare = async (emailOverride?: string) => {
    if (!sessionId) return
    // If no email on session yet, show capture step first
    const emailToUse = emailOverride ?? (shareEmail || null)
    if (!emailToUse) { setShareEmailStep(true); return }
    setShareBusy(true)
    try {
      const res  = await fetch('/api/roof-visualizer/session', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action: 'share', email: emailToUse }) })
      const data = await res.json()
      if (data.shareUrl) { setShareUrl(data.shareUrl); setShareEmailStep(false); setStep('share') }
    } catch { setError('Could not create share link.') }
    finally { setShareBusy(false) }
  }

  const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: T.radLg, padding: T.sp6, ...extra }}>{children}</div>
  )


  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, fontFamily: 'inherit' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ background: t.cardBg, borderBottom: `1px solid ${t.cardBorder}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Link href={proId ? '/dashboard' : '/'} style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: BRAND.teal, letterSpacing: '-0.5px' }}>ProGuild</span>
          </Link>
          {proId ? (
            <>
              <span style={{ color: t.textSubtle }}>›</span>
              <Link href="/dashboard" style={{ color: t.textMuted, textDecoration: 'none', fontWeight: 500 }}>Dashboard</Link>
              <span style={{ color: t.textSubtle }}>›</span>
              <Link href="/dashboard" style={{ color: t.textMuted, textDecoration: 'none', fontWeight: 500 }}>Tools</Link>
              <span style={{ color: t.textSubtle }}>›</span>
              <span style={{ color: t.textPri, fontWeight: 600 }}>Roof Visualizer</span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: t.textMuted }}>· Roof Visualizer</span>
          )}
        </div>
        {proId
          ? <Link href="/dashboard" style={{ fontSize: 13, color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>← Dashboard</Link>
          : <Link href="/login" style={{ fontSize: 13, color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
        }
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {step === 'upload' && (
            <div style={{ display: 'inline-block', background: BRAND.tealAlpha, color: BRAND.teal, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 999, marginBottom: 16 }}>
              Free AI Roof Visualizer
            </div>
          )}
          <h1 style={{ fontSize: 42, fontWeight: 800, color: t.textPri, margin: '0 0 14px', letterSpacing: '-1.2px', lineHeight: 1.08 }}>
            See your new roof<br />
            <span style={{ color: BRAND.teal }}>before you spend a dollar</span>
          </h1>
          <p style={{ fontSize: 17, color: t.textMuted, margin: 0, maxWidth: 560, marginInline: 'auto', lineHeight: 1.5 }}>
            Show homeowners exactly how their new roof will look — real shingle colours from GAF, Owens Corning, CertainTeed, IKO and Atlas, rendered on their actual house.
          </p>
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            {['Real manufacturer colours', 'No homeowner sign-up', 'First 3 renders free', 'Results in under a minute'].map(item => (
              <span key={item} style={{ fontSize: 12.5, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: BRAND.teal, fontWeight: 700 }}>✓</span> {item}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: T.radMd, padding: '12px 16px', marginBottom: 20, color: '#DC2626', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16 }}>×</button>
          </div>
        )}

        {step === 'upload' && card(
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${BRAND.teal}`, borderRadius: 16, padding: '64px 32px', textAlign: 'center', cursor: 'pointer', background: `linear-gradient(180deg, ${BRAND.tealAlpha} 0%, transparent 70%)`, transition: 'background 0.2s' }}>
            <div style={{ width: 76, height: 76, margin: '0 auto 20px', borderRadius: '50%', background: t.cardBg, border: `2px solid ${BRAND.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, boxShadow: '0 4px 16px rgba(13,148,136,0.15)' }}>🏡</div>
            <p style={{ fontWeight: 800, fontSize: 21, color: t.textPri, margin: '0 0 8px', letterSpacing: '-0.3px' }}>Drop a photo of the house</p>
            <p style={{ color: t.textMuted, fontSize: 14.5, margin: '0 0 24px' }}>or click to browse — JPG or PNG, up to 10MB</p>
            <div style={{ display: 'inline-block', background: BRAND.teal, color: '#fff', padding: '14px 38px', borderRadius: 10, fontWeight: 700, fontSize: 15.5, boxShadow: '0 4px 14px rgba(13,148,136,0.3)' }}>Choose Photo</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
          </div>
        )}

        {step === 'preview' && card(
          <div style={{ textAlign: 'center' }}>
            {photoPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Your home" style={{ maxHeight: 380, maxWidth: '100%', borderRadius: T.radMd, marginBottom: 20, objectFit: 'contain' }} />
            )}
            <p style={{ fontWeight: 700, fontSize: 16, color: t.textPri, margin: '0 0 6px' }}>Ready to analyze this photo?</p>
            <p style={{ color: t.textMuted, fontSize: 13, margin: '0 0 20px' }}>Make sure the roof is clearly visible. You can pick a different photo if needed.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { setStep('upload'); setPendingFile(null); setPhotoPreview(null) }}
                style={{ padding: '11px 22px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                ← Choose Different Photo
              </button>
              <button onClick={handleAnalyze}
                style={{ padding: '11px 28px', borderRadius: T.radMd, border: 'none', background: BRAND.teal, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Analyze My Roof →
              </button>
            </div>
          </div>
        )}

        {step === 'segmenting' && card(
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            {photoPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Your home" style={{ maxHeight: 200, borderRadius: T.radMd, marginBottom: 24, maxWidth: '100%', objectFit: 'cover', opacity: 0.55 }} />
            )}
            <div style={{ width: 40, height: 40, border: `4px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 18px' }} />
            <p style={{ fontWeight: 700, color: t.textPri, fontSize: 17, margin: '0 0 6px' }}>
              {elapsed < 10 ? 'Uploading your photo…' : elapsed < 40 ? 'AI is mapping every surface…' : 'Almost there — building your roof map…'}
            </p>
            <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 14px' }}>
              This takes 30–60 seconds. Please keep this tab open.
            </p>
            <div style={{ maxWidth: 320, margin: '0 auto' }}>
              <div style={{ height: 6, borderRadius: 999, background: t.cardBgAlt, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(95, elapsed / 60 * 100)}%`, background: BRAND.teal, borderRadius: 999, transition: 'width 1s linear' }} />
              </div>
              <p style={{ fontSize: 12, color: t.textSubtle, margin: '8px 0 0' }}>{elapsed}s elapsed</p>
            </div>
          </div>
        )}

        {step === 'confirm' && card(
          <div>
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 16, color: t.textPri, margin: '0 0 4px' }}>Tap each section of your roof</p>
              <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>
                {eraseMode
                  ? 'Drag over any areas you don\'t want painted — walls, soffits, anything that\'s not roof. Tap "Done Erasing" when finished.'
                  : 'Tap a roof plane to select it — or hold and drag across several at once. Tap again to remove. Teal is exactly what gets painted.'}
              </p>
            </div>

            {/* Occlusion warning — shown when trees or heavy shadows likely cover part of the roof */}
            {occlusionLevel === 'heavy' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: T.radMd, padding: '12px 14px', marginBottom: 14 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>🌳</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#991B1B', marginBottom: 2 }}>Heavy tree cover detected</div>
                  <div style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.5 }}>We couldn't find enough clear roof area. For best results, use a photo taken in winter, from a different angle, or farther back so the full roofline is visible.</div>
                </div>
              </div>
            )}
            {occlusionLevel === 'partial' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: T.radMd, padding: '12px 14px', marginBottom: 14 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#92400E', marginBottom: 2 }}>Trees may be covering part of your roof</div>
                  <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.5 }}>Tap the roof sections you can see — we'll render those. For a complete visualization, try a photo where the full roofline is visible.</div>
                </div>
              </div>
            )}

            {/* Super-mask banner — shown when a single tap covers >30% of frame */}
            {superMaskWarning && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#FFF7ED', border: '2px solid #EA580C', borderRadius: T.radMd, padding: '14px 16px', marginBottom: 14 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🏠</span>
                {!eraseMode ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#92400E', marginBottom: 3 }}>We found the roof — but also some walls</div>
                      <div style={{ fontSize: 13, color: '#B45309', lineHeight: 1.5 }}>Tap below to erase walls, gutters, or anything that isn't roof. Takes about 15 seconds.</div>
                    </div>
                    <button onClick={() => { setEraseMode(true); setTraceHint(null) }}
                      style={{ flexShrink: 0, padding: '10px 16px', borderRadius: T.radMd, border: 'none', background: '#EA580C', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Clean Up Selection →
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#92400E', marginBottom: 3 }}>Drag over walls, siding or gutters to remove them</div>
                      <div style={{ fontSize: 13, color: '#B45309', lineHeight: 1.5 }}>Drag over anything that isn't roof — the teal will be removed from those areas. Use Fine brush for eave edges.</div>
                    </div>
                    <button onClick={() => { setEraseMode(false); setSuperMaskWarning(false) }}
                      style={{ flexShrink: 0, padding: '10px 16px', borderRadius: T.radMd, border: '2px solid #EA580C', background: '#fff', color: '#EA580C', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ✓ Done Erasing
                    </button>
                  </>
                )}
              </div>
            )}

            <div style={{ position: 'relative', borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}`, maxWidth: 720, margin: '0 auto', touchAction: 'none' }}>
              {photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={confirmImgRef} src={photoPreview} alt="Your home"
                  onPointerDown={eraseMode ? handleEraseStart : handleSweepStart}
                  onPointerMove={eraseMode ? handleEraseMove : handleSweepMove}
                  onPointerUp={eraseMode ? handleEraseEnd : handleSweepEnd}
                  onPointerLeave={eraseMode ? handleEraseEnd : handleSweepEnd}
                  draggable={false}
                  style={{ width: '100%', display: 'block', cursor: eraseMode ? 'cell' : 'crosshair', userSelect: 'none' }} />
              )}
              <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: t.textSubtle }}>
                {selected.size === 0 ? 'Nothing selected yet' : `${selected.size} section${selected.size === 1 ? '' : 's'} selected${erasePixels.size > 0 ? ` · ${erasePixels.size} px erased` : ''}`}
              </span>
              {traceHint && <span style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>{traceHint}</span>}
              {/* Erase is an escape hatch — show as a single contextual button, not a peer toggle */}
              {selected.size > 0 && !eraseMode && (
                <button onClick={() => { setEraseMode(true); setTraceHint(null); setSuperMaskWarning(false) }}
                  style={{ padding: '8px 16px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  ⌫ Erase unwanted areas
                </button>
              )}
              {eraseMode && (
                <button onClick={() => setEraseMode(false)}
                  style={{ padding: '8px 16px', borderRadius: T.radMd, border: `1.5px solid #EA580C`, background: '#FFF7ED', color: '#EA580C', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  ✓ Done Erasing
                </button>
              )}
              {eraseMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: t.textSubtle }}>Brush:</span>
                  {([['Fine', 8], ['Normal', 14], ['Large', 22]] as [string, 8|14|22][]).map(([label, r]) => (
                    <button key={r} onClick={() => setEraseRadius(r)}
                      style={{ padding: '5px 9px', borderRadius: T.radSm, border: `1.5px solid ${eraseRadius === r ? '#EA580C' : t.cardBorder}`, background: eraseRadius === r ? '#FFF7ED' : t.cardBg, color: eraseRadius === r ? '#EA580C' : t.textMuted, fontWeight: eraseRadius === r ? 700 : 500, fontSize: 11, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={handleUndo} disabled={history.length === 0}
                style={{ padding: '10px 18px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: history.length ? t.textBody : t.textSubtle, fontWeight: 600, fontSize: 13, cursor: history.length ? 'pointer' : 'not-allowed' }}>
                ↶ Undo
              </button>
              <button onClick={handleConfirmMask} disabled={selected.size === 0 || confirmBusy}
                style={{ padding: '12px 32px', borderRadius: T.radMd, border: 'none', background: selected.size > 0 ? BRAND.teal : '#ccc', color: '#fff', fontWeight: 700, fontSize: 15, cursor: selected.size > 0 && !confirmBusy ? 'pointer' : 'not-allowed' }}>
                {confirmBusy ? `Preparing your roof… ${elapsed}s` : 'Confirm Roof →'}
              </button>
            </div>
          </div>
        )}

        {step === 'touchup' && card(
          <div>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 16, color: t.textPri, margin: '0 0 4px' }}>Touch up edges</p>
              <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>
                Drag over any remaining wall or siding areas to remove them. <strong>Teal stays</strong> = gets painted. <strong>Amber</strong> = will be removed. Use Extra Fine for eave lines.
              </p>
            </div>

            {!touchupReady && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: t.textMuted, fontSize: 13, gap: 10 }}>
                <div style={{ width: 20, height: 20, border: `2px solid ${BRAND.teal}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Loading mask…
              </div>
            )}

            <div style={{ position: 'relative', borderRadius: T.radLg, overflow: 'hidden', lineHeight: 0, touchAction: 'none', cursor: 'cell', display: touchupReady ? 'block' : 'none' }}
              onPointerDown={handleTouchupStart}
              onPointerMove={handleTouchupMove}
              onPointerUp={handleTouchupEnd}
              onPointerLeave={handleTouchupEnd}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={touchupImgRef} src={photoPreview ?? ''} alt="" style={{ display: 'none' }} />
              <canvas ref={touchupCanvasRef} style={{ width: '100%', display: 'block' }} />
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: t.textSubtle }}>Brush:</span>
              {([['Extra Fine', 4], ['Fine', 8], ['Normal', 14], ['Large', 22]] as [string, 4|8|14|22][]).map(([label, r]) => (
                <button key={r} onClick={() => setTouchupRadius(r)}
                  style={{ padding: '6px 12px', borderRadius: T.radSm, border: `1.5px solid ${touchupRadius === r ? BRAND.teal : t.cardBorder}`, background: touchupRadius === r ? BRAND.tealAlpha : t.cardBg, color: touchupRadius === r ? BRAND.teal : t.textMuted, fontWeight: touchupRadius === r ? 700 : 500, fontSize: 12, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={() => { touchupEraseSet.current = new Set(); redrawTouchup() }}
                style={{ padding: '9px 14px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Reset
              </button>
              <button onClick={() => setStep('pick')}
                style={{ padding: '9px 16px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleApplyTouchup} disabled={touchupBusy}
                style={{ padding: '10px 22px', borderRadius: T.radMd, border: 'none', background: BRAND.teal, color: '#fff', fontWeight: 700, fontSize: 14, cursor: touchupBusy ? 'wait' : 'pointer' }}>
                {touchupBusy ? 'Applying…' : 'Apply & Continue →'}
              </button>
            </div>
          </div>
        )}

        {step === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {photoPreview && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', alignItems: 'stretch', borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', background: t.cardBg }}>
                <div style={{ position: 'relative', lineHeight: 0, alignSelf: 'start' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Your home" style={{ width: '100%', height: 'auto', display: 'block' }} />
                {showPickMask && (
                  <canvas ref={pickOverlayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
                )}
                <button onClick={() => setShowPickMask(v => !v)}
                  title={showPickMask ? 'Hide the confirmed roof area' : 'Show the confirmed roof area'}
                  style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(15,118,110,0.9)', color: '#fff', border: 'none', borderRadius: T.radSm, padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ Roof confirmed
                  <span style={{ opacity: 0.75, fontWeight: 500 }}>{showPickMask ? '· hide' : '· show'}</span>
                </button>
                {/* Touch up edges — enters full-res mask editing step */}
                <button onClick={() => setStep('touchup')}
                  title="Clean up eave edges at full resolution"
                  style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: T.radSm, padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  ✏ Touch up edges
                </button>
                </div>
                <div style={{ padding: '20px 22px', background: t.cardBg, borderLeft: `1px solid ${t.cardBorder}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }}>
                    Your comparison
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minHeight: 34 }}>
                    {selectedSkuIds.length === 0 && (
                      <span style={{ fontSize: 12.5, color: t.textMuted }}>Pick up to 10 colors to compare →</span>
                    )}
                    {selectedSkuIds.map(id => skuMap[id] && (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.cardBgAlt, borderRadius: 999, padding: '4px 10px 4px 5px' }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: skuMap[id].hex_preview, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: t.textBody, whiteSpace: 'nowrap' }}>{skuMap[id].name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {card(
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: t.textPri, margin: '0 0 4px' }}>Pick up to 10 shingle colors</p>
                <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 20px' }}>We'll show all three side by side — free</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {[null, ...groups.map(g => g.manufacturer)].map(m => (
                    <button key={m ?? 'all'} onClick={() => setMfgFilter(m)}
                      style={{ padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${mfgFilter === m ? BRAND.teal : t.cardBorder}`,
                        background: mfgFilter === m ? BRAND.tealAlpha : t.cardBg,
                        color: mfgFilter === m ? BRAND.teal : t.textMuted }}>
                      {m ?? 'All'}
                    </button>
                  ))}
                </div>
                {groups.filter(g => !mfgFilter || g.manufacturer === mfgFilter).map(group => (
                  <div key={group.manufacturer} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{group.manufacturer}</p>
                      {getMfgTier(group.manufacturer) && (() => {
                        const tier = getMfgTier(group.manufacturer)!
                        return (
                          <span title={tier.description}
                            style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                              background: tier.color + '18', color: tier.color, border: `1px solid ${tier.color}40`,
                              letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            {tier.label}
                          </span>
                        )
                      })()}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 12 }}>
                      {group.skus.map(sku => <SkuSwatch key={sku.id} sku={sku} selected={selectedSkuIds.includes(sku.id)} onClick={() => toggleSku(sku.id)} />)}
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: 12, color: t.textSubtle, margin: '0 0 14px' }}>{selectedSkuIds.length === 0 ? 'Select at least one color' : `${selectedSkuIds.length} color${selectedSkuIds.length > 1 ? 's' : ''} selected`}</p>
                <button onClick={handleRender} disabled={selectedSkuIds.length === 0}
                  style={{ width: '100%', background: selectedSkuIds.length > 0 ? BRAND.teal : '#ccc', color: '#fff', border: 'none', borderRadius: T.radMd, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: selectedSkuIds.length > 0 ? 'pointer' : 'not-allowed' }}>
                  Visualize My Roof →
                </button>
                <p style={{ fontSize: 11, color: t.textSubtle, textAlign: 'center', margin: '10px 0 0' }}>Free — no account required for first 3 renders</p>
                <p style={{ fontSize: 10.5, color: t.textSubtle, textAlign: 'center', margin: '8px 0 0', lineHeight: 1.45 }}>
                  Colors shown are digital approximations. Manufacturers recommend viewing full-size shingle samples in daylight before choosing.
              </p>

              {/* AI Recommendation banner — only shown after a render has been done */}
              {roofMeanRgb && renders.length > 0 && (() => {
                const recIds = pickRecommended(skus, roofMeanRgb)
                const recSkus = recIds.map(id => skus.find(s => s.id === id)).filter(Boolean) as Sku[]
                if (recSkus.length === 0) return null
                return (
                  <div style={{ marginBottom: 20, padding: '14px 18px', background: BRAND.teal + '10', borderRadius: T.radLg, border: `1px solid ${BRAND.teal}30` }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: BRAND.teal, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ✦ Recommended for your roof
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {recSkus.map(s => (
                        <button key={s.id} onClick={() => {
                          setSelectedSkuIds(prev =>
                            prev.includes(s.id) ? prev : prev.length >= 10 ? [...prev.slice(1), s.id] : [...prev, s.id]
                          )
                        }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                            borderRadius: T.radMd, border: `2px solid ${selectedSkuIds.includes(s.id) ? BRAND.teal : 'transparent'}`,
                            background: t.cardBg, cursor: 'pointer', transition: 'border-color 0.12s' }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: s.hex_preview, flexShrink: 0, display: 'inline-block', border: '1px solid rgba(0,0,0,0.1)' }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: t.textPri }}>{s.name}</span>
                          {selectedSkuIds.includes(s.id) && <span style={{ fontSize: 11, color: BRAND.teal }}>✓</span>}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: t.textSubtle, margin: '8px 0 0' }}>
                      Based on contrast with your current roof colour.
                    </p>
                  </div>
                )
              })()}
              <p style={{ display: 'none' }}>
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'rendering' && (
          <div>
            <p style={{ fontWeight: 700, fontSize: 17, color: t.textPri, margin: '0 0 20px' }}>Generating your renders…</p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(selectedSkuIds.length + 1, 4)}, 1fr)`, gap: 16 }}>
              {photoPreview && (
                <div style={{ borderRadius: T.radLg, overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Original" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '10px 14px', background: t.cardBg }}><span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>Original</span></div>
                </div>
              )}
              {selectedSkuIds.map(id => <SkeletonCard key={id} label={skuMap[id]?.name} />)}
            </div>
          </div>
        )}

        {step === 'results' && (() => {
            const allItems: Array<{ url: string; label: string; hex: string; mfg: string; isOriginal?: boolean; lowContrast?: boolean }> = [
              ...(photoPreview ? [{ url: photoPreview, label: 'Original', hex: '#888', mfg: '', isOriginal: true }] : []),
              ...renders.filter(r => r.renderUrl).map(r => ({ url: r.renderUrl!, label: r.skuName, hex: r.hexPreview, mfg: r.mfgName ?? '', lowContrast: r.lowContrast })),
            ]
            return (
              <div>
                {/* ── Hero image ──────────────────────────────────────── */}
                {heroIdx !== null && allItems[heroIdx] && (
                  <div style={{ position: 'relative', borderRadius: T.radLg, overflow: 'hidden', marginBottom: 12, cursor: 'zoom-in', lineHeight: 0 }}
                    onClick={() => setLightbox({ url: allItems[heroIdx!].url, label: allItems[heroIdx!].label })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={allItems[heroIdx].url} alt={allItems[heroIdx].label}
                      style={{ width: '100%', maxHeight: 520, objectFit: 'cover', display: 'block' }} />
                    {/* Label badge */}
                    <div style={{ position: 'absolute', bottom: 14, left: 14, background: 'rgba(0,0,0,0.62)', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!allItems[heroIdx].isOriginal && (
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: allItems[heroIdx].hex, display: 'inline-block', flexShrink: 0, border: '1px solid rgba(255,255,255,0.3)' }} />
                      )}
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
                        {allItems[heroIdx].isOriginal ? 'Original roof' : `${allItems[heroIdx].mfg ? allItems[heroIdx].mfg + ' · ' : ''}${allItems[heroIdx].label}`}
                      </span>
                    </div>
                    {/* Zoom hint */}
                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#fff' }}>⤢ Tap to zoom</div>
                    {/* ✓ Roof confirmed badge */}
                    {showPickMask && (
                      <div style={{ position: 'absolute', bottom: 14, right: 14 }}>
                        <button onClick={e => { e.stopPropagation(); setShowPickMask(false) }}
                          style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          ✓ Roof confirmed · hide
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Low-contrast note — this colour barely differs from the existing roof */}
                {heroIdx !== null && allItems[heroIdx]?.lowContrast && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: T.radMd, padding: '10px 13px', marginBottom: 12 }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
                    <div style={{ fontSize: 13, color: '#B45309', lineHeight: 1.45 }}>
                      <strong style={{ color: '#92400E' }}>Low contrast — {allItems[heroIdx].label} is similar to the existing roof.</strong>{' '}
                      The render is accurate but the change may be subtle. For a stronger visual impact, consider a colour with higher contrast — try something lighter, darker, or from a different colour family.
                    </div>
                  </div>
                )}

                {/* ── Thumbnail strip — Original + renders ────────────── */}
                {/* Strip wrapper: scrollbarVisible gives a persistent thin track on all */}
                {/* platforms so users know it's scrollable. paddingBottom:10 gives the  */}
                {/* scrollbar room so it doesn't clip the thumbnail border.               */}
                <style>{`
                  .rv-thumb-strip::-webkit-scrollbar { height: 4px; }
                  .rv-thumb-strip::-webkit-scrollbar-track { background: transparent; }
                  .rv-thumb-strip::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 2px; }
                  .rv-thumb-strip { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.18) transparent; }
                `}</style>
                <div className="rv-thumb-strip" style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 10, minWidth: 0, WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity' }}>
                  {allItems.map((item, i) => (
                    <div key={i} onClick={() => setHeroIdx(i)}
                      style={{ flexShrink: 0, width: 116, cursor: 'pointer', borderRadius: T.radMd, overflow: 'hidden', scrollSnapAlign: 'start',
                        border: heroIdx === i ? `2.5px solid ${BRAND.teal}` : `2px solid ${t.cardBorder}`,
                        transition: 'border-color 0.12s', opacity: heroIdx === i ? 1 : 0.75 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.label} style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                      {/* Colour band */}
                      <div style={{ height: item.isOriginal ? 0 : 6, background: item.hex }} />
                      <div style={{ padding: '5px 7px', background: t.cardBg, minHeight: 34 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: heroIdx === i ? BRAND.teal : t.textPri, lineHeight: 1.25 }}>
                          {item.isOriginal ? 'Original' : item.label}
                        </div>
                        {!item.isOriginal && item.mfg && (
                          <div style={{ fontSize: 9, color: t.textSubtle, lineHeight: 1.2 }}>
                            {item.mfg}{item.lowContrast ? ' · low contrast' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Primary actions ──────────────────────────────────── */}
                {!shareEmailStep ? (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button onClick={() => handleShare()}
                      style={{ flex: 1, minWidth: 200, padding: '14px 24px', borderRadius: T.radMd, border: 'none', background: BRAND.teal, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
                      Send to Homeowner →
                    </button>
                    <button onClick={() => setStep('pick')}
                      style={{ padding: '14px 18px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ← Try Other Colors
                    </button>
                  </div>
                ) : (
                  /* Email capture */
                  <div style={{ background: '#F0FDF9', border: `2px solid ${BRAND.teal}`, borderRadius: T.radLg, padding: '20px 24px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: t.textPri, marginBottom: 4 }}>Where should we send the notification?</div>
                      <div style={{ fontSize: 13, color: t.textMuted }}>Enter your email — we'll notify you the moment your homeowner picks a colour.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="email" placeholder="your@email.com" value={shareEmail}
                        onChange={e => setShareEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && shareEmail && handleShare(shareEmail)}
                        autoFocus
                        style={{ padding: '11px 14px', borderRadius: T.radMd, border: `1.5px solid ${BRAND.teal}`, fontSize: 14, outline: 'none', width: 240, background: '#fff', color: t.textPri, boxSizing: 'border-box' as const }} />
                      <button onClick={() => handleShare(shareEmail)} disabled={!shareEmail || shareBusy}
                        style={{ padding: '11px 20px', borderRadius: T.radMd, border: 'none', background: BRAND.teal, color: '#fff', fontWeight: 700, fontSize: 14, cursor: shareEmail ? 'pointer' : 'not-allowed', opacity: !shareEmail ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                        {shareBusy ? 'Creating…' : 'Get Link →'}
                      </button>
                      <button onClick={() => setShareEmailStep(false)}
                        style={{ padding: '11px 14px', borderRadius: T.radMd, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Error renders ────────────────────────────────────── */}
                {renders.some(r => !r.renderUrl) && (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(renders.filter(r => !r.renderUrl).length, 3)}, 1fr)`, gap: 12, marginBottom: 16 }}>
                    {renders.filter(r => !r.renderUrl).map(r => (
                      <ErrorCard key={r.skuId} label={r.skuName} retrying={retrying.has(r.skuId)} onRetry={() => handleRetry(r.skuId)} />
                    ))}
                  </div>
                )}

                {/* ── PDF Report card ──────────────────────────────────── */}
                {card(
                  <div>
                    {/* Visual mock PDF — real renders inside, blurred for non-pros */}
                    <div style={{ position: 'relative', borderRadius: T.radMd, overflow: 'hidden', border: `1px solid ${t.cardBorder}`, marginBottom: 16 }}>
                      <div style={{ background: '#F8FAFC', padding: '14px 18px', filter: proId ? 'none' : 'blur(3px)', userSelect: 'none', pointerEvents: proId ? 'auto' : 'none' }}>
                        {/* Mock PDF header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${BRAND.teal}`, paddingBottom: 8, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: BRAND.teal }}>ProGuild</div>
                            <div style={{ fontSize: 9, color: '#888' }}>Roof Visualization Report</div>
                          </div>
                          <div style={{ fontSize: 9, color: '#888' }}>{new Date().toLocaleDateString()}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#111', marginBottom: 2 }}>Smith Residence — Roof Colour Comparison</div>
                        <div style={{ fontSize: 10, color: '#666', marginBottom: 10 }}>Prepared by: Your Roofing Company · Licensed & Insured</div>
                        {/* Render thumbnails inside mock PDF */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          {renders.filter(r => r.renderUrl).slice(0, 3).map((r, i) => (
                            <div key={i} style={{ flex: 1, borderRadius: 4, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r.renderUrl!} alt="" style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} />
                              <div style={{ height: 10, background: r.hexPreview }} />
                              <div style={{ padding: '3px 5px', fontSize: 8, fontWeight: 600, color: '#111' }}>{r.mfgName} {r.skuName}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Lock overlay for non-pros */}
                      {!proId && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <div style={{ fontSize: 24 }}>🔒</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: t.textPri }}>Pro feature — free to unlock</div>
                          <Link href={`/login?tab=signup${sessionId ? `&visualizer_session=${sessionId}` : ''}`}
                            style={{ display: 'inline-block', background: BRAND.teal, color: '#fff', padding: '8px 18px', borderRadius: T.radMd, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                            Join Free to Unlock →
                          </Link>
                        </div>
                      )}
                    </div>
                    {/* Actions row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: t.textPri, marginBottom: 3 }}>Professional Roof Visualization Report</div>
                        <div style={{ fontSize: 13, color: t.textMuted }}>Cover · comparisons · manufacturer swatches · ready to attach to proposals</div>
                      </div>
                      {proId ? (
                        <button onClick={handleDownloadReport} disabled={reportBusy}
                          style={{ padding: '10px 20px', borderRadius: T.radMd, border: 'none', background: BRAND.teal, color: '#fff', fontWeight: 700, fontSize: 13, cursor: reportBusy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                          {reportBusy ? 'Generating…' : '↓ Download Report'}
                        </button>
                      ) : (
                        <Link href={`/login?tab=signup${sessionId ? `&visualizer_session=${sessionId}` : ''}`}
                          style={{ display: 'inline-block', padding: '10px 18px', borderRadius: T.radMd, border: `2px solid ${BRAND.teal}`, background: t.cardBg, color: BRAND.teal, fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Sign in to Download →
                        </Link>
                      )}
                    </div>
                  </div>,
                  { marginBottom: 16 }
                )}

                {/* ── Contractor signup — benefit-led. Hidden once signed in. ── */}
                {proId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '10px 0', fontSize: 13, color: t.textSubtle }}>
                    <span style={{ color: BRAND.teal, fontWeight: 700 }}>✓</span>
                    Signed in — branded reports enabled
                  </div>
                ) : card(
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                      <p style={{ fontWeight: 700, color: t.textPri, margin: '0 0 8px', fontSize: 16 }}>Unlock unlimited renders</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {['Unlimited renders — no cap', 'Branded PDF reports for proposals', 'Homeowner colour tracking', 'Free to join — no card required'].map(b => (
                          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: BRAND.teal, fontWeight: 700, fontSize: 12 }}>✓</span>
                            <span style={{ fontSize: 13, color: t.textMuted }}>{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Link href={`/login?tab=signup${sessionId ? `&visualizer_session=${sessionId}` : ''}`}
                      style={{ display: 'inline-block', background: BRAND.teal, color: '#fff', padding: '12px 26px', borderRadius: T.radMd, fontWeight: 700, fontSize: 15, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      Join ProGuild Free →
                    </Link>
                  </div>
                )}
              </div>
            )
          })()}

        {step === 'gate' && card(
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🎨</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Want to see more renders?</h2>
            <p style={{ color: t.textMuted, fontSize: 15, margin: '0 0 28px', maxWidth: 400, marginInline: 'auto' }}>Enter your email to unlock unlimited renders — free, no credit card.</p>
            <div style={{ maxWidth: 340, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="email" placeholder="your@email.com" value={gateEmail} onChange={e => setGateEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGateSubmit()}
                style={{ padding: '12px 16px', borderRadius: T.radMd, border: `1.5px solid ${t.inputBorder}`, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              <button onClick={handleGateSubmit} disabled={!gateEmail || gateBusy}
                style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radMd, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: gateEmail ? 'pointer' : 'not-allowed', opacity: !gateEmail ? 0.6 : 1 }}>
                {gateBusy ? 'Unlocking…' : 'Unlock Free Renders →'}
              </button>
              <p style={{ fontSize: 12, color: t.textSubtle, margin: 0 }}>Already have an account? <Link href="/login" style={{ color: BRAND.teal, textDecoration: 'none', fontWeight: 600 }}>Sign in</Link></p>
            </div>
          </div>
        )}

        {step === 'share' && card(
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📨</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: '0 0 10px' }}>Share with your homeowner</h2>
            <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 24px', maxWidth: 440, marginInline: 'auto' }}>Send this link to your homeowner. They'll pick their favourite color and you'll be notified instantly.</p>
            {shareUrl && (
              <div style={{ maxWidth: 480, margin: '0 auto' }}>
                <div style={{ display: 'flex', gap: 8, background: t.cardBgAlt, border: `1px solid ${t.cardBorder}`, borderRadius: T.radMd, padding: '10px 14px', marginBottom: 16, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: t.textBody, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareUrl}</span>
                  <button onClick={() => navigator.clipboard.writeText(shareUrl)} style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: T.radSm, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Copy Link</button>
                </div>
                <button onClick={() => setStep('results')} style={{ background: 'none', border: 'none', color: BRAND.teal, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>← Back to renders</button>
              </div>
            )}
          </div>
        )}

        {step === 'upload' && (
          <div style={{ marginTop: 0 }}>
            {/* Photo tips */}
            <p style={{ fontWeight: 700, fontSize: 13, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px' }}>
              Photo tips — best results
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { icon: '✅', text: 'Street-level front view, roof clearly visible' },
                { icon: '✅', text: 'Straight-on angle — not too high, not too low' },
                { icon: '✅', text: 'Full roof fits in the frame, no cropping at edges' },
                { icon: '✅', text: 'Taken in daylight with no heavy shadows on the roof' },
                { icon: '❌', text: 'Trees or branches covering the roof' },
                { icon: '❌', text: 'Aerial or steep-angle drone shots' },
                { icon: '❌', text: 'Heavy rain, snow, or deep shadow across the whole roof' },
                { icon: '❌', text: 'Side or rear of the house — front view only' },
              ].map((tip, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
                  borderRadius: T.radMd, background: tip.icon === '✅' ? BRAND.teal + '08' : '#ef444408',
                  border: `1px solid ${tip.icon === '✅' ? BRAND.teal + '22' : '#ef444422'}`,
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{tip.icon}</span>
                  <span style={{ fontSize: 13, color: t.textBody, lineHeight: 1.4 }}>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'upload' && skus.length > 0 && (
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>
              {skus.length} real shingle colours · 5 manufacturers
            </p>
            {/* 9-per-row grid — 18 chips split into 2 clean rows */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 56px)', gap: 8, justifyContent: 'center' }}>
              {skus.map(s => {
                const isHovered = hoveredSkuId === s.id
                const mfg = getMfgName(s)
                return (
                  <div key={s.id}
                    onMouseEnter={() => setHoveredSkuId(s.id)}
                    onMouseLeave={() => setHoveredSkuId(null)}
                    onPointerDown={() => setHoveredSkuId(s.id)}
                    onPointerUp={() => setTimeout(() => setHoveredSkuId(null), 900)}
                    style={{ position: 'relative', width: 56, height: 56, borderRadius: 10, background: s.hex_preview, border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', overflow: 'visible', cursor: 'default' }}>
                    {isHovered && (
                      <div style={{
                        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(15,15,15,0.95)', color: '#fff', borderRadius: 10,
                        padding: s.swatch_url ? '0' : '6px 10px',
                        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                        minWidth: s.swatch_url ? 140 : 'auto', overflow: 'hidden',
                      }}>
                        {s.swatch_url
                          ? <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.swatch_url} alt={s.name}
                                style={{ width: 140, height: 100, objectFit: 'cover', display: 'block' }} />
                              <div style={{ padding: '6px 10px' }}>
                                <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{s.name}</div>
                                {mfg && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{mfg}</div>}
                              </div>
                            </>
                          : <>
                              <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{s.name}</div>
                              {mfg && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{mfg}</div>}
                            </>
                        }
                        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(15,15,15,0.95)' }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.label} onClick={e => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '82vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', cursor: 'default' }} />
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, cursor: 'default' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{lightbox.label}</span>
            {lightbox.label !== 'Original' && (
              <button onClick={() => downloadRender(lightbox.url, lightbox.label)}
                style={{ background: BRAND.teal, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                ↓ Download
              </button>
            )}
            <button onClick={() => setLightbox(null)}
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
