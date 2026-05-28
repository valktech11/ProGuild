# ProGuild.ai — HANDOVER v103
**Date:** May 28, 2026  
**Session:** Build Session 4 — Roofing CRM QA + Measurement Engine fixes  
**Branch:** `staging` at commit `0b7212b`  
**Staging:** staging.proguild.ai (pw: proguild2026)  
**Test account:** proguildstagingroofer@mailinator.com (Robert Smith, Roofer, Jacksonville)

---

## ⚠️ CRITICAL: OUTSTANDING ISSUE — Apply to Estimate Still Not Working

**Symptom:** Clicking Apply to Estimate from Calculator still opens EST-1037 in GBB mode, not Standard mode.

**Root cause chain (fully diagnosed):**
1. `estimate_type` lives in `roofing_estimate_data`, NOT `estimates` table ✅ (fixed in `bed4c8b`)
2. But EST-1037's `roofing_estimate_data` row still has `estimate_type = 'tiered'` and `tiered_data` populated from before
3. The API upsert with `{ onConflict: 'estimate_id' }` SHOULD overwrite it — but Vercel may not have deployed the fix yet due to the webhook disconnect/reconnect

**To verify the fix is working:** Open browser devtools → Network tab → click Apply to Estimate → look at the POST to `/api/estimates` → check the response JSON:
- If `items_replaced: true` in response → fix is working, navigate manually to the estimate
- If no `items_replaced` → fix not running

**Fallback — manual DB fix if needed:**
```sql
UPDATE roofing_estimate_data 
SET estimate_type = 'standard', tiered_data = null
WHERE estimate_id = (
  SELECT e.id FROM estimates e
  JOIN leads l ON e.lead_id = l.id
  JOIN pros p ON l.pro_id = p.id
  WHERE l.contact_name = 'Rajesh Kumar'
  AND p.email = 'proguildstagingroofer@mailinator.com'
  AND e.status = 'draft'
  LIMIT 1
);
```
Run in Supabase SQL Editor (staging: `zttsqqvaakblgbutviai`) then re-open the estimate.

---

## 🚨 VERCEL DEPLOY ISSUE

**What happened:** Vercel GitHub webhook was working until ~18:45 today. Pushes after `a3de6fd` stopped triggering deploys. I incorrectly advised disconnecting the GitHub repo in Vercel Settings → Git. The repo was reconnected but may have deployed from `main` instead of `staging`.

**Current state of Vercel:**
- Latest Vercel deployment shown: `a3de6fd` (Material Prices fix, deployed 14 min before session end)
- Latest staging commit: `0b7212b` (chore: trigger deploy after reconnect)
- Commits NOT confirmed deployed: `bed4c8b` (the critical estimate_type fix)

**To verify:** Go to Vercel → Deployments → check if `bed4c8b` or `0b7212b` show as Ready. If not, manually redeploy from staging branch.

**To fix permanently:** Vercel → Project → Settings → Git → ensure `valktech11/ProGuild` is connected, `staging` branch deploys to Preview environment.

---

## ✅ EVERYTHING BUILT THIS SESSION (in commit order, oldest → newest)

### Measurement Engine & Lead Detail
| Commit | What |
|---|---|
| `769041b` | Insurance fields not loading — wrong field name |
| `e839268` | InsuranceClaimFields crash — NUMERIC type from DB |
| `14db11e` | InsuranceClaimFields redesign — phone format, coloured status, net calc |
| `5a6345c` | Pipeline reorder — insurance_approved BEFORE proposal_sent |
| `81d6159` | Adjuster appointment datetime format + insurance gate + nav SVG icons |
| `6ff1f0c` | Calculator removed from nav, stale session cleared |
| `692d295` | sessionStorage 10-min TTL — prevents cross-property contamination |
| `29ef25e` | Calculator address uses geocoded formattedAddress |
| `3fca91d` | Quick Bid Report generates inline on lead detail (no redirect) |
| `84dc17c` | DM Sans font across calculator and modal |
| `1745fba` | LF auto-fill + report share/calculator buttons on property page |

### Property Page
| Commit | What |
|---|---|
| `7d27639` | Reports not showing — orphaned property_id fix (3-part: API, property page backfill, PATCH endpoint) |
| `e830740` | Delete report button — two bugs (duplicate modal + filter race condition) |

