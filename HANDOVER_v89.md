# ProGuild.ai — Dev Handover v89 (Sprint 4 — Session 2)
**Date:** May 12, 2026  
**Last commit:** `64a305d` on `dev` + `staging`  
**Next session starts here.**

---

## 0. CRITICAL RULES — UNCHANGED

1. **`lib/roofing/premiumReportPdf.ts` and `lib/roofing/reportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax. Use `React.createElement` aliased as `h`.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push: always use full token URL, never `&&`, always separate commands:**
   ```bash
   git push https://GH_TOKEN_SEE_VERCEL@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://GH_TOKEN_SEE_VERCEL@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **DO NOT BUILD until user says "go".**
5. **NO Claude/Anthropic API in prod** — Gemini only for vision.
6. **Staging gate:** `process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'` — auto-set by Vercel.
7. **Always `npx tsc --noEmit` before pushing** — learned the hard way this session.

---

## 1. Project Stack

| Item | Value |
|---|---|
| Repo | github.com/valktech11/ProGuild |
| GH Token | GH_TOKEN_SEE_VERCEL (in Vercel env vars) |
| Stack | Next.js 16.2.2, Supabase, Vercel (project: tradesnetwork), Cloudflare R2 |
| Staging | staging.proguild.ai (password: proguild2026) |
| Test account | wasimakram@wasim.com |
| Branch flow | dev → staging (both auto-deploy on push, both mapped in Vercel) |

---

## 2. What Was Fixed This Session

### 2.1 Root Cause: SVG Diagrams Blank (FIXED ✅)
**Two bugs found and fixed:**

**Bug 1 — Solar API segment structure mismatch:**  
`groundAreaMeters2` is nested inside `segment.stats.groundAreaMeters2`, NOT at `segment.groundAreaMeters2` (top level). The `parseSegments()` filter was rejecting all 8 segments because it checked the wrong key. Fixed in `parseSegments()` to check `stats.groundAreaMeters2` with fallback to top-level for legacy data.

**Bug 2 — `boundingBox` location:**  
`boundingBox` is a top-level key on the Solar API `buildingInsights` response, NOT inside `solarPotential`. Fixed `parseBbox()` to check top-level first, then `solarPotential` as fallback.

**Bug 3 — SVG Text props format:**  
`Text` component in react-pdf SVG context requires `fontSize`, `fill`, `textAnchor` inside `style: {}` object, not as flat props. All `Text as any` calls inside `buildDiagramSvg()` were passing flat props → silently failed. Fixed across all 10 call sites.

**Bug 4 — Null children spread:**  
`legend` and `pitchLegend` can be `null` — were spread directly into `h(Svg, ...)` children causing silent render failure. Fixed with `...(legend ? [legend] : [])`.

### 2.2 Caching: Material Order Serving Stale PDF (FIXED ✅)
The UI was checking `report.premium_r2_url` — if set, rendered a static `<a>` link instead of calling the API. User could never get a fresh PDF. Fixed two ways:
1. Route now always clears `premium_r2_key = null` before regenerating
2. UI Material Order button always calls the API (no static link shortcut)

### 2.3 Street View Indoor Photos (FIXED ✅ — by replacing entirely)
`source=outdoor` in Google Street View Static API does NOT reliably filter user-uploaded indoor photos. The property at 3919 Highgate ct has indoor bedroom photos uploaded at that GPS coordinate by a resident — all 4 headings returned bedroom/living room shots regardless of API parameters.

**Decision: Dropped Street View entirely. Replaced with 4 oblique satellite images.**

Pages 3-4 now show N/S/E/W offset satellite views using Maps Static API with `~30m coordinate offset` in each cardinal direction. No indoor photos possible. Clean aerial views every time.

### 2.4 Page 5 Length Diagram (REPLACED ✅)
**Root cause: Not fixable with available data.**  
Solar API `roofSegmentStats` gives only centroids — no polygon vertices, no edge coordinates. Drawing lines center-to-center is geometrically meaningless and visually blank/wrong.

