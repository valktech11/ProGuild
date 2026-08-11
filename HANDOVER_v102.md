# ProGuild.ai — Dev Handover v102
**Date:** May 26, 2026  
**Latest commit:** `8a642ac` on `dev` + `staging`  
**Branch flow:** dev → staging (auto-deploy Vercel) → main (manual, production)  
**Staging URL:** staging.proguild.ai (password: `proguild2026`)  
**Test accounts:**
- samaltman@sam.com — Roofer (pro_id: `2fbc58c2-c9d3-4040-acf9-810c3b215a05`)
- proguildstagingroofer@mailinator.com — Roofer staging test (Robert Smith)
- valktech11+roofer@gmail.com / valktech11+hvac@gmail.com / valktech11+electrician@gmail.com — Gmail plus aliases
**Repo:** github.com/valktech11/ProGuild  
**Stack:** Next.js 16.2.2 (Turbopack), Supabase, Vercel, Cloudflare R2, TypeScript strict, Stripe, Resend

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf. Never rename.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push — always separate commands, never `&&`:**
   ```bash
   git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **DO NOT BUILD until user says "go".**
5. **NO Claude/Anthropic API in prod** — Gemini only for vision AI features.
6. **PATCH handlers — never spread full estimate object.** Only send fields explicitly needed.
7. **Estimates GET uses parallel queries, NOT joins.** Join failures silently return null; parallel queries degrade gracefully.
8. **`fullBleed={true}` required on DashboardShell for estimate page** — needed for sticky header.
9. **Stripe API version MUST be `2026-04-22.dahlia`** (stripe@22.1.1 installed). Four files use it.
10. **AddLeadModal is rendered in DashboardShell** (outside mobile div) — works on all pages automatically.
11. **GitHub token:** `ghp_REDACTED_ROTATE_THIS_TOKEN_NOW` — rotate after use.

---

## 1. What Was Built — May 25-26, 2026 (This Session)

### 1.1 Invoice Detail Page (Pro-side)
`app/dashboard/invoices/[id]/page.tsx` — complete build:
- Teal header band: pro logo, business_name, license, invoice number, dates
- Billed To section, line items table, totals (subtotal/tax/total/paid/balance)
- Payment Schedule: milestone cards, green ✓ when paid
- Right sidebar: Balance Due (large teal) + progress bar, Email Status, Payment History, Quick Links
- `RecordPaymentModal`: milestone selector, amount, method (Cash/Check/Zelle/Venmo/Card/Bank Transfer/Other), date, reference
- Records to `payment_history` JSONB, auto-sets `paid` status → lead `job_won` when balance 0

### 1.2 Public Invoice Page
`app/invoice/[id]/page.tsx` + `app/api/invoices/public/[id]/route.ts`:
- Scoped select (strips pro_id, sensitive fields), joins pro
- `fmt()` null-guarded
- Milestone Payment Flow: Step 1 select → Step 2 method → Step 3 confirm
- Card → Stripe Checkout; non-card → direct record

### 1.3 Stripe Payment Integration
- `app/api/invoices/stripe/checkout/route.ts` — creates Checkout Session
- `app/api/webhooks/stripe/route.ts` — handles `checkout.session.completed`, idempotent via stripe_session_id dedup
- **Env vars needed in Vercel staging:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL=https://staging.proguild.ai`
- Stripe webhook endpoint: `https://staging.proguild.ai/api/webhooks/stripe`
- Test cards: `4242 4242 4242 4242` (success), `4000000000009995` (decline)
- **⚠ Stripe not E2E tested yet** — env vars not set in Vercel staging

### 1.4 GBB Estimate Redesign (3-iteration final)
`lib/trades/roofing/components/EstimatePage.tsx`:
- 3-column read-only cards + isolated full-screen edit modal per tier (`TierEditModal`)
- `createPortal(modal, document.body)` to escape CSS transform containment
- Material prices warning banner (yellow) when `materialPrices` null
- Recalculate banner (blue) when saved prices differ from settings
- Right panel: compact green dot + "Selected" + brand + tier comparison table
- `sign/route.ts` syncs `estimates.total/subtotal/tax_amount` to selected GBB tier on homeowner approval

### 1.5 DB Migrations Run on Staging
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_history jsonb DEFAULT '[]'::jsonb,
  payment_milestones jsonb, require_deposit boolean DEFAULT true,
  deposit_percent integer DEFAULT 30, deposit_amount numeric,
  resend_message_id text, sent_to_email text, email_status text, email_bounce_reason text,
  viewed_count integer DEFAULT 0;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS logo_url text;
