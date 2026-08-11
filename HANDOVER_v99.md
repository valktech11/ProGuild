# ProGuild.ai — Dev Handover v99
**Date:** May 21, 2026
**Latest commit:** `ff0530c` on `dev` + `staging`
**Branch flow:** dev → staging (auto-deploy on Vercel push) → main (manual, production)
**Staging URL:** staging.proguild.ai (password: proguild2026)
**Test accounts:** samaltman@sam.com (roofer), wasimakram@wasim.com (hvac)
**Repo:** github.com/valktech11/ProGuild
**Stack:** Next.js 16.2.2 (Turbopack), Supabase, Vercel, Cloudflare R2, TypeScript strict

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax. Use `React.createElement`.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push — always separate commands, never &&:**
   ```
   git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **DO NOT BUILD until user says "go".**
5. **NO Claude/Anthropic API in prod** — Gemini only for vision.
6. **TS check before every commit:**
   ```
   npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|TS2875\|..."
   ```
7. **`useSearchParams` always wrapped in `Suspense`** in Next.js App Router.
8. **ROTATE GITHUB TOKEN** — ghp_REDACTED_ROTATE_NOW was exposed in chat.

---

## 1. What Was Built This Session — Complete Summary

This session covered the entire roofing CRM workflow from lead creation through to proposal signing. Every piece is connected and tested on staging.

### 1.1 Trade Plugin System (Phase B+C — commit 012b190)

**Architecture decision:** Single registry pattern. All trades are self-contained modules. Shell pages never import trade components directly — they go through `plugin.components`.

**Files:**
- `lib/trades/_registry/index.ts` — single entry point, exports: `getTradeConfig()`, `isRoofing()`, `isHVAC()`, `getStageAnchors()`, `getTradeLabels()`, `getAllTradeStageKeys()`, `getActiveStages()`, `getInitialStage()`, `getTerminalStages()`
- `lib/trades/_registry/types.ts` — `AnyTradeBase`, `AnyPipelineStage` (now includes `requires?: string`), `AnyTradeComponents`, `AnyStageAnchors`
- `lib/trades/roofing/config.ts` — complete roofing config (stages, nav, stageAnchors, leadSources, features, components)
- `lib/trades/roofing/types.ts` — `RoofingPipelineStage` (now includes `requires?: string`), `RoofingConfig`, `RoofingStageAnchors`
- `lib/trades/roofing/state-machine.ts` — `ROOFING_STAGES`, `isValidTransition()`
- `lib/trades/roofing/components/` — AddLeadModal, EstimatePage, EstimatePublicPage, InsuranceClaimFields, JobPhotoLog, WarrantyRecord
- `lib/trades/_default/components/AddLeadModal.tsx` — generic modal for non-roofing trades
- Trade configs for: hvac, plumbing, electrician, general-contractor, _default

**What Phase B+C fixed:**
- All hardcoded stage keys eliminated. Stage filters use `getStageAnchors(slug)` not `'New'`/`'Paid'`.
- `dashboard/page.tsx` — modal routes through `plugin.components.AddLeadModal`
- `pipeline/page.tsx` — newLeads/wonThisMonth use `anchors.entry`/`anchors.won`
- `pipeline/[id]/page.tsx` — backNav reads `tradePlugin.labels.pipeline`, TIPS split into ROOFING_TIPS + GENERIC_TIPS
- `clients/[id]/page.tsx` — "Jobs" reads `getTradeLabels(slug).pipeline`
- `design.ts` — `stageStyle()` reads trade config first, STAGE_BASE as fallback
- `types/index.ts` — `LeadStatus = string` (registry is source of truth)

### 1.2 DB Architecture — Extension Table Pattern (commits 3d6f440, c35430d, 3d0d075, 8f7ff5e)

**The pattern:** Universal tables (leads, estimates, invoices) contain only trade-agnostic columns. Trade-specific data lives in extension tables.

**All SQL executed on staging. DB state is confirmed clean.**

#### Tables confirmed in DB:

**`estimates` — 37 universal columns. NO roofing-specific columns.**
Key columns: id, pro_id, lead_id, estimate_number, status, trade_slug, total, subtotal, discount, discount_type, tax_rate, tax_amount, deposit_percent, require_deposit, valid_until, sent_at, viewed_at, viewed_count, approved_at, paid_at, terms, notes, decline_reason, contact_phone, contact_email, invoiced_at, invoice_id, declined_at, voided_at, void_reason, revision_of, lead_name, lead_source, trade, job_description, created_at, updated_at

**`roofing_estimate_data` — extension table (1:1 with estimates)**
Columns: id, estimate_id (UNIQUE FK), pro_id, estimate_type, tiered_data (JSONB), scope_of_work, payment_milestones (JSONB), property_address, square_count, pitch, waste_pct, created_at, updated_at
RLS: pro owns their own rows

**`roofing_job_data` — extension table (1:1 with leads)**
Columns: id, lead_id (UNIQUE FK), pro_id, insurance_claim, insurance_company, claim_number, adjuster_name, adjuster_phone, adjuster_appointment, claim_status, approved_amount, supplement_amount, deductible, roof_type, square_count, pitch, waste_pct, layers, decking_replacement, permit_number, permit_status, shingle_brand, shingle_model, warranty_term, install_date, warranty_expiry, custom_fields, created_at, updated_at
RLS: pro owns their own rows

**`roofing_invoice_data` — extension table (1:1 with invoices)**
Columns: id, invoice_id (UNIQUE FK), pro_id, insurance_company, claim_number, approved_amount, deductible, supplement_amount, supplement_submitted, supplement_approved, permit_number, permit_status, lien_waiver_signed, lien_waiver_r2_key, certificate_of_completion, final_payment_note, created_at, updated_at
RLS: pro owns their own rows

**`hvac_estimate_data` — extension table (1:1 with estimates)**
Columns: id, estimate_id (UNIQUE FK), pro_id, job_type, system_type, existing_brand, existing_model, existing_tonnage, existing_seer, existing_install_year, existing_refrigerant, proposed_brand, proposed_model, proposed_tonnage, proposed_seer, proposed_hspf, proposed_refrigerant, proposed_warranty_yrs, scope_of_work, includes_labor, includes_permit, includes_disposal, includes_thermostat, duct_work_included, duct_work_notes, payment_milestones, financing_available, financing_monthly, created_at, updated_at

**`hvac_invoice_data` — extension table (1:1 with invoices)**
Columns: id, invoice_id (UNIQUE FK), pro_id, system_type, brand_installed, model_installed, serial_number, tonnage_installed, seer_installed, refrigerant_type, warranty_years, warranty_expiry_date, refrigerant_added_lbs, refrigerant_recovered_lbs, technician_cert_number, permit_number, permit_status, permit_inspection_date, install_date, startup_completed, thermostat_programmed, homeowner_walkthrough, lien_waiver_signed, lien_waiver_r2_key, next_service_due, final_notes, created_at, updated_at

**`estimates` also had 2 columns added (v98):**
- `notes TEXT` — universal, for all trades
- `decline_reason TEXT` — universal, for all trades

**`estimates` columns removed (v95) — migrated to roofing_estimate_data:**
- estimate_type (was added by v82)
- tiered_data (was added by v82)
- scope_of_work
- payment_milestones
- property_address

**trade_slug backfill on estimates:**
```sql
UPDATE estimates e SET trade_slug = p.trade_slug
FROM pros p WHERE p.id = e.pro_id AND e.trade_slug IS NULL;
```

### 1.3 API Write Paths — What goes where

**POST /api/estimates:**
- Destructures: pro_id, lead_id, lead_name, trade, trade_slug, state, contact_*, property_address, square_count, pitch, waste_pct, line_items[], source
- Writes to `estimates`: universal fields + trade_slug
- Writes to `roofing_estimate_data`: estimate_type='tiered', property_address, square_count, pitch, waste_pct (when trade_slug includes 'roof')
- Writes to `estimate_items`: line_items array (when source='roofing_calculator')
- Returns: `{ estimate: { ...estimateRow, id }, existed: false }`

**PATCH /api/estimates/[id]:**
- Universal fields → `estimates` table
- Roofing fields (estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct) → `roofing_estimate_data` upsert (onConflict: estimate_id)

**GET /api/estimates/[id]:**
- Joins: `estimate_items`, `pros(trade_slug, full_name, phone_cell, city, state)`, `leads(property_address, contact_*)`, `roofing_estimate_data(estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct)`
- Also fetches `roofing_job_data` for insurance + measurements (lead-level)
- Returns flattened: `{ ...estimate, estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct, insurance_claim, approved_amount, deductible, supplement_amount }`

**GET /api/leads/[id]:**
- Joins `roofing_job_data` when trade_slug includes 'roof'
- Returns: `{ lead: { ...leadRow, roofing_job_data: { ...} } }`

**PATCH /api/leads/[id]:**
- Two-path write:
  - STRING_FIELDS (contact_*, property_address, notes, scheduled_date, follow_up_date, lead_source, lead_status, client_id) → `leads` table
  - ROOFING_JOB_FIELDS (insurance_*, square_count, pitch, waste_pct, roof_type, shingle_*, permit_*, warranty_*) → `roofing_job_data` upsert (onConflict: lead_id)

**POST /api/invoices:**
- Creates invoice row
- Fetches trade_slug from linked estimate
- Creates `roofing_invoice_data` row if roofing trade, pre-fills insurance + permit fields from `roofing_job_data`

**GET /api/invoices/[id] + PATCH /api/invoices/[id]:**
- GET: joins `roofing_invoice_data`, returns as `invoice.roofing_data`
- PATCH: routes ROOFING_INVOICE_FIELDS to `roofing_invoice_data` upsert

### 1.4 Roofing Stage Config with Gates (lib/trades/roofing/config.ts)

All 7 forward stages now have `requires` field:

```
inspection_scheduled  → requires: 'lead_has_address'
proposal_sent         → requires: 'estimate_ready'
proposal_signed       → requires: 'estimate_sent'
insurance_approved    → requires: 'insurance_claim_filed'
scheduled             → requires: 'estimate_approved'
in_progress           → requires: 'scheduled_date'
job_won               → requires: 'invoice_exists'
```

Terminal stages: `lost` (reopenable: true), `unqualified` (reopenable: false)

stageAnchors: entry=lead_in, won=job_won, lost=lost, depositTrigger=proposal_signed, warrantyTrigger=job_won

### 1.5 Stage Gate Evaluator (evalGate in pipeline/[id]/page.tsx)

```typescript
function evalGate(targetKey: string): { pass: boolean; reason?: string; action?: string }
```

Gates evaluate against in-memory state: `lead`, `lead.roofing_job_data`, `est`, `inv`, `STAGE_ORDER`

| Stage | Check | Error |
|---|---|---|
| inspection_scheduled | !lead.property_address | "Add a property address before scheduling inspection." |
| proposal_sent | !est → block; est.total===0 → block; PASS → move + open estimate | "Create a proposal / no items yet" |
| proposal_signed | !est → block; est.status not in [sent,viewed,approved] → block | "Proposal must be sent first" |
| insurance_approved | !rjd?.insurance_claim → block | "Mark as insurance claim first" |
| scheduled | !est or proposal_signed not yet reached → block | "Get proposal signed first" |
| in_progress | !lead?.scheduled_date → block | "Set a job date first" |
| job_won | !inv → block | "Create an invoice first" |

Backwards moves → `confirmBack` dialog (no gate). `force=true` bypasses all gates (undo actions only).

### 1.6 Estimate Builder (RoofingEstimatePage)

**File:** `lib/trades/roofing/components/EstimatePage.tsx` (~1200 lines)

**Routing:** Shell page `app/dashboard/estimates/[id]/page.tsx` reads `estimate.trade_slug ?? session.trade_slug` → if includes 'roof' → renders RoofingEstimatePage

**Key features built this session:**

**PropertyCard with inline measurement editor:**
- Shows address + measurement pills (sq, pitch, waste). Red warning if no measurements.
- Edit button → inline form expands with:
  - Property address text input (saves to both `leads.property_address` AND `roofing_estimate_data.property_address`)
  - Squares (numeric, required), Pitch (dropdown 3/12–12/12), Waste % (dropdown 10/12/15/18/20%)
- "Apply & Recalculate All Tiers" button:
  - `recalcTiersFromSq(sq, selectedTier)` → recalculates qty+amount for every line item in all 3 tiers, returns selected tier subtotal
  - `recalcMilestones(newTotal)` → updates all 3 payment milestone amounts
  - `onSave()` → PATCH /api/estimates/[id] with square_count/pitch/waste_pct → roofing_estimate_data
  - `onMeasurementsUpdate()` → PATCH /api/leads/[id] with all measurement fields + property_address → roofing_job_data + leads

**GBB 3-column tier cards:**
- Standard (CertainTeed Landmark / 30yr), Upgraded (Owens Corning Duration / 30yr / MOST POPULAR), Premium (GAF Timberline HDZ / Lifetime)
- Inline click-to-edit line items (name, qty, unit, unit_price)
- Per-tier subtotals auto-calculate
- Editable brand/warranty/label

**Right panel sticky:**
- Selected tier summary, all-tier comparison ($X / $Y / $Z), Tax, Total You'll Earn (+21% badge)
- Valid until (amber if <3 days)
- Payment schedule: 30/40/30 default, editable, recalculates on tier select AND on measurements apply

**`tiered_data` JSONB structure:**
```json
{
  "tiers": [{ "key": "standard|upgraded|premium", "label": "...", "shingle_brand": "...", "warranty": "...", "items": [{"id","name","qty","unit","unit_price","amount"}], "subtotal": 0 }],
  "selected_tier": "upgraded"
}
```

**Props:**
```typescript
interface Props {
  estimate: RoofingEstimate
  templates?: GBBTemplate[]
  onSave: (updates: Partial<RoofingEstimate>) => Promise<void>
  onSend: () => Promise<void>
  onBack: () => void
  darkMode?: boolean
  onMeasurementsUpdate?: (fields: { property_address?: string; square_count?: number; pitch?: string; waste_pct?: number }) => Promise<void>
}
```

### 1.7 Homeowner Proposal (RoofingEstimatePublicPage)

**File:** `lib/trades/roofing/components/EstimatePublicPage.tsx` (~750 lines)

**Route:** `app/estimate/[id]/page.tsx` — no auth, publicly accessible

**Features:**
- Dark navy/teal hero with pro company info, address, measurement pills
- 2-col desktop layout (≥960px): tiers + scope left, sticky summary right
- Premium-first tier ordering on public page (psychological close)
- 48px price display, financing from $X/mo
- Canvas e-sign: mouse + touch events, clear button
- Sign flow: Canvas PNG → POST /api/estimates/public/[id]/sign → R2 upload → signatures table (sha256 hashes) → estimate.status=approved → siblings voided
- View tracking: POST /api/estimates/public/[id]/view on page load (increments viewed_count, advances sent→viewed, rate-skips drafts)

### 1.8 Measurement Tool Wiring (commit baf8682)

**ProMeasure** (`app/dashboard/roofing/promeasure/page.tsx`):
- Reads `?lead_id=` and `?address=` from URL
- `pushToCalc()` is now async:
  - Sets `pg_promeasure` + `pg_report_data` sessionStorage
  - When `leadId` present: PATCH /api/leads/{leadId} with square_count/pitch/waste_pct → writes to roofing_job_data
  - Navigates to calculator with `lead_id` preserved in URL

**Quick Bid Report** (`app/dashboard/roofing/property/[id]/page.tsx`):
- Reads `?lead_id=` from URL (passed by pipeline Job Details buttons)
- When `leadId` present + report exists: shows teal "↩ Apply X sq to Lead" button
- Button: PATCH /api/leads/{leadId} with square_count/pitch/waste_factor → roofing_job_data
- Shows green success confirmation after apply

**Pipeline Job Details tab** (after InsuranceClaimFields):
- Shows measurement pills from `lead.roofing_job_data` (or red "⚠ No measurements yet" warning)
- "ProMeasure" button → `/dashboard/roofing/promeasure?lead_id={id}&address={encoded}`
- "Quick Bid Report" button → `/dashboard/roofing/property?lead_id={id}&address={encoded}` (fails with toast if no address)

**Calculator** (`app/dashboard/roofing/calculator/page.tsx`):
- POST body now includes: `trade_slug`, `lead_name`, `trade`, `state`, `square_count`, `pitch`, `waste_pct`, `property_address` (from session + state vars)
- POST /api/estimates processes `line_items` → inserted into `estimate_items`

### 1.9 P0 + P1 Fixes (commit 8a138f1, ccac946)

**P0 — Data loss fixed:**
- InsuranceClaimFields → PATCH /api/leads/[id] → ROOFING_JOB_FIELDS upsert → roofing_job_data ✅
- Calculator line_items → POST /api/estimates processes line_items array → estimate_items ✅

**P1 — Broken pre-fill fixed:**
- Property page sets `pg_report_data` sessionStorage → calculator reads it ✅
- Calculator passes square_count/pitch/waste_pct in POST body → roofing_estimate_data populated ✅

**warnProposal modal (commit ccac946):**
- Modal JSX was missing despite warnProposal state being set correctly
- Modal now shows correct message: "No proposal yet" or "Proposal has no items"
- CTA: "Create Proposal" (calls createEst) or "Open Proposal" (navigates to estimate)

**Payment milestones fix (commit ff0530c):**
- `recalcTiersFromSq()` now returns selected tier subtotal synchronously
- `saveMeasurements()` computes new total inline, calls `recalcMilestones()` immediately
- Milestones now show real dollar amounts after entering sq count

---

## 2. Complete Workflow — What's Wired

```
LEAD COMES IN
  → RoofingAddLeadModal: name, phone, source, address
  → POST /api/leads: leads.property_address set

  ↓

