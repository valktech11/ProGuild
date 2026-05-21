import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Step 1: discover available models for this key
  let model = 'gemini-1.5-flash' // safe default
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`
    )
    const listData = await listRes.json()
    if (listData.models) {
      const preferred = [
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
      ]
      const available: string[] = listData.models
        .filter((m: {supportedGenerationMethods?: string[]}) =>
          m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: {name: string}) => m.name.replace('models/', ''))

      for (const p of preferred) {
        const found = available.find(a => a === p || a.startsWith(p))
        if (found) { model = found; break }
      }
    }
  } catch { /* use default */ }

  // Step 2: generate
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
    return NextResponse.json({ error: data.error.message, model }, { status: 500 })
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return NextResponse.json({ text })
}
