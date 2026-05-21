import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { prompt } = await req.json()
  if (!prompt) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
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
    return NextResponse.json({ error: data.error.message }, { status: 500 })
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return NextResponse.json({ text })
}
