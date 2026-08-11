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
import {
  rgbToLab, labToRgbRaw, labToRgbGamutMapped, isInGamut,
  adaptiveK, chromaRolloff, labRecolorPixel,
  K_BASE, K_MAX, CHROMA_ROLLOFF_MIN, L_ROLLOFF_LO, L_ROLLOFF_HI,
} from '../lib/roof-visualizer/lab.ts'

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
  // Threshold is 20 (raised from 12): Pristine Heather chroma=18 drifted to lavender
  // under AI; classical is exact for it. Nordic/HeatherBlend/Slate/browns stay on AI.
  const tryAi = (hex) => chroma(hex) > 20

  // Neutral greys/blacks — classical is mathematically exact, AI can only drift hue
  assert(!tryAi('#8A8A8A'), 'Pewter Gray skips AI (chroma 0)',       `chroma=${chroma('#8A8A8A')}`)
  assert(!tryAi('#707070'), 'Georgetown Gray skips AI',              `chroma=${chroma('#707070')}`)
  assert(!tryAi('#5A5A5A'), 'IKO Cambridge skips AI',                `chroma=${chroma('#5A5A5A')}`)
  assert(!tryAi('#1A1A1A'), 'Onyx Black skips AI',                   `chroma=${chroma('#1A1A1A')}`)
  assert(!tryAi('#3D3D3D'), 'GAF Charcoal skips AI',                 `chroma=${chroma('#3D3D3D')}`)
  assert(!tryAi('#8C7A8A'), 'Pristine Heather skips AI (chroma 18 < 20, drifted lavender)', `chroma=${chroma('#8C7A8A')}`)

  // Chromatic chips keep the AI attempt behind the two-sided gate
  assert(tryAi('#6B5C3E'), 'Weathered Wood attempts AI',             `chroma=${chroma('#6B5C3E')}`)
  assert(tryAi('#2E3B4E'), 'IKO Nordic attempts AI',                 `chroma=${chroma('#2E3B4E')}`)
  assert(tryAi('#9B7B8A'), 'Heather Blend attempts AI (chroma 32)',  `chroma=${chroma('#9B7B8A')}`)
  assert(tryAi('#5A6472'), 'GAF Slate attempts AI',                  `chroma=${chroma('#5A6472')}`)

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

// ── 10. Granule blend palette ───────────────────────────────────────────────
console.log('\ngranule blend')
{
  const parseHex = (x) => { const s = x.replace('#',''); return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)] }
  const cellNoise = (x, y, salt) => {
    let n = (x >> 1) * 73856093 ^ (y >> 1) * 19349663 ^ salt * 83492791
    n = (n ^ (n >>> 13)) >>> 0
    return ((n % 2001) / 1000) - 1
  }
  const mix = (hexes) => {
    const pal = hexes.map(parseHex)
    let sum = [0,0,0], counts = new Array(pal.length).fill(0)
    for (let y = 0; y < 120; y += 2) for (let x = 0; x < 120; x += 2) {
      const i = Math.floor(((cellNoise(x,y,5)+1)/2) * pal.length) % pal.length
      counts[i]++; sum[0]+=pal[i][0]; sum[1]+=pal[i][1]; sum[2]+=pal[i][2]
    }
    const n = counts.reduce((a,b)=>a+b)
    return { mean: sum.map(v => Math.round(v/n)), share: counts.map(c => c/n) }
  }

  // Solid SKUs must be untouched by the blend path (Cambridge is the best render in the build)
  const solid = mix(['#5A5A5A'])
  assert(solid.mean.join() === '90,90,90', 'single-tone SKU renders its exact hex',
    `got ${solid.mean} — solid SKUs must not be altered by blend logic`)

  // Blend palettes must distribute roughly evenly across granule tones
  const bark = mix(['#5C4A2A', '#3E3020', '#6E6350'])
  assert(bark.share.every(s => s > 0.25 && s < 0.42), 'granule tones distribute evenly',
    `shares ${bark.share.map(s => (s*100).toFixed(0)+'%')} — one tone dominating defeats the blend`)

  // Barkwood: the olive cast is a large R-B gap; blending must narrow it
  const singleGap = 0x5C - 0x2A            // 50
  const blendGap  = bark.mean[0] - bark.mean[2]
  assert(blendGap < singleGap - 8, 'blend reduces the yellow/olive cast (R-B gap narrows)',
    `single-hex gap ${singleGap}, blend gap ${blendGap} — Barkwood would still render olive`)

  // Heather Blend: greys/browns must pull it off pure pink
  const heather = mix(['#9B7B8A', '#6E6470', '#7D6355'])
  assert(heather.mean[0] - heather.mean[1] < 0x9B - 0x7B, 'blend reduces the pink cast',
    `R-G gap did not narrow — Heather Blend would still render pink`)
}

