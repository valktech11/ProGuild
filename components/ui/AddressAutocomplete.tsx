'use client'
// components/ui/AddressAutocomplete.tsx
// Reusable address autocomplete using /api/places/autocomplete (server-side key, secure)
// Drop-in replacement for any plain address <input>
//
// Usage:
//   <AddressAutocomplete
//     value={address}
//     onChange={setAddress}
//     placeholder="123 Main St, Tampa, FL"
//     inputStyle={{ borderColor: '#E8E2D9', background: '#FAF9F6' }}
//     inputClassName="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
//   />

import { useState, useRef, useEffect, useCallback } from 'react'

interface Prediction {
  description: string
  place_id: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputClassName?: string
  inputStyle?: React.CSSProperties
  onSelect?: (description: string, placeId: string) => void
  disabled?: boolean
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = '123 Main St, City, State',
  inputClassName = '',
  inputStyle = {},
  onSelect,
  disabled = false,
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [activeIdx, setActiveIdx]     = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch predictions debounced 300ms
  const fetch = useCallback(async (input: string) => {
    if (input.length < 3) { setPredictions([]); setOpen(false); return }
    setLoading(true)
    try {
      const r = await window.fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}`)
      const d = await r.json()
      setPredictions(d.predictions || [])
      setOpen((d.predictions || []).length > 0)
    } catch {
      setPredictions([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    setActiveIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetch(v), 300)
  }

  function handleSelect(pred: Prediction) {
    onChange(pred.description)
    setPredictions([])
    setOpen(false)
    setActiveIdx(-1)
    onSelect?.(pred.description, pred.place_id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || predictions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, predictions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(predictions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={inputClassName}
          style={inputStyle}
        />
        {loading && (
          <div style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            width: 14, height: 14, border: '2px solid #E8E2D9',
            borderTopColor: '#0F766E', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
          }} />
        )}
      </div>

      {open && predictions.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #E8E2D9', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
          padding: '4px 0', listStyle: 'none', maxHeight: 220, overflowY: 'auto',
        }}>
          {predictions.map((pred, i) => (
            <li
              key={pred.place_id}
              onMouseDown={() => handleSelect(pred)}
              style={{
                padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                color: '#0A1628', lineHeight: 1.4,
                background: i === activeIdx ? 'rgba(15,118,110,0.06)' : 'transparent',
                borderLeft: i === activeIdx ? '3px solid #0F766E' : '3px solid transparent',
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span style={{ color: '#0F766E', marginRight: 8, fontSize: 12 }}>📍</span>
              {pred.description}
            </li>
          ))}
          <li style={{
            padding: '6px 14px 4px', fontSize: 10, color: '#C4BAB0',
            borderTop: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <img src="https://developers.google.com/static/maps/documentation/images/google_on_white.png"
              alt="Google" style={{ height: 10, opacity: 0.5 }} />
          </li>
        </ul>
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  )
}