### Measurement Section Redesign
| Commit | What |
|---|---|
| `0b2cc14` | Measurement section state-aware — measured vs unmeasured states |
| `9dfd949` | Measurement section empty — backfill from roof_reports at API level |
| `4e3e940` | Full redesign — hero SQ chip, LF grid, single Open Calculator CTA |
| `57cd03b` | Re-measure ↻ toggle, border polish, alignment fix |

### Activity Feed
| Commit | What |
|---|---|
| `547ff22` | Activity feed reads stage transitions from pipeline_events DB table |

### Calculator → Estimate Flow (critical path)
| Commit | What |
|---|---|
| `9057618` | Apply to Estimate → /estimates/undefined — response shape fix |
| `f7344a7` | 4 issues: calculator line items dropped, labour persistence, switch banner, milestone recalc |
| `0e9ab5a` | Calculator→Estimate force Standard + GBB uses adjusted sq + hide GBB on insurance |
| `5daab64` | 3 hardcoding issues: calculator loads settings prices, deposit_percent removed, PITCH_FACTORS shared lib |
| `a3de6fd` | Material Prices settings — live $/LF → $/bundle conversion display |
| `bed4c8b` | **CRITICAL FIX:** estimate_type written to wrong table (roofing_estimate_data not estimates) |

### Infrastructure
| Commit | What |
|---|---|
| `0b7212b` | Vercel reconnect trigger |

---

## 🔴 OUTSTANDING BUG: Apply to Estimate → GBB not Standard

**Next session first action:** Confirm `bed4c8b` is deployed on Vercel. If yes, test Apply to Estimate — should open Standard mode with real line items. If still GBB, run the manual SQL above.

---

## Rajesh Kumar E2E Test Status

| Step | Status | Notes |
|---|---|---|
| **Step 1** — Insurance fields | ✅ DONE | State Farm, SF-2026-001, $18,500 approved, $2,500 deductible, Claim Status = Approved, stage = Insurance Approved |
| **Step 2** — Quick Bid Report | ✅ DONE | 22.5 sq, 6/12, 12% waste, LF auto-filled (Ridge 27/Hip 162/Valley 39/Rake 54/Eave 212) |
| **Step 3** — Calculator → Estimate | 🔴 BLOCKED | Apply to Estimate opens GBB not Standard. Fix deployed but not confirmed live. |
| **Step 4** — Send to Homeowner | ⏳ Pending Step 3 |
| **Step 5** — Homeowner signs | ⏳ Pending |
| **Step 6** — Schedule | ⏳ Pending |
| **Step 7** — Job Won + Invoice | ⏳ Pending |

---

## Complete Roofing CRM QA Plan

### TEST LEAD 1: Rajesh Kumar (Insurance Job) — Continue E2E

**Pre-conditions confirmed:**
- Lead exists: 3919 Highgate Court, Jacksonville FL 32216
- Stage: Insurance Approved
- Measurements: 22.5 sq · 6/12 · 12% waste · Ridge 27ft · Hip 162ft · Valley 39ft · Rake 54ft · Eave 212ft
- Report saved on Property page
- EST-1037 exists (draft)

**Step 3 — Build Estimate (BLOCKED — fix first)**
1. Open Calculator from Rajesh's lead → verify labour shows $4,500 (persisted)
2. Verify prices load from settings (underlayment $22, drip edge $2/LF=$20/piece)
3. Total should be ~$17,390 ($12,890 materials + $4,500 labour)
4. Click Apply to Estimate
5. ✅ EST-1037 opens in **Standard mode** (not GBB)
6. ✅ 10 line items visible (shingles, underlayment, ridge cap, starter, nails, drip edge, ice shield, pipe boots, tear-off, labour)
7. ✅ Total = $17,390 (or close — depends on tax)
8. ✅ GBB toggle NOT visible (insurance job)
9. ✅ Payment milestones calculated from $17,390

**Step 4 — Send Proposal**
1. Add scope of work: "Full roof replacement — 22.5 sq, 6/12 pitch, architectural shingles, ice & water shield per FL code. Insurance claim SF-2026-001."
2. Click **Send to Homeowner**
3. ✅ Stage moves to Proposal Sent
4. ✅ Activity feed shows "Stage moved to Proposal Sent"
5. ✅ Estimate status = 'sent'

