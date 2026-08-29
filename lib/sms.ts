// lib/sms.ts — Twilio wrapper for ProGuild SMS
//
// Two send functions:
//   sendProSms()        — contractor notifications (always allowed)
//   sendHomeownerSms()  — homeowner transactional only (review requests, status updates)
//
// Required env vars:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER  (registered 10DLC number)

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER

function toE164(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return null
  return cleaned.startsWith('1') && cleaned.length === 11
    ? `+${cleaned}`
    : `+1${cleaned.slice(-10)}`
}

async function sendSms(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn('[sms] Twilio env vars not set — SMS skipped')
    return false
  }
  const e164 = toE164(to)
  if (!e164) { console.warn('[sms] Invalid phone:', to); return false }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      },
      body: new URLSearchParams({ To: e164, From: TWILIO_FROM, Body: body }).toString(),
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

export async function sendProSms(to: string, body: string): Promise<boolean> {
  return sendSms(to, body)
}

export async function sendHomeownerSms(to: string, body: string): Promise<boolean> {
  return sendSms(to, body)
}

export function newLeadSmsBody({ contactName, city, state, dashboardUrl }: {
  contactName: string; city?: string | null; state?: string | null; dashboardUrl: string
}): string {
  const loc = [city, state].filter(Boolean).join(', ')
  return `ProGuild: New lead from ${contactName}${loc ? ` in ${loc}` : ''}. View it: ${dashboardUrl}`
}