INSPECTION SCHEDULED [gate: property_address required]
  → Job Details tab shows:
      • Measurement pills from roofing_job_data (or red warning)
      • ProMeasure button (passes lead_id + address)
      • Quick Bid Report button (passes lead_id + address, requires address)

  ↓

MEASUREMENT TOOLS (any of 3 paths)
  PATH A: Job Details → ProMeasure → draw polygons → Apply
          → PATCH /api/leads/[id] → roofing_job_data (sq/pitch/waste)
          → sessionStorage set → calculator pre-filled

  PATH B: Job Details → Quick Bid Report → satellite analysis
          → "Apply to Lead" button → PATCH /api/leads/[id] → roofing_job_data

  PATH C: Enter measurements in estimate builder PropertyCard inline editor
          → saves to roofing_estimate_data + roofing_job_data + leads.property_address

  ↓

CREATE PROPOSAL [gate: estimate required + total > 0]
  → createEst() → POST /api/estimates with:
      trade_slug, lead_name, property_address,
      square_count, pitch, waste_pct (from lead.roofing_job_data)
  → Creates estimates row + roofing_estimate_data row
  → RoofingEstimatePage opens
  → GBB tiers pre-filled from square_count

  ↓

ESTIMATE BUILDER
  → Roofer adjusts tier items, prices, scope, milestones
  → Send to Homeowner → estimate.status=sent → stage=proposal_sent

  ↓