```

### 1.6 Complete CRM Architecture Fixes (May 26)

**Phase 1 — DB constraint:**
```sql
-- leads_lead_status_check now includes all trade stage keys:
-- assessed (plumbing), bidding/closeout/contract_signed/milestone_1/milestone_2 (GC),
-- permit_approved/permit_submitted/site_visit (electrician)
```

**Phase 2 — Leads API (`app/api/leads/route.ts`):**
- `trade_slug` written to every new lead at creation
- `property_id` auto-set: lead auto-creates or matches property by address
- `pipeline_events` initial row written on lead creation
- Address normalisation: `property_address` always stores street only (not full "street, city, state, zip")
- Client `city`/`zip` uses separate fields correctly
- `Queued_Manual` → `lead_in` in contact-pro API

**Phase 3 — Stage API (`app/api/leads/[id]/stage/route.ts`):**
- Trade-stage validation: HVAC lead cannot move to `proposal_signed`, GC cannot reach `insurance_approved`
- Returns 422 with trade name and valid stages in error message
- `pipeline_events` written on every stage transition (immutable audit trail)

**Phase 4 — Trade configs:**
- `stageAnchors` added to plumbing (`entry: new_call`), electrician (`entry: new_call`), GC (`entry: lead_in`)
- `exact?` and `comingSoon?` fields added to all NavItem types

**Phase 5 — Generic AddLeadModal address fields:**
- `lib/trades/_default/components/AddLeadModal.tsx` now captures street, city, state, zip
- Sends `property_address`, `contact_city`, `contact_state`, `contact_zip` to API

**Phase 6 — Properties UX:**
- Empty state: "Properties are created automatically when you add a lead with an address"
- One CTA: "Add Property Manually" (for edge cases)
- Sidebar `+ Add New Lead` is the primary action

**Phase 7 — Contact-pro API:**
- `Queued_Manual` → `lead_in`

**Nav fixes:**
- `isA('/dashboard')` always exact — no false Overview highlighting
- `startsWith` for sub-routes — `/dashboard/pipeline/[id]` correctly highlights Jobs
- `AddLeadModal` rendered outside mobile div — works on desktop from ALL pages
- Quick Bid PDF removed from nav (feature lives inside Properties page)
- Duplicate `+ Add Lead` button removed from pipeline page

### 1.7 Resend Email Integration
- `app/api/estimates/send/route.ts` — sends estimate email to homeowner
- `app/api/invoices/send/route.ts` — sends invoice email to homeowner
- `app/api/leads/route.ts` — sends new lead notification to pro
- All use `process.env.RESEND_API_KEY` and `process.env.EMAIL_FROM`
- **⚠ hello@proguild.ai must be verified in Resend before Wave 1**

---

## 2. Current Staging State

### 2.1 What Works End-to-End (Verified on Staging)
- ✅ Add Lead (all trades) — address saves correctly, property auto-created, client auto-created
- ✅ Lead → Estimate → Send to Homeowner (Resend)
- ✅ Homeowner signs estimate → lead advances to `proposal_signed`
- ✅ Invoice auto-created on signing
- ✅ Pro records payment (cash/check/Zelle/Venmo)
- ✅ Invoice → paid → lead advances to `job_won`
- ✅ ProMeasure satellite reports (Quick Bid + Premium PDF)
- ✅ GBB tier selection, editing, signing
- ✅ Pipeline stage transitions with trade-stage validation
- ✅ `pipeline_events` audit trail writing on every stage change
- ✅ `trade_slug` + `property_id` + `client_id` set on every new lead
- ✅ Nav highlighting correct — Overview only on `/dashboard`
- ✅ `+ Add New Lead` sidebar button works from every page

### 2.2 What Needs Vercel Env Vars (Not Tested)
- ❌ Stripe card payments — needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- ❌ Resend email delivery — needs `hello@proguild.ai` verified in Resend

---

## 3. Architecture — Ferrari Design (Complete)

### 3.1 Data Model (The Right Design)

```
pros (contractor profile)
  └─ leads (one per job, trade_slug + property_id + client_id set at creation)
       ├─ roofing_job_data (1:1 FK — insurance, adjuster, supplement, measurements)
       ├─ hvac_job_data (1:1 FK — system_type, refrigerant, tonnage, seer_rating)
       ├─ electrical_job_data (1:1 FK — panel, permit, code notes)
       ├─ plumbing_job_data (1:1 FK — fixture, emergency, permit)
       ├─ gc_job_data (1:1 FK — project_type, materials_budget, sub_count, permit)
       ├─ estimates (FK lead_id — line items, GBB tiers, e-sign)
       │    └─ estimate_items
       ├─ invoices (FK lead_id — milestones, payment_history)
       ├─ pipeline_events (immutable audit log — every stage change)
       └─ property_id → properties (address, roof_data, reports)
                          └─ roof_reports (satellite measurements)
  └─ clients (homeowner contact — phone, email, address)
       └─ hvac_equipment (AC, furnace, heat pump — linked to client + property)
            └─ maintenance_reminders
            └─ refrigerant_log
