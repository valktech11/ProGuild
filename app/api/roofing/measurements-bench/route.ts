// app/api/roofing/measurements-bench/route.ts
// GET /api/roofing/measurements-bench
// Staging-only — runs the measurement engine against a fixed set of benchmark
// properties (each with Roofr ground-truth baked in) and renders an HTML
// comparison table. One link, no params. Lets us see accuracy across roof
// types at a glance instead of running addresses one at a time.

export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { runDsmAnalysis } from '@/lib/roofing/dsmAnalysis'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

// Ground truth from Roofr reports (whole feet). facets = Roofr's facet count.
const BENCH: Array<{
  label: string; address: string;
  truth: { ridge: number; hip: number; valley: number; eave: number; rake: number; facets: number }
}> = [
  { label: '3985 Silverpoint Ln, Jacksonville FL', address: '3985 Silverpoint Lane, Jacksonville, FL 32216',
    truth: { ridge: 121, hip: 396, valley: 212, eave: 557, rake: 13, facets: 33 } },
  { label: '3919 Highgate Ct, Jacksonville FL',    address: '3919 Highgate Court, Jacksonville, FL 32216',
    truth: { ridge: 29, hip: 149, valley: 37, eave: 224, rake: 53, facets: 22 } },
  { label: '1704 Avondale Ave, Jacksonville FL',   address: '1704 Avondale Avenue, Jacksonville, FL 32205',
    truth: { ridge: 83, hip: 125, valley: 49, eave: 341, rake: 78, facets: 22 } },
  { label: '17507 Cypress Hilltop Way, Hockley TX', address: '17507 Cypress Hilltop Way, Hockley, TX',
    truth: { ridge: 78, hip: 238, valley: 105, eave: 317, rake: 45, facets: 22 } },
  { label: '3696 Walnut Brook Dr, Rochester Hills MI', address: '3696 Walnut Brook Drive, Rochester Hills, MI',
    truth: { ridge: 173, hip: 170, valley: 188, eave: 298, rake: 144, facets: 23 } },
]

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`)
  const j = await res.json()
  const loc = j?.results?.[0]?.geometry?.location
  return loc ? { lat: loc.lat, lng: loc.lng } : null
}

export async function GET(_req: NextRequest) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
    return new NextResponse('Not available in production', { status: 403 })
  }
  if (!GOOGLE_KEY) return new NextResponse('GOOGLE_SOLAR_API_KEY not configured', { status: 503 })

  type Row = {
    label: string
    truth: typeof BENCH[number]['truth']
    got: { ridge: number; hip: number; valley: number; eave: number; rake: number; facets: number } | null
    error: string | null
  }

  const rows: Row[] = []
  for (const b of BENCH) {
    try {
      const c = await geocode(b.address)
      if (!c) { rows.push({ label: b.label, truth: b.truth, got: null, error: 'geocode failed' }); continue }
      const lf = await runDsmAnalysis(c.lat, c.lng, GOOGLE_KEY)
      if (!lf) { rows.push({ label: b.label, truth: b.truth, got: null, error: 'no roof planes' }); continue }
      rows.push({
        label: b.label, truth: b.truth,
        got: { ridge: lf.ridge_ft, hip: lf.hip_ft, valley: lf.valley_ft, eave: lf.eave_ft, rake: lf.rake_ft, facets: lf.facet_count },
        error: null,
      })
    } catch (e) {
      rows.push({ label: b.label, truth: b.truth, got: null, error: String(e).slice(0, 120) })
    }
  }

  // ── Render HTML table ──────────────────────────────────────────────────────
  const pctErr = (got: number, exp: number): number => exp > 0 ? Math.round((got - exp) / exp * 100) : (got === 0 ? 0 : 999)
  const cell = (got: number, exp: number): string => {
    const e = pctErr(got, exp)
    const abs = Math.abs(e)
    const color = abs <= 15 ? '#16a34a' : abs <= 40 ? '#ca8a04' : '#dc2626'
    return `<td style="text-align:right;padding:6px 10px"><b>${got}</b> <span style="color:${color};font-size:12px">(${e > 0 ? '+' : ''}${e}%)</span><br><span style="color:#94a3b8;font-size:11px">truth ${exp}</span></td>`
  }
  const facetCell = (got: number, exp: number): string => {
    const ratio = exp > 0 ? got / exp : 1
    const color = ratio >= 0.85 ? '#16a34a' : ratio >= 0.6 ? '#ca8a04' : '#dc2626'
    return `<td style="text-align:right;padding:6px 10px"><b style="color:${color}">${got}</b> <span style="color:#94a3b8;font-size:11px">/ ${exp}</span></td>`
  }

  const body = rows.map(r => {
    if (!r.got) {
      return `<tr><td style="padding:6px 10px">${r.label}</td><td colspan="6" style="color:#dc2626;padding:6px 10px">${r.error}</td></tr>`
    }
    const g = r.got, t = r.truth
    // "score": count of edges within 40% as a rough X/5
    const edges: Array<[number, number]> = [[g.ridge, t.ridge], [g.hip, t.hip], [g.valley, t.valley], [g.eave, t.eave], [g.rake, t.rake]]
    const score = edges.filter(([gv, tv]) => Math.abs(pctErr(gv, tv)) <= 40).length
    return `<tr>
      <td style="padding:6px 10px">${r.label}</td>
      ${facetCell(g.facets, t.facets)}
      ${cell(g.ridge, t.ridge)}
      ${cell(g.hip, t.hip)}
      ${cell(g.valley, t.valley)}
      ${cell(g.eave, t.eave)}
      ${cell(g.rake, t.rake)}
      <td style="text-align:center;padding:6px 10px;font-weight:700">${score}/5</td>
    </tr>`
  }).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ProGuild Measurement Benchmark</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;margin:24px;color:#0f172a}
  table{border-collapse:collapse;font-size:13px;width:100%}
  th{background:#0f766e;color:#fff;padding:8px 10px;text-align:right;font-size:12px}
  th:first-child{text-align:left}
  tr:nth-child(even){background:#f8fafc}
  td{border-bottom:1px solid #e2e8f0}
  .legend{margin-top:14px;font-size:12px;color:#64748b}
  .legend b{color:#16a34a}.legend i{color:#ca8a04;font-style:normal}.legend s{color:#dc2626;text-decoration:none}</style></head>
  <body>
  <h2 style="margin:0 0 4px">ProGuild Linear Footage — Benchmark vs Roofr</h2>
  <div style="color:#64748b;font-size:13px;margin-bottom:14px">Generated ${new Date().toISOString()} · green ≤15% · amber ≤40% · red >40% · facets colored by recovery ratio</div>
  <table>
    <tr><th>Property</th><th>Facets</th><th>Ridge</th><th>Hip</th><th>Valley</th><th>Eave</th><th>Rake</th><th>Score</th></tr>
    ${body}
  </table>
  <div class="legend">
    <p><b>Facets</b> = ProGuild detected / Roofr truth. Low ratio = RANSAC under-segmentation (the accuracy ceiling).</p>
    <p>Each LF cell: <b>bold</b> = ProGuild value, colored % = error vs Roofr, grey = Roofr truth.</p>
    <p>Score = edges within 40% (rough X/5). Eave/rake currently split ~50/50 by the perimeter tracer (known separate bug).</p>
  </div>
  </body></html>`

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
}
