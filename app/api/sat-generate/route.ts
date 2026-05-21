import { NextRequest, NextResponse } from 'next/server'

async function getAvailableModel(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )
    const data = await res.json()
    if (!data.models) return null

    // Preferred models in order - pick first available that supports generateContent
    const preferred = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro',
    ]

    const available: string[] = data.models
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m: { name: string }) => m.name.replace('models/', ''))

    for (const p of preferred) {
      // Match exact or version suffix e.g. gemini-1.5-flash-002
      const match = available.find(a => a === p || a.startsWith(p + '-') || a.startsWith(p + '_'))
      if (match) return match
    }

    // Fallback: return first available generateContent model
    return available[0] || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set in environment variables' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Auto-discover the best available model
  const model = await getAvailableModel(apiKey)
  if (!model) {
    return NextResponse.json({ error: 'No Gemini models available for this API key. Check key permissions.' }, { status: 500 })
  }

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
    return NextResponse.json({ error: data.error.message }, { status: res.status })
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return NextResponse.json({ text })
}
