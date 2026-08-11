# ProGuild.ai — Dev Handover v128
**Date:** July 31, 2026  
**Session:** HVAC CRM — Complete E2E Testing, Bug Fixes & Mobile Polish  
**Staging HEAD:** `2f6abf2` (verify-v125)  
**Branch:** `staging` only — prod untouched  
**Staging URL:** staging.proguild.ai (password: proguild2026)  
**Repo:** github.com/valktech11/ProGuild (Next.js/TypeScript)  
**Mobile repo:** github.com/valktech11/ProGuildMobile (Flutter/Dart)  

---

## 0. CRITICAL RULES — READ FIRST

1. **GO gate:** No build, no push without Raj's explicit "go" or "ok go".
2. **Pre-push gate (mandatory, in order):**
   - `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS2307\|TS2875\|TS7026\|TS2503\|TS7006\|TS2591\|TS6133" | grep -v "__tests__"` — zero output required
   - `npm run test:visualizer` — must show "All invariants hold." (83/83)
   - Full `next build` — check for "Failed to type check" in output
3. **TypeScript filter:** Only suppress TS2307/2875/7026/2503/7006/2591/6133 — never expand. TS2322 and TS2339 are real errors.
4. **Bump `CLIENT_BUILD`** in `app/roof-visualizer/client.tsx` on every visualizer push.
5. **Git push format (never chained with &&):**
   ```
   git push https://ClaudeBuild:GITHUB_PAT_TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
   ```
   *(PAT: github_pat_11CBJZBBY... — get from Raj's secure notes. Rotate at session start.)*
6. **Prod is `bzfauzqqxwtqqskjhrgq`** — NEVER touch. Staging is `zttsqqvaakblgbutviai`.
7. **`lib/roofing/reportPdf.ts` and `premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf.
8. **DO NOT BUILD** until analysis is complete and user says go.
9. **Both GitHub PATs are overdue for rotation** — security risk, do at session start.

---

## 1. Test Accounts

| Account | Role | Email | Notes |
|---------|------|-------|-------|
| HVAC test | Technician | `ricksmith@mailinator.com` | `trade_slug = hvac-technician`, use this for HVAC testing |
| Roofing test | Roofer | `robertsmithstagingroofer@mailinator.com` | 8-stage roofing pipeline |
| Reviewer | Admin | `rajuprodguild@gmail.com` / `test1234` | |

---

## 2. Session Summary — What Was Done

This session was a full end-to-end test of the HVAC CRM trade plugin. A systematic class of bugs was found and fixed: shared code that hardcoded roofing stage keys, column names, or labels. Roofing worked accidentally (its defaults were compatible); HVAC exposed each gap. All bugs are now fixed.

---

## 3. Bugs Found & Fixed (Permanent Record)

### 3.1 Stage Key Casing: "Quoted" vs "quoted" (THE board/list/dots bug)
**Symptom:** Rajesh's lead was absent from the Service Board, showed "New Call" in the list, had all-grey progress dots.  
**Root cause:** `app/api/estimates/[id]/route.ts` hardcoded `lead_status = 'Quoted'` (capital Q) when an estimate was sent for any non-roofing trade. HVAC stage key is `quoted` (lowercase). Case-sensitive `===` comparisons broke all three surfaces.  
**Fix:** Added `sentTrigger` and `depositTrigger` anchors to both trade configs. All stage-writing paths now read anchors, never hardcode.  
**Files:** `lib/trades/hvac/config.ts`, `lib/trades/roofing/config.ts`, both `types.ts`, `app/api/estimates/[id]/route.ts`, `app/api/calendar/route.ts`

### 3.2 Estimate→Invoice: 100% Deterministic Failure
**Symptom:** Every estimate stayed "Approved" with "Create Invoice" after signing. Clicking Create Invoice did nothing visible.  
**Root cause:** `applyEstimateSignedEffects` created an invoice (line 198) but NEVER wrote `invoice_id` back onto the estimate. The "Create Invoice" button hit the duplicate guard (invoice already exists), returned early `{ existed: true }` without linking — so the estimate could NEVER reach "invoiced". 5-for-5 SQL check confirmed: all 5 recent estimates had an invoice in the DB but zero had `invoice_id` set.  
**Key diagnostic:** The audit_log query showed `estimates/UPDATE` rows DID fire — ruling out audit trigger rollback theories. The 100% failure rate distinguished it from a race condition.  
**Fix:** `lib/trades/roofing/applySignedEffects.ts` — after creating the invoice, capture its id and immediately update the estimate: `status=invoiced, invoiced_at, invoice_id`.  
**Data fix SQL (run on staging):**
```sql
UPDATE estimates e SET status='invoiced', invoice_id=i.id, invoiced_at=now()
FROM invoices i WHERE i.estimate_id=e.id
  AND e.status='approved' AND e.invoice_id IS NULL AND i.status<>'void';
```

### 3.3 Won→Customer: zip vs zip_code + Missing Payment Paths
**Root cause 1:** `clients` table column is `zip`, not `zip_code`. Every client INSERT used `zip_code` — silently threw inside try/catch, no client created on ANY path.  
**Root cause 2:** Two of four payment paths were missing `resolveClientForLead`: `invoices/[id]` PATCH and public `pay-milestone`.  
**Fix:** Column corrected in `lib/leads/resolveClientForLead.ts` and `app/api/leads/[id]/stage/route.ts`. Both missing paths wired in `app/api/invoices/[id]/route.ts` and `app/api/invoices/public/[id]/pay-milestone/route.ts`.  
**All 6 won-writing paths confirmed:** manual stage, mark-paid, record-payment, stripe webhook, invoices PATCH, public pay-milestone.

### 3.4 Performance Funnel: Hardcoded Roofing Stages
**Symptom:** HVAC accounts saw "Inspection Scheduled", "Insurance Approved", "Proposal Signed" in their funnel.  
**Fix:** `app/api/roofing/performance/route.ts` now fetches `pros.trade_slug` and builds FUNNEL from `getActiveStages(trade_slug)`.

### 3.5 Estimate-Invoiced Update: Silent 0-Row Miss
**Symptom:** Estimate stayed "Approved" after Create Invoice even though the invoice was created.  
**Root cause:** `POST /api/invoices` estimate-update returned no error on 0-row updates (Supabase doesn't error on 0-row updates). `console.log` was used for diagnostics — Vercel Hobby plan drops `console.log`, only `console.error` appears.  
**Fix:** Added read-back confirm (`.select().maybeSingle()`) + retry with minimal fields. Uses `console.error` for logging.

### 3.6 Clients List Infinite-Load
**Root cause:** `useEffect` in `app/dashboard/clients/page.tsx` depended on `[router]` only, not `[session]`. If auth hadn't resolved on first render, effect early-returned and never re-ran.  
**Fix:** Dependency changed to `[session, _authLoading, router]` + `.finally(() => setLoading(false))`.

### 3.7 Mobile Calendar: onTeal Removal Side Effects (3 bugs)
After changing `onTeal={true}` to `onTeal={false}` on `MobileMonthGrid`, three things broke:
1. **Dots invisible** — were hardcoded `rgba(255,255,255,0.9)` (white on white). Fixed: real event colors (teal/indigo/amber/red).
2. **Selected day number disappears** — `selBg = rgba(255,255,255,0.92)` (white pill on white bg) + `numColor = white`. Fixed: `selBg = #0F766E` (teal pill), `numColor = white`.
3. **Header nav buttons** — were white-on-teal style. Fixed: outlined with `t.inputBorder`.

---

## 4. Architecture Rules Added This Session

- **`zip` on `clients` table, `zip_code` on `properties` table** — different tables, different column names. Always verify before writing INSERTs.
- **"How often does it fail?" is the first diagnostic question** — 100% = code bug. Occasional = race/transient. Distinguishing them immediately saves many rounds.
- **Use `console.error` for critical diagnostics** — Vercel Hobby plan drops `console.log` output.
- **Read the `audit_log` for write-sequence questions** — confirms whether writes fired and in what order.
- **One logical save = one write per table** — duplicate audit rows make the log unreadable.
- **`pro_id` on mutations must come from the verified bearer token**, never from the request body (IDOR prevention).

---

## 5. HVAC CRM — Verified Feature Status

### ✅ Fully Tested E2E
- Service Board (board view, list view, stage colors, board refresh on nav back)
- Add Service Call modal (validation error in footer, scroll-to-failing-field)
- Lead → estimate → sign → invoice auto-created + linked (root cause fixed)
- All 6 payment paths → job_won → customer created
- Equipment → reminder → manual Schedule Job → lead on Service Board
- Equipment → reminder → auto-cron (30-day trigger) → lead on board
- Customers list loads, client detail page fast (single-client fetch)
- Job history: shows job description + source + mapped stage label
- Equipment Records list: clean two-line rows
- Maintenance Plans: reminders display, Schedule Job creates correct lead
- Refrigerant Log: entries save, stats update, leak flag visually distinct (red YES)
- Dashboard Overview: stats, Active Jobs, Upcoming Maintenance
- Calendar: type-colored dot indicators, hover tooltips, agenda strip labels
- Performance funnel: HVAC stage labels (trade-aware)

### HVAC Config (lib/trades/hvac/config.ts)
```
Stages (7 active): new_call → diagnosed → quoted → parts_ordered → scheduled → in_progress → job_won
Terminal: lost, unqualified
stageAnchors: entry='new_call', won='job_won', lost='lost', sentTrigger='quoted', depositTrigger='scheduled'
Nav sections: TODAY / BILLING / EQUIPMENT / COMPLIANCE / REPORTS
Labels: pipeline='Service Board', wonStage='Completed'
```

### HVAC DB Tables (staging only — not yet on prod)
- `hvac_equipment` — equipment records per client
- `hvac_refrigerant_log` — EPA 608 compliance log
- `hvac_maintenance_reminders` — auto-created when next_service_date is set
- `hvac_job_data` — system_type, issue_type, refrigerant_type per lead
- `hvac_estimate_data`, `hvac_invoice_data` — extension tables

---

## 6. Roofing Regression — PASSED

Tested on `robertsmithstagingroofer@mailinator.com`:
- ✅ Roofing nav (Jobs/Money/MY RECORDS/ROOFING TOOLS)
- ✅ Lead modal: roofing sources (Storm Damage, Insurance Co., Door Knock, Canvassing)
- ✅ Full 8-stage pipeline: Lead In → Inspection Scheduled → Proposal Sent → Proposal Signed → Scheduled → In Progress → Job Won
- ✅ Estimate sign → "Invoiced" immediately (v113 shared engine fix applies to roofing too)
- ✅ Performance funnel: correct roofing stage labels
- ✅ Roof Visualizer accessible from nav

---

## 7. Mobile Polish Shipped (Web Mobile)

| Fix | Commit |
|-----|--------|
| Calendar teal band removed — header now light/white | v119 |
| Invoice layout: single column on mobile (was 2-col) | v121 |
| Invoice line items: AMOUNT no longer clips | v122 |
| Estimate page: buttons wrap, no horizontal scroll | v120 |
| Service Board selected pill: filled with stage color | v120 |
| Roof Visualizer copy: 10 renders free (was 3) | v114 |
| Calendar month dots: real colors (were white-on-white) | v123 |
| Calendar selected day: teal pill (was white-on-white) | v124 |
| Performance page mobile layout | v125 |

---

## 8. Key Files Changed This Session

```
lib/trades/hvac/config.ts              — sentTrigger, depositTrigger anchors added
lib/trades/hvac/types.ts               — HVACStageAnchors updated
lib/trades/roofing/config.ts           — sentTrigger added
lib/trades/roofing/types.ts            — RoofingStageAnchors updated
lib/trades/roofing/applySignedEffects.ts — THE fix: links invoice back to estimate
lib/leads/resolveClientForLead.ts      — zip (not zip_code), shared won→client helper
lib/estimates/milestones.ts            — computeHVACMilestones, computeMilestonesForTrade
app/api/estimates/[id]/route.ts        — uses sentTrigger anchor (no capital Quoted)
app/api/invoices/route.ts              — estimate-link read-back confirm + retry
app/api/invoices/[id]/route.ts         — resolveClientForLead wired
app/api/invoices/public/[id]/pay-milestone/route.ts — resolveClientForLead wired
app/api/invoices/mark-paid/route.ts    — resolveClientForLead wired
app/api/invoices/[id]/record-payment/route.ts — resolveClientForLead wired
app/api/webhooks/stripe/route.ts       — resolveClientForLead wired
app/api/roofing/performance/route.ts   — trade-aware funnel
app/api/cron/hvac-maintenance-reminders/route.ts — address carry-over, source=Manual
app/api/hvac/maintenance-reminders/route.ts — address columns in join
app/api/leads/route.ts                 — client_id filter (?client_id=)
app/api/clients/[id]/route.ts          — GET handler (single client)
app/dashboard/calendar/page.tsx        — teal removal, dots, selected day
app/dashboard/clients/page.tsx         — [session, _authLoading, router] dep fix
app/dashboard/clients/[id]/page.tsx    — single-client fetch, job history labels
app/dashboard/hvac/equipment/page.tsx  — clean two-line list rows
app/dashboard/hvac/maintenance/page.tsx — address + Manual source
app/dashboard/invoices/[id]/page.tsx   — mobile responsive layout
app/dashboard/estimates/[id]/page.tsx  — button wrap, overflow-x hidden
app/dashboard/performance/page.tsx     — mobile layout
components/ui/LeadPipeline.tsx         — selected pill filled, board refresh
components/ui/EventChip.tsx            — hover tooltip (portal), agenda strip labels
backfill-won-lead-clients-v96.sql      — backfill SQL (zip column fixed)
```

---

## 9. Pending Prod Migrations (Run in Order on bzfauzqqxwtqqskjhrgq)

**⚠ All migrations below have been run on staging only. Prod is clean and untouched.**

Run these in strict order:

1. `v101-supplement-sessions.sql` — **HIGH PRIORITY**: supplement save fails silently in prod without this
2. `v115` — `estimate_items.source` column
3. `v116-supplement-corpus.sql` — 5 supplement corpus tables + 7-item seed
4. `v117-supplement-unit-prices.sql` — FL8X-2026-EST unit prices
5. Audit/observability SQL from §37.4 of the Bible (17 table triggers, audit_log columns, pro_sessions index)
6. `backfill-won-lead-clients-v96.sql` — links existing won leads to customers (zip column fixed)
7. Supplement data fix: `UPDATE estimates e SET status='invoiced', invoice_id=i.id, invoiced_at=now() FROM invoices i WHERE i.estimate_id=e.id AND e.status='approved' AND e.invoice_id IS NULL AND i.status<>'void';`

**Separate prod changes needed:**
- Delete `app/api/admin/env-check/route.ts` before prod merge
- R2_BUCKET_NAME → `proguild-media` (prod bucket)
- NEXT_PUBLIC_GOOGLE_MAPS_KEY referrer restriction → `proguild.ai/*`
- Confirm STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY set on prod Vercel
- ROOF_CALC_PRO_ID set on prod

---

## 10. Standing Open Items

| Item | Priority | Notes |
|------|----------|-------|
| **Both GitHub PATs rotation** | SECURITY | Overdue many sessions. Do at session start. |
| **Supabase Free → Pro ($25/mo)** | HIGH | Free tier pauses after 7 days inactivity — 134k records at risk |
| **Twilio 10DLC registration** | HIGH | 2-week government process. Blocks ALL SMS. Start immediately. |
| Prod cutover SQL batch | HIGH | See §9 above |
| iOS TestFlight pipeline | MEDIUM | Codemagic, Apple enrollment 92GGX23UAR, watch contact@proguild.ai |
| Google Play Alpha → 0.1% rollout | MEDIUM | Don't auto-promote |
| Carrier-side supplement validation | MEDIUM | Heath McDermott gap — all carrier patterns `is_provisional: true` |
| Supplement Phase 2 | LOW | 8 Elias Franco items parked pending budget |
| Maintenance_Plan lead source | LOW | Needs `lead_source` CHECK constraint migration |
| DB CHECK constraint hardening | LOW | Reject invalid lead_status values at DB level |

---

## 11. Next Session: HVAC Mobile CRM

The next session is building the HVAC CRM trade plugin for the Flutter mobile app. The web HVAC CRM is complete and tested — mobile should mirror it as a thin client over the same web APIs.

### 11.1 What Mobile Already Has (from prior sessions)
- Login (Google SSO + email/password)
- Pipeline/Kanban (trade-aware, real GET /api/leads)
- Lead Detail (stage mover, notes, photos, insurance fields)
- Estimate lifecycle viewer + timeline
- Calculator → estimate creation
- Roofing-specific: ProMeasure, Quick Bid report, supplement assistant

### 11.2 What Needs Building for HVAC Mobile

**Priority order:**

**P1 — Service Board (HVAC tabs)**
The mobile pipeline screen currently has hardcoded roofing stages. It needs to consume `/api/trade-config` (already built) to get HVAC stages instead. The stage tab strip and lead cards need to use HVAC labels: New Call, Diagnosed, Quote Sent, Parts Ordered, Job Scheduled, On the Job, Completed.

**P2 — Add Service Call modal**
Currently shows the roofing AddLeadModal on mobile. HVAC needs its own modal with:
- Lead source grid (Phone Call, Referral, Facebook, Instagram, Website, Google, Yard Sign, Other)
- System type picker (Split AC, Heat Pump, Furnace, Mini-Split, Package Unit)
- Issue type picker (Repair, Maintenance, Replacement, New Install)
- Refrigerant picker (R-410A, R-454B, R-32, R-22, R-407C, Other)
- Customer name, phone, address, email, scope (required)

**P3 — Equipment tab on customer detail**
Customer detail screen needs an Equipment tab showing:
- List of `hvac_equipment` records for this client
- Add Equipment form: type, brand, model, serial, refrigerant, filter size, install date, last service, next service date
- Equipment card: header (type + brand + due badge) + spec grid + service timeline

**P4 — Maintenance Plans screen**
New screen at `/dashboard/hvac/maintenance` equivalent:
- Lists `hvac_maintenance_reminders` with `status=Pending`
- Each row: customer name, equipment type, due date, due badge
- "Schedule Job" button → POST to create maintenance lead → flips reminder to Scheduled

**P5 — Refrigerant Log screen**
- List `hvac_refrigerant_log` entries
- Add entry: type, added lbs, recovered lbs, cylinder ID, tech cert, leak detected toggle, notes
- Summary stats: total added, total recovered, leak count

**P6 — HVAC estimate/invoice**
The estimate page should show HVAC-specific placeholder text and terms (already handled by the web via `tradeSlug` prop). Mobile estimate viewer may need small updates for HVAC label differences.

### 11.3 API Endpoints Available (Already Built)
```
GET  /api/leads?pro_id=&client_id=          List leads (client_id filter available)
GET  /api/leads/[id]                         Single lead with HVAC job data
POST /api/leads                              Create lead (sends trade_slug, issue_type etc.)
GET  /api/clients/[id]?pro_id=              Single client with derived metrics
GET  /api/hvac/equipment?pro_id=&client_id= Equipment list
POST /api/hvac/equipment                     Add equipment (auto-creates reminder)
PATCH /api/hvac/equipment/[id]              Update equipment
DELETE /api/hvac/equipment/[id]?pro_id=     Delete equipment
GET  /api/hvac/maintenance-reminders?pro_id= Pending reminders (joined with equipment + client)
POST /api/hvac/maintenance-reminders         Create/update reminder
GET  /api/hvac/refrigerant?pro_id=          Log entries
POST /api/hvac/refrigerant                   Add entry
DELETE /api/hvac/refrigerant/[id]?pro_id=  Delete entry
GET  /api/cron/hvac-maintenance-reminders   Cron endpoint (30-day auto-trigger)
GET  /api/pipeline/summary?pro_id=          Summary cards (maintenanceDue count included)
```

### 11.4 Key Data Shapes

**hvac_equipment row:**
```json
{
  "id": "uuid",
  "client_id": "uuid",
  "equipment_type": "AC_Unit|Heat_Pump|Furnace|Mini_Split|Package_Unit",
  "brand": "Carrier",
  "model_number": "24ACC636A003",
  "serial_number": "4521X99",
  "refrigerant_type": "R-410A",
  "filter_size": "16x25",
  "installation_date": "2026-07-01",
  "last_service_date": "2026-07-02",
  "next_service_date": "2026-08-29",
  "notes": "test"
}
```

**hvac_maintenance_reminders row:**
```json
{
  "id": "uuid",
  "pro_id": "uuid",
  "client_id": "uuid",
  "equipment_id": "uuid",
  "due_date": "2026-08-29",
  "status": "Pending|Scheduled|Completed",
  "scheduled_lead_id": null,
  "clients": { "full_name": "Nina Smith", "phone": "...", "email": "..." },
  "hvac_equipment": { "equipment_type": "AC_Unit", "brand": "Carrier", "model_number": "..." }
}
```

### 11.5 Flutter Architecture Notes (from prior sessions)
- **Dart files:** Use shell heredoc with single-quoted delimiter `<< 'DARTEOF'` — never Python f-strings
- **scaffold background:** `context.pg.surface` not `context.pg.background`
- **Haptics:** `PGHaptics` class not `Haptics`
- **Money formatting:** `fmtMoney()` from utils
- **API client:** `ApiClient` singleton, `apiFetch` equivalent is `_authedGet()` / `_authedPost()`
- **State management:** Provider pattern
- **To inject methods:** use `rfind('\n}')` to locate last class closing brace
- **Mobile PAT:** `github_pat_11CBJZBBY0sRSRMuJikL3P_...` (overdue for rotation)

### 11.6 Session Start Checklist
1. Rotate both GitHub PATs (web + mobile) — SECURITY, overdue
2. Read this HANDOVER in full
3. Confirm `ricksmith@mailinator.com` HVAC account is still working on staging
4. Confirm Vercel build at `2f6abf2` (verify-v125) is green
5. Pull the mobile repo, check for any pending commits on master
6. Start with P1 (Service Board HVAC tabs) — that's the foundation everything else depends on

---

## 12. Staging State Snapshot

```
Web repo:    valktech11/ProGuild, staging branch
HEAD:        2f6abf2 (verify-v125)
CLIENT_BUILD: verify-v125
Deployed:    staging.proguild.ai (Vercel, auto-deploy from staging branch)
Prod:        proguild.ai — UNTOUCHED, running old build

Mobile repo: valktech11/ProGuildMobile, master branch
Last known commit: from June/July roofing sessions (check repo)

Supabase staging:  zttsqqvaakblgbutviai (dev only — Claude uses this)
Supabase prod:     bzfauzqqxwtqqskjhrgq (NEVER touch)

HVAC test data on staging:
  - ricksmith@mailinator.com: HVAC Technician account
  - Customers: Rajesh Kumar ($424 LTV, 1 equipment, won lead)
  - Equipment: AC Unit on Rajesh (next service Jul 30 — already cron-processed)
  - Nina Smith: equipment with 30-day service date, cron verified
  - Multiple leads at various HVAC stages for testing
```

---

*ProGuild.ai · HANDOVER v128 · July 31, 2026 · Next session: HVAC mobile CRM build*
