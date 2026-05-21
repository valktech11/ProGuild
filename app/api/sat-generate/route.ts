import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // First: list available models to find what works with this key
  let chosenModel = ''
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    )
    const listData = await listRes.json()
    if (listData.models?.length) {
      // Log all available models for debugging
      const all = listData.models
        .filter((m: {supportedGenerationMethods?: string[]}) =>
          m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: {name: string}) => m.name.replace('models/', ''))

      // Pick best available
      const preferred = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro', 'gemini-pro']
      for (const p of preferred) {
        const found = all.find((a: string) => a.startsWith(p))
        if (found) { chosenModel = found; break }
      }
      if (!chosenModel && all.length > 0) chosenModel = all[0]

      if (!chosenModel) {
        return NextResponse.json({
          error: `No generateContent models available. Models found: ${listData.models.map((m: {name:string}) => m.name).join(', ')}`
        }, { status: 500 })
      }
    } else if (listData.error) {
      return NextResponse.json({ error: `Key error: ${listData.error.message}` }, { status: 500 })
    }
  } catch (e) {
    return NextResponse.json({ error: `Model discovery failed: ${e}` }, { status: 500 })
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`,
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
    return NextResponse.json({ error: data.error.message, model: chosenModel }, { status: 500 })
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return NextResponse.json({ text })
}
