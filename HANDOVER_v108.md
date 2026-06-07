# ProGuild HANDOVER v108

**Session date:** June 7, 2026
**Continues:** HANDOVER_v107 (baseline commit `12427ab`)
**Branch:** `staging` → staging.proguild.ai
**HEAD at close:** `c3577bc`
**Repo:** `valktech11/ProGuild` (capital P; `proguild.git` URL redirects but works)

---

## 0. TL;DR — what changed this session

1. **Supplement Assistant AI shipped & working** — the FL claims moat. Paste adjuster scope → Gemini finds missing/underpaid FL line items + drafts a supplement letter. Persists across reloads.
2. **Insurance claim-status workflow hooks** — Approved auto-advances pipeline; Supplement Filed logs activity; struck-off handling when claim falls through. All with Activity-tab auto-refresh.
3. **Roofer flow rework** — Quick Bid on a lead (retail path), property linkage, "View report PDF" link, Calculator removed from property report line.
4. **Measurement-engine investigation → net code change ZERO.** A multi-step detour that ended in an important discovery: the function I was "fixing" (`classifyEdge` / `runDsmAnalysis`) is a **dead/secondary path the real report never uses**. The real engine is `computeLinearFootageFromSegments`. Everything was reverted; misleading debug endpoints removed. **The real product was never broken — Highgate premium LF is 5/5 vs Roofr.**

---

## 1. Supplement Assistant AI — COMPLETE & WORKING

The moat feature. Tab on the lead detail page, FL-gated to insurance_claim roofing leads, paste-text only for v1 (PDF parsing = v2).

**Files:**
- `lib/fl/supplement.ts` — FL re-roof checklist, `buildItemsPrompt()` + `buildLetterPrompt()` (split into two calls), `parseSupplementResponse()`
- `app/api/roofing/supplement/route.ts` — POST (two-call: items JSON then letter), GET (restore latest session)
- `lib/trades/roofing/components/SupplementAssistant.tsx` — UI, persist/restore on mount
- `tests/unit/supplement.test.ts` — 16 tests green
- `v101-supplement-sessions.sql` — table (id, lead_id, pro_id, scope_text, result_json jsonb, created_at)

**THE root-cause fix (commit `51616b0`):** `gemini-2.5-flash` is a *thinking* model. Thinking tokens silently consume `maxOutputTokens`, causing MAX_TOKENS truncation at ~210 tokens of visible output. Fix: `thinkingConfig: { thinkingBudget: 0 }` in generationConfig. Combined with a two-call approach (items JSON, then letter separately) to avoid single-call truncation. Cost ≈ $0.002/analysis — negligible.

