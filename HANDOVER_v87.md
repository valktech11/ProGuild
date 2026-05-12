# ProGuild.ai — Dev Handover v87 (Sprint 3 Final + Premium Report Rebuild Plan)
**Date:** May 12, 2026
**Last commit:** `ad96549` on `dev` + `staging`
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax. Use `React.createElement` aliased as `h`.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push: always use full token URL, never `&&`, always separate commands:**
   ```bash
   git push https://GH_TOKEN_SEE_VERCEL@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://GH_TOKEN_SEE_VERCEL@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **DO NOT BUILD until user says "go".**
5. **NO Claude/Anthropic API in prod** — Gemini only for vision.
6. **Staging gate:** `process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'` — auto-set by Vercel.

---

## 1. Project Stack

| Item | Value |
|---|---|
| Repo | github.com/valktech11/ProGuild |
| GH Token | GH_TOKEN_SEE_VERCEL |
| Stack | Next.js 16.2.2, Supabase, Vercel (project: tradesnetwork), Cloudflare R2 |
| Staging | staging.proguild.ai (password: proguild2026) |
| Test account | wasimakram@wasim.com |
| Branch flow | dev → staging (auto-deploy on push) |

---

## 2. What Was Done This Session

### Segment Algorithm v2.1 — Validated Against Roofr Ground Truth

Rewrote `computeLinearFootageFromSegments()` in `lib/roofing/dsmAnalysis.ts`.

**Validation results (3 Roofr ground truth properties):**

| Property | Segs | Ridge | Hip | Valley | Eave | Rake | Avg Err |
|---|---|---|---|---|---|---|---|
| Highgate 3919 Jacksonville FL | 8 | -7% ✅ | +9% ✅ | +5% ✅ | +2% ✅ | -11% ✅ | **6.8%** |
| Cypress Hilltop 17507 Hockley TX | 15 | +23% ⚠️ | +31% ⚠️ | +3% ✅ | -0.3% ✅ | +133% ❌ | **38%** |
| Walnut Brook 3696 Rochester Hills MI | 16 | -65% ❌ | +75% ❌ | -62% ❌ | +62% ❌ | -47% ❌ | **62%** |

**Root cause of Cypress/Walnut errors:** Solar API under-segments complex roofs (15-16 segs vs 22-23 real facets). Missing segments = missing edge data. Walnut Brook's 173ft ridge is almost entirely from dormers — dormers are vertical geometry, invisible to any ground-projection approach.

**Algorithm v2.1 key rules (in `lib/roofing/dsmAnalysis.ts`):**
- **Ridge:** 180°-opposing pairs, at least one main segment (≥18m²) required. Skip sec↔sec pairs (noise). Length = 0.7 × min(sqrt(gndA), sqrt(gndB))
- **Valley:** main↔secondary pairs only, azDiff 30-120°, tight adjacency 2.0×. Catalogued so hip step skips them.
- **Hip:** all adjacent pairs azDiff 45-150° NOT already valleys. main↔main: pitch-corrected + capped. Others: raw dist capped.
- **Eave/Rake:** perimeter from segment areas, shape-corrected. Only main↔main ridge segs produce rake (gable ends). Hip segs use triangular correction factor 2.8×.

### DSM Investigation — Definitive Findings

Spent significant time investigating Google Solar API DSM GeoTIFFs:
- **LOW quality** (`:DSM:LOW`): 0.1°/pixel = ~11km/pixel. Global terrain model. Useless for roof geometry.
- **HIGH quality** (`:DSM:HIGH`): Only available for ~30% of US (dense metros where Google has flown high-res oblique missions). MEDIUM/LOW quality addresses return global terrain regardless of `pixelSizeMeters=0.1` parameter.
- **Our test properties** (Hockley TX, Rochester Hills MI) are both MEDIUM quality — no usable DSM.
- **Fixed:** `dataLayers` call now uses `requiredQuality=HIGH&pixelSizeMeters=0.1` (commit `c1ce4cf`). Debug route returns HIGH URLs for HIGH quality addresses.

**DSM gradient detection approach:** Abandoned. The data doesn't exist for the majority of US suburban addresses.

### Accuracy Ceiling by Data Source

| Source | Coverage | Max Accuracy | Cost/report |
|---|---|---|---|
| Solar roofSegmentStats | ~95% US | ±7% simple, ±62% dormers | $0.006 |
| Solar DSM GeoTIFF | ~30% US | ±15% (HIGH only) | $0.006 |
| Microsoft Footprints + skeleton | ~95% US | ±5% eave, ±65% ridge (no dormers) | $0 |
| Street View x4 + Gemini classify | ~85% US | Classification only, not ft | $0.015 |
| Nearmap AI Features | ~90% US | ±5% all lines | $0.50 |