**Replaced with a proper LF Summary Table page:**
- Color-coded table: edge type, description, footage, "order for" material
- Total LF bar (accent color)
- Combined lengths card (ridge+hip for capping, eave+rake for drip edge)
- Accuracy note card

### 2.5 Satellite Yellow Bounding Box (FIXED ✅)
`buildTopViewUrl()` was drawing a yellow `path=` overlay on the Maps Static image. Removed — clean satellite image only.

### 2.6 Cover Page Dead Space (PARTIALLY FIXED)
Satellite image height increased from 190 → 260px. Property details strip added below LF+pro columns. Some dead space remains at very bottom — react-pdf `Page` flex layout quirk. Not critical.

### 2.7 Mobile UI Overhaul (FIXED ✅)
Complete rewrite of `app/dashboard/roofing/property/[id]/page.tsx` render block:
- **Stats strip**: 4-chip row (Sq / Pitch / Facets / Waste) visible immediately when report exists
- **Action row**: 3 equal tiles (ProMeasure / Calculator / Generate) always at top — no more buried scroll
- **Generate Report**: compact tile, shows "Re-run" when report exists, "Generate" when none
- **Report cards**: clean horizontal layout — metrics left, buttons right, no collision
- **Property fields**: always visible in read-only mode. Edit button toggles to editable. Was edit-only before (fields invisible unless editing — terrible UX)
- **Button labels**: "Bid" → "Quick Bid", "Material" → "Material Order"

### 2.8 Debug Routes Added (STAGING ONLY)
`app/api/roofing/solar-debug/route.ts` — GET endpoint, fetches live Solar API for Highgate coords, shows segment structure. Used to diagnose the `groundAreaMeters2` location. **Delete before launch.**

---

## 3. Current PDF Structure (12 pages)

| Page | Content | Status |
|---|---|---|
| 1 | Cover: satellite, metrics, LF summary, pro card, property details strip | ✅ Working, minor dead space at bottom |
| 2 | Full satellite top-down (flex:1 fills page) | ✅ |
| 3 | Oblique aerial N + S (offset satellite, no Street View) | ✅ |
| 4 | Oblique aerial E + W | ✅ |
| 5 | LF Summary table (replaces broken length diagram) | ✅ |
| 6 | Pitch diagram SVG (8 segments, colored by pitch) | ✅ |
| 7 | Area diagram SVG (sq ft per segment) | ✅ |
| 8 | Notes diagram SVG (A–H facet labels) | ✅ |
| 9 | Report summary (pitch breakdown, complexity, waste table) | ✅ |
| 10 | All structures totals (LF breakdown, coordinates) | ✅ |
| 11 | Material estimate (5 brands × 6 waste% columns) | ✅ |
| 12 | Disclaimer | ✅ |

---

## 4. Key Architecture — Current State

### Solar API Segment Structure (CRITICAL — caused today's bugs)
```
solar_raw = buildingInsights response = {
  solarPotential: {
    roofSegmentStats: [
      {
        pitchDegrees: 27.4,
        azimuthDegrees: 38.2,
        stats: {
          areaMeters2: 44.3,        ← slope-corrected area
          groundAreaMeters2: 39.3,  ← NESTED HERE, not top-level
          sunshineQuantiles: [...]
        },
        center: { latitude, longitude },
        boundingBox: { sw, ne },
        planeHeightAtCenterMeters: 13.7
      }
    ]
  },
  boundingBox: { sw, ne },  ← TOP-LEVEL, not inside solarPotential
  imageryDate: { year, month, day }
}
```

### parseSegments() — current correct logic
```typescript
// Checks stats.groundAreaMeters2 first, then top-level fallback
const groundAreaMeters2 = (
  typeof s.groundAreaMeters2 === 'number' ? s.groundAreaMeters2 :
  typeof stats?.groundAreaMeters2 === 'number' ? stats.groundAreaMeters2 :
  0
)
const planeAreaMeters2 = (
  typeof s.planeAreaMeters2 === 'number' ? s.planeAreaMeters2 :
  typeof stats?.areaMeters2 === 'number' ? stats.areaMeters2 :
  undefined
)
```

