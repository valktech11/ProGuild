import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  // Read API key from site_config table (same pattern as rest of app)
  const { data } = await getSupabaseAdmin()
    .from('site_config')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single()

  // Fallback to env var if not in DB
  const apiKey = data?.value || process.env.GEMINI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini API key not configured. Add gemini_api_key to site_config table.' },
      { status: 500 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body

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

  const geminiData = await res.json()

  if (geminiData.error) {
    return NextResponse.json({ error: geminiData.error.message }, { status: 500 })
  }

  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return NextResponse.json({ text })
}
