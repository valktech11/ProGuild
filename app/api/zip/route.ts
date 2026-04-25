import { NextRequest, NextResponse } from 'next/server'
import { zipToCity } from '@/lib/zip'

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get('zip')?.trim()
  if (!zip) return NextResponse.json({ city: null, state: null })

  const result = await zipToCity(zip)
  return NextResponse.json(result ?? { city: null, state: null })
}
