import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY

  // Temporary debug — remove after confirming
  if (!apiKey) {
    return NextResponse.json({ error: 'ENV_MISSING: GEMINI_API_KEY is not set' }, { status: 500 })
  }

  // Show first 8 chars so we can confirm WHICH key is loaded (never logs full key)
  const keyPreview = apiKey.slice(0, 8) + '...'

  const { prompt } = await req.json().catch(() => ({ prompt: null }))
  if (!prompt) {
    return NextResponse.json({ error: 'Missing prompt', keyLoaded: keyPreview }, { status: 400 })
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.92, maxOutputTokens: 8192 }
    })
  })

  const data = await res.json()
  if (data.error) {
    return NextResponse.json({ error: data.error.message, keyPreview }, { status: 500 })
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return NextResponse.json({ text })
}
