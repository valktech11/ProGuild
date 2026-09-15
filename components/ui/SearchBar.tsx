'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Fuse from 'fuse.js'

// ── All searchable trades with keywords for fuzzy matching ────────────────────
const TRADE_SUGGESTIONS = [
  { slug: 'hvac-technician',    label: 'HVAC Technician',       icon: '❄️', keywords: ['ac', 'air conditioning', 'heating', 'cooling', 'hvac', 'furnace', 'heat pump', 'ductwork', 'refrigerant', 'air handler'] },
  { slug: 'electrician',        label: 'Electrician',            icon: '⚡', keywords: ['electric', 'electrical', 'wiring', 'outlet', 'breaker', 'panel', 'circuit', 'generator', 'ev charger', 'voltage'] },
  { slug: 'plumber',            label: 'Plumber',                icon: '🔧', keywords: ['plumb', 'pipe', 'leak', 'drain', 'water heater', 'toilet', 'sink', 'shower', 'faucet', 'sewer', 'repipe'] },
  { slug: 'roofing',             label: 'Roofer',                 icon: '🏠', keywords: ['roof', 'shingle', 'gutter', 'storm damage', 'tile roof', 'flat roof', 'soffit', 'fascia', 'roofing'] },
  { slug: 'general-contractor', label: 'General Contractor',     icon: '🏗️', keywords: ['renovation', 'remodel', 'addition', 'construction', 'build', 'contractor', 'kitchen', 'bathroom', 'home improvement'] },
  { slug: 'pool-spa',           label: 'Pool & Spa Contractor',  icon: '🏊', keywords: ['pool', 'spa', 'hot tub', 'swimming', 'pool pump', 'pool filter', 'pool heater', 'pool plaster'] },
  { slug: 'painter',            label: 'Painter',                icon: '🎨', keywords: ['paint', 'painting', 'stain', 'primer', 'exterior paint', 'interior paint', 'wall', 'ceiling'] },
  { slug: 'landscaper',         label: 'Landscaper',             icon: '🌿', keywords: ['landscape', 'lawn', 'yard', 'garden', 'sod', 'grass', 'tree', 'shrub', 'mulch'] },
  { slug: 'solar-energy',    label: 'Solar Installer',        icon: '☀️', keywords: ['solar', 'solar panel', 'photovoltaic', 'battery', 'powerwall', 'net metering', 'fpl bill'] },
  { slug: 'drywall',            label: 'Drywall Contractor',     icon: '🧱', keywords: ['drywall', 'sheetrock', 'plaster', 'patch', 'texture', 'stucco', 'wall repair'] },
  { slug: 'flooring',           label: 'Flooring Contractor',    icon: '🪵', keywords: ['floor', 'tile', 'hardwood', 'laminate', 'carpet', 'vinyl', 'grout'] },
  { slug: 'impact-window-shutter', label: 'Impact Window Contractor', icon: '🪟', keywords: ['window', 'impact window', 'hurricane window', 'shutter', 'door'] },
  { slug: 'carpenter',          label: 'Carpenter',              icon: '🪚', keywords: ['carpenter', 'wood', 'cabinet', 'deck', 'fence', 'framing', 'trim', 'molding'] },
  { slug: 'pest-control',       label: 'Pest Control',           icon: '🐛', keywords: ['pest', 'termite', 'ant', 'roach', 'mosquito', 'rodent', 'bug', 'insect', 'fumigation'] },
  { slug: 'irrigation',         label: 'Irrigation Contractor',  icon: '💧', keywords: ['irrigation', 'sprinkler', 'drip', 'water system', 'backflow'] },
  { slug: 'marine-contractor',  label: 'Marine Contractor',      icon: '⚓', keywords: ['dock', 'boat', 'marine', 'seawall', 'pier', 'lift', 'waterfront'] },
]

