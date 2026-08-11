# ProGuild.ai — Build Instructions for New Claude Session
## v92 | Updated May 2026

---

## What changed since v78

| Area | v78 | v92 |
|---|---|---|
| Next.js | Not specified | 16.2.2 (Turbopack) |
| React | Not specified | 19.2.4 |
| Schema | 36 tables | 134 tables (v90+v91+v92 migrations) |
| Trade system | None | lib/trades/ — 8 trades, 58 unit tests |
| Design tokens | lib/theme.ts → theme(dk) | lib/tokens.ts → T + theme(dk) (theme.ts re-exports for compat) |
| New components | None | TradeSidebar, TradeWidget, InsuranceClaimFields, JobPhotoLog, WarrantyRecord, GoodBetterBest |
| New API routes | None | /api/leads/[id]/stage, /api/leads/[id]/photos |
| Dashboard routes | pipeline, estimates, invoices, clients, calendar | + roofing/calculator, roofing/promeasure, roofing/property/[id] |
| Handover doc | HANDOVER_v76_2.md | HANDOVER_v92_DBSession.md |
| Unit tests | 124 cases | 58 trade isolation + 124 CRM = 182 total |

---

## Step 1: Clone the repo

```bash
git clone https://YOUR_TOKEN@github.com/valktech11/ProGuild.git
cd ProGuild
git checkout dev
git pull origin dev
```

> ⚠️ TOKEN ROTATION REQUIRED: The token `YOUR_GITHUB_TOKEN` was exposed in chat history and must be rotated before use. Get the new token from Wasim. GitHub → Settings → Developer settings → Personal access tokens.

---

## Step 2: Git identity (run once after cloning)

```bash
git config user.email "wasimakram@wasim.com"
git config user.name "Wasim Akram"
```

Required for commits in Claude's non-interactive environment.

---

## Step 3: Install dependencies

```bash
npm install
```

---

## Step 4: Environment setup

`.env.local` is gitignored. For Claude's bash_tool these are already available from the staging environment. For local development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://zttsqqvaakblgbutviai.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dHNxcXZhYWtibGdidXR2aWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDQwNTUsImV4cCI6MjA5Mjc4MDA1NX0.c-OZEooM7_zttSbbn9KgKzuK0kWxProcnaprWs6mx2Y
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dHNxcXZhYWtibGdidXR2aWFpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwNDA1NSwiZXhwIjoyMDkyNzgwMDU1fQ._F-7JX0bImFKAqfLCIZCzcdloMpzK5-IPxzxj2qBBdw
NEXT_PUBLIC_SITE_URL=https://staging.proguild.ai
GEMINI_API_KEY=<AI Studio key — separate from GCP billing>
GOOGLE_SOLAR_API_KEY=<GCP ProGuild Server Key>
NEXT_PUBLIC_GOOGLE_MAPS_KEY=<Maps Platform API Key>
R2_ACCOUNT_ID=<Cloudflare R2>
R2_ACCESS_KEY_ID=<Cloudflare R2>
R2_SECRET_ACCESS_KEY=<Cloudflare R2>
R2_BUCKET_NAME=proguild-media-staging
R2_PUBLIC_BUCKET_URL=<R2 public bucket URL>
RESEND_API_KEY=<Resend dashboard>
```

> ⚠️ CRITICAL: GEMINI_API_KEY and GOOGLE_SOLAR_API_KEY are DIFFERENT keys on DIFFERENT billing accounts. Topping up one does NOT top up the other. Monitor both separately.

---

## Step 5: Understand the deployment pipeline

```
All new code → dev branch first (never start on staging or main)
    ↓
TypeScript check (mandatory before every commit)
    ↓
git push HEAD:dev
    ↓
GitHub Actions CI: unit + integration tests
    ↓ (if green)
git push HEAD:staging
    ↓
Vercel auto-deploys to staging.proguild.ai (~35 seconds)
    ↓
QA on staging (360px mobile + desktop)
    ↓
Only after QA passes: merge staging → main (production)
```

**Staging URL:** https://staging.proguild.ai  
**Staging password:** `proguild2026`  
**Production URL:** https://proguild.ai  

**NEVER push directly to main. Always dev → staging → manual merge to main after QA.**

---

## Step 6: Git commit and push — EXACT COMMANDS

```bash
# 1. TypeScript check (mandatory — see Step 7)
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
# Empty output = clean. Non-empty = fix before committing.

