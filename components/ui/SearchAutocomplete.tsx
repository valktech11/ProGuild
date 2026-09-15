'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Fuse from 'fuse.js'

// ── Trade suggestions ─────────────────────────────────────────────────────────
const TRADE_SUGGESTIONS = [
  { slug: 'hvac-technician',    label: 'HVAC Technician',         icon: '❄️', keywords: ['ac', 'air conditioning', 'heating', 'cooling', 'furnace', 'heat pump', 'hvac'] },
  { slug: 'electrician',        label: 'Electrician',              icon: '⚡', keywords: ['electric', 'electrical', 'wiring', 'outlet', 'breaker', 'panel', 'generator'] },
  { slug: 'plumber',            label: 'Plumber',                  icon: '🔧', keywords: ['plumb', 'pipe', 'drain', 'water', 'toilet', 'sink', 'leak', 'faucet'] },
  { slug: 'roofing',             label: 'Roofer',                   icon: '🏠', keywords: ['roof', 'shingle', 'gutter', 'storm', 'leak'] },
  { slug: 'general-contractor', label: 'General Contractor',       icon: '🏗️', keywords: ['contractor', 'renovation', 'remodel', 'addition', 'build'] },
  { slug: 'pool-spa',           label: 'Pool & Spa Contractor',    icon: '🏊', keywords: ['pool', 'spa', 'hot tub', 'swimming'] },
  { slug: 'painter',            label: 'Painter',                  icon: '🎨', keywords: ['paint', 'painting', 'exterior', 'interior'] },
  { slug: 'landscaper',         label: 'Landscaper',               icon: '🌿', keywords: ['landscape', 'lawn', 'yard', 'garden', 'sod', 'grass', 'tree'] },
  { slug: 'solar-energy',    label: 'Solar Installer',          icon: '☀️', keywords: ['solar', 'panel', 'photovoltaic', 'battery'] },
  { slug: 'drywall',            label: 'Drywall Contractor',       icon: '🧱', keywords: ['drywall', 'sheetrock', 'plaster', 'patch', 'stucco'] },
  { slug: 'flooring',           label: 'Flooring Contractor',      icon: '🪵', keywords: ['floor', 'tile', 'hardwood', 'laminate', 'carpet', 'vinyl'] },
  { slug: 'impact-window-shutter', label: 'Impact Window Contractor', icon: '🪟', keywords: ['window', 'impact', 'hurricane', 'shutter', 'door'] },
  { slug: 'carpenter',          label: 'Carpenter',                icon: '🪚', keywords: ['carpenter', 'wood', 'cabinet', 'deck', 'fence', 'trim'] },
  { slug: 'pest-control',       label: 'Pest Control',             icon: '🐛', keywords: ['pest', 'termite', 'bug', 'insect', 'rodent', 'fumigation'] },
  { slug: 'irrigation',         label: 'Irrigation Contractor',    icon: '💧', keywords: ['irrigation', 'sprinkler', 'water system'] },
  { slug: 'marine-contractor',  label: 'Marine Contractor',        icon: '⚓', keywords: ['dock', 'boat', 'marine', 'seawall', 'pier'] },
]

// Fuse instance for trade fuzzy matching
const tradeFuse = new Fuse(TRADE_SUGGESTIONS, {
  keys: [
    { name: 'label',    weight: 0.6 },
    { name: 'keywords', weight: 0.4 },
  ],
  threshold: 0.4,
  includeScore: true,
})

// FL cities for city autocomplete
const FL_CITIES = [
  'Tampa', 'Miami', 'Orlando', 'Jacksonville', 'Sarasota',
  'Fort Lauderdale', 'Fort Myers', 'Naples', 'Cape Coral',
  'Clearwater', 'St. Petersburg', 'West Palm Beach',
  'Gainesville', 'Bradenton', 'Pensacola', 'Tallahassee',
  'Daytona Beach', 'Melbourne', 'Lakeland', 'Port St. Lucie',
  'Coral Gables', 'Boca Raton', 'Delray Beach', 'Pompano Beach',
  'Hollywood', 'Miramar', 'Pembroke Pines', 'Hialeah',
  'Palm Bay', 'Palm Beach', 'Ocala', 'Kissimmee',
]

const cityFuse = new Fuse(FL_CITIES, { threshold: 0.35 })

interface Props {
  tradeValue: string
  cityValue: string
  onTradeChange: (v: string) => void
  onCityChange: (v: string) => void
  onSearch: (trade: string, city: string) => void
  onTileTap?: (slug: string) => void
  loading?: boolean
}

