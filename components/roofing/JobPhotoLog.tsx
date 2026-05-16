// components/roofing/JobPhotoLog.tsx
// Photo upload with phase labels, grid view, share link, ZIP for adjuster.
// Used on lead detail page for all trades (roofing has insurance-specific phases).
// Uploads to Cloudflare R2 via /api/leads/[id]/photos
'use client'

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
  id:         string
  url:        string
  phase:      PhotoPhase
  caption:    string
  uploadedAt: string
  filename:   string
}

interface Props {
  leadId:     string
  proId:      string
  isRoofing:  boolean   // shows Insurance phase label if true
  darkMode:   boolean
}

const PHASES: PhotoPhase[] = [
  'Before',
  'Decking',
  'Installation',
  'Completion',
  'Damage',
  'Insurance',
]

const PHASE_COLORS: Record<PhotoPhase, { bg: string; text: string }> = {
  Before:       { bg: '#FEF3C7', text: '#B45309' },
  Decking:      { bg: '#EFF6FF', text: '#1D4ED8' },
  Installation: { bg: '#F5F3FF', text: '#6D28D9' },
  Completion:   { bg: '#F0FDF4', text: '#15803D' },
  Damage:       { bg: '#FEF2F2', text: '#DC2626' },
  Insurance:    { bg: '#FFF7ED', text: '#C2410C' },
}

// Max file size: 10MB
const MAX_BYTES = 10 * 1024 * 1024

