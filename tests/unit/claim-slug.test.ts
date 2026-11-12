import { describe, it, expect, vi } from 'vitest'
import { generateSlugCandidates, generateUniqueSlug } from '../../lib/slug'

// Mock admin client: `taken` is the set of slugs already in pros.slug.
// Mirrors `admin.from('pros').select('id').eq('slug', c).maybeSingle()`.
function mockAdmin(taken: Set<string>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => ({
            data: taken.has(val) ? { id: 'x' } : null,
          }),
        }),
      }),
    }),
  }
}

const aycock = {
  fullName: 'Aycock, Toby Wheaton',
  trade: 'general-contractor',
  city: 'Pompano Beach',
  state: 'FL',
  licenseNumber: 'CGC1520657',
}

describe('claim-time slug generation', () => {
  it('builds first-last-trade-city as the primary candidate', () => {
    const c = generateSlugCandidates(aycock)
    expect(c[0]).toBe('aycock-toby-wheaton-general-contractor-pompano-beach')
  })

  it('assigns the primary slug when nothing collides (the happy claim path)', async () => {
    const slug = await generateUniqueSlug(mockAdmin(new Set()), aycock)
    expect(slug).toBe('aycock-toby-wheaton-general-contractor-pompano-beach')
  })

  it('TRADE is embedded in the slug — the fix under test', async () => {
    const slug = await generateUniqueSlug(mockAdmin(new Set()), aycock)
    expect(slug).toContain('general-contractor')
  })

  it('falls through to the +state candidate when the primary is taken', async () => {
    const taken = new Set(['aycock-toby-wheaton-general-contractor-pompano-beach'])
    const slug = await generateUniqueSlug(mockAdmin(taken), aycock)
    expect(slug).toBe('aycock-toby-wheaton-general-contractor-pompano-beach-fl')
  })

  it('appends a base36 timestamp when every candidate is exhausted', async () => {
    // Pre-take every deterministic candidate so only the timestamp fallback is free.
    const taken = new Set(generateSlugCandidates(aycock))
    const slug = await generateUniqueSlug(mockAdmin(taken), aycock)
    expect(taken.has(slug)).toBe(false)
    expect(slug).toMatch(/-[0-9a-z]+$/)
  })

  it('missing trade degrades to the "pro" placeholder, not an empty segment', async () => {
    const slug = await generateUniqueSlug(mockAdmin(new Set()), {
      ...aycock, trade: null,
    })
    expect(slug).toBe('aycock-toby-wheaton-pro-pompano-beach')
    expect(slug).not.toContain('--')
  })

  it('name-only pro (no trade/city/state) still yields a usable slug', async () => {
    const slug = await generateUniqueSlug(mockAdmin(new Set()), {
      fullName: 'Bobby Tables', trade: null, city: null, state: null, licenseNumber: null,
    })
    expect(slug).toBe('bobby-tables-pro')
  })

  it('accents and punctuation are stripped to URL-safe output', async () => {
    const slug = await generateUniqueSlug(mockAdmin(new Set()), {
      fullName: 'José Núñez-O’Brien', trade: 'Roofing & Repair', city: 'Fort Pierce', state: 'FL', licenseNumber: null,
    })
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).toContain('jose-nunez-obrien')
  })
})