# 2. Stage and commit (SEPARATE from push)
git add -A
git commit -m "feat: description of change"

# 3. Push to dev (triggers CI)
git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev

# 4. Push to staging (Vercel auto-deploys)
git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging

# 5. Merge staging → main (production) — ONLY after QA passes all 5 gates
git checkout main && git pull origin main && git merge staging
git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:main
```

> ⚠️ NEVER use `&&` between commit and push — TypeScript exits code 1 and silently skips the push.  
> ⚠️ NEVER use `git push origin dev` — fails in Claude's non-interactive environment.  
> ⚠️ NEVER include the real token in any file committed to git — GitHub push protection blocks it.

---

## Step 7: TypeScript check ritual (CRITICAL)

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```

Empty output = clean. Run before every push to every branch.

---

## Step 8: Run unit tests

```bash
# All unit tests (182 total: 58 trade isolation + 124 CRM)
npm run test:unit

# Trade isolation only (58 tests — runs in <1 second)
npx jest __tests__/unit/trades/ --no-coverage

# CRM tests only
npx jest __tests__/unit/estimates-invoices-leads --no-coverage

# Watch mode
npm run test:watch
```

---

## Key rules when writing code

### Auth — always sessionStorage, never localStorage
```typescript
const raw = sessionStorage.getItem('pg_pro')   // NOT localStorage
const session: Session | null = raw ? JSON.parse(raw) : null
// Dark mode only: localStorage.getItem('pg_darkmode') === '1'
```

### Design tokens — updated in v92
```typescript
// Old (still works — re-exported for backward compat):
import { theme } from '@/lib/theme'
const t = theme(dk)
// t.textPrimary, t.textMuted, t.cardBg, t.inputBorder, t.cardBorder

// New (preferred for new code):
import { T, theme } from '@/lib/tokens'
// T.fontBody, T.radMd, T.sp4 etc. — semantic spacing/sizing tokens
// theme(dk) still works the same way
```

### Trade system — always use registry, never import directly
```typescript
import { getTradeConfig, isRoofing, isHVAC, isPlumbing } from '@/lib/trades/_registry'

const tradeConfig = getTradeConfig(session.trade_slug ?? '')

// Gate roofing-only features:
if (isRoofing(tradeConfig)) {
  // show InsuranceClaimFields, JobPhotoLog, WarrantyRecord etc.
}
```

### API routes — always use admin client
```typescript
import { getSupabaseAdmin } from '@/lib/supabase'
const sb = getSupabaseAdmin()
// Service role bypasses RLS — ownership must be enforced in query:
.eq('id', recordId).eq('pro_id', proId)  // always double-check ownership
```

### Stage transitions — always use the API route
```typescript
// NEVER update lead_status directly in the DB from UI code
// ALWAYS go through the stage route which enforces isValidTransition()
await fetch(`/api/leads/${leadId}/stage`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ stage: newStage, pro_id: session.id })
})
// Returns 422 if transition is invalid
```

### New dashboard pages — always wrap in DashboardShell
```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/theme'

export default function MyPage() {
  const router = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  useEffect(() => { if (!session) router.push('/login') }, [session, router])
  if (!session) return null
  const t = theme(dk)

  return (
    <DashboardShell
      session={session} newLeads={0} onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}
    >
      {/* your content */}
    </DashboardShell>
  )
}
```

### Contact names — always capitalize
```typescript
import { capName } from '@/lib/utils'
capName(lead.contact_name)  // "neha patel" → "Neha Patel"
```

### PDF files — NEVER rename to .tsx
```typescript
// lib/roofing/reportPdf.ts and lib/roofing/premiumReportPdf.ts
// MUST stay .ts not .tsx — SWC JSX transform breaks react-pdf renderToBuffer
// NEVER add JSX syntax to these files
// ALWAYS use React.createElement() instead
```

### All roofing API routes need nodejs runtime
```typescript
export const runtime = 'nodejs'  // required for all app/api/roofing/* routes
```

### useSearchParams — always wrap in Suspense
```tsx
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function Inner() {
  const params = useSearchParams()
  // ...
}
export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>
}
```

---

## File structure — updated for v92

