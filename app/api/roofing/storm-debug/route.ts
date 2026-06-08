// app/api/roofing/storm-debug/route.ts
// GET /api/roofing/storm-debug — raw IEM LSR dump for diagnosing the hail-magnitude bug.
// STAGING ONLY. Read-only, no DB, no secrets — fetches public NOAA/IEM storm reports.
//
// Purpose: settle whether IEM hail MAG is decimal inches (e.g. "1.75") or hundredths
// (e.g. "175" = 1.75"), and whether "61" was a real value, a wind speed, or a parse shift.
//
// Examples:
//   /api/roofing/storm-debug?wfo=JAX
//   /api/roofing/storm-debug?lat=30.190383&lng=-81.526070&near=2026-03-16
//   /api/roofing/storm-debug?wfo=JAX,TAE&days=900

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

// Quote-aware CSV parser (REMARK contains commas/quotes).
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function wfosFor(la: number, ln: number): string[] {
  if (ln < -84.0) return ['TAE']
  if (la >= 29.4) return ['JAX', 'TAE']
  if (la < 25.6) return ['KEY', 'MFL']
  if (la >= 27.8 && ln >= -81.6) return ['MLB', 'JAX']
  if (la >= 27.0 && ln < -81.8) return ['TBW', 'TAE']
  return ['MFL', 'TBW']
}

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const wfoParam = searchParams.get('wfo')
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const days = parseInt(searchParams.get('days') || '730', 10)
  const near = searchParams.get('near') || '' // e.g. 2026-03-16

  const wfos = wfoParam
    ? wfoParam.split(',').map(w => w.trim().toUpperCase()).filter(Boolean)
    : (!isNaN(lat) && !isNaN(lng) ? wfosFor(lat, lng) : ['JAX'])

  const now = new Date()
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const isoZ = (d: Date) => d.toISOString().slice(0, 19) + 'Z'

  const perWfo = []

  for (const wfo of wfos) {
    const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py`
      + `?wfo=${wfo}&sts=${isoZ(start)}&ets=${isoZ(now)}&fmt=csv`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ProGuild/1.0' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) { perWfo.push({ wfo, url, fetch_status: res.status, error: 'non-200' }); continue }
      const text = await res.text()
      const lines = text.trim().split('\n')
      const headerRaw = lines[0] ?? ''
      const header = parseCsvLine(headerRaw).map(h => h.trim().toLowerCase())
      const idx = (f: string) => header.indexOf(f)

      const magI = idx('mag'), typeI = idx('typetext'), validI = idx('valid')
      const qualI = idx('qualify'), latI = idx('lat'), lonI = idx('lon')

      const hailMagCounts: Record<string, number> = {}
      const hailRows: unknown[] = []
      const zone61Rows: unknown[] = []   // ANY row whose parsed mag is 50–70 (tests the wind-misclass theory)
      const nearRows: unknown[] = []     // rows matching the `near` date, any type

      let totalRows = 0
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue
        totalRows++
        const cols = parseCsvLine(line)
        const magRaw = (cols[magI] ?? '').trim()
        const typetext = (cols[typeI] ?? '').trim().toUpperCase()
        const valid = (cols[validI] ?? '').trim()
        const magNum = magRaw === 'None' || magRaw === '' ? NaN : parseFloat(magRaw)

        const rowInfo = {
          valid,
          typetext,
          mag_raw: magRaw,
          mag_parsed: isNaN(magNum) ? null : magNum,
          as_inches: isNaN(magNum) ? null : magNum,        // if format is decimal inches
          as_hundredths_in: isNaN(magNum) ? null : magNum / 100, // if format is hundredths
          qualify: qualI >= 0 ? (cols[qualI] ?? '').trim() : null,
          lat: latI >= 0 ? (cols[latI] ?? '').trim() : null,
          lon: lonI >= 0 ? (cols[lonI] ?? '').trim() : null,
          cols_count: cols.length,
          header_count: header.length,
          raw_line: line.slice(0, 260),
        }

        if (typetext.includes('HAIL')) {
          hailMagCounts[magRaw] = (hailMagCounts[magRaw] || 0) + 1
          if (hailRows.length < 60) hailRows.push(rowInfo)
        }
        if (!isNaN(magNum) && magNum >= 50 && magNum <= 70 && zone61Rows.length < 30) {
          zone61Rows.push(rowInfo)
        }
        if (near && valid.includes(near.replace(/-/g, '')) && nearRows.length < 40) {
          nearRows.push(rowInfo)
        }
      }

      // Unit verdict heuristic from the hail mag distribution
      const hailMags = Object.keys(hailMagCounts).map(parseFloat).filter(n => !isNaN(n))
      const anyDecimal = hailMags.some(n => n % 1 !== 0 && n <= 8)        // 0.75, 1.25, 1.75...
      const manyBig = hailMags.filter(n => n >= 25).length                // 75, 100, 175...
      const allUnder8 = hailMags.length > 0 && hailMags.every(n => n <= 8)
      let unit_verdict: string
      if (anyDecimal || allUnder8) {
        unit_verdict = 'DECIMAL_INCHES — mag is real inches; any value >8 is an anomaly (parse shift or wind misclass). The mag>8 clamp is SAFE.'
      } else if (manyBig >= 2 && hailMags.every(n => n >= 25)) {
        unit_verdict = 'HUNDREDTHS — mag is inches×100. CORRECT FIX is parseFloat(mag)/100, NOT the clamp. The clamp would kill all real hail.'
      } else {
        unit_verdict = 'UNCLEAR — inspect hail_mag_distribution and hail_rows below.'
      }

      perWfo.push({
        wfo,
        url,
        fetch_status: 200,
        header_raw: headerRaw,
        header_parsed: header,
        mag_index: magI,
        typetext_index: typeI,
        lat_index: latI,
        lon_index: lonI,
        total_rows: totalRows,
        hail_count: Object.values(hailMagCounts).reduce((a, b) => a + b, 0),
        hail_mag_distribution: hailMagCounts,
        unit_verdict,
        zone_50_70_rows: zone61Rows,   // if a WIND row here has mag ~61, that's the misclass culprit
        near_date_rows: nearRows,
        hail_rows: hailRows,
      })
    } catch (e) {
      perWfo.push({ wfo, url, error: String(e).slice(0, 200) })
    }
  }

  return NextResponse.json({
    query: { wfos, days, near: near || null, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng },
    note: 'READ ONLY — raw IEM LSR dump for hail-magnitude diagnosis',
    results: perWfo,
  })
}
