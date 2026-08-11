// GET  /api/roof-size-calculator?address=<string>
//      Returns { sqft, squares, pitch, imageryDate, lat, lng, formattedAddress }
//
// POST /api/roof-size-calculator
//      Body: { name, email, phone, address, sqft, squares, pitch }
//      Creates a lead tagged lead_source: 'roof_calculator' assigned to the org pro.
//      No auth required — public endpoint.

import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocode'
import { getSupabaseAdmin } from '@/lib/supabase'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

// ── The org pro that receives calculator leads ────────────────────────────────
// valktech11@gmail.com — same UUID on staging and prod.
// Override via ROOF_CALC_PRO_ID env var if needed without a redeploy.
const ORG_PRO_ID = process.env.ROOF_CALC_PRO_ID || '4dd8236f-7f4e-43d2-a834-6ed0c08ec689'

// ═══════════════════════════════════════════════════════════════════════════
// ABUSE PROTECTION — this is a PUBLIC, UNAUTHENTICATED endpoint that calls a
// BILLABLE Google API. Without these controls a single script could run up an
// unbounded bill. Three layers, cheapest first:
//
//   1. CACHE       — the same address always yields the same roof. A cache hit
//                    costs zero Google calls. This is the biggest saver, and it
//                    means a page that goes viral on one address is free.
//   2. IP LIMIT    — caps how many *uncached* lookups one IP can trigger.
//   3. DAILY CAP   — a global circuit breaker. Even under a distributed attack,
//                    this bounds the worst-case spend for the day.
//
// State lives in Postgres (roof_calc_lookups), NOT in memory: Vercel runs many
// serverless instances, so an in-memory counter would be enforced per-instance
// and the real limit would be N x instances. Shared state is the only correct
// way to do this.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_DAYS     = 30    // a roof does not change size; 30d is conservative
const IP_LOOKUPS_PER_HR  = Number(process.env.ROOF_CALC_IP_LIMIT   || 15)
const IP_LEADS_PER_HR    = Number(process.env.ROOF_CALC_LEAD_LIMIT || 3)
const GLOBAL_CALLS_PER_DAY = Number(process.env.ROOF_CALC_DAILY_CAP || 500)

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

// Normalise so "123 Main St " and "123 main st" are one cache key.
function addressKey(address: string): string {
  return address.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Cached roof result for this address, or null. Zero Google spend on a hit.
async function readCache(key: string) {
  const since = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString()
  const { data } = await getSupabaseAdmin()
    .from('roof_calc_lookups')
    .select('result')
    .eq('address_key', key)
    .not('result', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.result as Record<string, unknown> | undefined) ?? null
}

// How many *billable* (uncached) lookups has this IP triggered in the last hour?
async function ipLookupsLastHour(ip: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await getSupabaseAdmin()
    .from('roof_calc_lookups')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('billable', true)
    .eq('kind', 'lookup')
    .gte('created_at', since)
  return count ?? 0
}

// Global billable calls today — the circuit breaker.
async function globalCallsToday(): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count } = await getSupabaseAdmin()
    .from('roof_calc_lookups')
    .select('id', { count: 'exact', head: true })
    .eq('billable', true)
    .eq('kind', 'lookup')
    .gte('created_at', since.toISOString())
  return count ?? 0
}

async function recordLookup(
  key: string, ip: string, billable: boolean, result: Record<string, unknown> | null,
) {
  await getSupabaseAdmin().from('roof_calc_lookups').insert({
    address_key: key, ip_address: ip, billable, kind: 'lookup', result,
  })
}

// Lead-submission rate limit — stops the form being used as a spam cannon.
// Counted in roof_calc_lookups (kind='lead') rather than by adding a column to
// the core `leads` table, which is audited and shared across the whole product.
async function leadsLastHour(ip: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await getSupabaseAdmin()
    .from('roof_calc_lookups')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('kind', 'lead')
    .gte('created_at', since)
  return count ?? 0
}