**Step 5 — Homeowner Signs**
1. Copy the public estimate URL from the estimate page
2. Open in incognito browser
3. ✅ Public estimate shows Standard line items + $17,390 total
4. Click **Approve** → draw signature → submit
5. ✅ Stage moves to Proposal Signed
6. ✅ Draft invoice auto-created
7. ✅ Activity feed: "Proposal approved"

**Step 6 — Schedule**
1. Set Job Date on lead detail (3 days from today)
2. ✅ Drag to Scheduled stage
3. ✅ Calendar shows the job on correct date

**Step 7 — Job Won**
1. Calendar → mark job complete (or drag to Job Won)
2. ✅ Stage = Job Won
3. ✅ Invoice created from signed proposal
4. Open invoice → Send → Mark as Paid
5. ✅ "Won This Month" KPI on Overview updates
6. ✅ Activity feed: "Job Won"

**Step 8 — Post-Job**
1. Address card → "+ Save as Property" (if not already saved)
2. ✅ Property page shows Rajesh's roof history
3. ✅ Warranty record created (shingle brand, term)
4. Request review → ✅ sent

---

### TEST LEAD 2: Brian Thompson (Retail Cash Job — GBB Test)

**Purpose:** Test GBB flow on a non-insurance job

**Setup:**
1. Add New Lead: Brian Thompson, 4521 Oak Bluff Drive, Jacksonville FL 32217, (904) 555-0188
2. Source: Phone Call
3. Message: "Wants full replacement, 25-year shingles. Budget flexible. No insurance."
4. Stage: Lead In

**Test sequence:**
1. Open lead → Measurements section shows "No measurements yet"
2. Click **Quick Bid Report** → wait 30-45s → measurements appear
3. Note the sq/pitch/waste values
4. Click **Open Calculator** → verify prices load from settings
5. Enter labour (e.g. $4,200) → total shows
6. Click **Apply to Estimate** → Standard estimate opens
7. ✅ Standard mode, correct line items, correct total
8. **Switch to GBB:** Click "Good / Better / Best" toggle
9. ✅ Dark navy confirmation banner appears (not amber)
10. Click **Switch & Save**
11. ✅ 3 tiers visible: Standard/Upgraded/Premium
12. ✅ GBB uses **adjusted squares** (pitch-corrected + waste), not flat sq
13. ✅ Upgraded tier selected by default
14. ✅ Payment milestones recalculated from GBB total
15. ✅ "Recalculate" button appears if prices changed
16. Send to Brian → sign in incognito → selects Upgraded tier
17. ✅ Stage → Proposal Signed
18. ✅ Invoice created from selected tier amount

---

### TEST: Material Prices Settings
1. Go to ROOFING TOOLS → Material Prices
2. ✅ Live conversion shows for each field:
   - Shingles $285/sq → "= $95/bundle"
   - Ridge cap $4/LF → "= $140/bundle (35 LF)"
   - Starter strip $2/LF → "= $210/bundle (105 LF)"
   - Drip edge $2/LF → "= $20/piece (10 ft) · typical: $1.50–2.50/LF"
3. Change a price → ✅ preview at bottom updates
4. Click Save Prices
5. Open Calculator → ✅ prices reflect saved values (not hardcoded defaults)
6. Edit a price in Calculator → "Save as defaults" button appears
7. Click Save as defaults → ✅ Material Prices page now shows the new value

---

### TEST: Property Page
1. Navigate to MY RECORDS → Properties → 3919 Highgate Court
2. ✅ Reports section shows 4 reports (from earlier testing)
3. ✅ Latest report shows LF breakdown: Ridge 27ft · Hip 162ft · Valley 39ft · Rake 54ft · Eave 212ft
4. Click **Calculator** on a report card → ✅ Calculator opens pre-filled
5. Click **Share** → ✅ URL copied to clipboard / native share
6. Click **Delete** on a duplicate report → ✅ confirmation modal (dark navy, not plain white)
7. Click Delete in modal → ✅ report disappears from list
8. ✅ Report count updates

---

### TEST: Activity Feed
On Rajesh's lead, Activity tab should show (after full E2E):
- ✅ Stage moved to Insurance Approved (purple chevron) — from Inspection Scheduled
- ✅ Stage moved to Inspection Scheduled (purple chevron) — from Lead In
- ✅ Proposal sent (teal)
- ✅ Proposal viewed (teal)
- ✅ Proposal approved (teal)
- ✅ Estimate created (teal)
- ✅ Note added (amber)
- ✅ Lead created (teal)
All sorted newest-first.

