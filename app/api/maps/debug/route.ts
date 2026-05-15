/**
 * app/api/maps/debug/route.ts
 *
 * Diagnostic endpoint for Google Maps / Places API issues.
 * Staging only — tests every layer of the Places autocomplete stack
 * server-side so you get a single URL result with no browser digging needed.
 *
 * Usage:
 *   GET /api/maps/debug            — full diagnostic (all tests)
 *   GET /api/maps/debug?mode=autocomplete  — test Places Autocomplete API only
 *   GET /api/maps/debug?mode=places-new    — test Places API (New) only
 *   GET /api/maps/debug?mode=maps-js       — test Maps JS load with server key
 *   GET /api/maps/debug?mode=maps-js-browser — test Maps JS with JS key + referer
 *   GET /api/maps/debug?mode=geocode       — test Geocoding API only
 *   GET /api/maps/debug?mode=js-key        — check env var presence only
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SERVER_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''
const JS_KEY     = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''

const TEST_ADDRESS   = '1704 Avondale Avenue, Jacksonville, FL 32205'
const TEST_PARTIAL   = '1704 Avon'  // simulates user typing in autocomplete

export async function GET(req: NextRequest) {
  // Staging guard
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development'
  if (env === 'production') {
    return NextResponse.json({ error: 'Debug endpoint disabled in production' }, { status: 403 })
  }

  const mode    = req.nextUrl.searchParams.get('mode') ?? 'all'
  const address = req.nextUrl.searchParams.get('address') ?? TEST_ADDRESS

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    mode,
    env,
  }

  // ── 1. Env var presence check ─────────────────────────────────────────────
  results.env_vars = {
    GOOGLE_SOLAR_API_KEY:
      SERVER_KEY
        ? `${SERVER_KEY.slice(0, 8)}...${SERVER_KEY.slice(-4)} (${SERVER_KEY.length} chars) ✅`
        : 'MISSING ❌',
    NEXT_PUBLIC_GOOGLE_MAPS_KEY:
      JS_KEY
        ? `${JS_KEY.slice(0, 8)}...${JS_KEY.slice(-4)} (${JS_KEY.length} chars) ✅`
        : 'MISSING ❌',
    keys_match:
      SERVER_KEY && JS_KEY
        ? SERVER_KEY === JS_KEY
          ? 'SAME KEY ⚠️ (acceptable but unusual — referrer restrictions apply to both)'
          : 'DIFFERENT KEYS ✅ (expected — server key unrestricted, JS key referrer-restricted)'
        : 'N/A',
  }

  if (mode === 'js-key') {
    return NextResponse.json(results, { status: 200 })
  }

  // ── 2. Geocoding API (baseline — confirms server key works at all) ─────────
  if (mode === 'all' || mode === 'geocode') {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json` +
        `?address=${encodeURIComponent(address)}&key=${SERVER_KEY}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const json = await res.json() as {
        status: string
        results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>
        error_message?: string
      }
      results.geocoding_api = {
        http_status: res.status,
        api_status:  json.status,
        error:       json.error_message ?? null,
        first_result: json.results?.[0]
          ? { formatted_address: json.results[0].formatted_address, lat: json.results[0].geometry.location.lat, lng: json.results[0].geometry.location.lng }
          : null,
        verdict: json.status === 'OK'
          ? `✅ Geocoding API working — ${json.results?.[0]?.formatted_address}`
          : `❌ Geocoding failed: ${json.status} — ${json.error_message ?? ''}`,
      }
    } catch (e) {
      results.geocoding_api = { error: String(e).slice(0, 200), verdict: '❌ Geocoding API request threw an exception' }
    }
  }

  // ── 3. Places Autocomplete API (server-side — this is what the JS widget calls) ──
  if (mode === 'all' || mode === 'autocomplete') {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(TEST_PARTIAL)}&types=address&components=country:us&key=${SERVER_KEY}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const json = await res.json() as {
        status: string
        predictions?: Array<{ description: string; place_id: string }>
        error_message?: string
      }
      results.places_autocomplete_legacy = {
        http_status:      res.status,
        api_status:       json.status,
        error:            json.error_message ?? null,
        prediction_count: json.predictions?.length ?? 0,
        sample_predictions: json.predictions?.slice(0, 3).map(p => p.description) ?? [],
        verdict: json.status === 'OK'
          ? `✅ Places Autocomplete (Legacy) working — ${json.predictions?.length} predictions for "${TEST_PARTIAL}"`
          : `❌ Places Autocomplete (Legacy) BROKEN: ${json.status} — ${json.error_message ?? 'no message'}`,
        note: 'This is the API the Maps JS Autocomplete widget uses. If this fails, autocomplete will not work in the browser regardless of JS key.',
      }
    } catch (e) {
      results.places_autocomplete_legacy = { error: String(e).slice(0, 200), verdict: '❌ Places Autocomplete request threw' }
    }
  }

  // ── 4. Places API (New) — Text Search ────────────────────────────────────
  if (mode === 'all' || mode === 'places-new') {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-Goog-Api-Key':  SERVER_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
        },
        body: JSON.stringify({ textQuery: address }),
        signal: AbortSignal.timeout(8000),
      })
      const json = await res.json() as {
        places?: Array<{ id: string; displayName?: { text: string }; formattedAddress: string }>
        error?: { message: string; status: string }
      }
      results.places_api_new = {
        http_status:  res.status,
        api_status:   res.status === 200 ? 'OK' : (json.error?.status ?? 'ERROR'),
        error:        json.error?.message ?? null,
        result_count: json.places?.length ?? 0,
        first_result: json.places?.[0]
          ? { id: json.places[0].id, name: json.places[0].displayName?.text, address: json.places[0].formattedAddress }
          : null,
        verdict: res.status === 200 && (json.places?.length ?? 0) > 0
          ? `✅ Places API (New) working — ${json.places?.length} results`
          : `❌ Places API (New) BROKEN: HTTP ${res.status} — ${json.error?.message ?? 'no results'}`,
        note: 'Maps JS v3.56+ Autocomplete widget requires Places API (New) to be enabled in GCP.',
      }
    } catch (e) {
      results.places_api_new = { error: String(e).slice(0, 200), verdict: '❌ Places API (New) request threw' }
    }
  }

  // ── 5. Maps JS API load — server key (no referrer restriction) ───────────
  if (mode === 'all' || mode === 'maps-js') {
    try {
      const url = `https://maps.googleapis.com/maps/api/js?key=${SERVER_KEY}&libraries=places`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const body = await res.text()

      const errors = {
        InvalidKeyMapError:        body.includes('InvalidKeyMapError'),
        ApiProjectMapError:        body.includes('ApiProjectMapError'),
        RefererNotAllowedMapError: body.includes('RefererNotAllowedMapError'),
        OverDailyLimitMapError:    body.includes('OverDailyLimitMapError'),
        ApiNotActivatedMapError:   body.includes('ApiNotActivatedMapError'),
        MapsApiDeprecatedError:    body.includes('MapsApiDeprecatedError'),
      }
      const hasError   = Object.values(errors).some(Boolean)
      const hasPlaces  = body.includes('Autocomplete') && body.length > 50000
      const foundError = Object.entries(errors).find(([, v]) => v)?.[0] ?? null

      results.maps_js_server_key = {
        http_status:      res.status,
        response_size_kb: Math.round(body.length / 1024),
        has_places_autocomplete_class: hasPlaces,
        errors_found:     errors,
        verdict: !hasError && hasPlaces
          ? `✅ Maps JS loaded with Places library (${Math.round(body.length / 1024)}KB) — Autocomplete class present`
          : !hasError
          ? `⚠️ Maps JS loaded (${Math.round(body.length / 1024)}KB) but Places/Autocomplete class NOT found — may be loading async`
          : `❌ Maps JS error in response body: ${foundError}`,
        note: 'Uses server key — no referrer restriction. If this fails, it is a billing/API enablement issue.',
      }
    } catch (e) {
      results.maps_js_server_key = { error: String(e).slice(0, 200), verdict: '❌ Maps JS request threw' }
    }
  }

  // ── 6. Maps JS API load — JS key + staging referer (simulates browser) ───
  if ((mode === 'all' || mode === 'maps-js-browser') && JS_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/js?key=${JS_KEY}&libraries=places`
      const res = await fetch(url, {
        headers: {
          'Referer': 'https://staging.proguild.ai/',
          'Origin':  'https://staging.proguild.ai',
        },
        signal: AbortSignal.timeout(10000),
      })
      const body = await res.text()

      const errors = {
        InvalidKeyMapError:        body.includes('InvalidKeyMapError'),
        ApiProjectMapError:        body.includes('ApiProjectMapError'),
        RefererNotAllowedMapError: body.includes('RefererNotAllowedMapError'),
        OverDailyLimitMapError:    body.includes('OverDailyLimitMapError'),
        ApiNotActivatedMapError:   body.includes('ApiNotActivatedMapError'),
      }
      const hasError   = Object.values(errors).some(Boolean)
      const foundError = Object.entries(errors).find(([, v]) => v)?.[0] ?? null

      results.maps_js_browser_key_staging_referer = {
        http_status:      res.status,
        response_size_kb: Math.round(body.length / 1024),
        errors_found:     errors,
        verdict: !hasError
          ? `✅ Maps JS loads with JS key from staging.proguild.ai referer`
          : `❌ Maps JS error: ${foundError} — ${
              errors.RefererNotAllowedMapError
                ? 'staging.proguild.ai is NOT in the JS key HTTP referrer allowlist in GCP'
                : errors.InvalidKeyMapError
                ? 'JS key is invalid or restricted'
                : errors.ApiNotActivatedMapError
                ? 'Maps JavaScript API not enabled on the JS key'
                : 'see errors_found for details'
            }`,
        note: 'Simulates exactly what the browser does when a user opens Add Property on staging.',
      }
    } catch (e) {
      results.maps_js_browser_key_staging_referer = { error: String(e).slice(0, 200), verdict: '❌ Maps JS (browser sim) request threw' }
    }
  } else if (mode === 'all' && !JS_KEY) {
    results.maps_js_browser_key_staging_referer = {
      verdict: '❌ Skipped — NEXT_PUBLIC_GOOGLE_MAPS_KEY is not set',
    }
  }

  // ── 7. Summary ────────────────────────────────────────────────────────────
  const testKeys = [
    'geocoding_api',
    'places_autocomplete_legacy',
    'places_api_new',
    'maps_js_server_key',
    'maps_js_browser_key_staging_referer',
  ]
  const verdicts = testKeys
    .filter(k => results[k] !== undefined)
    .map(k => {
      const v = (results[k] as Record<string, unknown>)?.verdict as string ?? ''
      return `${v}`
    })

  results.summary = {
    passing: verdicts.filter(v => v.startsWith('✅')).length,
    warning: verdicts.filter(v => v.startsWith('⚠️')).length,
    failing: verdicts.filter(v => v.startsWith('❌')).length,
    verdicts,
    diagnosis: (() => {
      const ac  = (results.places_autocomplete_legacy as Record<string, unknown>)?.verdict as string ?? ''
      const jsB = (results.maps_js_browser_key_staging_referer as Record<string, unknown>)?.verdict as string ?? ''
      const jsS = (results.maps_js_server_key as Record<string, unknown>)?.verdict as string ?? ''
      const pn  = (results.places_api_new as Record<string, unknown>)?.verdict as string ?? ''

      if (jsB.includes('RefererNotAllowedMapError'))
        return '🔑 FIX: Add staging.proguild.ai/* to JS key HTTP referrer allowlist in GCP Console → APIs & Services → Credentials'
      if (jsB.includes('ApiNotActivatedMapError') || jsS.includes('ApiNotActivatedMapError'))
        return '🔑 FIX: Enable "Maps JavaScript API" in GCP Console → APIs & Services → Library'
      if (ac.includes('❌') && pn.includes('❌'))
        return '🔑 FIX: Enable both "Places API" and "Places API (New)" in GCP Console → APIs & Services → Library'
      if (ac.includes('❌') && pn.includes('✅'))
        return '🔑 FIX: Enable "Places API" (legacy) in GCP Console — Places API (New) works but legacy Autocomplete widget needs the old one too'
      if (ac.includes('✅') && jsB.includes('❌'))
        return '🔑 FIX: Server-side APIs work but browser JS key has an issue — check referrer allowlist and API restrictions on NEXT_PUBLIC_GOOGLE_MAPS_KEY'
      if (ac.includes('✅') && jsB.includes('✅'))
        return '✅ All server-side APIs work and JS key loads from staging — issue is likely in the client-side initAutocomplete() code. Check browser console for JS errors.'
      return '⚠️ Could not determine specific cause — review individual test results above'
    })(),
  }

  return NextResponse.json(results, { status: 200, headers: { 'Content-Type': 'application/json' } })
}
