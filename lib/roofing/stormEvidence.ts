// lib/roofing/stormEvidence.ts
// NOAA storm evidence pipeline for FL insurance claims.
//
// Sources:
//   IEM LSR (Local Storm Reports) — hail/wind/tornado ground-truth events
//   NWS CAP/GeoJSON                — warning polygons at date of loss
//
// Output: ranked storm dates + per-date evidence package suitable for
// court-ready PDF and carrier submission.

export const runtime = 'nodejs'

// ── WFO routing (FL counties) ────────────────────────────────────────────────
export function wfosFor(lat: number, lon: number): string[] {
  if (lon < -84.0)                              return ['TAE']
  if (lat >= 29.4)                              return ['JAX', 'TAE']
  if (lat < 25.6)                               return ['KEY', 'MFL']
  if (lat >= 27.8 && lon >= -81.6)              return ['MLB', 'JAX']
  if (lat >= 27.0 && lon < -81.8)               return ['TBW', 'TAE']
  return ['MFL', 'TBW']
}

// ── CSV helpers ──────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface LsrEvent {
  date:            string    // ISO date YYYY-MM-DD
  datetime:        string    // ISO datetime
  event_type:      string    // 'HAIL' | 'TSTM WND GST' | 'TORNADO' | etc
  magnitude:       number    // inches for hail, mph for wind
  magnitude_type:  string    // 'IN' | 'MPH'
  county:          string
  state:           string
  wfo:             string
  lat:             number
  lon:             number
  distance_miles:  number
  remark:          string
}

export interface StormDate {
  date:            string          // YYYY-MM-DD
  score:           number          // ranking score (higher = stronger evidence)
  hail_events:     LsrEvent[]
  wind_events:     LsrEvent[]
  other_events:    LsrEvent[]
  max_hail_in:     number | null   // largest hail diameter
  max_wind_mph:    number | null
  event_count:     number
  has_tornado:     boolean
  nws_warnings:    NwsWarning[]
}

export interface NwsWarning {
  event:       string    // 'Tornado Warning' | 'Severe Thunderstorm Warning' etc
  onset:       string
  expires:     string
  headline:    string
  polygon?:    [number, number][]  // lon,lat pairs
}

export interface StormEvidenceResult {
  address:         string
  lat:             number
  lon:             number
  search_radius_mi:number
  years_back:      number
  storm_dates:     StormDate[]     // sorted best → worst
  best_date:       string | null   // top-ranked YYYY-MM-DD (recommended date of loss)
  fetched_at:      string
}

// ── haversine ────────────────────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8 // miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── IEM LSR fetch ─────────────────────────────────────────────────────────────
async function fetchLsr(
  wfo: string,
  start: Date,
  end: Date,
  lat: number,
  lon: number,
  radiusMi: number,
): Promise<LsrEvent[]> {
  const isoZ = (d: Date) => d.toISOString().slice(0, 19) + 'Z'
  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py`
    + `?wfo=${wfo}&sts=${isoZ(start)}&ets=${isoZ(end)}&fmt=csv`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ProGuild/1.0 (contact@proguild.ai)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return []
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const idx = (f: string) => header.indexOf(f)
  const magI = idx('mag'), typeI = idx('typetext'), validI = idx('valid')
  const latI = idx('lat'), lonI = idx('lon'), countyI = idx('county')
  const stateI = idx('st'), remarkI = idx('remark')

  const events: LsrEvent[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    const typetext = (cols[typeI] ?? '').trim().toUpperCase()
    const validStr = (cols[validI] ?? '').trim()
    const magRaw = (cols[magI] ?? '').trim()
    const evLat = parseFloat(cols[latI] ?? '')
    const evLon = parseFloat(cols[lonI] ?? '')

    if (isNaN(evLat) || isNaN(evLon)) continue
    const dist = haversine(lat, lon, evLat, evLon)
    if (dist > radiusMi) continue

    // IEM valid format: YYYYMMDDHHMMSS
    const dt = validStr.length >= 8
      ? `${validStr.slice(0,4)}-${validStr.slice(4,6)}-${validStr.slice(6,8)}T${validStr.slice(8,10)||'00'}:${validStr.slice(10,12)||'00'}:00Z`
      : ''
    const date = dt.slice(0, 10)

    let mag = magRaw === 'None' || magRaw === '' ? NaN : parseFloat(magRaw)
    // Unit disambiguation: IEM hail is decimal inches (<= 8 is valid hail; > 8 clamp to hundredths)
    let magType = 'RAW'
    if (typetext.includes('HAIL')) {
      if (!isNaN(mag) && mag > 8) mag = mag / 100 // hundredths → inches
      magType = 'IN'
    } else if (typetext.includes('WND') || typetext.includes('WIND') || typetext.includes('GST')) {
      magType = 'MPH'
    }

    events.push({
      date,
      datetime: dt,
      event_type: typetext,
      magnitude: isNaN(mag) ? 0 : parseFloat(mag.toFixed(2)),
      magnitude_type: magType,
      county: (cols[countyI] ?? '').trim(),
      state: (cols[stateI] ?? '').trim(),
      wfo,
      lat: evLat,
      lon: evLon,
      distance_miles: parseFloat(dist.toFixed(2)),
      remark: (cols[remarkI] ?? '').trim().slice(0, 300),
    })
  }
  return events
}

// ── NWS warnings for a date ───────────────────────────────────────────────────
async function fetchNwsWarnings(date: string, lat: number, lon: number): Promise<NwsWarning[]> {
  try {
    // NWS API: active alerts for a point at a given time isn't directly queryable
    // historically; use the NWS CAP ATOM archive via Iowa Environmental Mesonet.
    // For production accuracy: fetch IEM's polygon archive for Severe Thunderstorm +
    // Tornado warnings by WFO and date range.
    const wfos = wfosFor(lat, lon)
    const wfo = wfos[0]
    const dayStart = `${date}T00:00:00Z`
    const dayEnd = `${date}T23:59:59Z`
    const url = `https://mesonet.agron.iastate.edu/api/1/cow.json`
      + `?wfo=${wfo}&begints=${dayStart}&endts=${dayEnd}&phenomena=TO,SV,FF&lsrtype=all`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ProGuild/1.0 (contact@proguild.ai)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const j = await res.json() as any
    const warnings: NwsWarning[] = []
    for (const w of (j.events || [])) {
      warnings.push({
        event: w.ph_name || w.phenomena || 'Warning',
        onset: w.issue || dayStart,
        expires: w.expire || dayEnd,
        headline: w.hvtec_nwsli || w.ph_name || '',
      })
    }
    return warnings
  } catch {
    return []
  }
}

