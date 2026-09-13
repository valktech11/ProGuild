// lib/notifications.ts
// Central helper for inserting pro_notifications rows and sending FCM push.
// All notification inserts go through here so the schema stays consistent.

import { getSupabaseAdmin } from '@/lib/supabase'

export type NotificationType =
  | 'lead_assigned'
  | 'lead_unassigned'
  | 'job_won'
  | 'estimate_approved'
  | 'new_lead_created'
  | 'trial_expiry_reminder'

interface NotifyParams {
  proId: string          // recipient
  companyId: string | null
  type: NotificationType
  title: string
  body?: string
  leadId?: string | null
}

export async function notify(params: NotifyParams): Promise<void> {
  try {
    await getSupabaseAdmin().from('pro_notifications').insert({
      pro_id:     params.proId,
      company_id: params.companyId,
      type:       params.type,
      title:      params.title,
      body:       params.body ?? null,
      lead_id:    params.leadId ?? null,
    })
  } catch {
    // Non-fatal — never let notification failure break the main operation
  }
}

// Notify all owners of a company except the actor themselves
export async function notifyOwners(
  companyId: string,
  actorProId: string,
  params: Omit<NotifyParams, 'proId' | 'companyId'>
): Promise<void> {
  try {
    const sb = getSupabaseAdmin()
    const { data: owners } = await sb
      .from('company_members')
      .select('pro_id')
      .eq('company_id', companyId)
      .eq('role', 'owner')
      .neq('pro_id', actorProId)
    
    if (!owners?.length) return
    
    await sb.from('pro_notifications').insert(
      owners.map(o => ({
        pro_id:     o.pro_id,
        company_id: companyId,
        type:       params.type,
        title:      params.title,
        body:       params.body ?? null,
        lead_id:    params.leadId ?? null,
      }))
    )
  } catch {
    // Non-fatal
  }
}

// ── FCM Push ──────────────────────────────────────────────────────────────────
// Sends a device push notification via FCM HTTP v1 API.
// Requires FIREBASE_SERVICE_ACCOUNT env var (JSON string of the service account key).
// Non-fatal: if FCM fails the in-app notification (pro_notifications row) still exists.

export async function sendPushToFcmToken(
  fcmToken: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!serviceAccountRaw) {
      console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT not set — skipping push')
      return
    }

    const serviceAccount = JSON.parse(serviceAccountRaw)
    const projectId = serviceAccount.project_id

    // Get OAuth2 access token using JWT (service account)
    const accessToken = await getFirebaseAccessToken(serviceAccount)

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title, body },
            android: {
              priority: 'high',
              notification: { sound: 'default', channel_id: 'leads' },
            },
            apns: {
              payload: { aps: { sound: 'default', badge: 1 } },
            },
          },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('[FCM] Send failed:', res.status, err)
    } else {
      console.log('[FCM] Push sent to token:', fcmToken.slice(0, 20) + '...')
    }
  } catch (e) {
    console.error('[FCM] sendPushToFcmToken error (non-fatal):', e)
  }
}

// Minimal JWT / OAuth2 implementation for Firebase service account.
// Uses Web Crypto API (available in Next.js Edge + Node.js 18+).
async function getFirebaseAccessToken(serviceAccount: {
  client_email: string
  private_key: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  // Encode JWT header + claim
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify(claim))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${header}.${payload}`

  // Import private key
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${sig}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token: string }
  return tokenData.access_token
}