### US Roof Complexity Distribution
- Simple hip (≤8 Solar segs): ~40% of US — our algo ±7% ✅
- Hip + wing (9-12 segs): ~30% — our algo ±20-30% ⚠️
- Complex multi-wing (13-16 segs): ~20% — our algo ±38% ❌
- Dormers + complex (16+ segs): ~10% — our algo ±62% ❌

**Practical note:** Storm chasers work suburban subdivisions (post-1990 simple hip roofs). That's the highest-volume market and where we're most accurate. Ship it.

---

## 3. Report Test Property UUIDs (Staging)

| Property | UUID | Roofr Facets | Solar Segs |
|---|---|---|---|
| 3919 Highgate ct, Jacksonville FL | `c748a70c-35b9-4223-b112-2f1fdf9b1126` | 22 | 8 |
| 17507 Cypress Hilltop Way, Hockley TX | `3ed6e40e-017c-4343-8511-fd027e55e206` | 22 | 15 |
| 3696 Walnut Brook Dr, Rochester Hills MI | `754f5244-5469-4a23-91f4-dc0cbb53f17b` | 23 | 16 |

To regenerate linear footage after algo changes:
```sql
UPDATE roof_reports
SET linear_footage = NULL, premium_r2_key = NULL
WHERE id IN ('c748a70c-35b9-4223-b112-2f1fdf9b1126','3ed6e40e-017c-4343-8511-fd027e55e206','754f5244-5469-4a23-91f4-dc0cbb53f17b');
```

---

## 4. NEXT SESSION — Premium Report Full Rebuild

**The main task for next session.** Do NOT start building until user says "go". Review this entire section first.

### Target Page Structure (EagleView/Roofr parity)

| Page | Content | Source |
|---|---|---|
| 1 | Cover — satellite top view + measurements panel + pro info | Maps Static + DB |
| 2 | Images — Top view full page | Maps Static |
| 3 | Images — N + S Street View obliques | Street View Static |
| 4 | Images — E + W Street View obliques | Street View Static |
| 5 | Length Diagram — SVG wireframe, colour-coded edges, ft labels | roofSegmentStats |
| 6 | Pitch Diagram — SVG, facets shaded by pitch, slope arrows | roofSegmentStats |
| 7 | Area Diagram — SVG, sqft label at each segment centroid | roofSegmentStats |
| 8 | Notes Diagram — SVG, A-Z labels smallest→largest | roofSegmentStats |
| 9 | Report Summary — areas per pitch + complexity bar + waste table | DB |
| 10 | All Structures Totals — full linear footage breakdown | DB |
| 11 | Material Estimate — by brand × waste% | Computed from LF |
| 12 | Disclaimer | Static |

### What's Skipped (vs EagleView)
- Cover 3D wireframe → skip (needs Pictometry oblique)
- Penetrations diagram → skip (needs oblique imagery to detect dormers/skylights)
- Decimal precision appendix → skip (approximated segments, not vertex-accurate)
- Wall/step flashing → add as approximation with disclaimer

### Route Changes Needed (`app/api/roofing/premium-report/route.ts`)

1. Add `solar_raw` to the DB select (already in schema, just not selected)
2. Fetch top-view satellite image (reuse `fetchTopView` logic from `report/route.ts`)
3. Fetch 4 Street View cardinal images (heading 0/90/180/270, pitch=10, fov=90)
4. Pass image buffers + `roofSegmentStats` + `bbox` to PDF builder

**Image fetching pattern** (copy from `report/route.ts`):
```typescript
async function fetchImageBase64(url: string, label = ''): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) { console.warn(`image ${label} failed`); return '' }
  const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${mime};base64,${buf.toString('base64')}`
}

// Top view — Maps Static zoom=21 with yellow bbox overlay
// Street View — heading=0/90/180/270, size=640x400, pitch=10, fov=90
// All parallel with Promise.all — add to maxDuration if needed (keep at 60s)
```

### SVG Diagram Generation

`roofSegmentStats` gives us per-segment: `pitchDegrees`, `azimuthDegrees`, `groundAreaMeters2`, `center.latitude`, `center.longitude`.

**Projection approach:**
1. Find bounding box of all segment centers
2. Project lat/lng → pixel coords (simple linear, aspect-corrected for latitude)
3. Per segment: approximate as quadrilateral from center + sqrt(area) + azimuth
   - Width = `sqrt(groundAreaM2)` metres → pixels
   - Facing direction from azimuth
   - Two opposing edges parallel to downslope direction
4. Classify edges using same v2.1 algorithm logic (ridge/hip/valley/eave/rake)
5. Render 4 variants: length labels, pitch shading+arrows, area labels, A-Z labels

**Edge colours (matching Roofr):**
- Ridge: `#1E3A8A` (dark blue)
- Hip: `#D97706` (amber)
- Valley: `#DC2626` (red)
- Eave: `#6B7280` (gray)
- Rake: `#16A34A` (green)

