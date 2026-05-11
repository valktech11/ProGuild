// lib/api/utils.ts
// Shared API utilities: validation, error responses, safe fetch
// Used by all roofing API routes

import { NextResponse } from 'next/server'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// ── Error response factory ────────────────────────────────────────────────────

export function apiError(
  message: string,
  status: number,
  detail?: unknown
): NextResponse {
  const body: Record<string, unknown> = { error: message }
  // Never expose internal details in production
  if (!IS_PRODUCTION && detail !== undefined) {
    body.detail = detail instanceof Error
      ? detail.message
      : String(detail).slice(0, 300)
  }
  return NextResponse.json(body, { status })
}

// ── Input validation ──────────────────────────────────────────────────────────

/** Validates lat/lng are finite numbers within geographic bounds */
export function validateCoordinates(
  lat: unknown,
  lng: unknown
): { valid: true; lat: number; lng: number } | { valid: false; error: string } {
  const latN = Number(lat)
  const lngN = Number(lng)
  if (!isFinite(latN) || !isFinite(lngN)) {
    return { valid: false, error: 'lat and lng must be finite numbers' }
  }
  if (latN < -90 || latN > 90) {
    return { valid: false, error: 'lat must be between -90 and 90' }
  }
  if (lngN < -180 || lngN > 180) {
    return { valid: false, error: 'lng must be between -180 and 180' }
  }
  return { valid: true, lat: latN, lng: lngN }
}

/** Validates a UUID-format string */
export function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

// ── Safe fetch with timeout and JSON parsing ──────────────────────────────────

interface FetchOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
  headers?: Record<string, string>
}

interface FetchResult<T> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

export async function safeFetch<T>(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const { method = 'GET', body, timeoutMs = 25000, headers = {} } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...headers },
    }
    if (body !== undefined) fetchOptions.body = JSON.stringify(body)

    const res = await fetch(url, fetchOptions)
    clearTimeout(timer)

    // Guard against non-JSON responses (HTML error pages, gateway timeouts)
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: res.status,
        error: `Unexpected response format (${res.status}): expected JSON, got ${contentType.split(';')[0]}`,
      }
    }

    const data = await res.json() as T
    return { ok: res.ok, status: res.status, data }

  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, status: 408, error: `Request timed out after ${timeoutMs}ms` }
    }
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── R2 client factory ─────────────────────────────────────────────────────────

import { S3Client } from '@aws-sdk/client-s3'

export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 configuration: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY required')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) throw new Error('R2_BUCKET_NAME environment variable is required')
  return bucket
}
