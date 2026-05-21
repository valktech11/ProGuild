import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'ENV_MISSING: GEMINI_API_KEY not set in Vercel Environment Variables' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Try models in order until one works
  const models = [
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-pro',
  ]

  let lastError = ''
  for (const model of models) {
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
      lastError = data.error.message
      // If model not found, try next one
      if (data.error.status === 'NOT_FOUND' || data.error.message?.includes('no longer')) {
        continue
      }
      // Other errors (quota, auth) — return immediately
      return NextResponse.json({ error: data.error.message }, { status: 500 })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return NextResponse.json({ text, model })
  }

  return NextResponse.json({ error: `All models failed. Last error: ${lastError}` }, { status: 500 })
}
