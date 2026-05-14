# ProGuild — Sprint 5 Complete Handover
**Date:** May 14, 2026  
**Last commit:** `5244e1a` (clean revert ridge length — sqrt formula for all pairs)  
**Branches:** dev + staging both at `5244e1a`  
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. `lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`
2. All roofing API routes need `export const runtime = 'nodejs'`
3. Git push: always full token URL, separate commands, push BOTH dev AND staging
4. **DO NOT BUILD until user says "go"**
5. NO Claude/Anthropic API in prod — Gemini only
6. `npx tsc --noEmit` before every push
7. GOOGLE_SOLAR_API_KEY ≠ GEMINI_API_KEY — two separate billing accounts

---

## 1. What Sprint 5 Achieved

Starting state: Jacksonville all wrong, RH/Hockley partial.  
End state: Jacksonville 5/5, Hockley 3/5 (up from 3/5), Rochester Hills 3/5 (up from 1/5).

### Key fixes shipped:

| Fix | Commit | Effect |
|---|---|---|
| Mask perimeter pixel-accurate total | `1201521` | Jacksonville eave −17%→−5%, rake +51%→+2% |
| Hip roof rake=0 (pure hip has no gable) | `aac5540` | Jacksonville rake corrected |
| Mask-scaled segment rake-ratio | `50be831` | Replaced hardcoded 70/30 split |
| planeHeightAtCenterMeters dormer valley | `402e66f` | RH valley −62%→−7% |
| DORMER_AREA_MAX 7m² threshold | `a195ca6` | Prevents Hockley hip secondaries firing dormer gate |
| Ridge height adjacency fallback dh<3m | `5244e1a` | Additional ridge pairs found via height |

---

## 2. Final Accuracy (recompute-all confirmed May 14 2026)

| Property | Ridge | Hip | Valley | Eave | Rake |
|---|---|---|---|---|---|
| **Jacksonville** | 27ft (−7%) ✅ | 162ft (+9%) ✅ | 39ft (+5%) ✅ | 212ft (−5%) ✅ | 54ft (+2%) ✅ |
| **Hockley** | 40ft (−49%) ❌ | 311ft (+31%) ❌ | 108ft (+3%) ✅ | 335ft (+6%) ✅ | 50ft (+11%) ✅ |
| **Rochester Hills** | 77ft (−55%) ❌ | 298ft (+75%) ❌ | 175ft (−7%) ✅ | 195ft (−35%) ⚠️ | 154ft (+7%) ✅ |

Roofr ground truth: Jacksonville ridge=29,hip=149,valley=37,eave=224,rake=53 | Hockley ridge=78,hip=238,valley=105,eave=317,rake=45 | RH ridge=173,hip=170,valley=188,eave=298,rake=144

---

## 3. Architecture — Key Files

```
lib/roofing/dsmAnalysis.ts      — ALL classifier logic (2183 lines)
  computeLinearFootageFromSegments()   — v2 (production, always runs)
  computeLinearFootageV3()             — v3 (runs alongside, ALWAYS falls back to v2)
  traceMaskPerimeter()                 — mask GeoTIFF → perimeter in metres
  classifyMaskEdges()                  — Phase 3 (exported but not in hot path)
  detectHasGable()                     — gable detector for rake classification
  deriveWingBoundariesFromSegments()   — PCA wing detection (diagnostic only)

app/api/roofing/dsm/route.ts    — POST: runs classifier, writes to DB
                                   GET: debug modes (staging only)
  mode=recompute-all             — runs all 3 test properties, no DB write
  mode=recompute&report_id=UUID  — single property, no DB write
  mode=segments&report_id=UUID   — dumps solar_raw segment data
  mode=wing-debug&report_id=UUID — dumps segments with height_msl, bbox, all_keys

app/api/roofing/report/route.ts — Quick Bid pipeline (geocode→solar→PDF→R2→DB)
app/api/roofing/premium-report/route.ts — reads linear_footage from DB → PDF
```

---

## 4. Solar API Fields — Complete Inventory

All confirmed present in solar_raw for US HIGH/MEDIUM properties.  
Key: `all_keys = ["stats","center","boundingBox","pitchDegrees","azimuthDegrees","planeHeightAtCenterMeters"]`