```
app/
  dashboard/
    page.tsx                          ← Overview dashboard (reads trade config)
    pipeline/
      page.tsx                        ← Pipeline kanban
      [id]/page.tsx                   ← Lead detail
    estimates/
      page.tsx                        ← Estimates list
      [id]/page.tsx                   ← Estimate builder/detail
    invoices/
      page.tsx                        ← Invoices list
      [id]/page.tsx                   ← Invoice detail
    clients/
      page.tsx                        ← Clients list
    calendar/
      page.tsx                        ← Calendar
    hvac/                             ← NEW: HVAC-specific pages
    roofing/
      calculator/page.tsx             ← NEW: Roofing material calculator
      promeasure/page.tsx             ← NEW: Polygon measurement tool
      property/[id]/page.tsx          ← NEW: Property profile
  api/
    leads/
      route.ts                        ← GET list, POST create
      [id]/
        route.ts                      ← GET, PATCH, DELETE
        stage/route.ts                ← NEW: PATCH stage transition (422 on invalid)
        photos/route.ts               ← NEW: GET list, POST upload to R2
    estimates/[id]/route.ts
    invoices/
    roofing/
      report/route.ts                 ← Satellite report pipeline
      reports/route.ts                ← GET re-signed URLs, DELETE
      dsm/route.ts                    ← DSM+RANSAC linear footage
      premium-report/route.ts        ← Premium Material Order PDF
      warranties/route.ts             ← POST create warranty record

components/
  layout/
    DashboardShell.tsx                ← Sidebar + TopHeader + MobileNav
  dashboard/
    TradeSidebar.tsx                  ← NEW: Renders trade.nav from config
    TradeWidget.tsx                   ← NEW: Switches on isRoofing/isHVAC
  ui/
    LeadPipeline.tsx                  ← Kanban board — accepts stages prop from trade config
    FilterPanel.tsx
    AddLeadModal.tsx
  roofing/
    InsuranceClaimFields.tsx          ← NEW: 9-field insurance toggle
    JobPhotoLog.tsx                   ← NEW: Photos with phase labels + ZIP
    WarrantyRecord.tsx                ← NEW: Job Won warranty modal
  estimate/
    GoodBetterBest.tsx                ← NEW: 3-column tiered proposal
    EstimateItems.tsx
    EstimateSummary.tsx
    EstimateProgressBar.tsx
    PaymentPanel.tsx

lib/
  trades/
    _registry/index.ts               ← getTradeConfig(), isRoofing(), isHVAC() etc.
    _registry/types.ts               ← AnyTradeConfig discriminated union
    roofing/
      types.ts
      config.ts
      state-machine.ts               ← VALID_TRANSITIONS, isValidTransition()
    hvac/
    plumbing/
    electrician/
    general-contractor/
    solar/
    _default/
  utils.ts                           ← capName, timeAgo, avatarColor, planLabel
  theme.ts                           ← Re-exports from lib/tokens.ts (backward compat)
  tokens.ts                          ← T (spacing/sizing) + theme(dk) (colours)
  design.ts                          ← stageStyle(), eventStyle() — stage chip colours
  supabase.ts                        ← getSupabaseAdmin() + getSupabase()
  api/utils.ts                       ← apiError(), validateCoordinates(), isValidUuid(), getR2Client()
  roofing/
    reportPdf.ts                     ← Quick Bid PDF builder (.ts NOT .tsx)
    premiumReportPdf.ts              ← Premium PDF builder (.ts NOT .tsx)
    dsmAnalysis.ts                   ← DSM+RANSAC shared lib

__tests__/
  unit/
    trades/
      roofing.test.ts                ← State machine + isolation (47 tests)
      hvac.test.ts
      trade-registry.test.ts
    estimates-invoices-leads.test.ts ← 124-case CRM test suite
    api.test.ts
    utils.test.ts

types/
  index.ts                           ← Session, Lead, Estimate, Invoice, LeadStatus etc.

SQL migrations (repo root):
  v90-master-schema.sql              ← Trade job data, audit, RLS, indexes
  v91-definitive-schema.sql          ← Identity, community, event sourcing, API layer
  v92-domain-tables.sql              ← All 10 product domains (40 tables)
  SPRINT_B_README.md                 ← Wiring instructions for Sprint B components
  HANDOVER_v92_DBSession.md          ← Current session handover (latest)
```

---

## Trade system architecture

The trade system is a sealed module per trade. **Never import from individual trade folders in UI code.** Always use the registry.