const FL_CITIES = [
  'Tampa', 'Miami', 'Orlando', 'Jacksonville', 'Sarasota', 'Fort Lauderdale',
  'Fort Myers', 'Naples', 'Cape Coral', 'Clearwater', 'St. Petersburg',
  'West Palm Beach', 'Gainesville', 'Bradenton', 'Pensacola', 'Tallahassee',
  'Port Charlotte', 'Melbourne', 'Ocala', 'Lakeland',
]

// ── Fuse instances ────────────────────────────────────────────────────────────
const tradeFuse = new Fuse(TRADE_SUGGESTIONS, {
  keys: [
    { name: 'label',    weight: 2 },
    { name: 'keywords', weight: 1 },
  ],
  threshold: 0.4,
  includeScore: true,
})

const cityFuse = new Fuse(FL_CITIES, { threshold: 0.3, includeScore: true })

interface Props {
  tradeValue: string
  cityValue: string
  onTradeChange: (v: string) => void
  onCityChange: (v: string) => void
  onSubmit: () => void
  zipResolving?: boolean
  onDetectLocation?: () => void
  placeholder?: string
}

export default function SearchBar({
  tradeValue, cityValue, onTradeChange, onCityChange,
  onSubmit, zipResolving, onDetectLocation,
  placeholder = 'What do you need? e.g. "electrician", "AC repair"',
}: Props) {
  const [tradeSuggestions, setTradeSuggestions] = useState<typeof TRADE_SUGGESTIONS>([])
  const [citySuggestions, setCitySuggestions]   = useState<string[]>([])
  const [tradeOpen, setTradeOpen]               = useState(false)
  const [cityOpen, setCityOpen]                 = useState(false)
  const [tradeIdx, setTradeIdx]                 = useState(-1)
  const [cityIdx, setCityIdx]                   = useState(-1)

  const tradeRef  = useRef<HTMLInputElement>(null)
  const cityRef   = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setTradeOpen(false); setCityOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function handleTradeInput(v: string) {
    onTradeChange(v)
    setTradeIdx(-1)
    if (!v.trim()) { setTradeSuggestions([]); setTradeOpen(false); return }
    const results = tradeFuse.search(v).slice(0, 6).map(r => r.item)
    setTradeSuggestions(results)
    setTradeOpen(results.length > 0)
  }

  function handleCityInput(v: string) {
    onCityChange(v)
    setCityIdx(-1)
    if (!v.trim() || /^\d{5}$/.test(v.trim())) { setCitySuggestions([]); setCityOpen(false); return }
    const results = cityFuse.search(v).slice(0, 5).map(r => r.item as string)
    setCitySuggestions(results)
    setCityOpen(results.length > 0)
  }

  function selectTrade(t: typeof TRADE_SUGGESTIONS[0]) {
    onTradeChange(t.label)
    setTradeSuggestions([]); setTradeOpen(false); setTradeIdx(-1)
    cityRef.current?.focus()
  }

  function selectCity(c: string) {
    onCityChange(c)
    setCitySuggestions([]); setCityOpen(false); setCityIdx(-1)
  }

  function tradeKeyDown(e: React.KeyboardEvent) {
    if (!tradeOpen) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setTradeIdx(i => Math.min(i + 1, tradeSuggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setTradeIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && tradeIdx >= 0) { e.preventDefault(); selectTrade(tradeSuggestions[tradeIdx]) }
    if (e.key === 'Escape') { setTradeOpen(false); setTradeIdx(-1) }
  }

  function cityKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && cityIdx === -1) { setTradeOpen(false); setCityOpen(false); onSubmit(); return }
    if (!cityOpen) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCityIdx(i => Math.min(i + 1, citySuggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCityIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && cityIdx >= 0) { e.preventDefault(); selectCity(citySuggestions[cityIdx]) }
    if (e.key === 'Escape') { setCityOpen(false); setCityIdx(-1) }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-col sm:flex-row bg-white rounded-2xl shadow-md border overflow-visible"
        style={{ borderColor: '#E8E2D9' }}>

        {/* Trade field */}
        <div className="relative flex-1">
          <div className="flex items-center px-4 py-4 gap-3 border-b sm:border-b-0 sm:border-r"
            style={{ borderColor: '#E8E2D9' }}>
            <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#A89F93' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input ref={tradeRef} type="text" value={tradeValue}
              onChange={e => handleTradeInput(e.target.value)}
              onKeyDown={tradeKeyDown}
              onFocus={() => tradeValue && tradeSuggestions.length > 0 && setTradeOpen(true)}
              placeholder={placeholder}
              className="flex-1 text-base outline-none bg-transparent"
              style={{ color: '#0A1628' }}
              autoComplete="off" />
            {tradeValue && (
              <button type="button" onClick={() => { onTradeChange(''); setTradeSuggestions([]); setTradeOpen(false) }}
                className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg">×</button>
            )}
          </div>

          {/* Trade dropdown */}
          {tradeOpen && tradeSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border z-50 overflow-hidden"
              style={{ borderColor: '#E8E2D9' }}>
              {tradeSuggestions.map((t, i) => (
                <button key={t.slug} type="button"
                  onMouseDown={() => selectTrade(t)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors text-sm"
                  style={{
                    background: i === tradeIdx ? 'rgba(15,118,110,0.06)' : 'white',
                    color: i === tradeIdx ? '#0F766E' : '#0A1628',
                    borderBottom: i < tradeSuggestions.length - 1 ? '1px solid #F5F4F0' : 'none',
                  }}>
                  <span className="text-base flex-shrink-0">{t.icon}</span>
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* City / ZIP field */}
        <div className="relative sm:w-56">
          <div className="flex items-center px-4 py-4 gap-3 border-b sm:border-b-0"
            style={{ borderColor: '#E8E2D9' }}>
            <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#A89F93' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <input ref={cityRef} type="text" value={cityValue}
              onChange={e => handleCityInput(e.target.value)}
              onKeyDown={cityKeyDown}
              onFocus={() => cityValue && citySuggestions.length > 0 && setCityOpen(true)}
              placeholder="City or ZIP code"
              className="flex-1 text-base outline-none bg-transparent"
              style={{ color: '#0A1628' }}
              autoComplete="off" />
            {cityValue
              ? <button type="button" onClick={() => { onCityChange(''); setCitySuggestions([]); setCityOpen(false) }}
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg">×</button>
              : onDetectLocation && (
                  <button type="button" onClick={onDetectLocation} title="Use my location"
                    className="text-lg flex-shrink-0" style={{ color: '#0F766E' }}>📍</button>
                )
            }
          </div>

          {/* City dropdown */}
          {cityOpen && citySuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border z-50 overflow-hidden"
              style={{ borderColor: '#E8E2D9' }}>
              {citySuggestions.map((c, i) => (
                <button key={c} type="button"
                  onMouseDown={() => selectCity(c)}
                  className="flex items-center gap-2 w-full px-4 py-3 text-left text-sm transition-colors"
                  style={{
                    background: i === cityIdx ? 'rgba(15,118,110,0.06)' : 'white',
                    color: i === cityIdx ? '#0F766E' : '#0A1628',
                    borderBottom: i < citySuggestions.length - 1 ? '1px solid #F5F4F0' : 'none',
                  }}>
                  <span style={{ color: '#A89F93' }}>📍</span>
                  <span className="font-medium">{c}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button type="button" onClick={onSubmit}
          className="px-8 py-4 text-base font-bold text-white flex items-center justify-center gap-2 flex-shrink-0 rounded-b-2xl sm:rounded-b-none sm:rounded-r-2xl"
          style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
          {zipResolving
            ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><span>Find Pros</span><span className="hidden sm:inline ml-1">→</span></>
          }
        </button>
      </div>
    </div>
  )
}