HOMEOWNER SIGNS [gate: estimate must be sent/viewed/approved]
  → /estimate/{id} public page
  → Homeowner selects tier → draws signature
  → POST /api/estimates/public/[id]/sign
  → estimate.status=approved, sibling estimates voided

  ↓

INSURANCE WORKFLOW (if claim) [gate: insurance_claim=true required]
  → InsuranceClaimFields toggle → enter carrier, claim#, adjuster
  → PATCH /api/leads/[id] → roofing_job_data
  → Move to Insurance Approved (gate passes when insurance_claim=true)

  ↓

SCHEDULE JOB [gate: scheduled_date required for In Progress]
  → Set Job Date in lead edit form
  → Move to Scheduled → In Progress

  ↓

JOB WON [gate: invoice must exist]
  → Create Invoice → POST /api/invoices
  → roofing_invoice_data created with insurance/permit pre-filled
  → Move to Job Won → WarrantyRecord modal opens
  → Roofer logs shingle brand/model/warranty → roofing_warranties row created
```

---

## 3. Key File Paths

```
Trade registry:
  lib/trades/_registry/index.ts
  lib/trades/_registry/types.ts

Roofing config:
  lib/trades/roofing/config.ts       ← stages with requires, stageAnchors, nav
  lib/trades/roofing/types.ts        ← RoofingPipelineStage with requires field
  lib/trades/roofing/state-machine.ts