```

**Key rules:**
- `leads` table is sacred — never grows for trade-specific reasons
- Trade-specific data lives in `*_job_data` tables (1:1 FK with `lead_id`)
- `pipeline_events` is append-only — never update/delete
- `property_id` always set when lead has an address
- `trade_slug` always set from pro's profile at lead creation

### 3.2 Trade Pipeline Stages

| Trade | Entry | Stages | Won |
|---|---|---|---|
| Roofing | `lead_in` | lead_in → inspection_scheduled → proposal_sent → proposal_signed → insurance_approved → scheduled → in_progress → job_won | `job_won` |
| HVAC | `new_call` | new_call → diagnosed → quoted → parts_ordered → scheduled → in_progress → job_won | `job_won` |
| Plumbing | `new_call` | new_call → assessed → quoted → scheduled → in_progress → job_won | `job_won` |
| Electrician | `new_call` | new_call → site_visit → quoted → permit_submitted → permit_approved → scheduled → in_progress → job_won | `job_won` |
| GC | `lead_in` | lead_in → bidding → contract_signed → permit_submitted → milestone_1 → milestone_2 → closeout → job_won | `job_won` |
| All | — | lost (reopenable), unqualified (terminal) | — |

**Trade-stage validation:** `PATCH /api/leads/[id]/stage` rejects stages from wrong trade (422 with message). HVAC lead cannot reach `proposal_signed`. GC lead cannot reach `insurance_approved`.

### 3.3 Lead Status DB Constraint
All valid values in `leads_lead_status_check`:
```
job_won, lost, unqualified,
lead_in, inspection_scheduled, proposal_sent, proposal_signed, insurance_approved,
scheduled, in_progress,
new_call, diagnosed, quoted, parts_ordered, job_complete,
assessed, site_visit, permit_submitted, permit_approved,
bidding, contract_signed, milestone_1, milestone_2, closeout,
New, Contacted, Completed, Paid, Scheduled, Quoted (legacy)
```

---

## 4. Outstanding Gaps — Prioritised

### 4.1 PRE-LAUNCH BLOCKERS

| # | Item | File | Effort |
|---|---|---|---|
| 1 | **RLS audit** — v90/v91 migrations added 134 tables; verify RLS enabled + policies correct on all tables | Supabase dashboard | Medium |
| 2 | **Stripe env vars** in Vercel staging | Vercel dashboard | 5 min |
| 3 | **hello@proguild.ai** verified in Resend | Resend dashboard | 5 min |
| 4 | **Supabase Free → Pro** ($25/mo) — pauses on inactivity | Supabase billing | 5 min |
| 5 | **US LLC registered** — blocks Stripe Connect + Wave 1 emails | Stripe Atlas or direct filing | Owner action |
| 6 | **Twilio 10DLC** registration — 1-2 week government process, start NOW | Twilio console | Owner action |

### 4.2 WAVE 2 (HVAC Outreach — before HVAC pros onboard)

| # | Item | Effort |
|---|---|---|
| 1 | `hvac_job_data` population — wire equipment data into job data table on job save | Medium |
| 2 | HVAC equipment → `property_id` FK — add property_id to equipment table | Small |
| 3 | HVAC pipeline stages QA — verify new_call/diagnosed/quoted/parts_ordered work in UI | Small |

### 4.3 WAVE 3 (GC/Plumber/Electrician Outreach)

| # | Item | Effort |
|---|---|---|
| 1 | GC milestone tracking UI — `/dashboard/gc/milestones` | Large |
| 2 | GC subcontractor roster — `/dashboard/gc/subs` | Large |
| 3 | Plumbing fixture records — `/dashboard/plumbing/fixtures` | Large |
| 4 | Electrician panel records + permit tracker | Large |
| 5 | Populate `electrical_job_data`, `plumbing_job_data`, `gc_job_data` from estimates | Medium |

### 4.4 POST-LAUNCH

| # | Item | Notes |
|---|---|---|
| 1 | Full address normalization | Remove denormalized fields from leads; read from properties JOIN everywhere. Very Large — deferred. |
| 2 | Multi-trade pros | `pro_trades` table, trade switcher in nav. Currently one trade per pro profile. |
| 3 | `pipeline_events` analytics UI | Event log exists, no dashboard yet |
| 4 | Hip/valley classifier fix | `dsmAnalysis.ts` `classifyEdge()` — ridge=981ft, hip=0ft bug. Path B: manual LF entry recommended |
| 5 | Voice input (Whisper) | Phase 2 roadmap |
| 6 | AI proposal narrative | Claude API for homeowner proposal text |
| 7 | Community rework | Ghost town; needs seeding before Wave 1 |

---

## 5. Key File Paths

```
app/dashboard/
  pipeline/page.tsx                          — Pipeline board (all trades)
  pipeline/[id]/page.tsx                     — Lead detail
  estimates/[id]/page.tsx                    — Estimate builder shell
  invoices/[id]/page.tsx                     — Pro invoice detail
  roofing/property/page.tsx                  — Property profiles list
  roofing/property/[id]/page.tsx             — Property detail + report generation
  roofing/promeasure/page.tsx                — Satellite measurement
  roofing/calculator/page.tsx                — Material calculator (pipe boots + disposal added)
  roofing/settings/page.tsx                  — Material prices settings

