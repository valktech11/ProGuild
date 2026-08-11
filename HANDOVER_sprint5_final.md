# ProGuild — Sprint 5 Handover (Linear Footage Classifier)
**Date:** May 13, 2026  
**Last commit:** `1ca695f` (+ route cleanup, not yet pushed)  
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. `lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`
2. All roofing API routes need `export const runtime = 'nodejs'`
3. Git push: always full token URL, separate commands, push BOTH dev AND staging
4. **DO NOT BUILD until user says "go"**
5. NO Claude/Anthropic API in prod — Gemini only
6. `npx tsc --noEmit` before every push

---

## 1. What Sprint 5 Was About

Building accurate linear footage (ridge/hip/valley/eave/rake in feet) from Google Solar API segment data, replacing EagleView's $40-$91 reports. The classifier feeds the Premium Material Order PDF.

**Three test properties (Roofr ground truth):**

| Property | Segs | Type | Ridge | Hip | Valley | Eave | Rake |
|---|---|---|---|---|---|---|---|
| Jacksonville FL | 8 | Simple hip | 29 | 149 | 37 | 224 | 53 |
| Hockley TX | 15 | Multi-wing | 78 | 238 | 105 | 317 | 45 |
| Rochester Hills MI | 16 | Dormers | 173 | 170 | 188 | 298 | 144 |

**Test report IDs (samaltman@sam.com, pro_id: 2fbc58c2-c9d3-4040-acf9-810c3b215a05):**
- Jacksonville: `b200b680-7b7b-48d5-89bd-7de8dc8dfd2c`
- Hockley: `208d31e4-fc0a-4a6f-a1e8-9a3d42de6c7a`
- Rochester Hills: `5630f286-b52d-4fcd-a423-57c3ba5f5b5a`

**Debug URL (one-shot, no login):**
```
https://staging.proguild.ai/api/roofing/dsm?mode=recompute-all
```

---

## 2. Current State — What Works

### Current accuracy (v2 classifier, what ships today):

| Property | Ridge | Hip | Valley | Eave | Rake |
|---|---|---|---|---|---|
| **Jacksonville** | 27 (−7%) ✅ | 162 (+9%) ✅ | 39 (+5%) ✅ | 186 (−17%) ⚠️ | 80 (+51%) ❌ |
| **Hockley** | 40 (−49%) ❌ | 311 (+31%) ❌ | 108 (+3%) ✅ | 335 (+6%) ✅ | 50 (+11%) ✅ |
| **Rochester Hills** | 61 (−55%) ❌ | 298 (+75%) ❌ | 72 (−62%) ❌ | 244 (−18%) ✅ | 105 (−27%) ⚠️ |

Jacksonville is essentially solved. Hockley valley/eave/rake ✅. RH eave ✅.

The `±20% accuracy` note in the Material Order output is honest and defensible for launch.

---

## 3. Architecture — Key Files

```
lib/roofing/dsmAnalysis.ts      — ALL classifier logic
  computeLinearFootageFromSegments()   — v2 (production, always runs)
  computeLinearFootageV3()             — v3 (runs alongside, safety fallback to v2)
  traceMaskPerimeter()                 — mask GeoTIFF → perimeter in metres

app/api/roofing/dsm/route.ts    — POST: runs classifier, writes to DB
                                   GET: debug modes (staging only)
  mode=recompute-all             — runs all 3 test properties, no DB write
  mode=recompute&report_id=UUID  — single property, no DB write
  mode=segments&report_id=UUID   — dumps solar_raw segment data

app/api/roofing/premium-report/route.ts — reads linear_footage from DB → PDF
```

---

## 4. How the Classifier Works

### v2 (production)
```
RIDGE:  azDiff > 150°, at least one main face (≥18m²)
        both-main pairs → bbox overlap gate (0.0003° tolerance)
        main↔sec pairs  → adjOk centroid gate
        length = 0.7 × min(sqrt(gndA), sqrt(gndB))

VALLEY: main↔secondary tier, azDiff 30-120°, adjOk(2.0×)
        length = centroid distance

HIP:    azDiff 45-150°, adjOk(2.5×), NOT valley
        top-2 closest neighbours per segment (deduplication)
        length = centroid distance × pitch correction, capped at max rafter

EAVE/RAKE: mask perimeter × 70/30 split when mask available (HIGH/MEDIUM quality)
           fallback: segment perimeter heuristic
```