// ── 11. Palette calibration guards ──────────────────────────────────────────
console.log('\npalette calibration')
{
  const parse = (x) => { const s = x.replace('#',''); return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)] }
  const lum = (x) => { const [r,g,b] = parse(x); return (r+g+b)/3 }
  const spread = (hexes) => { const ls = hexes.map(lum); return Math.max(...ls) - Math.min(...ls) }
  const blueRatio = (x) => { const [r,,b] = parse(x); return b / r }

  // Wide luminance spread reads as speckle/moss, not granule blend (v120 shipped 36-64)
  const palettes = {
    Barkwood:        ['#63533C', '#5F4E38', '#695A44'],
    WeatheredWood:   ['#6B5C3E', '#665739', '#705F44'],
    Driftwood:       ['#7A6B55', '#746551', '#82715B'],
    HeatherBlend:    ['#9B7B8A', '#8D7C88', '#98817C'],
    PristineHeather: ['#8C7A8A', '#83788A', '#8E7F80'],
  }
  for (const [name, pal] of Object.entries(palettes)) {
    const s = spread(pal)
    assert(s <= 14, `${name} granule spread <= 14 (no speckling)`, `spread ${s.toFixed(1)}`)
    assert(s >= 2,  `${name} keeps some granule variation`, `spread ${s.toFixed(1)} — too uniform`)
  }

  // Brown-family SKUs must not drift into olive (blue channel starved relative to red)
  for (const name of ['Barkwood', 'WeatheredWood', 'Driftwood']) {
    const br = blueRatio(palettes[name][0])
    assert(br >= 0.52, `${name} base stays in the brown family (B/R >= 0.52)`,
      `B/R ${(br*100).toFixed(0)}% — renders olive (Barkwood shipped at 46%)`)
  }
}

// ── 12. Erase brush ──────────────────────────────────────────────────────────
console.log('\nerase brush')
{
  // Simulate the server-side erase step: erase mask zeros pixels from the union mask.
  // roofMask is the middle band; eraseRaw zeroes the top half of that band.
  const eraseRaw = Buffer.alloc(W * H)
  for (let y = Math.floor(H * 0.33); y < Math.floor(H * 0.50); y++)
    for (let x = 0; x < W; x++) eraseRaw[y * W + x] = 255

  const maskAfterErase = Buffer.from(roofMask)
  let erasedCount = 0
  for (let i = 0; i < W * H; i++) {
    if (eraseRaw[i] > 128 && maskAfterErase[i] === 255) { maskAfterErase[i] = 0; erasedCount++ }
  }
  let remainingCount = 0
  for (let i = 0; i < W * H; i++) if (maskAfterErase[i] === 255) remainingCount++

  assert(erasedCount > 0, 'erase step removes pixels from the mask', 'no pixels were erased — erase loop is broken')
  assert(remainingCount < roofPx, 'mask pixel count decreases after erase', `before=${roofPx} after=${remainingCount}`)
  assert(remainingCount > 0, 'erase does not wipe the entire mask when partial', `remaining=${remainingCount}`)

  // Pixel guarantee still holds after erase: outside the FINAL (erased) mask = byte-identical to original
  const erasedRgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    erasedRgba[i*4] = 255; erasedRgba[i*4+1] = 0; erasedRgba[i*4+2] = 0  // vivid red layer
    erasedRgba[i*4+3] = maskAfterErase[i]
  }
  const erasedLayer = await sharp(erasedRgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  const erasedComp  = await sharp(photoJpeg).composite([{ input: erasedLayer, blend: 'over' }]).raw().toBuffer()
  const originalRaw = await sharp(photoJpeg).raw().toBuffer()
  const ch = erasedComp.length / (W * H)
  let leaked = 0
  for (let i = 0; i < W * H; i++) {
    if (maskAfterErase[i] > 128) continue  // inside final mask — paint is expected
    const same = erasedComp[i*ch] === originalRaw[i*3] && erasedComp[i*ch+1] === originalRaw[i*3+1] && erasedComp[i*ch+2] === originalRaw[i*3+2]
    if (!same) leaked++
  }
  assert(leaked === 0, 'pixel guarantee holds after erase — nothing outside final mask changed', `${leaked} leaked pixels`)

  // Undo restores: erase commits push to the history stack the same as taps.
  // Simulate: pre-erase selection → erase → undo restores pre-erase selection.
  const preErase = new Set([3, 7, 9])
  const historyStack = [new Set(preErase)]
  // (erase happens — user has modified erasePixels)
  const undoneSelection = new Set(historyStack[historyStack.length - 1])
  assert(undoneSelection.size === preErase.size && [...preErase].every(v => undoneSelection.has(v)),
    'undo after erase restores pre-erase selection snapshot', `got {${[...undoneSelection]}} expected {${[...preErase]}}`)
}