```typescript
// ✅ CORRECT
import { getTradeConfig, isRoofing } from '@/lib/trades/_registry'

// ❌ WRONG — never import directly from trade folders in UI
import { roofingConfig } from '@/lib/trades/roofing/config'
```

### Adding a new trade — 3 steps, zero existing file changes
1. Create `lib/trades/[trade]/` with `types.ts`, `config.ts`, `state-machine.ts`
2. Import and add to registry in `lib/trades/_registry/index.ts`
3. Create `[trade]_job_data` table in a new SQL migration

### Stage transitions
The `VALID_TRANSITIONS` map in `lib/trades/roofing/state-machine.ts` is the single source of truth. The same `isValidTransition()` function runs in both unit tests AND the production `PATCH /api/leads/[id]/stage` route. The API returns 422 on invalid transitions.

---

## Database — current state (May 2026)

### Supabase instances
| Environment | Project ID | URL |
|---|---|---|
| Staging | zttsqqvaakblgbutviai | https://zttsqqvaakblgbutviai.supabase.co |
| Production | bzfauzqqxwtqqskjhrgq | https://bzfauzqqxwtqqskjhrgq.supabase.co |

### Migration status
| File | Staging | Production |
|---|---|---|
| v90-master-schema.sql | ✅ Complete | ⏳ Run before production launch |
| v91-definitive-schema.sql | ✅ Complete | ⏳ Run before production launch |
| v92-domain-tables.sql | ✅ Complete | ⏳ Run before production launch |

**Run order on production: v90 → v91 → v92 (in sequence, never skip)**

### Test accounts
- **Primary:** `wasimakram@wasim.com` / Pro ID: `7e883161-f9af-4de8-8bc6-71933033100f`
- **Do NOT use:** `test@proguild.ai` — E2E fixture data only

### Key schema rules
- `trade_slug` on leads determines which `[trade]_job_data` table to join
- All leads queries must include `WHERE deleted_at IS NULL` (soft delete)
- `estimates.tiered_data` is the canonical G/B/B column — `estimates.tiers` was dropped
- `post_likes` → deprecated, use `post_reactions`
- `messages` → deprecated, use `conversations` + `conversation_messages`
- `lead_trigger_log` → deprecated, use `job_queue`

---

## Pipeline events — write to this on every business event

```typescript
// Every meaningful business event should write to pipeline_events
// This is the immutable audit trail AND the NoSQL migration path
await sb.from('pipeline_events').insert({
  event_type:   'stage_changed',
  pro_id:       session.id,
  lead_id:      leadId,
  trade_slug:   tradeConfig.slug,
  event_data:   { from: currentStage, to: newStage },
  actor_type:   'pro',
  ip_address:   req.headers.get('x-forwarded-for') ?? null,
})
```

---

## Design system — updated tokens

```typescript
import { T, theme } from '@/lib/tokens'

// T — semantic sizing tokens (never hardcode px values)
T.fontBody      // 14px — primary readable body text
T.fontLabel     // 16px — section labels, card titles
T.fontHeading   // 18px — section headers
T.fontTitle     // 24px — page h1
T.radSm         // 8px — buttons, inputs
T.radMd         // 12px — standard cards
T.sp4           // 16px — standard spacing
T.sp6           // 24px — large spacing

// theme(dk) — colour tokens (dk = darkMode boolean)
const t = theme(dk)
t.textPrimary   // primary text
t.textMuted     // secondary text, timestamps
t.cardBg        // card background
t.cardBorder    // card border
t.inputBg       // input background
t.inputBorder   // input border
```

### Stage chip colours (from lib/design.ts)
```typescript
import { stageStyle } from '@/lib/design'
const { bg, text } = stageStyle(lead.lead_status)
// Handles both old generic stages (New/Quoted/Scheduled) and new trade stages (lead_in/proposal_sent etc.)
```

### Brand colours
```
TEAL      #0F766E  — primary actions, buttons, CTAs
TEAL_L    #14B8A6  — lighter accents
NAVY      #0A1628  — primary text dark mode, headings
CREAM     #F5F4F0  — page background light
AMBER     #F59E0B  — warnings, new stage
GREEN     #15803D  — job won, approved
RED       #DC2626  — lost, danger actions
```

---

## Sprint B — what's wired vs pending