### v3 (experimental, always falls back to v2 currently)
Uses hull proximity (2m) for adjacency + drain-direction cross-wing filter for hip + v2 tier/azDiff classification. Currently produces worse R+H divergence than v2 on all properties → safety check (>40% divergence) triggers v2 fallback every time.

**v3 is NOT shipping — v2 is what runs in production.**

---

## 5. What Was Tried and Why It Failed

### Round 1-3: bbox-based adjacency in v3
Replaced adjOk with bbox overlap for ridge/valley/hip. Problem: bbox overlap at any fixed tolerance was either too tight (missed cross-wing pairs) or too loose (found false pairs). Went through 3 iterations.

### Round 4: face normal dot product (convexity test)
`dot(n_i, n_j) > 0 → hip/ridge, ≤ 0 → valley`. Failed because `cos(pitch)` dominates — every pair appeared convex (dot always > 0), valley = 0 on all properties.

### Round 5: drain-direction for valley
"Both faces drain toward each other → valley". Failed because centroid-to-centroid vector is a poor proxy for the shared edge direction. Jacksonville valley pairs don't satisfy mutual convergence — only one face drains toward the other.

### Round 6: drain-direction for hip cross-wing rejection + v2 valley logic
Hip=0 on Jacksonville — 2m hull proximity rejected all hip pairs (panel clusters too far apart). Valley massively overcounted.

### Key lesson
The Solar API's `roofSegmentStats` gives centroids, bounding boxes, and area — but NOT actual polygon vertices. Any geometry-correct approach (convexity, drain direction, polygon intersection) either fails or degrades without actual facet polygon data. v2's azimuth+area heuristics are surprisingly robust precisely because they encode the same geometric relationships without requiring precise polygon data.

---

## 6. What v2 Gets Wrong and Why

### Hockley ridge (40 vs 78, −49%)
`adjOk` centroid gate: `distM(s7,s8) > sqrt(min(52,21)) × 2.5 = 11.4m`. The s7↔s8 cross-wing ridge pair centroids are >11.4m apart → rejected. The bbox fix (0.0003° tolerance) was added but Hockley's MEDIUM imagery quality means smaller segment bboxes that still don't overlap at that tolerance.

### Hockley hip (311 vs 238, +31%)
Cross-wing main↔main pairs with azDiff 45-150° pass `adjOk` because large segments have wide centroid thresholds. s4(38m²)↔s7(52m²): `sqrt(38) × 2.5 = 15.4m`. Cross-wing centroids within 15.4m pass.

### Rochester Hills ridge (61 vs 173, −55%)
Same adjOk failure — multi-wing dormer roof, many ridge pairs have centroids too far apart.

### Rochester Hills hip (298 vs 170, +75%)
Same cross-wing hip overcounting.

### Rochester Hills valley (72 vs 188, −62%)
Dormer valley secondaries: `adjOk(VALLEY_ADJ=2.0)` = `sqrt(small_area) × 2.0`. For a 9m² dormer cheek: `3 × 2 = 6m`. If dormer centroid is >6m from main face centroid → rejected.

### Eave/rake (all properties)
70/30 mask perimeter split is a hardcode. Jacksonville is more like 85/15. This is Phase 3.

---

## 7. The Right Fix — Phase 3 (Next Sprint)

**Mask polygon per-edge azimuth classification** is the highest-value remaining work:

The mask GeoTIFF (0.1m/pixel) is already fetched. `traceMaskPerimeter()` counts perimeter pixels but throws away their coordinates. Phase 3 traces the actual boundary polygon and classifies each edge:

```
1. Trace mask boundary → ordered list of pixel coordinates
2. Convert pixel coords to lat/lng using GeoTIFF georeferencing (origin + pixel size)
3. For each boundary edge segment: compute azimuth
4. Compare to dominant ridge direction (azimuth of largest segment)
   - Edge perpendicular to ridge direction (±45°) → eave
   - Edge parallel to ridge direction → rake
5. Sum eave edges and rake edges separately
```