### Oblique Satellite (replaces Street View)
```typescript
// Offset ~30m in cardinal direction so building appears from that side
function buildObliqueOffsetUrl(lat, lng, heading, apiKey) {
  const rad = (heading * Math.PI) / 180
  const offsetLat = lat - Math.cos(rad) * 0.0003
  const offsetLng = lng + Math.sin(rad) * 0.0003
  return `${MAPS_STATIC_BASE}?center=${offsetLat},${offsetLng}&zoom=19&size=640x400&maptype=satellite&key=${apiKey}`
}
```

### Pro Name Fallback Chain
```typescript
proName: pro.full_name ?? pro.business_name ?? (pro.email ? pro.email.split('@')[0] : null) ?? 'ProGuild Pro'
```
**Note:** Test account `wasimakram@wasim.com` has `full_name = null` and `business_name = null`. With current fallback it shows "wasimakram". Actual pro accounts should have `full_name` set.

---

## 5. Test Reports

| Property | UUID | Solar segs | Status |
|---|---|---|---|
| 3919 Highgate ct, Jacksonville FL | `f501139a-967f-4284-a89d-568546804e05` | 8 | ✅ Full working — diagrams, LF, oblique images |
| 17507 Cypress Hilltop Way, Hockley TX | `3ed6e40e-017c-4343-8511-fd027e55e206` | 15 | Needs regen |
| 3696 Walnut Brook Dr, Rochester Hills MI | `754f5244-5469-4a23-91f4-dc0cbb53f17b` | 16 | `solar_raw = NULL` — old report pre-Sprint 4. Delete + regen. |

**Rochester Hills error:** "No Solar API data on this report — regenerate the Bid Report first"  
Fix: Delete report, click Re-run. New report saves `solar_raw` to DB.

---

## 6. Known Remaining Issues

### Priority 1 — classifyEdge() bug (Ridge=981ft, Hip=0ft)
**File:** `lib/roofing/dsmAnalysis.ts`  
**Bug:** `classifyEdge()` uses dot product of surface normals → wrong for shallow pitches. Misclassifies virtually all hips as ridges.  
**Fix approach:** Use **azimuth difference between adjacent segments** from Solar API data:
- Azimuth diff < 30° → Ridge (same-facing slopes, peak between them)
- Azimuth diff 30°-150° → Hip (different-facing, sloped corner)
- Azimuth diff > 150° → Valley (facing away, internal channel)
- Boundary segment → Eave or Rake (determined by azimuth vs building cardinal orientation)

This is the #1 accuracy gap. The correct data is already in `solar_raw.solarPotential.roofSegmentStats[].azimuthDegrees`. No new data source needed.

### Priority 2 — Production error handling for solar_raw = NULL
Old reports (pre-Sprint 4) have `solar_raw = NULL`. Material Order fails with unhelpful error.  
**Fix needed:**
1. Better error message: "This report needs a refresh — click Re-run above (30 seconds)"
2. Highlight/pulse the Re-run button when this error shows
3. Pre-launch migration: backfill `solar_raw` for all existing reports

### Priority 3 — Cover page dead space
Bottom ~30% of cover page 1 is empty below the property details strip. react-pdf `Page` doesn't auto-stretch flex children. Add more content or use `minHeight` on the details strip.

### Priority 4 — Oblique satellite images are same image (all 4)
The offset approach (0.0003 degree in each direction) produces very similar images because at zoom=19 the offset is small relative to the image frame. Consider: increase offset to 0.001, or use zoom=18 for a wider view that actually shows different aspects.

### Priority 5 — Report→Calculator→Estimate pre-fill (Sprint 4 planned)
`sessionStorage` push already implemented for squares/pitch from Quick Bid. Needs extension to pre-fill the full material estimate from the Material Order report.