app/api/
  leads/route.ts                             — POST creates lead + client + property + pipeline_event
  leads/[id]/route.ts                        — GET joins roofing_job_data; PATCH upserts job data
  leads/[id]/stage/route.ts                  — Stage transition with trade-validation + pipeline_events
  estimates/[id]/route.ts                    — Parallel queries, no joins
  estimates/public/[id]/sign/route.ts        — Homeowner sign → proposal_signed + invoice creation
  invoices/[id]/route.ts                     — Pro invoice CRUD + payment recording
  invoices/public/[id]/route.ts              — Public scoped invoice (no sensitive fields)
  invoices/public/[id]/pay-milestone/route.ts — Homeowner milestone payment
  invoices/stripe/checkout/route.ts          — Stripe Checkout Session creation
  webhooks/stripe/route.ts                   — Stripe webhook handler (checkout.session.completed)
  contact-pro/route.ts                       — Marketplace inbound lead (fixed: lead_in not Queued_Manual)

lib/trades/
  roofing/config.ts                          — 10-stage pipeline, stageAnchors, nav (Quick Bid PDF removed)
  roofing/components/EstimatePage.tsx        — GBB modal redesign, isLocked, save/dirty
  roofing/components/EstimatePublicPage.tsx  — Homeowner estimate + signature
  roofing/components/AddLeadModal.tsx        — Roofer-specific lead modal (street-only address fix)
  hvac/config.ts                             — new_call entry, stageAnchors
  plumbing/config.ts                         — new_call entry, stageAnchors ADDED
  electrician/config.ts                      — new_call entry, stageAnchors ADDED
  general-contractor/config.ts               — lead_in entry, stageAnchors ADDED
  _default/config.ts                         — lead_in entry, address fields in modal
  _default/components/AddLeadModal.tsx       — Now captures street/city/state/zip
  _registry/index.ts                         — getTradeConfig, getInitialStage, getAllTradeStageKeys

components/
  layout/DashboardShell.tsx                  — AddLeadModal rendered here (outside mobile div); isA fix
  ui/AddLeadModal.tsx                        — Generic modal (no address fields; use roofing-specific one)
  ui/EmptyState.tsx                          — Added secondaryCtaLabel + onSecondaryCta props

lib/roofing/
  dsmAnalysis.ts                             — Hip/valley classifier (KNOWN BUG: ridge=981ft, hip=0ft)
  reportPdf.ts                               — Quick Bid PDF (.ts not .tsx — critical)
  premiumReportPdf.ts                        — Premium PDF (.ts not .tsx — critical)
