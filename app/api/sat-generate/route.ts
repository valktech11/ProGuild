import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Gemini API (generativelanguage.googleapis.com) current stable models
  const models = [
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]

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
      const msg = (data.error.message || '').toLowerCase()
      if (msg.includes('not found') || msg.includes('no longer') || msg.includes('deprecated') || msg.includes('not supported')) {
        continue // try next model
      }
      return NextResponse.json({ error: data.error.message }, { status: 500 })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return NextResponse.json({ text })
  }

  return NextResponse.json({ error: 'No working model found for this API key' }, { status: 500 })
}
