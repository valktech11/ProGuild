import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ENV_MISSING: GEMINI_API_KEY not set' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Current stable Gemini models (May 2026)
  const models = [
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash',
    'gemini-1.5-pro-002',
  ]

  let lastError = ''
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.92, maxOutputTokens: 8192 }
          })
        }
      )
      const data = await res.json()
      if (data.error) {
        lastError = data.error.message || 'Unknown error'
        const msg = lastError.toLowerCase()
        // Only skip to next model if this model is unavailable
        if (msg.includes('not found') || msg.includes('no longer') || msg.includes('not supported') || msg.includes('deprecated')) {
          continue
        }
        // Auth / quota errors — stop immediately
        return NextResponse.json({ error: lastError }, { status: res.status })
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return NextResponse.json({ text })
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Fetch failed'
      continue
    }
  }

  return NextResponse.json({ error: `Generation failed: ${lastError}` }, { status: 500 })
}