```

---

## 6. Commits This Session (May 26, newest first)

```
8a642ac  fix: AddLeadModal outside mobile div — works on desktop; remove Quick Bid PDF from nav
1b1f379  fix: handleAddLead always opens built-in modal
3bcc6d5  fix: properties empty state — single CTA, sidebar is primary Add Lead action
8f242a3  fix: nav /dashboard always exact; sidebar Add Lead always works; remove duplicate Add Lead from pipeline
086da29  fix: add exact? comingSoon? to DefaultNavItem type
077233f  fix: remove duplicate Add Property button; Overview nav exact:true
9c7efb8  fix: add stageAnchors field to ElectricianConfig PlumbingConfig GCConfig interfaces
9814e96  fix: Quick Bid PDF nav → promeasure; isA uses startsWith for sub-routes
68c7ef2  feat: complete CRM architecture — trade_slug on leads, property auto-link, pipeline_events, trade-stage validation
817705d  fix: add lead_in to DefaultStage type
08ed2a0  fix: default trade config entry stage new → lead_in
1e4594a  fix: properties API strips city/state/zip from address_line1
cf693f6  fix: roofing AddLeadModal street-only in property_address
dc231c1  fix: Properties nav → /dashboard/roofing/property (not /dashboard/clients)
f38f6c9  fix: remove stale setStatusOpen reference
3504dcc  fix: top header cleanup — remove duplicate Add Lead, location pill, dummy bell badge
22d85de  fix: Add New Lead sidebar works on all pages — AddLeadModal in DashboardShell
cf34844  feat: add pipe boots + disposal to roofing calculator
788d884  fix: JSX structure — pipe boots inside card container
```

---

## 7. Infrastructure Checklist Before Launch

| Item | Status | Action |
|---|---|---|
| Supabase Free → Pro | ❌ | supabase.com → billing → upgrade |
| US LLC | ❌ | Stripe Atlas ($500) or direct filing ($300) |
| Twilio 10DLC | ❌ | Start NOW — 2 week approval |
| hello@proguild.ai in Resend | ❌ | resend.com → domains → verify |
| Stripe env vars in Vercel | ❌ | Vercel → staging → env vars |
| Stripe webhook registered | ❌ | stripe.com → webhooks → add staging URL |
| GitHub token rotate | ⚠️ | github.com → settings → tokens → rotate |
| RLS audit | ❌ | Supabase → SQL editor → check policies |
| Community feed seeded | ❌ | 15+ posts before Wave 1 |
| Mobile QA at 360px | ❌ | Test all key flows on mobile |
| Production SQL migrations | ❌ | v74-v92 not run on production DB |

---

## 8. Start Here Next Session

**Priority 1 — Stripe E2E test:**
1. Add env vars to Vercel staging: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`
2. Register webhook in Stripe dashboard: `https://staging.proguild.ai/api/webhooks/stripe` → event: `checkout.session.completed`
3. Create lead → estimate → sign → invoice → pay via card → verify `job_won`

**Priority 2 — RLS audit:**
Run in Supabase SQL editor:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY rowsecurity, tablename;
```
Any row with `rowsecurity = false` on a sensitive table is a vulnerability.

**Priority 3 — HVAC Wave 2 prep:**
Wire `hvac_job_data` population from equipment records when a job is saved.

**Priority 4 — Production SQL migrations:**
Before going live, run all pending migrations on the production Supabase project (`bzfauzqqxwtqqskjhrgq`). See HANDOVER_v80 for migration file list.

---

## 9. Key Design Decisions (Do Not Re-debate)

1. **One `leads` table for all trades** — cross-trade queries require it; trade-specific data in `*_job_data` tables
2. **`trade_slug` on both `pros` AND `leads`** — lead is self-describing; changing pro's trade doesn't break history
3. **Trade-stage validation in API** — DB constraint is safety net; API enforces trade-specific valid stages
4. **`pipeline_events` is append-only** — never update/delete; it's the legal audit trail
5. **`property_id` auto-set** — created/matched from address when lead is saved; never null if address provided
6. **AddLeadModal in DashboardShell** — works from every page; individual pages don't need to wire it
7. **`/dashboard` always exact match** — `isA` special-cases this; sub-routes don't false-highlight Overview
8. **Quick Bid PDF is a feature inside Properties** — not a separate nav destination
9. **Properties emerge from leads** — empty state guides to "Add New Lead", not "Add Property"
10. **Stripe API version `2026-04-22.dahlia`** — hardcoded in 4 files; do not change