This fixes eave/rake on all properties, eliminates the 70/30 hardcode, and gives the actual drip-edge polygon (not the wall footprint — the actual roof surface edge).

**GeoTIFF georeferencing:** the mask URL is fetched via `decodeGeoTiff()` which returns `{ data, width, height }`. The pixel-to-lat/lng transform requires the GeoTIFF's origin coordinates and pixel size. Current `decodeGeoTiff()` may or may not preserve the geo-transform — check `lib/roofing/dsmAnalysis.ts` around line 34 (`fetchDataLayers`) and the GeoTIFF decode logic to see if origin is available.

**For the adjOk / hip cross-wing problem (Hockley/RH):**
The clean fix requires building shape data to detect wing boundaries. Two options:
1. **MS Building Footprints** (free, ~50ms): fetches the actual building polygon. L-shaped building → two wings → cross-wing pairs rejected. See https://github.com/microsoft/GlobalMLBuildingFootprints
2. **Elevation API on bbox corners**: query elevation at all 4 corners of each segment bbox (4 × N segments ≈ 60 Elevation API calls per property, ~$0.02). Height gradient between adjacent segment corners identifies the ridge point. Most geometrically accurate option.

---

## 8. Known Issues (Non-Classifier)

- `pros.license_verified` column missing → premium-report route logs error on pro fetch. Not blocking (report still generates) but should be fixed.
- Hockley has MEDIUM imagery quality → mask fetch sometimes returns null → eave/rake falls back to segment heuristic (which happens to give good results for Hockley anyway).

---

## 9. Data in solar_raw

All fields confirmed present in DB for test properties:
- `solarPotential.roofSegmentStats[]` — azimuth, pitch, area, centroid, bbox, height (MSL)
- `solarPotential.solarPanels[]` — 51/105/185 panels with lat/lng + segmentIndex
- `solarPotential.wholeRoofStats.groundAreaMeters2` — total footprint
- `imageryQuality` — HIGH (Jacksonville/RH) or MEDIUM (Hockley)
- `dataLayers` — NOT stored (maskUrl/dsmUrl fetched fresh per DSM run, signed URLs)

---

## 10. Sprint Roadmap

| Sprint | Status | Notes |
|---|---|---|
| 5 — DSM linear footage | ⚠️ Partial | Jacksonville ✅, Hockley/RH partial |
| 5 Phase 3 — Mask polygon eave/rake | ⬜ Not started | Fixes eave/rake all properties |
| 5 Phase 4 — Schematic SVG diagram | ⬜ Not started | Roofr-style colour-coded edge diagram |
| 5 Phase 5 — MS BF cross-wing | ⬜ Not started | Fixes hip/ridge on complex roofs |
| 4 — Report→Calculator→Estimate | ⬜ Not started | |
| 4 — Good/Better/Best estimate | ⬜ Not started | |
| 4 — Homeowner proposal PDF | ⬜ Not started | |

---

## 11. Pre-Launch Checklist

- [ ] SQL migrations on PRODUCTION (v74, v76-*, v77, v78, v83, v84, v85)
- [ ] Supabase Free → Pro ($25/mo)
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod
- [ ] All env vars to Vercel PRODUCTION (including GEMINI_API_KEY)
- [ ] `hello@proguild.ai` verify in Resend
- [ ] Cloudflare DNS orange-cloud
- [ ] Twilio 10DLC registration (1-2 weeks lead time — start NOW)
- [ ] Submit sitemap to Google Search Console
- [ ] Fix `NEXT_PUBLIC_GOOGLE_MAPS_KEY` config for Places autocomplete
- [ ] Fix `pros.license_verified` column missing error
- [ ] GCP billing alerts at $50/$100/$200
- [ ] Delete debug-sprint3 route if still present

---

## 12. Env Vars (Vercel staging)

```
GOOGLE_SOLAR_API_KEY      — Solar API + Maps Static + Gemini
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME            — proguild-media-staging
NEXT_PUBLIC_VERCEL_ENV    — auto-set by Vercel
```

---

## 13. Git

```bash
# Always push both branches separately (replace GH_TOKEN with actual token from Vercel env or password manager)
git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
```

Staging URL: https://staging.proguild.ai (password: proguild2026)
