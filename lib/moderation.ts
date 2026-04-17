// Content moderation using Claude API
// Called server-side before saving any user-generated text to DB

// Fast client-safe banned word check — catches obvious cases before API call
const BANNED_PATTERNS = [
  /\bfuck(ed|ing|er|s)?\b/i,
  /\bshit(ty|s|ter)?\b/i,
  /\bbitch(es)?\b/i,
  /\basshole(s)?\b/i,
  /\bcunt(s)?\b/i,
  /\bdick(s|head)?\b/i,
  /\bpiss(ed)?\b/i,
  /\bwhore(s)?\b/i,
  /\bslut(s)?\b/i,
  /\bmoron(s)?\b/i,
  /\bretard(ed|s)?\b/i,
  /\bstupid\s+(bitch|ass|idiot)\b/i,
  /\bn[i1]gg[ae]r/i,
]

export function hasObviousProfanity(text: string): boolean {
  return BANNED_PATTERNS.some(p => p.test(text))
}

export async function moderateContent(text: string): Promise<{ safe: boolean; reason?: string }> {
  if (!text || text.trim().length === 0) return { safe: true }
  if (text.trim().length < 10) return { safe: true }

  // Fast path — catch obvious profanity without API call
  if (hasObviousProfanity(text)) {
    return { safe: false, reason: 'Contains profanity or offensive language' }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role:    'user',
          content: `You are a strict content moderator for a professional trades marketplace used by contractors and homeowners. Any review must be professional and constructive.

Flag as UNSAFE if the text contains ANY of the following — even mildly:
- Any profanity, swear words, or crude language (including mild ones like "damn", "crap", "pissed off")
- Personal insults or attacks on the person (calling them names, questioning their character)
- Threats or aggressive language
- Hate speech, slurs, or discriminatory language
- Sexually explicit content
- Spam or promotional content unrelated to the job

The standard is STRICT. If in doubt, flag as UNSAFE. Constructive negative reviews ("poor quality work", "did not finish on time") are fine. Personal attacks are not.

Review text: "${text.replace(/"/g, "'")}"

Reply ONLY with:
SAFE
or
UNSAFE: [reason in 5 words]`,
        }],
      }),
    })

    if (!response.ok) {
      console.error('Moderation API error:', response.status)
      // If API unavailable, fall back to pattern check only — already passed
      return { safe: true }
    }

    const data = await response.json()
    const result = data.content?.[0]?.text?.trim() || 'SAFE'

    if (result.startsWith('UNSAFE')) {
      const reason = result.replace('UNSAFE:', '').trim()
      return { safe: false, reason: reason || 'Content not allowed' }
    }

    return { safe: true }
  } catch (error) {
    console.error('Moderation check failed:', error)
    return { safe: true }
  }
}
