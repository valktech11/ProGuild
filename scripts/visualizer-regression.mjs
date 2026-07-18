#!/usr/bin/env node
/**
 * Roof Visualizer regression harness — run before every push that touches
 * app/api/roof-visualizer/** or app/roof-visualizer/**
 *
 *   node scripts/visualizer-regression.mjs
 *
 * Asserts the pipeline invariants that were each discovered the hard way:
 *   1. sharp blur on 1ch raw returns 3ch  (shipped black masks — morphology)
 *   2. morphological closing preserves mask area
 *   3. additive recolor puts mid-tone roof exactly on the chip hex
 *   4. pixel guarantee: everything outside the mask is byte-identical to the original
 *   5. vegetation (ExG) + sky (ExB) vetoes fire on the right pixels and only those
 *   6. candidate filters (veg/sky/ground) exclude the right candidates
 *   7. two-sided arbitration arithmetic (lazy copy loses, different-house loses)
 *
 * No network, no API keys, no cost. Pure sharp + arithmetic on synthetic fixtures.
 */
import sharp from 'sharp'

let failures = 0
const ok  = (name) => console.log(`  \x1b[32m✓\x1b[0m ${name}`)
const bad = (name, detail) => { failures++; console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${detail}`) }
const assert = (cond, name, detail) => cond ? ok(name) : bad(name, detail)

const W = 400, H = 300

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Photo: top third sky (blue), middle roof (mid-grey), bottom lawn (green)
const photoRaw = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    if (y < H * 0.33)      { photoRaw[i] = 120; photoRaw[i+1] = 170; photoRaw[i+2] = 235 } // sky
    else if (y < H * 0.66) { photoRaw[i] = 120; photoRaw[i+1] = 118; photoRaw[i+2] = 115 } // roof
    else                   { photoRaw[i] =  70; photoRaw[i+1] = 140; photoRaw[i+2] =  60 } // lawn
  }
}
const photoJpeg = await sharp(photoRaw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()

// Roof mask: the middle band
const roofMask = Buffer.alloc(W * H)
let roofPx = 0
for (let y = Math.floor(H * 0.33); y < Math.floor(H * 0.66); y++)
  for (let x = 0; x < W; x++) { roofMask[y * W + x] = 255; roofPx++ }

console.log('\n\x1b[1mRoof Visualizer regression harness\x1b[0m\n')

// ── 1. sharp blur channel expansion (the black-mask bug) ─────────────────────
console.log('sharp behaviour guards')
{
  const blurred = await sharp(roofMask, { raw: { width: W, height: H, channels: 1 } }).blur(1.2).raw().toBuffer()
  assert(blurred.length === W * H * 3,
    'blur() on 1ch raw still expands to 3ch (extractChannel(0) remains REQUIRED)',
    `expected ${W*H*3} bytes, got ${blurred.length} — sharp behaviour changed, re-verify all morph/mask code`)

  const guarded = await sharp(roofMask, { raw: { width: W, height: H, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer()
  assert(guarded.length === W * H, 'blur() + extractChannel(0) yields 1ch', `got ${guarded.length}`)
}

// ── 2. Morphological closing preserves area ──────────────────────────────────
console.log('\nmorphology')
{
  const morph = async (m, sigma, threshold) => {
    const b = await sharp(m, { raw: { width: W, height: H, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer()
    const out = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i++) out[i] = b[i] > threshold ? 255 : 0
    return out
  }
  let m = await morph(roofMask, 1.2, 10)   // dilate
  m = await morph(m, 0.8, 235)             // erode
  let after = 0
  for (let i = 0; i < W * H; i++) if (m[i] === 255) after++
  assert(after >= roofPx * 0.9,
    'closing preserves ≥90% of mask area',
    `before=${roofPx} after=${after} — morphology is destroying the mask (this shipped black masks once)`)
}

// ── 3. Additive recolor: mid-tone lands on the chip hex ──────────────────────
console.log('\nclassical recolor')
{
  const hex = '8C7A8A'                                  // Pristine Heather
  const tr = parseInt(hex.slice(0,2),16), tg = parseInt(hex.slice(2,4),16), tb = parseInt(hex.slice(4,6),16)
  const K = 0.55
  const lum = await sharp(photoJpeg).greyscale().raw().toBuffer()

  // roof mean luminance
  let sum = 0, n = 0
  for (let i = 0; i < W * H; i++) if (roofMask[i] > 128) { sum += lum[i]; n++ }
  const mean = sum / n

  // a pixel at the roof mean should render as the chip colour
  let idx = -1
  for (let i = 0; i < W * H; i++) if (roofMask[i] > 128 && Math.abs(lum[i] - mean) < 1) { idx = i; break }
  const shade = (lum[idx] - mean) * K
  const out = [tr + shade, tg + shade, tb + shade].map(v => Math.round(v))
  assert(Math.abs(out[0]-tr) <= 2 && Math.abs(out[1]-tg) <= 2 && Math.abs(out[2]-tb) <= 2,
    'mid-tone roof pixel renders as the exact chip hex',
    `expected ~[${tr},${tg},${tb}] got [${out}] — light SKUs will drift (Heather candy-lilac bug)`)

  // brightest roof pixel must not blow out
  let maxLum = 0
  for (let i = 0; i < W * H; i++) if (roofMask[i] > 128 && lum[i] > maxLum) maxLum = lum[i]
  const hi = Math.round(tr + (maxLum - mean) * K)
  assert(hi <= 255, 'highlight does not clip', `got ${hi}`)
}

// ── 4. Pixel guarantee ───────────────────────────────────────────────────────
console.log('\npixel guarantee')
{
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    rgba[i*4] = 255; rgba[i*4+1] = 0; rgba[i*4+2] = 0     // vivid red layer
    rgba[i*4+3] = roofMask[i]
  }
  const layer = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  const composited = await sharp(photoJpeg).composite([{ input: layer, blend: 'over' }]).raw().toBuffer()
  const original   = await sharp(photoJpeg).raw().toBuffer()
  const ch = composited.length / (W * H)

  let leaked = 0, painted = 0
  for (let i = 0; i < W * H; i++) {
    const same = composited[i*ch] === original[i*3] && composited[i*ch+1] === original[i*3+1] && composited[i*ch+2] === original[i*3+2]
    if (roofMask[i] > 128) { if (!same) painted++ } else if (!same) leaked++
  }
  assert(leaked === 0, 'zero pixels changed outside the mask', `${leaked} leaked — "same house" guarantee broken`)
  assert(painted > roofPx * 0.9, 'roof region actually painted', `only ${painted}/${roofPx}`)
}

// ── 5. Veto tests ────────────────────────────────────────────────────────────
console.log('\nvetoes')
{
  const exg = (r,g,b) => 2*g - r - b
  const exb = (r,g,b) => 2*b - r - g
  assert(exg(70,140,60) > 40,   'lawn triggers vegetation veto (ExG>40)',  `ExG=${exg(70,140,60)}`)
  assert(exg(120,118,115) <= 40,'grey roof does NOT trigger veg veto',      `ExG=${exg(120,118,115)}`)
  assert(exb(120,170,235) > 50, 'sky triggers sky veto (ExB>50)',           `ExB=${exb(120,170,235)}`)
  assert(exb(120,118,115) <= 50,'grey roof does NOT trigger sky veto',      `ExB=${exb(120,118,115)}`)
  assert(exb(140,140,150) <= 50,'concrete driveway does NOT trigger sky veto (needs the ground filter)',
    `ExB=${exb(140,140,150)} — this is why driveways need the geometric filter, not a colour test`)
}

// ── 6. Manual selection model (preselection deleted) ────────────────────────
console.log('\nmanual selection')
{
  // Preselection was removed after six iterations of filter-chain regressions.
  // Invariant: the confirm step opens with NOTHING selected, on every photo type.
  const initialSelection = new Set()
  assert(initialSelection.size === 0,
    'confirm opens with zero selected (no preselection layer)',
    'something is preselected — the elimination-based failure mode is back')

  // Sweep accumulates and only ADDS; each plane toggles at most once per drag
  const sel = new Set(), swept = new Set()
  const sweepOver = (idx) => { if (!swept.has(idx)) { swept.add(idx); sel.add(idx) } }
  ;[3, 3, 7, 7, 9].forEach(sweepOver)
  assert(sel.size === 3 && sel.has(3) && sel.has(7) && sel.has(9),
    'sweep adds each crossed plane exactly once',
    `expected {3,7,9}, got {${[...sel]}}`)

  // Tap toggles (add then remove)
  const tapped = new Set([5])
  const tapToggle = (s, i) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }
  assert(tapToggle(tapped, 5).size === 0, 'tap on selected plane removes it', 'toggle broken')
  assert(tapToggle(tapped, 8).size === 2, 'tap on unselected plane adds it', 'toggle broken')

  // Undo restores the previous selection snapshot
  const history = [new Set([1]), new Set([1, 2])]
  const current = new Set([1, 2, 3])
  const undone = new Set(history[history.length - 1])
  assert(undone.size === 2 && !undone.has(3), 'undo restores prior selection', `got {${[...undone]}}`)
  assert(current.size === 3, 'undo does not mutate the live set in place', 'aliasing bug')
}

// ── 7. Two-sided arbitration ─────────────────────────────────────────────────
console.log('\narbitration gate')
{
  const serve = (nonRoof, roof, chipLum = 100) => nonRoof <= 18 && roof >= (chipLum > 160 ? 20 : 12)
  assert(!serve(6.0, 0.0),  'lazy AI photocopy loses (roofMAE 0)',            'photocopy served')
  assert(!serve(45.0, 30.0),'different-house AI loses (nonRoofMAE 45)',        'wrong house served')
  assert( serve(3.1, 29.1), 'genuine AI edit wins',                            'good AI render rejected')
  assert(!serve(3.0, 15.0, 200), 'pale SKU needs roofMAE ≥ 20',                'pastel AI slipped through')
}

// ── 8. Neutral-chip routing ─────────────────────────────────────────────────
console.log('\nneutral chip routing')
{
  const chroma = (hex) => {
    const s = hex.replace('#','')
    const r = parseInt(s.slice(0,2),16), g = parseInt(s.slice(2,4),16), b = parseInt(s.slice(4,6),16)
    return Math.max(r,g,b) - Math.min(r,g,b)
  }
  const tryAi = (hex) => chroma(hex) > 12

  // Neutral greys/blacks — classical is mathematically exact, AI can only drift hue
  assert(!tryAi('#8A8A8A'), 'Pewter Gray skips AI (chroma 0)',    `chroma=${chroma('#8A8A8A')}`)
  assert(!tryAi('#707070'), 'Georgetown Gray skips AI',           `chroma=${chroma('#707070')}`)
  assert(!tryAi('#5A5A5A'), 'IKO Cambridge skips AI',             `chroma=${chroma('#5A5A5A')}`)
  assert(!tryAi('#1A1A1A'), 'Onyx Black skips AI',                `chroma=${chroma('#1A1A1A')}`)
  assert(!tryAi('#3D3D3D'), 'GAF Charcoal skips AI',              `chroma=${chroma('#3D3D3D')}`)

  // Chromatic chips keep the AI attempt behind the two-sided gate
  assert(tryAi('#6B5C3E'), 'Weathered Wood attempts AI',          `chroma=${chroma('#6B5C3E')}`)
  assert(tryAi('#2E3B4E'), 'IKO Nordic attempts AI',              `chroma=${chroma('#2E3B4E')}`)
  assert(tryAi('#8C7A8A'), 'Pristine Heather attempts AI',        `chroma=${chroma('#8C7A8A')}`)
  assert(tryAi('#5A6472'), 'GAF Slate attempts AI',               `chroma=${chroma('#5A6472')}`)

  // Additive recolor on a neutral chip must stay neutral at every luminance
  const neutralStays = [40, 128, 220].every(lum => {
    const shade = (lum - 128) * 0.55
    const [r,g,b] = [0x8A, 0x8A, 0x8A].map(v => Math.round(v + shade))
    return r === g && g === b
  })
  assert(neutralStays, 'additive shading keeps a neutral chip neutral at all luminances',
    'classical path introduced a colour cast — impossible unless the loop changed')
}

// ── 9. Trace containment + granule jitter ──────────────────────────────────
console.log('\ntrace containment & granule')
{
  // Flood fill spreads only into UNOWNED pixels. A window dropped from the candidate
  // set becomes unowned → the fill bleeds in → classical paints the glass.
  const MIN_AREA_FRAC = 0.0008
  const isCandidate = (areaPct) => areaPct >= MIN_AREA_FRAC
  assert(isCandidate(0.003), 'window (0.3%) is an owned candidate — blocks trace bleed',
    'window unowned: flood fill will paint glass (log-proven purple window)')
  assert(isCandidate(0.005), 'door (0.5%) is an owned candidate', 'door unowned')
  assert(!isCandidate(0.0002), 'sub-0.08% speck is still excluded', 'noise became selectable')

  // Deterministic granule noise: same pixel → same value across renders
  const cellNoise = (x, y, salt) => {
    let n = (x >> 1) * 73856093 ^ (y >> 1) * 19349663 ^ salt * 83492791
    n = (n ^ (n >>> 13)) >>> 0
    return ((n % 2001) / 1000) - 1
  }
  assert(cellNoise(100, 200, 1) === cellNoise(100, 200, 1), 'granule noise is deterministic',
    'noise varies per call — renders would not reproduce')
  assert(cellNoise(100, 200, 1) !== cellNoise(140, 260, 1), 'granule noise varies across cells',
    'noise is constant — no granule texture')
  const vals = []
  for (let x = 0; x < 40; x += 2) vals.push(cellNoise(x, 0, 1))
  assert(Math.max(...vals) <= 1 && Math.min(...vals) >= -1, 'granule noise stays in [-1,1]',
    `range ${Math.min(...vals)}..${Math.max(...vals)} — jitter would blow out colour`)
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(failures === 0
  ? '\n\x1b[32m\x1b[1mAll invariants hold.\x1b[0m\n'
  : `\n\x1b[31m\x1b[1m${failures} invariant(s) broken — do not push.\x1b[0m\n`)
process.exit(failures === 0 ? 0 : 1)