**Letter quality fix (`613daef`):** prompt fills known facts (date, carrier, claim #, property, company) and FORBIDS bracketed placeholders — no more `[Your Company]` / `[Date]` noise.

**Persist/restore (`342c567`):** GET endpoint fetches latest session; component restores scope + result on mount with a "Last run restored" timestamp.

**Commit chain:** `8e447c1` → `b39a476` → `fb82a36` → `43f31a6` → `c60c54f` → `4d0ecaa` → `51616b0` → `613daef` → `342c567`.

**Verified working:** $6,840 supplement on Peter Brooks / Citizens / 9933 Orchard Hills Rd Jacksonville — clean letter to the adjuster, no placeholders.

> ⚠️ **PENDING — PRODUCTION:** run `v101-supplement-sessions.sql` on the **production** Supabase project before go-live. Staging is done; prod save fails silently without the table.

---

## 2. Insurance claim-status workflow hooks — COMPLETE & WORKING

When the Claim Status field changes in `InsuranceClaimFields.tsx`:
- **Approved** → auto-advance pipeline to `insurance_approved` + log activity (`aeed62d`)
- **Supplement Filed** → log activity entry with supplement total (`aeed62d`)
- New route `app/api/leads/[id]/events/route.ts` (POST custom pipeline_events)
- Activity rendering for `supplement_filed` + `insurance_auto_approved` in `app/dashboard/pipeline/[id]/page.tsx`

**Auto-refresh chain (the tricky part):**
- `4ec7bec` — re-fetch lead 800ms after save so stage/activity update without manual refresh
- `71d70d5` — Activity tab re-fetches pipeline_events (`refreshEvents`)
- `4ac4396` — **CRITICAL race fix:** `await` the hooks BEFORE calling `onSaved`. The Activity refresh was firing before the events were written. Refresh delay reduced to 400ms.

**Struck-off handling (`ee317d8`):** when insurance is toggled OFF while the lead sits at `insurance_approved`, the pipeline stepper renders that stage struck-through (grey dot, dash icon, line-through label). Extended the pre-existing `skipped` logic from `done` only to `(done || isActive)`. Reuses the existing "Convert to retail" path — does NOT auto-revert (would risk losing a legitimate approval).

---

## 3. Roofer flow rework — COMPLETE

Model: **lead = job actions; property = roof facts; Insurance toggle = flow fork; Quick Bid = fast Step-1-only bid.**

- `8113496` — Quick Bid button on a lead when insurance is OFF; pre-fills address; QuickBid reads `?address/city/state/zip/from` params; "View property" link via property_id
- `ccd11f3` — Quick Bid done step renders from the API response directly (was blank when opened from a lead with no linked property because the render gated on a null `pid`)
- `d96cd05` — progress bar creeps 82→94% over 28s so it never looks frozen; "Solar API" wording → "Satellite"
- `437defa` — Quick Bid from a lead passes `property_id` so the report links to the property; lead Step 1 + property page reflect it
- `485fd8e` — removed Calculator button from the property report line (kept Quick Bid / Material Order / Share / delete as PDF download paths); Quick Bid skips the DSM auto-run (fast Step-1 bid only); lead surfaces "View report PDF" via `report_url` once a report is linked

**Read-layer audit finding:** the architecture is HEALTHIER than feared. Leads GET (`app/api/leads/[id]/route.ts`) ALREADY joins roof_reports by property_id and surfaces square_count/pitch/waste — single source at the read layer. Leads auto-create/link a property on creation. **No 23-file FK refactor is needed.** The `selected_report_id` FK is only worth it for multi-report selection (later) — see §5.

---

## 4. ⭐ Measurement engine — the important discovery (net code change: ZERO)

### What happened
Comparing ProGuild vs Roofr reports for the same houses, linear footage looked badly off on Silverpoint (valley 1,258 vs 212). I chased this through `classifyEdge` in `lib/roofing/dsmAnalysis.ts` across several commits (`aaac169`, `5b2a4ae`), each "fix" moving the error to a different edge bucket and ultimately **breaking 3919 Highgate from 4–5/5 down to 0–1/5.**

### The root cause — TWO linear-footage engines
1. **`computeLinearFootageFromSegments` + `computeLinearFootageV3`** (Solar API *segment* geometry) — **the REAL engine.** Called by the DSM route (`app/api/roofing/dsm/route.ts:137,150`), writes `linear_footage` to the `roof_reports` DB, drives the actual Premium PDF. **This is the 5/5 engine.**
2. **`computeLinearFootage` + `classifyEdge`** (RANSAC/DSM pixel path, via `runDsmAnalysis`) — a **secondary/experimental path the report does NOT use.**

The debug/benchmark endpoints I built called engine #2 — the wrong one. **The entire investigation chased a dead path.**

### Proof
The **May 15 Highgate Premium PDF** (uploaded by founder) shows segment-engine LF:
| Edge | ProGuild (real engine) | Roofr truth | Error |
|---|---|---|---|
| Ridge | 27 | 29 | −7% |
| Hip | 162 | 149 | +9% |
| Valley | 39 | 37 | +5% |
| Rake | 54 | 53 | +2% |
| Eave | 212 | 224 | −5% |

**5/5, all within 9%.** The real product was never broken.

### Resolution
- `ae3dad9` — reverted `classifyEdge` + `computeLinearFootage` to the original `12427ab` version (the RANSAC path restored to baseline; it's unused so this is harmless)
- `c3577bc` — removed the misleading `measurements-bench` / `measurements-debug` endpoints (they measured the dead path and caused the false regression scare)

### Lesson logged (do not repeat)
**Before benchmarking or "fixing" a measurement function, trace which function the live report actually calls.** The premium report reads `linear_footage` from the DB; that field is written by the DSM route using `computeLinearFootageFromSegments`. `classifyEdge`/`runDsmAnalysis` is NOT in that path.

### True takeaway that still holds
- **Simple/normal roofs (≤~10 segments): genuinely competitive** — Highgate area + pitch + LF all strong.
- **Complex roofs (16+ segments, e.g. Silverpoint 33-facet): weaker** — and this is a **Solar-API-data ceiling** (no polygon vertices; centroid + bbox + area only), NOT a classifier bug. Roofr uses Vexcel/Nearmap imagery (stamped on their PDFs) — better *input data*, not better compute. The Premium PDF disclaimer is already honest (±7% on 8-facet, ±62% on 16+).
- The authoritative reference for all of this is the founder's doc **`ProGuild_Measurement_Engine_Complete_Code.docx` (Sprint 5 Final)** — §1.4 pipeline, §2 classifier gates/constants, §2.3 `planeHeightAtCenterMeters` discovery, §2.4 "what cannot be fixed without polygon vertices."

---

## 5. Architecture debt — RESOLVED / NARROWED

The `roofing_job_data` vs `roof_reports` duplication (square_count/pitch/waste in both) is **less severe than logged**: the read layer (`leads/[id]` GET) already joins by property_id and is single-source for reads. The `selected_report_id` FK is now a **nice-to-have for multi-report selection per property**, not a correctness fix. Deferred — only worth doing when multi-report selection is actually built.

---

## 6. PENDING / NEXT ACTIONS

| Item | Status | Notes |
|---|---|---|
| Run `v101-supplement-sessions.sql` on **production** Supabase | ⛔ PENDING before Supplement go-live | Staging done; prod save fails silently otherwise |
| Rotate the GitHub PAT used this session | ⛔ PENDING | `github_pat_11CB…` (in shell history) |
| Twilio: buy 904 number after 10DLC approval | ⏸ DEFERRED | Brand `B1RJVYZ`, Campaign `CMe6f79e5cf51d25001b04a0d45ee40312` |
| Stripe pricing decision → then gating | ⏸ DEFERRED | isPro=true hardcoded; talk to 5–10 FL roofers first |
| Complex-roof LF accuracy (Vexcel / polygon vertices) | ⏸ DEFERRED | Pre-revenue rule; needs better imagery, not classifier work |
| HVAC CRM vertical | ⏸ DEFERRED | After roofing stable |
| Facet-gated LF confidence labeling | OPTIONAL | PDF disclaimer already honest; low priority |

---

## 7. INFRASTRUCTURE (unchanged)

- GitHub `valktech11/ProGuild`, branch `staging`
- Supabase staging `zttsqqvaakblgbutviai` / prod `bzfauzqqxwtqqskjhrgq`
- Vercel team `valk-ce03c4a0`
- Build sandbox: `/tmp/proguild` (cloned)
- Stack: Next.js 16 + Supabase + Stripe(pending) + Resend + Twilio(pending) + Gemini (Google generativelanguage API) + Cloudflare R2
- **Two Google billing accounts (don't confuse):** `GEMINI_API_KEY` = AI Studio prepay; `GOOGLE_SOLAR_API_KEY` = GCP billing. Topping one does NOT top the other.

### Workflow rules (never break)
- Small slices; ONE commit per milestone; typecheck before every push.
- NEVER build without explicit "GO".
- Pre-existing typecheck noise: `__tests__/unit/trades/trade-system.test.ts` — ignore via `grep -v "trade-system.test.ts"`.
- Pre-existing failing tests: `tests/unit/api.test.ts` (10) + `estimates-invoices-leads.test.ts` (35) — mock-setup failures, confirmed pre-existing via git-stash test, unrelated to any work.

---

## 8. Full commit list (this session, oldest → newest)

```
8e447c1 feat(fl): Supplement Assistant — paste adjuster scope → AI line items + letter
b39a476 fix(supplement): show panel for all insurance leads, API enforces FL gate
fb82a36 fix(supplement): toggle onSaved propagates insurance_claim to parent
43f31a6 fix(supplement): remove responseMimeType (empty text in structured-output mode)
c60c54f fix(supplement): MAX_TOKENS — bump to 8192, shorten prompt
4d0ecaa fix(supplement): two-call approach — items then letter separately
51616b0 fix(supplement): THE fix — thinkingBudget=0 (thinking ate the token budget)
613daef fix(supplement): letter fills known facts, forbids bracketed placeholders
342c567 feat(supplement): persist results across reloads (GET + restore on mount)
aeed62d feat(insurance): claim status hooks — Approved auto-advance, Supplement Filed log
4ec7bec fix(insurance): re-fetch lead 800ms after save
71d70d5 fix(insurance): Activity tab refreshes after save
4ac4396 fix(insurance): await hooks before onSaved (race fix), 400ms delay
8113496 feat(flow): Quick Bid on lead pre-fills address; View property link
ccd11f3 fix(quickbid): done step renders from API response directly
d96cd05 fix(quickbid): progress bar creeps 82→94%; "Solar API" → "Satellite"
437defa fix(quickbid): link report to lead's property via property_id
485fd8e feat(flow): close out roofer flow — remove Calculator, Quick Bid skips DSM
ee317d8 fix(pipeline): strike through Insurance Approved when toggled off while active
aaac169 fix(dsm): [REVERTED] ridge/valley by edge elevation + debug endpoint
5b2a4ae fix(dsm): [REVERTED] elevation-primary edge classification
2eddc44 feat(debug): [REMOVED] measurements-bench endpoint
ae3dad9 revert(dsm): restore original classifyEdge + computeLinearFootage from 12427ab
c3577bc chore(debug): remove measurements-bench/debug endpoints (dead path)
```

**Net effect of `aaac169`/`5b2a4ae`/`2eddc44`/`ae3dad9`/`c3577bc`: the codebase is back to the `12427ab` measurement engine, plus the debug endpoints removed.** No change to production measurement behavior.