// ── Component ─────────────────────────────────────────────────────────────
export default function JobPhotoLog({ leadId, proId, isRoofing, darkMode }: Props) {
  const [photos,       setPhotos]       = useState<JobPhoto[]>([])
  const [loading,      setLoading]      = useState(true)
  const [uploading,    setUploading]    = useState(false)
  const [selectedPhase, setSelectedPhase] = useState<PhotoPhase>('Before')
  const [filterPhase,  setFilterPhase]  = useState<PhotoPhase | 'All'>('All')
  const [error,        setError]        = useState<string | null>(null)
  const [zipping,      setZipping]      = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const phases = isRoofing ? PHASES : PHASES.filter(p => p !== 'Insurance' && p !== 'Decking')

  // ── Load photos ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch(`/api/leads/${leadId}/photos?pro_id=${proId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { photos: JobPhoto[] }) => {
        if (!cancelled) setPhotos(data.photos ?? [])
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load photos')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [leadId, proId])

  // ── Upload ─────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    // Validate each file
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} is not an image file`)
        return
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds 10MB limit`)
        return
      }
    }

    setUploading(true)
    setError(null)

    try {
      const uploads = await Promise.all(
        files.map(async file => {
          const fd = new FormData()
          fd.append('file',    file)
          fd.append('phase',   selectedPhase)
          fd.append('pro_id',  proId)
          fd.append('caption', '')

          const res = await fetch(`/api/leads/${leadId}/photos`, {
            method: 'POST',
            body:   fd,
          })

          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error((d as {error?: string}).error ?? `Upload failed: HTTP ${res.status}`)
          }

          return res.json() as Promise<JobPhoto>
        })
      )

      setPhotos(prev => [...prev, ...uploads])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [leadId, proId, selectedPhase])

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (photoId: string) => {
    // Optimistic update
    setPhotos(prev => prev.filter(p => p.id !== photoId))

    const res = await fetch(`/api/leads/${leadId}/photos/${photoId}?pro_id=${proId}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      // Revert on failure
      setError('Failed to delete photo — please try again')
      // Re-fetch to get accurate state
      fetch(`/api/leads/${leadId}/photos?pro_id=${proId}`)
        .then(r => r.json())
        .then((d: { photos: JobPhoto[] }) => setPhotos(d.photos ?? []))
        .catch(() => {/* silent */})
    }
  }, [leadId, proId])

  // ── ZIP download for adjuster ──────────────────────────────────────────
  const handleDownloadZip = useCallback(async () => {
    setZipping(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/leads/${leadId}/photos/zip?pro_id=${proId}` +
        (filterPhase !== 'All' ? `&phase=${filterPhase}` : '')
      )

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `photos-${leadId.slice(0, 8)}${filterPhase !== 'All' ? `-${filterPhase}` : ''}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ZIP download failed')
    } finally {
      setZipping(false)
    }
  }, [leadId, proId, filterPhase])

  // ── Styles ─────────────────────────────────────────────────────────────
  const cardBg     = darkMode ? '#1E293B' : '#FFFFFF'
  const cardBorder = darkMode ? '#334155' : '#E8E2D9'
  const textPrimary= darkMode ? '#F1F5F9' : '#0A1628'
  const textMuted  = darkMode ? '#94A3B8' : '#6B7280'
  const inputBg    = darkMode ? '#0F172A' : '#F8FAFC'
  const inputBorder= darkMode ? '#334155' : '#CBD5E1'
  const teal       = '#0F766E'

  // ── Filtered photos ────────────────────────────────────────────────────
  const visible = filterPhase === 'All' ? photos : photos.filter(p => p.phase === filterPhase)

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${cardBorder}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: textPrimary, marginBottom: 16 }}>
        📷 Job photos ({photos.length})
      </h3>

      {/* Upload row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Phase selector */}
        <select
          value={selectedPhase}
          onChange={e => setSelectedPhase(e.target.value as PhotoPhase)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: `1.5px solid ${inputBorder}`,
            background: inputBg,
            color: textPrimary,
            fontSize: 14,
          }}
        >
          {phases.map(phase => (
            <option key={phase} value={phase}>{phase}</option>
          ))}
        </select>

        {/* Upload button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            background: uploading ? '#9CA3AF' : teal,
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            border: 'none',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Uploading…' : '+ Add photos'}
        </button>

        {/* Hidden file input — multiple, images only */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"   // prefer camera on mobile
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* ZIP download */}
        {photos.length > 0 && (
          <button
            onClick={handleDownloadZip}
            disabled={zipping}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'transparent',
              color: teal,
              fontWeight: 500,
              fontSize: 14,
              border: `1.5px solid ${teal}`,
              cursor: zipping ? 'not-allowed' : 'pointer',
              marginLeft: 'auto',
            }}
          >
            {zipping ? 'Preparing ZIP…' : '⬇ ZIP for adjuster'}
          </button>
        )}
      </div>

      {/* Phase filter tabs */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {(['All', ...phases] as const).map(phase => {
            const count = phase === 'All' ? photos.length : photos.filter(p => p.phase === phase).length
            if (phase !== 'All' && count === 0) return null
            const colors = phase === 'All' ? null : PHASE_COLORS[phase as PhotoPhase]
            const active = filterPhase === phase
            return (
              <button
                key={phase}
                onClick={() => setFilterPhase(phase)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                  border: active ? `1.5px solid ${colors?.text ?? teal}` : `1px solid ${cardBorder}`,
                  background: active ? (colors?.bg ?? '#F0FDFA') : 'transparent',
                  color: active ? (colors?.text ?? teal) : textMuted,
                  cursor: 'pointer',
                }}
              >
                {phase} {count > 0 && `(${count})`}
              </button>
            )
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: '#FEF2F2', color: '#DC2626',
          fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: textMuted, fontSize: 14 }}>
          Loading photos…
        </div>
      )}

      {/* Empty state */}
      {!loading && photos.length === 0 && (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: textMuted,
          fontSize: 14,
          background: darkMode ? '#0F172A' : '#F8FAFC',
          borderRadius: 8,
        }}>
          No photos yet. Add Before photos first.
        </div>
      )}

      {/* Photo grid — 3 columns */}
      {!loading && visible.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}>
          {visible.map(photo => {
            const colors = PHASE_COLORS[photo.phase]
            return (
              <div key={photo.id} style={{ position: 'relative' }}>
                {/* Photo */}
                <div style={{
                  paddingTop: '75%',   // 4:3 aspect ratio
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: darkMode ? '#0F172A' : '#F1F5F9',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`${photo.phase} photo`}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    loading="lazy"
                  />
                </div>

                {/* Phase label */}
                <div style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: colors.bg,
                  color: colors.text,
                }}>
                  {photo.phase}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(photo.id)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Delete photo"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
