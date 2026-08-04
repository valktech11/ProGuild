// lib/sms.ts
//
// Thin Twilio wrapper for ProGuild SMS notifications.
//
// POLICY: We only SMS the PRO (contractor) — never homeowners.
// Pros consented to receive notifications when they signed up (Terms of Service).
// Homeowner SMS requires separate explicit opt-in and is NOT implemented here.
//
// Required env vars (Vercel):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER   (your registered 10DLC number, e.g. +12025551234)
//
// If any env var is missing, sendSms() logs a warning and returns silently —
// so missing Twilio config never breaks the lead creation flow.

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER

/**
 * Send an SMS to a pro's mobile number.
 * Fire-and-forget — never throws, so callers don't need try/catch.
 * Returns true if the message was accepted by Twilio, false otherwise.
 */
export async function sendProSms(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn('[sms] Twilio env vars not set — SMS skipped')
    return false
  }

  // Sanitise the number — must be E.164 format (+1XXXXXXXXXX)
  const cleaned = to.replace(/\D/g, '')
  if (cleaned.length < 10) {
    console.warn('[sms] Invalid phone number, skipping:', to)
    return false
  }
  const e164 = cleaned.startsWith('1') && cleaned.length === 11
    ? `+${cleaned}`
    : `+1${cleaned.slice(-10)}`

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
    const params = new URLSearchParams({ To: e164, From: TWILIO_FROM, Body: body })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const err = await res.json()
      console.error('[sms] Twilio error:', err.message, 'code:', err.code)
      return false
    }
    return true
  } catch (e) {
    console.error('[sms] fetch failed:', e)
    return false
  }
}

/**
 * Format a new-lead SMS notification for the pro.
 */
export function newLeadSmsBody({
  contactName,
  city,
  state,
  dashboardUrl,
}: {
  contactName: string
  city?: string | null
  state?: string | null
  dashboardUrl: string
}): string {
  const location = [city, state].filter(Boolean).join(', ')
  const loc = location ? ` in ${location}` : ''
  return `ProGuild: New lead from ${contactName}${loc}. View it: ${dashboardUrl}`
}