### Built and on staging (code exists)
- `app/api/leads/[id]/stage/route.ts` — stage transition guard
- `app/api/leads/[id]/photos/route.ts` — photo upload to R2
- `app/dashboard/roofing/calculator/page.tsx` — material calculator
- `components/roofing/InsuranceClaimFields.tsx`
- `components/roofing/JobPhotoLog.tsx`
- `components/estimate/GoodBetterBest.tsx`
- `components/roofing/WarrantyRecord.tsx`

### Needs wiring into existing pages (see SPRINT_B_README.md)
- `InsuranceClaimFields` → `app/dashboard/pipeline/[id]/page.tsx` (with `isRoofing()` guard)
- `JobPhotoLog` → same page after InsuranceClaimFields
- `GoodBetterBest` → `app/dashboard/estimates/[id]/page.tsx` (with `isRoofing()` guard)
- `WarrantyRecord` → modal on `job_won` stage change if `isRoofing()`
- Calculator → report generation pushes `pg_report_data` to sessionStorage then routes to `/dashboard/roofing/calculator`

### Missing API routes (still to build)
- `PATCH /api/leads/[id]` — add insurance fields to write whitelist
- `DELETE /api/leads/[id]/photos/[photoId]` — delete single photo
- `GET /api/leads/[id]/photos/zip` — stream ZIP for adjuster
- `POST /api/roofing/warranties` — insert warranty record

---

## Common gotchas — updated

| Gotcha | What happens | Fix |
|---|---|---|
| `git push origin dev` | Fails — no interactive TTY | Always use full token URL |
| Token in committed file | GitHub push protection blocks push | Never put token in any file. Remove from history and recommit. |
| `&&` on commit+push | Push silently skipped | Always separate commands |
| `tiers` column on estimates | Column was dropped — use `tiered_data` | `estimates.tiered_data` is canonical |
| `getTradeConfig()` in UI | Never import from trade folders directly | Always use `@/lib/trades/_registry` |
| Stage change direct to DB | Bypasses isValidTransition() check | Always PATCH `/api/leads/[id]/stage` |
| reportPdf.ts renamed to .tsx | react-pdf renderToBuffer breaks | Keep as .ts, use React.createElement() |
| `useSearchParams` without Suspense | Prerender error | Wrap in `<Suspense fallback={null}>` |
| Insurance fields not saving | Not in leads PATCH whitelist | Add to `app/api/leads/[id]/route.ts` allowedFields |
| Session in useEffect | Dashboard flicker on load | Read session in useState initializer (synchronous) |
| `lead.contact_name` raw | Shows lowercase names | Always wrap in `capName()` |
| `Phone_Call` lead source | Underscores in UI | `.replace(/_/g, ' ')` on all lead_source displays |
| `lead_trigger_log` writes | Deprecated table | Write to `job_queue` instead |
| `post_likes` writes | Deprecated table | Write to `post_reactions` instead |

---

## Start-of-session checklist

```bash
# 1. Clone and checkout dev
git clone https://TOKEN@github.com/valktech11/ProGuild.git
cd ProGuild && git checkout dev && git pull origin dev

# 2. Set git identity
git config user.email "wasimakram@wasim.com"
git config user.name "Wasim Akram"

# 3. Install
npm install

# 4. Read the handover
cat HANDOVER_v92_DBSession.md

# 5. Read the Founders Bible (ask user to share ProGuild_Founders_Bible_v5.1.docx)

# 6. Confirm trade system is on dev
ls lib/trades/  # should show: _default _registry electrician general-contractor hvac plumbing roofing solar

# 7. Run unit tests to confirm clean state
npx jest __tests__/unit/trades/ --no-coverage
```

---

## Pre-ship checklist (before every push)

```bash
# 1. TypeScript clean
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"

# 2. Trade unit tests
npx jest __tests__/unit/trades/ --no-coverage

# 3. CRM unit tests
npm run test:unit

# 4. Commit (separate from push)
git add -A
git commit -m "feat: ..."

# 5. Push to dev
git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev

# 6. Push to staging
git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging

# 7. Wait ~35 seconds, verify Vercel build green

# 8. Test on staging.proguild.ai
#    - Test at 360px mobile width
#    - Test dark mode if any colour changed
#    - Test the specific flows you changed
```

---

## Always read two documents at session start

1. **`HANDOVER_v92_DBSession.md`** — current branch state, what's built, what's pending
2. **`ProGuild_Founders_Bible_v5.1.docx`** — product strategy, architecture decisions, git workflow (Section 19)

Current latest handover: `HANDOVER_v92_DBSession.md`