---

### TEST: Quick Bid PDF (Standalone)
1. ROOFING TOOLS → Quick Bid PDF
2. Search for "Rajesh Kumar" → ✅ shows as existing client
3. Select → ✅ shows previous reports for 3919 Highgate Court
4. Try manual entry → type new address with Google autocomplete
5. Click Generate → ✅ animated generating screen with satellite icon
6. ✅ Done screen: measurement tiles + Download PDF + Open Calculator + New Report

---

### TEST: ProMeasure
1. ROOFING TOOLS → ProMeasure (or from lead detail Re-measure)
2. Address pre-fills from lead
3. Draw polygons on satellite view
4. ✅ Area + perimeter calculated
5. Push to Calculator → ✅ sq pre-filled
6. ✅ Measurements written back to lead

---

### TEST: Insurance Gate
1. Create new lead at Lead In stage
2. Try to drag to Insurance Approved without setting insurance_claim = true
3. ✅ Gate blocks — shows "Mark this job as an insurance claim first"
4. Enable insurance toggle, set claim_status = "Approved"
5. ✅ Can now move to Insurance Approved

---

## Key Bugs Found This Session (document for tracking)

| # | Bug | Status | Fix commit |
|---|---|---|---|
| 1 | Insurance fields not loading on return | ✅ Fixed | `769041b` |
| 2 | Delete report button does nothing | ✅ Fixed | `e830740` |
| 3 | Reports not showing on property page | ✅ Fixed | `7d27639` |
| 4 | Measurement section always shows "No measurements" | ✅ Fixed | `9dfd949` |
| 5 | Apply to Estimate → /estimates/undefined | ✅ Fixed | `9057618` |
| 6 | Calculator line items dropped on existing estimate | ✅ Fixed | `f7344a7` |
| 7 | Labour amount not persisting | ✅ Fixed | `f7344a7` |
| 8 | Calculator uses hardcoded prices not settings | ✅ Fixed | `5daab64` |
| 9 | GBB uses flat sq not adjusted sq (pitch+waste) | ✅ Fixed | `0e9ab5a` |
| 10 | estimate_type written to wrong DB table | ✅ Fixed | `bed4c8b` |
| 11 | Apply to Estimate still opens GBB | 🔴 OPEN | Needs Vercel confirm |
| 12 | deposit_percent: 50 hardcoded in new estimates | ✅ Fixed | `5daab64` |
| 13 | PITCH_FACTORS defined in 3 separate files | ✅ Fixed | `5daab64` |

---

## Architecture Notes Added This Session

- `estimate_type` and `tiered_data` live in `roofing_estimate_data`, NOT `estimates`
- `GET /api/estimates/:id` reads from `roofing_estimate_data` for all roofing fields
- Calculator prices use $/bundle and $/piece; Settings stores $/sq and $/LF — unit conversion in calculator load
- Bundle sizes: shingles 3/sq, ridge cap 35 LF/bundle, starter strip 105 LF/bundle, drip edge 10 ft/piece
- `labour_amount` added to `ROOFING_JOB_FIELDS` allowlist — persists to `roofing_job_data`
- GBB hidden when `insurance_claim = true` on the lead
- `lib/roofing/pitchFactors.ts` — single source of truth for PITCH_FACTORS, shared by calculator/promeasure/EstimatePage
- Pipeline_events API: `GET /api/pipeline-events?lead_id=&pro_id=` — stage transition history
- `PATCH /api/roofing/reports` — backfills `property_id` on orphaned reports

---

## Next Session Start Instructions

1. Share: **ProGuild_Founders_Bible_v5.7.docx** + **HANDOVER_v103.md**
2. Open with: "Read both documents. Continue E2E Step 3 for Rajesh Kumar. Do not build until I say go."
3. First check: Is `bed4c8b` deployed on Vercel staging? If not, trigger deploy.
4. Second check: Run SQL fix for EST-1037 if Apply to Estimate still opens GBB.
5. Then continue E2E from Step 3.

---

*ProGuild.ai · HANDOVER v103 · May 28, 2026 · Staging: 0b7212b*