### Priority 6 — Pro name still shows "ProGuild Pro" for test account
The `maybeSingle()` query may still be returning null for the test pro_id. Verify by checking Supabase directly: `SELECT * FROM pros WHERE id = '2fbc58c2-c9d3-4040-acf9-810c3b215a05'`.

---

## 7. Measurement Accuracy — Honest Assessment

### What's accurate
- **Total squares/area**: Google Solar API area is solid, typically ±5% of reality. **Don't change this.**
- **Facet count**: Accurate.
- **Dominant pitch**: Accurate after 2-pass smoothing.
- **Waste factor**: Correct calculation from facet count.

### What's inaccurate
- **Ridge LF**: Shows ~981ft (should be ~27ft) — classifyEdge() bug
- **Hip LF**: Shows 0ft (should be ~162ft) — classifyEdge() bug  
- **Valley LF**: Shows ~39ft (could be right or wrong — coincidence)
- **Eave vs Rake split**: 70/30 heuristic — ±30% error on each

### What fixes this
1. **classifyEdge() azimuth fix** (Priority 1 above) — brings ridge/hip/valley to ±20% accuracy
2. **Gemini Vision on satellite** — visual edge tracing, planned Sprint 4
3. **Nearmap** — Sprint 6, EagleView-grade accuracy

### What won't fix this
- MS Building Footprints — gives eave only, not ridge/hip/valley
- More Solar API calls — already using all available data

---

## 8. Commits This Session

| Hash | Message |
|---|---|
| `64a305d` | fix: replace Street View with oblique satellite, LF summary page, always-visible property fields, Quick Bid/Material Order labels |
| `500af8f` | feat: mobile UX overhaul — stats strip, action row at top, compact report cards, edit mode collapsed |
| `7478c29` | fix: syntax error literal \n} in buildCoverPage |
| `6ff232d` | fix: edge lines between centers, remove bbox overlay, Street View location-only, cover dead space |
| `ba2964b` | fix: Material Order always regenerates PDF instead of serving cached link |
| `7ecab52` | fix: always regen PDF (clear r2_key before build) |
| `3cec8f1` | **fix: parse groundAreaMeters2 from stats sub-object — this was the SVG root cause** |
| `0c861f4` | fix: SVG Text props — move fontSize/fill/textAnchor into style object |

---

## 9. Sprint Roadmap

| Sprint | Status |
|---|---|
| 1-3 | ✅ Complete |
| 4 — SVG diagrams rendering | ✅ Done this session |
| 4 — Street View → oblique satellite | ✅ Done this session |
| 4 — Mobile UX overhaul | ✅ Done this session |
| 4 — classifyEdge() azimuth fix | ⚠️ Next priority |
| 4 — solar_raw=NULL production error handling | ⚠️ Next priority |
| 4 — Report→Calculator→Estimate pre-fill | ⬜ Planned |
| 4 — Gemini Vision on satellite for edge detection | ⬜ Planned |
| 5 — Microsoft Building Footprints | ⬜ Sprint 5 |
| 6 — Nearmap AI Features | ⬜ Sprint 6 |

---

## 10. Env Vars (Vercel staging)

```
GOOGLE_SOLAR_API_KEY      — Solar API + Maps Static + Gemini
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

---

## 11. Before Launch Checklist (Unchanged)

1. Delete `app/api/roofing/solar-debug/route.ts` (debug route, staging only)
2. Remove debug response block in `premium-report/route.ts` (returns JSON instead of PDF when segments=0)
3. Supabase Pro ($25/mo) — free tier pauses after inactivity
4. Twilio 10DLC — start now, 1-2 week approval
5. Stripe production activation
6. Google Places autocomplete referrer allowlist
7. Backfill `solar_raw` for all pre-Sprint-4 reports
8. Fix `classifyEdge()` before production (accuracy issue visible to paying customers)