**SVG output:** Inline SVG string, embedded in react-pdf `<Svg>` component. react-pdf has native SVG support — no rasterization needed.

**North arrow:** Small compass rose SVG in bottom-right of each diagram, derived from the dominant azimuth of all segments.

### Material Estimate Table

Full brand × waste% table, same as Roofr. Compute from linear footage:

```typescript
// Bundle/roll constants
const BUNDLE_SQ = 33.3  // sqft per bundle (3 bundles = 1 square)
const brands = {
  shingle: [
    { name: 'IKO - Cambridge', sqPerBundle: 33.3 },
    { name: 'GAF - Timberline', sqPerBundle: 33.3 },
    { name: 'Owens Corning - Duration', sqPerBundle: 33.3 },
    { name: 'CertainTeed - Landmark', sqPerBundle: 33.3 },
    { name: 'Atlas - Pristine', sqPerBundle: 33.3 },
  ],
  starter: [
    { name: 'GAF - Pro-Start', lfPerBundle: 120 },
    { name: 'IKO - Leading Edge Plus', lfPerBundle: 105 },
    { name: 'CertainTeed - SwiftStart', lfPerBundle: 120 },
    { name: 'Owens Corning - Starter Strip', lfPerBundle: 105 },
  ],
  iceWater: [
    { name: 'GAF - WeatherWatch', lfPerRoll: 65 },
    { name: 'IKO - StormShield', lfPerRoll: 65 },
    { name: 'CertainTeed - WinterGuard', lfPerRoll: 65 },
    { name: 'Owens Corning - WeatherLock', lfPerRoll: 75 },
  ],
  synthetic: [
    { name: 'GAF - Deck-Armor', sqftPerRoll: 1000 },
    { name: 'IKO - Stormtite', sqftPerRoll: 1000 },
    { name: 'CertainTeed - RoofRunner', sqftPerRoll: 1000 },
    { name: 'Owens Corning - RhinoRoof', sqftPerRoll: 1000 },
  ],
  capping: [
    { name: 'GAF - Seal-A-Ridge', lfPerBundle: 25 },
    { name: 'IKO - Hip and Ridge', lfPerBundle: 33 },
    { name: 'CertainTeed - Shadow Ridge', lfPerBundle: 33 },
    { name: 'Owens Corning - DecoRidge', lfPerBundle: 20 },
  ],
}

// Waste columns: 0%, 10%, 12%, 15%, 17%, 20%
// Ice & water base = eave_ft + valley_ft (+ step flashing approx)
// Starter = eave_ft + rake_ft
// Capping = ridge_ft + hip_ft
// Drip edge pieces = ceil((eave_ft + rake_ft) / 10)
// Valley sheets (8ft) = ceil(valley_ft / 8)
```

### Wall/Step Flashing Approximation
```typescript
// Rough approximations — display with disclaimer
const wall_flashing_ft = Math.round((lf.hip_ft || 0) * 0.08)
const step_flashing_ft = Math.round((lf.valley_ft || 0) * 1.7)
```

### Complexity Warning on PDF

Add to page 9 (Report Summary) based on segment count:
- `segments <= 10` → no warning
- `segments 11-15` → amber badge: "Complex roof — verify linear footage on-site before ordering"
- `segments >= 16` → red badge: "High complexity — field measurement recommended"

### PremiumReportData Type Updates Needed

Add to the interface in `premiumReportPdf.ts`:
```typescript
export interface PremiumReportData {
  // ... existing fields ...
  topViewBase64: string       // Maps Static top view with bbox
  northViewBase64: string     // Street View heading=0
  southViewBase64: string     // Street View heading=180
  eastViewBase64: string      // Street View heading=90
  westViewBase64: string      // Street View heading=270
  segments: RoofSegment[]     // roofSegmentStats from solar_raw
  bbox: { swLat: number; swLng: number; neLat: number; neLng: number } | null
}
```

---

## 5. Improvement Roadmap (Post-Launch)