Roofing components:
  lib/trades/roofing/components/AddLeadModal.tsx
  lib/trades/roofing/components/EstimatePage.tsx       ← GBB builder, PropertyCard, measurement editor
  lib/trades/roofing/components/EstimatePublicPage.tsx ← homeowner proposal, canvas e-sign
  lib/trades/roofing/components/InsuranceClaimFields.tsx
  lib/trades/roofing/components/JobPhotoLog.tsx
  lib/trades/roofing/components/WarrantyRecord.tsx

Shell pages:
  app/dashboard/estimates/[id]/page.tsx    ← routes to RoofingEstimatePage by trade_slug
  app/dashboard/pipeline/[id]/page.tsx     ← evalGate, measurement tools buttons, stage gates
  app/estimate/[id]/page.tsx               → EstimatePublicPage (no auth)

Roofing tools:
  app/dashboard/roofing/promeasure/page.tsx        ← reads ?lead_id, writes to roofing_job_data
  app/dashboard/roofing/property/[id]/page.tsx     ← Quick Bid Report, Apply to Lead button
  app/dashboard/roofing/calculator/page.tsx        ← passes trade_slug + measurements to POST /api/estimates

API routes:
  app/api/estimates/route.ts               ← POST: creates estimate + roofing_estimate_data
  app/api/estimates/[id]/route.ts          ← GET: joins all extension tables; PATCH: routes to extension tables
  app/api/estimates/public/[id]/sign/route.ts
  app/api/estimates/public/[id]/view/route.ts
  app/api/leads/[id]/route.ts              ← GET: joins roofing_job_data; PATCH: two-path write
  app/api/invoices/route.ts                ← POST: creates invoice + roofing_invoice_data
  app/api/invoices/[id]/route.ts           ← GET: joins roofing_invoice_data; PATCH: routes roofing fields