export default function SearchAutocomplete({
  tradeValue, cityValue, onTradeChange, onCityChange, onSearch, loading
}: Props) {
  const [tradeSuggestions, setTradeSuggestions] = useState<typeof TRADE_SUGGESTIONS>([])
  const [citySuggestions, setCitySuggestions]   = useState<string[]>([])
  const [focusedField, setFocusedField]         = useState<'trade' | 'city' | null>(null)
  const [selectedIdx, setSelectedIdx]           = useState(-1)
  const tradeRef  = useRef<HTMLInputElement>(null)
  const cityRef   = useRef<HTMLInputElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)

  // Trade fuzzy search
  useEffect(() => {
    const q = tradeValue.trim()
    if (!q || q.length < 2) { setTradeSuggestions([]); return }
    const results = tradeFuse.search(q).slice(0, 6).map(r => r.item)
    setTradeSuggestions(results)
    setSelectedIdx(-1)
  }, [tradeValue])

  // City fuzzy search
  useEffect(() => {
    const q = cityValue.trim()
    if (!q || q.length < 2) { setCitySuggestions([]); return }
    // Show matching cities
    const results = cityFuse.search(q).slice(0, 5).map(r => r.item as string)
    setCitySuggestions(results)
    setSelectedIdx(-1)
  }, [cityValue])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setFocusedField(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectTrade(item: typeof TRADE_SUGGESTIONS[0]) {
    onTradeChange(item.label)
    setTradeSuggestions([])
    setFocusedField(null)
    cityRef.current?.focus()
  }

  function selectCity(city: string) {
    onCityChange(city)
    setCitySuggestions([])
    setFocusedField(null)
  }

  function handleTradeKey(e: React.KeyboardEvent) {
    if (!tradeSuggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, tradeSuggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && selectedIdx >= 0) { e.preventDefault(); selectTrade(tradeSuggestions[selectedIdx]) }
    if (e.key === 'Escape') { setTradeSuggestions([]); setFocusedField(null) }
  }

  function handleCityKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && citySuggestions.length === 0) {
      onSearch(tradeValue, cityValue)
      return
    }
    if (!citySuggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, citySuggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && selectedIdx >= 0) { e.preventDefault(); selectCity(citySuggestions[selectedIdx]) }
    if (e.key === 'Escape') { setCitySuggestions([]); setFocusedField(null) }
  }

  const showTradeDrop = focusedField === 'trade' && tradeSuggestions.length > 0
  const showCityDrop  = focusedField === 'city'  && citySuggestions.length > 0

  return (
    <div ref={wrapRef} className="w-full max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row bg-white rounded-2xl shadow-md border overflow-visible"
        style={{ borderColor: '#E8E2D9' }}>

        {/* Trade field */}
        <div className="relative flex-1">
          <div className="flex items-center px-4 py-4 gap-3 border-b sm:border-b-0 sm:border-r"
            style={{ borderColor: '#E8E2D9' }}>
            <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#A89F93' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={tradeRef}
              type="text"
              value={tradeValue}
              onChange={e => { onTradeChange(e.target.value); setFocusedField('trade') }}
              onFocus={() => setFocusedField('trade')}
              onKeyDown={handleTradeKey}
              placeholder='What do you need? e.g. "electrician", "AC repair"'
              className="flex-1 text-base outline-none bg-transparent"
              style={{ color: '#0A1628' }}
              autoComplete="off"
            />
            {tradeValue && (
              <button onClick={() => { onTradeChange(''); setTradeSuggestions([]) }}
                className="text-gray-300 hover:text-gray-500 text-lg flex-shrink-0">×</button>
            )}
          </div>

          {/* Trade dropdown */}
          {showTradeDrop && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-50 overflow-hidden"
              style={{ borderColor: '#E8E2D9' }}>
              {tradeSuggestions.map((item, idx) => (
                <button key={item.slug}
                  onMouseDown={e => { e.preventDefault(); selectTrade(item) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ background: idx === selectedIdx ? 'rgba(15,118,110,0.06)' : 'white' }}>
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: '#0A1628' }}>{item.label}</div>
                    <div className="text-xs" style={{ color: '#A89F93' }}>View verified pros →</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* City field */}
        <div className="relative sm:w-56">
          <div className="flex items-center px-4 py-4 gap-3 border-b sm:border-b-0"
            style={{ borderColor: '#E8E2D9' }}>
            <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#A89F93' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <input
              ref={cityRef}
              type="text"
              value={cityValue}
              onChange={e => { onCityChange(e.target.value); setFocusedField('city') }}
              onFocus={() => setFocusedField('city')}
              onKeyDown={handleCityKey}
              placeholder="City or ZIP"
              className="flex-1 text-base outline-none bg-transparent"
              style={{ color: '#0A1628' }}
              autoComplete="off"
            />
            {cityValue
              ? <button onClick={() => { onCityChange(''); setCitySuggestions([]) }}
                  className="text-gray-300 hover:text-gray-500 text-lg flex-shrink-0">×</button>
              : <button type="button" title="Use my location"
                  onClick={() => {
                    navigator.geolocation?.getCurrentPosition(async pos => {
                      try {
                        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
                        const data = await res.json()
                        const c    = data.address?.city || data.address?.town || ''
                        if (c) onCityChange(c)
                      } catch {}
                    })
                  }}
                  className="text-lg flex-shrink-0" style={{ color: '#0F766E' }}>📍</button>
            }
          </div>

          {/* City dropdown */}
          {showCityDrop && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-50 overflow-hidden"
              style={{ borderColor: '#E8E2D9' }}>
              {citySuggestions.map((city, idx) => (
                <button key={city}
                  onMouseDown={e => { e.preventDefault(); selectCity(city) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{ background: idx === selectedIdx ? 'rgba(15,118,110,0.06)' : 'white' }}>
                  <span style={{ color: '#A89F93' }}>📍</span>
                  <span className="text-sm font-medium" style={{ color: '#0A1628' }}>{city}, FL</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={() => onSearch(tradeValue, cityValue)}
          disabled={loading}
          className="px-8 py-4 text-base font-bold text-white flex items-center justify-center gap-2 flex-shrink-0 rounded-b-2xl sm:rounded-b-none sm:rounded-r-2xl"
          style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
          {loading
            ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><span>Find Pros</span><span className="hidden sm:inline ml-1">→</span></>
          }
        </button>
      </div>
    </div>
  )
}