### Sprint 4 — Street View + Gemini Classification ($0.015/report)
Add Gemini roof-type classification on the 4 Street View images:
```
Prompt: "Analyze these 4 aerial views of a residential roof. Return JSON only:
{
  roof_type: 'hip' | 'gable' | 'hip_with_gables' | 'complex_dormer',
  stories: 1 | 2 | 3,
  dormer_count: N,
  gable_ends_visible: boolean
}"
```
Use output to:
- `hip` → rake_ratio = 0.05, no ridge from main segments
- `hip_with_gables` → rake_ratio = 0.15
- `gable` → rake_ratio = 0.30
- `complex_dormer` → surface "Field measurement recommended" warning

Expected improvement: Cypress rake from 133% → ~20%.

### Sprint 5 — Microsoft Building Footprints (free)
- Load US state GeoJSON files into Supabase PostGIS
- Spatial query by lat/lng → accurate footprint polygon
- Use polygon perimeter for eave accuracy (replaces sqrt(area)×4)
- Use polygon convexity/shape for rake ratio hint
- Does NOT fix dormers — only horizontal geometry

### Sprint 6 — Nearmap AI Features ($0.50/report)
- Viable when MRR supports $500/mo minimum
- One API call replaces entire segment algorithm
- ±5% accuracy for 90% of US addresses
- Add "Certified Accurate" tier at higher price point

---

## 6. Architecture — Key Files

```
app/
  api/
    roofing/
      report/route.ts          — Quick Bid report pipeline
      reports/route.ts         — GET list + DELETE
      dsm/route.ts             — POST: segment-based linear footage
                                 GET: debug (staging only)
      premium-report/route.ts  — POST: fetch images + build Premium PDF
  dashboard/
    roofing/
      property/[id]/page.tsx   — Property detail page

lib/
  api/
    utils.ts                   — Shared utilities
  roofing/
    dsmAnalysis.ts             — computeLinearFootageFromSegments() v2.1
    reportPdf.ts               — Quick Bid PDF (NO JSX)
    premiumReportPdf.ts        — Premium PDF (NO JSX) — NEEDS REBUILD
```

---

## 7. Commits This Session

| Hash | Message |
|---|---|
| `ad96549` | fix: segment algo v2.1 — skip sec↔sec ridge pairs, only main↔main segs produce rake |
| `5e69aa0` | feat: segment algo v2 — validated ±7% avg error on Highgate |
| `c1ce4cf` | fix: dataLayers requiredQuality HIGH + pixelSizeMeters 0.1 |

---

## 8. Sprint Roadmap

| Sprint | Status | Notes |
|---|---|---|
| 1 — Full pipeline, PDF, R2 | ✅ Complete | |
| 2A — Nearest supplier, NOAA | ✅ Done | NOAA frozen, deferred |
| 3 — Gemini Vision, Historic badge | ✅ Complete | |
| 3 — Quick Bid PDF (EagleView Bid Perfect) | ✅ Complete | |
| 3 — Premium PDF (EagleView Premium) | ⚠️ Partial | Linear footage done, diagrams + images pending |
| 3 — Linear footage (segment-based) | ✅ v2.1 shipped | ±7% simple, ±38-62% complex |
| 4 — Premium PDF full rebuild | ⬜ Next session | Images + SVG diagrams + material table |
| 4 — Street View + Gemini classification | ⬜ Sprint 4 | Improves complex roof rake accuracy |
| 4 — Report→Calculator→Estimate pre-fill | ⬜ Sprint 4 | sessionStorage already set |
| 5 — Microsoft Building Footprints | ⬜ Sprint 5 | Eave accuracy improvement |
| 6 — Nearmap AI Features | ⬜ Sprint 6 | Full parity with Roofr |

---

## 9. Pending Before Launch (Unchanged)

### Priority 1 — Supabase Pro ($25/mo)
Free tier pauses DB after inactivity. 134k records at risk. Do before outreach.

### Priority 2 — Twilio 10DLC
Start now — 1-2 week approval. Blocks SMS.

### Priority 3 — Clean debug routes before prod
```bash
rm -rf app/api/roofing/dsm-debug/
# Remove mode=segments GET handler from dsm/route.ts
```

### Priority 4 — Stripe production activation
Test mode only. Activate before real users.

### Priority 5 — Google Places autocomplete fix
`NEXT_PUBLIC_GOOGLE_MAPS_KEY` referrer allowlist: add `staging.proguild.ai/*` and `proguild.ai/*`.

---

## 10. Env Vars (Vercel staging)

```
GOOGLE_SOLAR_API_KEY      — Solar API + Maps Static + Street View + Gemini
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME            — proguild-media-staging
NEXT_PUBLIC_VERCEL_ENV    — auto-set by Vercel
GEMINI_API_KEY            — AI Studio prepay, $10 loaded May 11 2026
```

**Note:** `GOOGLE_SOLAR_API_KEY` also covers Street View Static API — same key, same server-only usage. No additional keys needed for cardinal images.