| Field | Used | Notes |
|---|---|---|
| pitchDegrees | ✅ | v2/v3 rafter correction, Quick Bid pitch |
| azimuthDegrees | ✅ | PRIMARY classification signal |
| stats.areaMeters2 | ✅ | Area, adjacency threshold |
| stats.groundAreaMeters2 | ✅ | Horizontal projection |
| stats.sunshineQuantiles[] | ❌ | Not used — solar irradiance |
| center.latitude/longitude | ✅ | adjOk centroid distance |
| boundingBox.ne/sw | ✅ | Ridge bbox overlap gate (tol=0.0003°) |
| planeHeightAtCenterMeters | ✅ | Sprint 5: ridge height fallback, dormer valley |
| groundAreaMeters2 (top-level) | ✅ | Duplicate of stats field |

**MISSING (the root cause of all remaining errors):**  
Solar API does NOT return polygon vertices — only centroid + bbox + area.  
Every formula approximates what vertex data would give exactly.

---

## 5. How the v2 Classifier Works (Production)

### Constants
```
MAIN_FACE_M2 = 18        // segments >= this = "main" face
RIDGE_ADJ = 2.5          // adjOk factor: distM ≤ sqrt(minGnd) × factor
VALLEY_ADJ = 2.0
HIP_ADJ = 2.5
RIDGE_HEIGHT_MAX = 3.0m  // max |dh| for height-based ridge fallback
HIP_HEIGHT_MAX = 4.0m    // max |dh| for bothMain hip pairs
DORMER_HEIGHT_MIN = 0.5m // secondary must be this much ABOVE main → dormer cheek
DORMER_AREA_MAX = 7.0m²  // max area for dormer height gate (RH dormers: 4.3-5.8m²)
```

### RIDGE
```
azDiff > 150° + (at least one main)
bothMain → ridgeBboxOverlap(tol=0.0003°) OR (|dh|<3m AND adjOk(4×))
main↔secondary → adjOk(2.5×)
length = sqrt(min(gnd(A),gnd(B))) × 0.7
```

### VALLEY
```
Pass 1: main↔secondary, azDiff 30-120°, adjOk(2.0×)
Pass 2 (dormer): secondary < 7m² AND heightOf(secondary) > heightOf(main) + 0.5m
         AND bbox overlap at tol=0.0003° → accept as valley even if adjOk fails
length = distM(centroid_A, centroid_B)
```

### HIP
```
azDiff 45-150°, NOT valley, adjOk(2.5×)
bothMain: |dh| < 4m guard (rejects cross-story)
top-2 closest neighbours per segment (deduplication)
length = distM × pitchCorr, capped at sqrt(gnd) × 2
```

### EAVE / RAKE
```
If maskPerimeterM > 0:
  rakeRatio = min(ridgeM / (maskPerimeterM × 0.5), 0.45)
  eave_ft = round(maskPerimeterM × (1 - rakeRatio) × 3.28084)
  rake_ft = round(maskPerimeterM × rakeRatio × 3.28084)
Else:
  segment heuristic (shape factor 3.5 for gable, 2.8 for hip)
```

---

## 6. What v2 Gets Wrong and Why

### Hockley ridge (40ft vs 78ft, −49%)
sqrt(min(gnd))×0.7 formula underestimates rectangular wing faces.  
Bbox long-axis formula gives 81ft for Hockley BUT also overcounts Jacksonville  
(2 pairs × 27ft = 54ft vs 29ft truth) because Jacksonville's hip roof  
also produces 2 bothMain pairs with midpoints only 2m apart — spatially  
indistinguishable from Hockley's 2 real ridge pairs.  
**Cannot fix without Elevation API or polygon vertices.**

### Hockley hip (311ft vs 238ft, +31%)
Large main segments pass adjOk(2.5×) across perpendicular wings because  
threshold = sqrt(51.9) × 2.5 = 18m. All 4 Hockley main centroids are within  
12m of each other — no spatial separation detectable from centroids.  
OSM building footprints tried but missed all 3 test properties.  
**Cannot fix without building polygon (OSM/MS BF) or Elevation API.**

### RH eave (195ft vs 298ft, −35%)
Dormer ridge pairs (from height gate) inflate ridgeM → inflate rakeRatio  
(ridgeM/maskPerim × 0.5 = 43%) → deflate eave.  
The 0.5 scale factor was calibrated for non-dormer roofs.  
**Fix: exclude dormer-sourced ridge pairs from rakeRatio calculation.**

### RH ridge/hip (77ft/298ft vs 173ft/170ft)
Same adjOk failure as Hockley — dormer segments have centroids within  
adjOk threshold of wrong main faces. Hip overcounts, ridge undercounts.

---