async function recordLeadSubmission(ip: string, key: string) {
  await getSupabaseAdmin().from('roof_calc_lookups').insert({
    address_key: key, ip_address: ip, billable: false, kind: 'lead', result: null,
  })
}


// ── Solar API ─────────────────────────────────────────────────────────────────
async function fetchSolarData(lat: number, lng: number) {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}` +
    `&requiredQuality=LOW&key=${GOOGLE_KEY}`
  const res = await fetch(url, { cache: 'force-cache' }) // cache per address
  if (!res.ok) throw new Error(`Solar API ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}

function sqftFromM2(m2: number) { return m2 * 10.7639 }
function toSquares(sqft: number) { return Math.round(sqft / 100) }

// Pull the 2-letter state code out of a Google formatted address.
// Format is reliably "..., City, ST 12345, USA".
function stateFromAddress(formatted: string): string | null {
  const m = formatted.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?,?\s*USA?$/)
  return m ? m[1] : null
}

// States where ProGuild currently has licensed contractors.
// Add to this list as the network expands — the page itself stays national.
const SERVICED_STATES = new Set(['FL'])

function parseSolar(solar: Record<string, unknown>) {
  const potential = (solar.solarPotential as Record<string, unknown>) || {}
  const whole     = (potential.wholeRoofStats as Record<string, unknown>) || {}
  const segments  = (potential.roofSegmentStats as Record<string, unknown>[]) || []

  const totalSqft    = Math.round(sqftFromM2((whole.areaMeters2 as number) || 0))
  const totalSquares = toSquares(totalSqft)

  // Dominant pitch from the largest segment
  let dominantPitch = 'Unknown'
  if (segments.length) {
    const largest = segments.reduce((a: any, b: any) =>
      ((a.areaMeters2 as number) || 0) >= ((b.areaMeters2 as number) || 0) ? a : b)
    const raw = (largest.pitchDegrees as number) || 0
    const rise = Math.round(Math.tan((raw * Math.PI) / 180) * 12)
    dominantPitch = `${rise}/12`
  }

  const imgRaw = solar.imageryDate as Record<string, number> | null
  const imageryDate = imgRaw
    ? `${imgRaw.year}-${String(imgRaw.month).padStart(2,'0')}-${String(imgRaw.day).padStart(2,'0')}`
    : null

  return { totalSqft, totalSquares, dominantPitch, imageryDate }
}

