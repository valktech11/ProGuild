import { NextRequest, NextResponse } from 'next/server'

// All Florida trades we support — slug maps to trade landing page
const FLORIDA_TRADES = [
  { slug: 'hvac-technician',       label: 'HVAC Technician',          keywords: ['ac', 'air conditioning', 'hvac', 'heating', 'cooling', 'furnace', 'heat pump', 'ductwork', 'refrigerant', 'air handler', 'thermostat'] },
  { slug: 'electrician',           label: 'Electrician',               keywords: ['electric', 'electrical', 'wiring', 'outlet', 'breaker', 'panel', 'circuit', 'fuse', 'light', 'power', 'generator', 'voltage', 'ev charger'] },
  { slug: 'plumber',               label: 'Plumber',                   keywords: ['plumb', 'pipe', 'leak', 'drain', 'water', 'toilet', 'sink', 'shower', 'faucet', 'sewer', 'water heater', 'repipe'] },
  { slug: 'roofer',                label: 'Roofer',                    keywords: ['roof', 'shingle', 'gutter', 'leak', 'storm damage', 'tile roof', 'flat roof', 'soffit', 'fascia'] },
  { slug: 'general-contractor',    label: 'General Contractor',        keywords: ['renovation', 'remodel', 'addition', 'construction', 'build', 'contractor', 'kitchen', 'bathroom', 'home improvement'] },
  { slug: 'pool-spa',              label: 'Pool & Spa Contractor',     keywords: ['pool', 'spa', 'hot tub', 'jacuzzi', 'swimming', 'pool pump', 'pool filter', 'pool heater', 'pool plaster'] },
  { slug: 'painter',               label: 'Painter',                   keywords: ['paint', 'painting', 'stain', 'primer', 'exterior paint', 'interior paint', 'wall', 'ceiling'] },
  { slug: 'landscaper',            label: 'Landscaper',                keywords: ['landscape', 'lawn', 'yard', 'garden', 'sod', 'grass', 'tree', 'shrub', 'mulch', 'sprinkler'] },
  { slug: 'solar-installer',       label: 'Solar Installer',           keywords: ['solar', 'solar panel', 'photovoltaic', 'battery', 'powerwall', 'net metering', 'fpl bill'] },
  { slug: 'drywall',               label: 'Drywall Contractor',        keywords: ['drywall', 'sheetrock', 'plaster', 'patch', 'texture', 'stucco', 'wall repair'] },
  { slug: 'flooring',              label: 'Flooring Contractor',       keywords: ['floor', 'tile', 'hardwood', 'laminate', 'carpet', 'vinyl', 'grout'] },
  { slug: 'impact-window-shutter', label: 'Impact Window Contractor',  keywords: ['window', 'impact window', 'hurricane window', 'shutter', 'door', 'sliding glass'] },
  { slug: 'carpenter',             label: 'Carpenter',                 keywords: ['carpenter', 'wood', 'cabinet', 'deck', 'fence', 'framing', 'trim', 'molding'] },
  { slug: 'pest-control',          label: 'Pest Control',              keywords: ['pest', 'termite', 'ant', 'roach', 'mosquito', 'rodent', 'bug', 'insect', 'fumigation'] },
  { slug: 'irrigation',            label: 'Irrigation Contractor',     keywords: ['irrigation', 'sprinkler', 'drip', 'water system', 'backflow'] },
  { slug: 'marine-contractor',     label: 'Marine Contractor',         keywords: ['dock', 'boat', 'marine', 'seawall', 'pier', 'lift', 'waterfront'] },
]

const TRADE_LIST_FOR_PROMPT = FLORIDA_TRADES
  .map(t => `- ${t.slug}: ${t.label}`)
  .join('\n')

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ slug: null, confidence: 0 })
    }

    const q = query.trim().toLowerCase()

    // Fast keyword match first — no API call needed for obvious cases
    for (const trade of FLORIDA_TRADES) {
      if (trade.keywords.some(kw => q.includes(kw))) {
        return NextResponse.json({
          slug:  trade.slug,
          label: trade.label,
          confidence: 0.95,
          method: 'keyword',
        })
      }
    }

    // Gemini for semantic matching — only if keyword match failed
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ slug: null, confidence: 0 })
    }

    const model = process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a Florida home trades classifier. Given a homeowner's search query, identify which trade professional they need.

Available trades:
${TRADE_LIST_FOR_PROMPT}

Homeowner query: "${query}"

Respond with a JSON object with exactly these fields:
- "slug": the trade slug from the list above, or null if no clear match
- "confidence": a number from 0.0 to 1.0 (use 0.0 if no match, 0.7+ for a clear match)
- "reasoning": one short sentence explaining the match

Only return JSON. No other text.`
            }]
          }],
          generationConfig: {
            maxOutputTokens: 128,
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!response.ok) {
      return NextResponse.json({ slug: null, confidence: 0 })
    }

    const data   = await response.json()
    const raw    = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(raw)
    const slug   = parsed.slug || null
    const confidence = parsed.confidence || 0

    // Only redirect if confident
    if (slug && confidence >= 0.7) {
      const trade = FLORIDA_TRADES.find(t => t.slug === slug)
      return NextResponse.json({
        slug,
        label: trade?.label || slug,
        confidence,
        method: 'gemini',
      })
    }

    return NextResponse.json({ slug: null, confidence, method: 'gemini' })

  } catch (err) {
    console.error('[match-trade] Error:', err)
    return NextResponse.json({ slug: null, confidence: 0 })
  }
}