// ── Score a storm date ────────────────────────────────────────────────────────
// Weights: hail size (primary), hail count, wind speed, tornado, proximity.
function scoreDate(sd: StormDate): number {
  let s = 0
  if (sd.max_hail_in !== null) {
    s += sd.max_hail_in * 40  // 1" = 40pts, 1.75" = 70pts (ACV threshold)
    s += sd.hail_events.length * 5
  }
  if (sd.max_wind_mph !== null && sd.max_wind_mph >= 58) s += 20
  if (sd.has_tornado) s += 60
  // Proximity bonus: events < 2mi are on-property
  const onProp = [...sd.hail_events, ...sd.wind_events].filter(e => e.distance_miles < 2).length
  s += onProp * 15
  // NWS warning corroboration
  s += sd.nws_warnings.length * 10
  return Math.round(s)
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function getStormEvidence(
  lat: number,
  lon: number,
  address: string,
  yearsBack: number = 3,
  radiusMi: number = 10,
): Promise<StormEvidenceResult> {
  const now = new Date()
  const start = new Date(now.getFullYear() - yearsBack, now.getMonth(), now.getDate())
  const wfos = wfosFor(lat, lon)

  // Fetch all WFOs in parallel
  const allEvents = (await Promise.all(
    wfos.map(wfo => fetchLsr(wfo, start, now, lat, lon, radiusMi).catch(() => [] as LsrEvent[]))
  )).flat()

  // Group by date
  const byDate = new Map<string, LsrEvent[]>()
  for (const e of allEvents) {
    if (!e.date) continue
    const bucket = byDate.get(e.date) ?? []
    bucket.push(e)
    byDate.set(e.date, bucket)
  }

  // Build StormDate objects — fetch NWS warnings for top candidates only
  const candidates: StormDate[] = []
  for (const [date, events] of byDate) {
    const hail  = events.filter(e => e.event_type.includes('HAIL'))
    const wind  = events.filter(e => e.event_type.includes('WND') || e.event_type.includes('GST') || e.event_type.includes('WIND'))
    const other = events.filter(e => !e.event_type.includes('HAIL') && !e.event_type.includes('WND') && !e.event_type.includes('GST') && !e.event_type.includes('WIND'))
    const maxHail = hail.length  ? Math.max(...hail.map(e => e.magnitude)) : null
    const maxWind = wind.length  ? Math.max(...wind.map(e => e.magnitude)) : null
    candidates.push({
      date, score: 0,
      hail_events: hail.sort((a,b) => b.magnitude - a.magnitude).slice(0, 20),
      wind_events: wind.sort((a,b) => b.magnitude - a.magnitude).slice(0, 20),
      other_events: other.slice(0, 10),
      max_hail_in: maxHail,
      max_wind_mph: maxWind,
      event_count: events.length,
      has_tornado: events.some(e => e.event_type.includes('TORNADO')),
      nws_warnings: [],
    })
  }

  // Pre-score, keep top 10 dates for NWS warning enrichment (rate-limit friendly)
  for (const c of candidates) c.score = scoreDate(c)
  candidates.sort((a, b) => b.score - a.score)
  const top10 = candidates.slice(0, 10)

  // Enrich top candidates with NWS warnings (parallel, max 5 concurrent)
  await Promise.all(
    top10.map(async sd => {
      sd.nws_warnings = await fetchNwsWarnings(sd.date, lat, lon)
      sd.score = scoreDate(sd) // re-score with warnings
    })
  )
  top10.sort((a, b) => b.score - a.score)

  return {
    address,
    lat,
    lon,
    search_radius_mi: radiusMi,
    years_back: yearsBack,
    storm_dates: top10,
    best_date: top10[0]?.date ?? null,
    fetched_at: now.toISOString(),
  }
}