// ── GET: measure roof ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim() ?? ''
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })
  if (address.length > 200) return NextResponse.json({ error: 'address too long' }, { status: 400 })

  const ip  = clientIp(req)
  const key = addressKey(address)

  // ── Layer 1: CACHE. A hit costs nothing — no geocode, no Solar API call. ──
  try {
    const cached = await readCache(key)
    if (cached) {
      // Log the hit (billable:false) so we can see the cache hit-rate later.
      void recordLookup(key, ip, false, null)
      return NextResponse.json({ ...cached, cached: true })
    }
  } catch {
    // Cache unavailable — fall through and serve live rather than fail the user.
  }

  // ── Layer 2: PER-IP RATE LIMIT on uncached (billable) lookups. ──
  try {
    if (await ipLookupsLastHour(ip) >= IP_LOOKUPS_PER_HR) {
      return NextResponse.json(
        { error: "You've reached the lookup limit for now. Please try again in an hour." },
        { status: 429 },
      )
    }
  } catch { /* limiter unavailable — do not lock users out of the tool */ }

  // ── Layer 3: GLOBAL DAILY CAP. Bounds worst-case spend under attack. ──
  try {
    if (await globalCallsToday() >= GLOBAL_CALLS_PER_DAY) {
      console.error('[roof-calc] DAILY CAP HIT — Solar API calls suspended for today')
      return NextResponse.json(
        { error: 'The calculator is temporarily at capacity. Please try again tomorrow.' },
        { status: 503 },
      )
    }
  } catch { /* cap check unavailable — proceed */ }

  const geo = await geocodeAddress(address)
  if (!geo) return NextResponse.json({ error: 'Address not found. Please try a more specific address.' }, { status: 404 })

  try {
    const solar = await fetchSolarData(geo.lat, geo.lng)
    const { totalSqft, totalSquares, dominantPitch, imageryDate } = parseSolar(solar)

    if (totalSqft === 0) {
      // Still billable — Google charged us even though the answer was unusable.
      void recordLookup(key, ip, true, null)
      return NextResponse.json({ error: 'Could not calculate roof size for this address. Try a nearby address.' }, { status: 422 })
    }

    const state = stateFromAddress(geo.formattedAddress)

    const payload = {
      sqft:             totalSqft,
      squares:          totalSquares,
      pitch:            dominantPitch,
      imageryDate,
      lat:              geo.lat,
      lng:              geo.lng,
      formattedAddress: geo.formattedAddress,
      state,
      // Whether we currently have contractors who can quote this address.
      // Drives the confirmation copy — the lead is captured either way.
      serviced:         state ? SERVICED_STATES.has(state) : false,
    }

    // Record as billable AND cache the result so this address is free next time.
    void recordLookup(key, ip, true, payload)

    return NextResponse.json(payload)
  } catch {
    void recordLookup(key, ip, true, null)
    return NextResponse.json({ error: 'Roof data unavailable for this address. Try again or enter a different address.' }, { status: 502 })
  }
}

// ── POST: capture lead ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, phone, address, sqft, squares, pitch } = body
  const state    = stateFromAddress(address ?? '')
  const serviced = state ? SERVICED_STATES.has(state) : false

  if (!name || !email || !address) {
    return NextResponse.json({ error: 'name, email and address are required' }, { status: 400 })
  }
  if (!ORG_PRO_ID) {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }
  // Basic shape checks — cheap, and they stop the crudest junk at the door.
  if (String(name).length > 100 || String(email).length > 200) {
    return NextResponse.json({ error: 'Invalid submission' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email))) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const ip = clientIp(req)

  // Rate limit lead submissions per IP — the form is public, so without this it
  // is a spam cannon pointed at the pipeline.
  try {
    if (await leadsLastHour(ip) >= IP_LEADS_PER_HR) {
      return NextResponse.json(
        { error: "You've already submitted a few requests. Please try again later." },
        { status: 429 },
      )
    }
  } catch { /* limiter unavailable — accept the lead rather than lose it */ }

  // Insert the lead
  const { data: lead, error } = await sb.from('leads').insert({
    pro_id:           ORG_PRO_ID,
    trade_slug:       'roofing',
    contact_name:     name.trim(),
    contact_email:    email.toLowerCase().trim(),
    contact_phone:    phone?.trim() || null,
    property_address: address.trim(),
    message:          `Roof size: ${sqft} sq ft (${squares} squares), pitch ${pitch}. `
                      + `State: ${state ?? 'unknown'}. `
                      + (serviced ? 'Serviced area.' : 'WAITLIST — no contractors in this state yet.')
                      + ' Submitted via roof-size-calculator.',
    lead_source:      serviced ? 'roof_calculator' : 'roof_calculator_waitlist',
    lead_status:      'new_lead',
    contact_state:    state,
  }).select('id').single()

  if (error || !lead) {
    console.error('[roof-calc] lead insert error:', error?.message)
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }

  // Count this submission against the per-IP lead limit.
  void recordLeadSubmission(ip, addressKey(String(address)))

  // Pre-fill roof size from calculator — non-fatal if it fails
  await sb.from('roofing_job_data').insert({
    lead_id:      lead.id,
    pro_id:       ORG_PRO_ID,
    square_count: squares,
  })

  return NextResponse.json({ ok: true, leadId: lead.id, serviced })
}