## 7. Recommended Next Accuracy Improvements

### Sprint 5D — Elevation API ridge length (highest value)
Query elevation at 4 bbox corners per segment → height gradient identifies  
actual shared ridge edge → exact ridge length without polygon vertices.  
~60 Elevation API calls per property, ~$0.02, geometrically correct.  
Endpoint: `https://maps.googleapis.com/maps/api/elevation/json`  
Fixes: Hockley ridge, hip overcounting detection, RH eave cascade.

### v3 Safety Check Tuning
computeLinearFootageV3() already exists. Reduce R+H safety threshold from  
40% to 30% and re-test. With better v2 baseline it may pass more often.  
v3 uses panel hull convex hulls for adjacency — geometrically correct.

### RH eave rakeRatio fix
Detect dormer roof type (facetCount >= 12 AND small secondaries present)  
and skip dormer ridge pairs from rakeRatio calculation.

---

## 8. Debug URLs (Staging)

```
https://staging.proguild.ai/api/roofing/dsm?mode=recompute-all
https://staging.proguild.ai/api/roofing/dsm?mode=wing-debug&report_id=208d31e4-fc0a-4a6f-a1e8-9a3d42de6c7a
https://staging.proguild.ai/api/roofing/dsm?mode=wing-debug&report_id=5630f286-b52d-4fcd-a423-57c3ba5f5b5a
https://staging.proguild.ai/api/roofing/dsm?mode=wing-debug&report_id=b200b680-7b7b-48d5-89bd-7de8dc8dfd2c
```

**Test report IDs (samaltman@sam.com, pro_id: 2fbc58c2-c9d3-4040-acf9-810c3b215a05):**
- Jacksonville: `b200b680-7b7b-48d5-89bd-7de8dc8dfd2c`
- Hockley: `208d31e4-fc0a-4a6f-a1e8-9a3d42de6c7a`
- Rochester Hills: `5630f286-b52d-4fcd-a423-57c3ba5f5b5a`

---

## 9. Sprint 4 Backlog (Next Sprint)

| Item | Priority | Notes |
|---|---|---|
| **Report→Calculator→Estimate pre-fill** | P1 | sessionStorage already pushes squares/pitch/waste — wire up intake end |
| **Good/Better/Best estimate tiers** | P1 | 3-column proposal, 35% avg ticket lift |
| **Homeowner proposal PDF** | P1 | Replaces Leap $99/mo |
| **Twilio 10DLC registration** | P1 🔥 | 1-2 week external process — START NOW, blocks all SMS |
| **SQL migrations to PRODUCTION** | P1 | v74, v76-*, v77, v78, v83, v84, v85 |
| **Supabase Free → Pro ($25/mo)** | P1 | DB pauses on inactivity — kills prod |
| **pros.license_verified column missing** | P2 | premium-report logs error on pro fetch. Not blocking but fix before launch |
| Phase 4 SVG roof diagram | P3 | Roofr-style colour-coded edge diagram |
| Phase 5D Elevation API ridge | P3 | Sprint 5D accuracy work |

---

## 10. Pre-Launch Checklist (unchanged from v85)

- [ ] SQL migrations on PRODUCTION (v74, v76-*, v77, v78, v83, v84, v85)
- [ ] Supabase Free → Pro ($25/mo)
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod
- [ ] All env vars to Vercel PRODUCTION (including GEMINI_API_KEY)
- [ ] `hello@proguild.ai` verify in Resend
- [ ] Cloudflare DNS orange-cloud
- [ ] **Twilio 10DLC registration (1-2 weeks lead time — START NOW)**
- [ ] Submit sitemap to Google Search Console
- [ ] Fix `NEXT_PUBLIC_GOOGLE_MAPS_KEY` config for Places autocomplete
- [ ] Fix `pros.license_verified` column missing error
- [ ] GCP billing alerts at $50/$100/$200
- [ ] Delete debug-sprint3 route if still present

---

## 11. Git

```bash
git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
```

GH_TOKEN: GH_TOKEN_FROM_PASSWORD_MANAGER  
Staging: https://staging.proguild.ai (password: proguild2026)

---

## 12. Env Vars (Vercel staging)

```
GOOGLE_SOLAR_API_KEY      — Solar API + Maps Static (GCP billing)
GEMINI_API_KEY            — AI Studio prepay ($10 loaded May 2026) — SEPARATE from GCP
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME            — proguild-media-staging
NEXT_PUBLIC_VERCEL_ENV    — auto-set by Vercel
```