```

---

## 4. What Is NOT Built Yet

### 4.1 Invoice UI — Build Next
`lib/trades/roofing/components/InvoicePage.tsx` — DOES NOT EXIST.

The DB is fully designed and ready:
- `invoices` table: 32 universal columns
- `roofing_invoice_data` table: insurance reconciliation, permit, lien waiver, completion checklist
- `payment_schedules` table: milestone billing rows
- API: POST /api/invoices, GET/PATCH /api/invoices/[id] — all wired

The invoice builder needs to:
- Read from the approved estimate (tiered_data, payment_milestones, line items)
- Show line items (from estimate_items — frozen at creation)
- Show payment milestones from roofing_estimate_data.payment_milestones
- Show insurance fields from roofing_invoice_data
- Send to homeowner (set status=sent)
- Allow mark-paid on each milestone

### 4.2 GBB Template Save Button
Template drawer in EstimatePage shows "No saved templates yet" but no save button.
`PATCH /api/roofing/settings` endpoint exists. `pros.gbb_templates` JSONB exists.
Just needs a "Save as template" button wired to the API.

### 4.3 Material Prices Settings Page
`pros.roofing_material_prices` JSONB exists. `GET/PATCH /api/roofing/settings` exists.
No UI built. The estimate builder uses hardcoded default unit prices.

---

## 5. Pending Infrastructure (Owner Actions Required)

| Action | Priority | Detail |
|---|---|---|
| Supabase Free → Pro ($25/mo) | 🔴 URGENT | 134k records. Free tier pauses after 7 days inactivity. |
| Twilio 10DLC registration | 🔴 URGENT | 1-2 week government approval. Blocks all SMS. |
| US LLC registration | 🔴 URGENT | Blocks Stripe payouts + Wave 1 email sends. |
| Rotate GitHub token | 🔴 URGENT | ghp_n1w6xR6... exposed in chat. Rotate immediately in GitHub settings. |
| Merge staging → main | 🟡 | 400+ commits behind. Required before production deploy. |
| hello@proguild.ai in Resend | 🟡 | All estimate emails use this sender. Must verify. |
| Cloudflare DNS orange-cloud | 🟢 | 10-second change. Day of launch only. |
| GCP billing alerts $50/$100/$200 | 🟢 | Cloud Console → Billing → Budgets. |

---

## 6. Session Commits (newest first)

```
ff0530c  fix: milestone recalc after measurements + Quick Bid Report Apply to Lead
16364ff  fix: lead possibly null in evalGate in_progress case
baf8682  feat: complete workflow wiring — stage gates, tool integration, address edit
3ed4df6  feat: inline measurement editor in estimate builder — recalculates all GBB tiers live
ccac946  fix: insert missing warnProposal modal JSX — proposal_sent gate now visible
8a138f1  fix: calculator → estimate pre-fill chain — P0+P1 complete
8f7ff5e  arch: hvac_estimate_data + hvac_invoice_data extension tables
3d0d075  arch: roofing_invoice_data extension table — invoices stays universal forever
c35430d  arch: complete estimates table cleanup — roofing data out of estimates forever
3d6f440  arch: roofing_estimate_data migration + fix all roofing write paths
101faab  feat: integrate lead detail → estimate — gate proposal_sent, pre-fill address + measurements
e1da85b  fix: session.name not full_name, no phone_cell on Session type
03efcaa  fix: route estimate builder using estimate.trade_slug not session — complete fix
865f19f  feat: upgrade homeowner proposal — 2-col desktop, sticky sidebar, 48px price, financing
2a3f4ec  feat: roofing estimate + invoice + canvas e-sign — complete build
9844def  arch: complete migration — eliminate all hardcoded stage keys and trade references
012b190  arch: Phase B+C — trade plugin components slot + fix all hardcoded trade references
```

---

## 7. Start Here Next Session

**Next task: Build Invoice UI.**

Start by reading this file. Then read:
- `app/api/invoices/route.ts` — POST (creates invoice + roofing_invoice_data)
- `app/api/invoices/[id]/route.ts` — GET/PATCH (joins roofing_invoice_data)
- `lib/trades/roofing/components/EstimatePage.tsx` — for design pattern reference

The invoice builder follows the same pattern as the estimate builder:
- `lib/trades/roofing/components/InvoicePage.tsx` — the builder UI
- `app/dashboard/invoices/[id]/page.tsx` — shell page that routes to RoofingInvoicePage by trade_slug
- `app/invoice/[id]/page.tsx` — public invoice page (homeowner pays here)

Invoice state machine:
```
draft → sent → viewed → paid (or partial_paid)
                     ↓
                  voided
```

Invoice is pre-filled from the approved estimate. Line items are FROZEN (JSONB on invoices.items — not editable after creation). Payment milestones come from roofing_estimate_data.payment_milestones and are stored in payment_schedules table.
