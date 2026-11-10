#!/usr/bin/env node
/**
 * ProGuild — one-time slug backfill for CLAIMED pros that have none.
 * ===========================================================================
 * WHY: until this session's fix, no claim path generated a slug. A claimed
 * profile with slug = NULL is EXCLUDED from the pros sitemap and never gets
 * indexed — the single most valuable SEO page (a real, verified contractor)
 * falls out of Google. This assigns a slug to every already-claimed pro that
 * is missing one (e.g. the first real claim, Aycock). The code fix handles all
 * future claims; this script cleans up the ones that happened before it shipped.
 *
 * SCOPE: is_claimed = true AND slug IS NULL. Narrow by design — this is a
 * cleanup, not the bulk importer (that's backfill-slugs.mjs).
 *
 * SAFE: dry-run unless you pass --write. Dry-run only READS and prints a
 * preview. With --write it sets ONLY the `slug` column on claimed rows that
 * currently have none; it never overwrites an existing slug.
 *
 * RUN from the REPO ROOT (point at whichever DB you mean to fix):
 *   node --env-file=.env.local scripts/backfill-claimed-slugs.mjs
 *   node --env-file=.env.local scripts/backfill-claimed-slugs.mjs --write
 *
 * Node <20 has no --env-file; the script also auto-loads .env.local/.env itself.
 * ===========================================================================
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

for (const file of ['.env.local', '.env']) {
  try {
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no file — fine */ }
}

const WRITE = process.argv.slice(2).includes('--write')

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.'); process.exit(1) }
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// slug logic — verbatim from lib/slug.ts (trade text = trade_slug, same result)
function toSlugPart(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-')
}
function candidates({ fullName, trade, city, state, licenseNumber }) {
  const np = (fullName || '').trim().split(/\s+/)
  const first = toSlugPart(np[0] || ''), last = toSlugPart(np.slice(1).join(' ') || '')
  const tp = toSlugPart(trade || 'pro'), cp = toSlugPart(city || ''), sp = toSlugPart(state || '')
  const l4 = licenseNumber ? String(licenseNumber).replace(/\D/g, '').slice(-4) : ''
  const ns = last ? `${first}-${last}` : first
  const c = []
  if (cp) c.push(`${ns}-${tp}-${cp}`)
  if (cp && sp) c.push(`${ns}-${tp}-${cp}-${sp}`)
  c.push(`${ns}-${tp}`)
  if (sp) c.push(`${ns}-${tp}-${sp}`)
  if (l4) c.push(`${ns}-${tp}-${cp || sp}-${l4}`)
  c.push(ns)
  return c.filter(x => x.length >= 4)
}

const bar = '='.repeat(74)
console.log(bar)
console.log(` CLAIMED-SLUG BACKFILL   mode=${WRITE ? 'WRITE (modifies DB)' : 'DRY-RUN (read only)'}`)
console.log(` target: ${URL}`)
console.log(bar)

// Fetch every claimed pro missing a slug (tiny set — no paging needed yet,
// but page anyway so it stays correct if claims ever pile up).
const targets = []
{
  let from = 0, PAGE = 1000
  while (true) {
    const { data, error } = await sb.from('pros')
      .select('id, full_name, city, state, license_number, trade_slug')
      .eq('is_claimed', true).is('slug', null)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) { console.error('fetch error:', error.message); process.exit(1) }
    if (!data?.length) break
    targets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
}

if (!targets.length) {
  console.log('0 claimed pros are missing a slug. Nothing to do.')
  process.exit(0)
}
console.log(`Claimed pros missing a slug: ${targets.length}`)

// Preload existing slugs for the collision guard.
process.stdout.write('Loading existing slugs... ')
const used = new Set()
{
  let from = 0, PAGE = 1000
  while (true) {
    const { data, error } = await sb.from('pros').select('slug').not('slug', 'is', null)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) { console.error('\nload error:', error.message); process.exit(1) }
    if (!data?.length) break
    for (const r of data) if (r.slug) used.add(r.slug)
    if (data.length < PAGE) break
    from += PAGE
  }
}
console.log(`${used.size} already in use.`)
console.log(bar)

function pickSlug(p) {
  const cs = candidates({ fullName: p.full_name, trade: p.trade_slug, city: p.city, state: p.state, licenseNumber: p.license_number })
  for (const c of cs) if (!used.has(c)) return c
  const base = cs[0] || toSlugPart(p.full_name) || 'pro'
  let s; do { s = `${base}-${Math.random().toString(36).slice(2, 6)}` } while (used.has(s))
  return s
}

let assigned = 0, skipped = 0
for (const p of targets) {
  if (!p.full_name || !p.full_name.trim()) {
    console.log(`  SKIP id=${p.id} (no full_name)`); skipped++; continue
  }
  const slug = pickSlug(p)
  used.add(slug)
  console.log(`  ${WRITE ? 'SET ' : 'WOULD SET'} id=${p.id}  "${p.full_name}"  ->  ${slug}`)
  if (WRITE) {
    const { error } = await sb.from('pros').update({ slug }).eq('id', p.id).is('slug', null)
    if (error) { console.error(`    write failed id=${p.id}: ${error.message}`); skipped++; continue }
    assigned++
  } else {
    assigned++
  }
}

console.log(bar)
if (!WRITE) {
  console.log(`DRY-RUN complete. ${assigned} slug(s) would be assigned, ${skipped} skipped.`)
  console.log(`Look right? Re-run the SAME command with --write added.`)
} else {
  console.log(`DONE. assigned=${assigned}  skipped=${skipped}`)
  console.log(`These claimed profiles now flow into /sitemaps/pros. Re-submit the`)
  console.log(`sitemap in Search Console so Google re-crawls them.`)
}
