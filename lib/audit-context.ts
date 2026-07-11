// lib/audit-context.ts
// Builds a Supabase admin client that forwards actor/source/device/IP to Postgres
// via request headers. PostgREST exposes these to the audit trigger through
// current_setting('request.headers'). See Audit & Observability Architecture §6.
//
// Usage in a route (after requirePro):
//   const db = auditedAdmin(req, { actorId: proId, actorType: 'pro' })
//   await db.from('leads').update(...)...
//
// The audit_trigger_fn reads x-pg-actor / x-pg-source / x-pg-device / x-forwarded-for.
// If these headers are absent (any legacy call path), the trigger falls back safely.

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const getUrl = () =>
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''

type ActorType = 'pro' | 'admin' | 'system' | 'homeowner'

interface AuditActor {
  actorId: string
  actorType?: ActorType
}

// Derive source platform + device + IP from the incoming request.
function requestContext(req: Request): { source: string; device: string; ip: string } {
  const h = req.headers
  const ua = h.get('user-agent') ?? ''
  // Mobile app sends an explicit X-Client-Platform: mobile header; web omits it.
  const explicit = h.get('x-client-platform')?.toLowerCase()
  const source = explicit === 'mobile' ? 'mobile'
    : explicit === 'web' ? 'web'
    // Fallback heuristic: the Flutter app's UA contains 'Dart' / 'proguild_mobile'
    : /dart|proguild_mobile|okhttp/i.test(ua) ? 'mobile'
    : 'web'
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || ''
  // Keep device descriptor compact — trim UA to 250 chars.
  const device = ua.slice(0, 250)
  return { source, device, ip }
}

export function auditedAdmin(req: Request, actor: AuditActor): SupabaseClient {
  const { source, device, ip } = requestContext(req)
  return createClient(
    getUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          'x-pg-actor': actor.actorId,
          'x-pg-actor-type': actor.actorType ?? 'pro',
          'x-pg-source': source,
          'x-pg-device': device,
          // x-forwarded-for is already a standard header PostgREST forwards;
          // set it explicitly so the trigger reads a clean single value.
          'x-forwarded-for': ip,
        },
      },
    }
  )
}