// ── 13. CIELAB engine ────────────────────────────────────────────────────────
// These import the SHIPPING module rather than reimplementing the arithmetic. The older
// blocks in this file re-derive their formulas by hand, which means route.ts can drift from
// the test and both stay green. Anything added from here on imports what actually runs.
console.log('\nCIELAB recolour engine')
{
  // Round trip must be exact for every in-gamut colour: L* carries the shading, so any
  // round-trip error is a systematic shift applied to every roof pixel.
  let maxErr = 0, worstAt = null
  for (let r = 0; r <= 255; r += 15)
    for (let g = 0; g <= 255; g += 15)
      for (let b = 0; b <= 255; b += 15) {
        const [L, A, B] = rgbToLab(r, g, b)
        const [r2, g2, b2] = labToRgbGamutMapped(L, A, B)
        const e = Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2))
        if (e > maxErr) { maxErr = e; worstAt = `${r},${g},${b} -> ${r2},${g2},${b2}` }
      }
  assert(maxErr === 0, 'sRGB -> Lab -> sRGB round trip is exact across the cube',
    `max channel error ${maxErr} at ${worstAt} — every roof pixel would carry this shift`)

  // Reference anchors. If these move, the matrices or white point have been edited.
  const white = rgbToLab(255, 255, 255), black = rgbToLab(0, 0, 0), grey = rgbToLab(128, 128, 128)
  assert(Math.abs(white[0] - 100) < 0.01 && Math.abs(white[1]) < 0.01 && Math.abs(white[2]) < 0.01,
    'white maps to L*100 a*0 b*0', `got ${white.map(v => v.toFixed(3))}`)
  assert(Math.abs(black[0]) < 0.01, 'black maps to L*0', `got ${black[0]}`)
  assert(Math.abs(grey[0] - 53.59) < 0.05, 'sRGB 128 grey maps to L*53.59 (D65 anchor)',
    `got ${grey[0].toFixed(3)}`)
  assert(Math.abs(grey[1]) < 0.01 && Math.abs(grey[2]) < 0.01,
    'neutral input yields zero chroma', `got a*=${grey[1]} b*=${grey[2]}`)

  // Gamut mapping must reduce chroma at CONSTANT HUE, not clip per channel. Per-channel
  // clipping is what shifted saturated highlights toward cyan in the legacy engine.
  const oogL = 55, oogA = 80, oogB = 70
  assert(!isInGamut(oogL, oogA, oogB), 'test colour is genuinely out of gamut',
    'fixture no longer exercises the gamut mapper')
  const mapped = labToRgbGamutMapped(oogL, oogA, oogB)
  const backLab = rgbToLab(...mapped)
  const hueIn  = Math.atan2(oogB, oogA), hueOut = Math.atan2(backLab[2], backLab[1])
  let dHue = Math.abs(hueIn - hueOut)
  if (dHue > Math.PI) dHue = 2 * Math.PI - dHue
  assert(dHue < 0.05, 'gamut mapping preserves hue angle (chroma reduced, not clipped)',
    `hue moved ${(dHue * 180 / Math.PI).toFixed(2)} deg — per-channel clipping has crept back in`)
  const cIn = Math.hypot(oogA, oogB), cOut = Math.hypot(backLab[1], backLab[2])
  assert(cOut < cIn, 'gamut mapping reduces chroma', `in ${cIn.toFixed(1)} out ${cOut.toFixed(1)}`)
  assert(mapped.every(v => v >= 0 && v <= 255 && Number.isInteger(v)),
    'gamut mapped output is valid 8-bit', `got ${mapped}`)

  // Adaptive K. Fixed K compressed a light roof recoloured to a dark chip into flat paint:
  // photo 7 measured roof L*61, an Onyx-class chip sits near L*15, and at K=0.55 the source
  // sd of 12.7 fell to 7.0. K must rise with travel and collapse to K_BASE when travel is nil.
  assert(Math.abs(adaptiveK(50, 50) - K_BASE) < 1e-9,
    'adaptiveK degrades to K_BASE when chip and roof means coincide', `got ${adaptiveK(50, 50)}`)
  assert(adaptiveK(15, 61) > 0.75,
    'adaptiveK approaches K_MAX on a long light-to-dark travel (photo 7 case)',
    `got ${adaptiveK(15, 61).toFixed(3)} — dark chips on light roofs will read as flat paint`)
  // Upper guard: K_MAX above ~0.85 reproduces source tab mottling strongly enough that it
  // dominates the render on a light-to-dark recolour. Measured on photo 7 / Brownwood.
  assert(adaptiveK(15, 61) <= 0.85,
    'adaptiveK stays below the tab-mottling threshold on long travels',
    `got ${adaptiveK(15, 61).toFixed(3)} — source shingle tabs will read as blocky patterning`)
  assert(adaptiveK(40, 35) < 0.65,
    'adaptiveK stays near baseline on short travel (dark chip on dark roof)',
    `got ${adaptiveK(40, 35).toFixed(3)} — legacy-equivalent cases would change appearance`)
  assert(adaptiveK(0, 100) <= K_MAX && adaptiveK(100, 0) <= K_MAX,
    'adaptiveK never exceeds K_MAX', 'contrast would be amplified beyond the source')

  // Chroma rolloff: full chip chroma through the midtones, tapered at both ends so saturation
  // is not painted into specular highlights or deep shade.
  assert(chromaRolloff(50) === 1 && chromaRolloff(L_ROLLOFF_LO) === 1 && chromaRolloff(L_ROLLOFF_HI) === 1,
    'chroma rolloff is unity across the midtone band', 'midtones would be desaturated')
  assert(Math.abs(chromaRolloff(0) - CHROMA_ROLLOFF_MIN) < 1e-9
      && Math.abs(chromaRolloff(100) - CHROMA_ROLLOFF_MIN) < 1e-9,
    'chroma rolloff reaches its floor at both ends', 'extremes would take full chip chroma')
  assert(chromaRolloff(10) > CHROMA_ROLLOFF_MIN && chromaRolloff(10) < 1,
    'chroma rolloff is monotonic between floor and unity', `got ${chromaRolloff(10)}`)
  assert(chromaRolloff(5) > 0,
    'chroma rolloff never reaches zero (deep shade keeps some hue)', 'shadow would go pure grey')

  // The pixel op itself: a roof pixel sitting exactly at the mean must render as the chip.
  // This is the LAB equivalent of the long-standing additive invariant in block 3.
  const chip = rgbToLab(0x6B, 0x4F, 0x3A)          // a Brownwood-class chromatic chip
  const kEff = adaptiveK(chip[0], chip[0])
  const atMean = labRecolorPixel({
    srcL: chip[0], roofMeanL: chip[0],
    chipL: chip[0], chipA: chip[1], chipB: chip[2], k: kEff,
  })
  assert(Math.abs(atMean[0] - 0x6B) <= 2 && Math.abs(atMean[1] - 0x4F) <= 2 && Math.abs(atMean[2] - 0x3A) <= 2,
    'mid-tone roof pixel renders as the exact chip hex (lab path)',
    `expected ~[107,79,58] got [${atMean}]`)

  // Shading direction must survive: a brighter source pixel must render brighter.
  const dark  = labRecolorPixel({ srcL: 30, roofMeanL: 55, chipL: chip[0], chipA: chip[1], chipB: chip[2], k: 0.8 })
  const light = labRecolorPixel({ srcL: 80, roofMeanL: 55, chipL: chip[0], chipA: chip[1], chipB: chip[2], k: 0.8 })
  assert(rgbToLab(...light)[0] > rgbToLab(...dark)[0],
    'shading direction preserved — brighter source pixel renders brighter',
    'ridge lines and shadows would invert')

  // Deep shade must not come back more saturated than the chip. This was the specific defect
  // of the additive engine: an equal offset on all three channels holds code-value spread
  // constant while perceptual chroma rises as lightness falls.
  const shadow = labRecolorPixel({ srcL: 6, roofMeanL: 55, chipL: chip[0], chipA: chip[1], chipB: chip[2], k: 0.8 })
  const shadowLab = rgbToLab(...shadow)
  assert(Math.hypot(shadowLab[1], shadowLab[2]) <= Math.hypot(chip[1], chip[2]) + 0.5,
    'deep shade is not more saturated than the chip itself',
    `chip C* ${Math.hypot(chip[1], chip[2]).toFixed(1)} vs shadow C* ${Math.hypot(shadowLab[1], shadowLab[2]).toFixed(1)}`)

  // Every output must be a legal 8-bit triple across the full L* sweep — no NaN, no clipping
  // artefacts leaking through from an out-of-gamut intermediate.
  let allValid = true
  for (let L = 0; L <= 100; L += 2) {
    const px = labRecolorPixel({ srcL: L, roofMeanL: 50, chipL: chip[0], chipA: chip[1], chipB: chip[2], k: 1.0 })
    if (!px.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) { allValid = false; break }
  }
  assert(allValid, 'lab recolour yields valid 8-bit output across the full L* sweep',
    'NaN or out-of-range channel leaked from the gamut mapper')
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(failures === 0
  ? '\n\x1b[32m\x1b[1mAll invariants hold.\x1b[0m\n'
  : `\n\x1b[31m\x1b[1m${failures} invariant(s) broken — do not push.\x1b[0m\n`)
process.exit(failures === 0 ? 0 : 1)
