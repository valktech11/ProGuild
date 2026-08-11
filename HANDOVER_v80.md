# ProGuild.ai — Development Handover Document
## Session: v80 — Bug Fixes, UI Polish, Pipeline Overhaul + Strategy
**Date:** May 2026
**Latest commit:** `b0fc813` (dev + staging)
**Branch:** `dev` → auto-deploys to staging after CI green
**Staging:** https://staging.proguild.ai (password: `proguild2026`)
**Repo:** https://github.com/valktech11/ProGuild

---

## ⚠️ CRITICAL RULES — READ FIRST

### Git push — ALWAYS use full token URL
```bash
# NEVER: git push origin dev  — fails in Claude's non-interactive env
# ALWAYS:
git push https://YOUR_TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
git push https://YOUR_TOKEN@github.com/valktech11/ProGuild.git HEAD:staging

# NEVER && commit+push — TS exits code 1, silently skips push
git commit -m "feat: ..."
git push ...dev
git push ...staging
```

### TypeScript check before every push
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly" | \
  grep -v "Cannot find module\|TS2503\|TS2591\|TS2345" | \
  grep -v "GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```
Also run file-specific unfiltered check on files you touched.

### Auth pattern
- `sessionStorage.getItem('pg_pro')` — NOT localStorage
- `localStorage.getItem('pg_darkmode')` — dark mode only
- All API routes use `getSupabaseAdmin()` server-side

### useSearchParams — always wrap in Suspense
```tsx
function Inner() { const params = useSearchParams(); ... }
export default function Page() { return <Suspense fallback={null}><Inner/></Suspense> }
```

---

## Stack
| Item | Value |
|---|---|
| Framework | Next.js 16.2.2 (Turbopack, App Router) |
| Database | Supabase staging: `zttsqqvaakblgbutviai.supabase.co` |
| Deployment | Vercel — project: `tradesnetwork` |
| Auth | `sessionStorage('pg_pro')` NOT localStorage |
| Dark mode | `localStorage('pg_darkmode')` = '1' or '0' |
| GitHub token | `ghp_REDACTED_see_github_secrets` (write scope, verified) |

---

## Test Accounts (Staging)
| Role | Email | ID |
|---|---|---|
| Test Pro | wasimakram@wasim.com | `7e883161-f9af-4de8-8bc6-71933033100f` |
| Test Pro | test@proguild.ai | `58b897e2-5723-4178-93d5-8bd29420b52f` |

**Do NOT use test@proguild.ai for general testing** — E2E fixture data only.

---

## What Was Built This Session (commits 77d04f5 → b0fc813)

### ✅ Bug Fix: Lead PATCH API — contact fields not saving (`77d04f5`)
**File:** `app/api/leads/[id]/route.ts`
- `contact_phone`, `contact_email`, `contact_city`, `contact_state`, `lead_source` were being sent by the drawer but never destructured from the request body — silently dropped every time
- All 5 fields now correctly flow through to `updateFields` and get written to Supabase
- The 200 OK from other fields persisting masked the bug completely

### ✅ Bug Fix: Edit Lead drawer save button hidden behind mobile nav (`3e65061`)
**File:** `app/dashboard/pipeline/[id]/page.tsx`
- Footer `paddingBottom` was `calc(16px + env(safe-area-inset-bottom))` — didn't account for 60px mobile nav
- Fixed to `calc(76px + env(safe-area-inset-bottom))` on mobile, overridden to `pb-4` on `md:` desktop

### ✅ UI: Login redesign + Add Lead card grouping + Estimate tax fix + State dropdown (`b14995b`)
**Files:** `app/login/page.tsx`, `components/ui/AddLeadModal.tsx`, `components/estimate/EstimateItems.tsx`, `app/dashboard/pipeline/[id]/page.tsx`

**Login redesign:**
- Dark navy/teal gradient hero panel on desktop (left 45%)
- ProGuild logo + 3 feature bullets on hero
- Right panel: strong `border: 2px solid #CBD5E1` inputs with teal focus state
- Gradient CTA button with shadow
- Mobile: top logo bar + form only
- Removed unused `Navbar` import

**Add Lead modal:**
- Lead details section wrapped in `#F8FAFC` card with border
- All inputs have `2px solid #CBD5E1` border + teal focus
- Labels uppercase bold — clear visual grouping

**Estimate tax row:**
- Both mobile and desktop tax rows now gated on `estimate.items.length > 0`
- Tax was always showing even on empty estimates — now hidden until items added

**Edit Lead state field:**
- Was free-text `<input maxLength={2}>` — replaced with full `US_STATES` dropdown
- Column widened from 80px to 140px to fit dropdown

### ✅ Calendar: Stats strip scope matches active view (`8254b03` + `312907b`)
**File:** `app/dashboard/calendar/page.tsx`
- Mobile stats strip now shows Day/Week/Month scope based on `mobileView` state
- Desktop sidebar card title + values respond to `desktopView` state
- Added derived stats: `weekJobs`, `monthJobs`, `monthValue`, `monthDone`
- Day → "Today's Value" / Jobs / Done
- Week → "Week's Value" / Jobs / Done
- Month → "Month's Value" / Jobs / Done

### ✅ Bug Fix: Edit Lead drawer scroll broken on mobile (`b959bd9` + `fe531ce`)
**File:** `app/dashboard/pipeline/[id]/page.tsx`

**Root causes fixed:**
1. `flex: 1` without `minHeight: 0` — classic browser bug, scroll area grew to fit content instead of capping at viewport
2. `height: 100%` doesn't reliably equal viewport on mobile Chrome (browser chrome eats into it) — switched to `100dvh`
3. `body overflow: hidden` scroll lock was blocking Android inner scroll — removed entirely

**Architecture change — bottom sheet on mobile:**
- Mobile: `position: fixed, bottom: 0, left: 0, right: 0, maxHeight: 92dvh, borderRadius: 20px 20px 0 0`
- Desktop: right side panel via Tailwind `md:` overrides
- Drag handle indicator on mobile
- `WebkitOverflowScrolling: touch` on scroll area
- `minHeight: 0` on flex scroll child

### ✅ Pipeline value overhaul — quoted_amount system-managed only (`b0fc813`)
**Files:** `app/api/estimates/[id]/route.ts`, `app/api/leads/[id]/route.ts`, `app/dashboard/pipeline/[id]/page.tsx`, `components/ui/LeadPipeline.tsx`

**The problem:** `quoted_amount` on leads was being set manually via Edit Lead drawer AND auto-synced from estimates — causing pipeline to show stale/wrong values with no visual context.

**The fix — one source of truth:**

`quoted_amount` is now **system-managed only**. The manual input field in the Edit Lead drawer is removed entirely.

**New sync rules:**
- Estimate status = `sent` → `lead.quoted_amount = estimate.total` + `lead.lead_status = 'Quoted'` (auto-moves stage)
- Estimate status = `approved/invoiced/paid` → `lead.quoted_amount = estimate.total` (stage stays, pro controls)
- Draft/viewed estimates → no sync (not committed yet)

**API changes:**
- `leads/[id]` PATCH: `quoted_amount` removed from writable fields — system only
- `estimates/[id]` PATCH: sync expanded to include `sent` status

**UI changes:**
- Edit Lead drawer: "Estimated Value" input removed. If estimate exists, shows read-only teal card with estimate total + link to estimate
- Pipeline card: amount shows with coloured status badge — `SENT` (amber), `APPROVED` (green), `INVOICED` (teal)
- No amount shown on New/Contacted leads — honest (no estimate yet)

---

## Current Pipeline / Lead Workflow (IMPORTANT — new behaviour)

```
New → Contacted → [Pro creates + sends estimate] → auto-moves to Quoted
Quoted → [Customer approves estimate] → Pro manually moves to Scheduled
Scheduled → Completed → [Invoice paid] → Job Won (Paid)
```

- **New/Contacted:** no amount on pipeline card — correct, no estimate exists yet
- **Quoted:** card shows `$650 SENT` in amber — estimate sent, awaiting approval
- **Scheduled:** card shows `$650 APPROVED` in green — estimate approved
- **Completed:** card shows `$650 INVOICED` in teal
- **Job Won:** card shows `$650` — invoice paid

Pipeline total now only counts leads with real estimates. No manual guesses inflating the number.

---

## Strategy Work This Session (non-code)

This session had extensive strategic discussion. Full analysis is saved as:
- `ProGuild_Strategy_Discussion.html` — full narrative with embedded flow diagrams (downloadable)
- `ProGuild_Marketplace_Strategy.docx` — summary Word document
- `ProGuild_HVAC_CRM_Requirements_v1.docx` — full HVAC feature requirements

### Key strategic decisions made:

**ProGuild's model vs competitors:**
- NOT a lead blast platform (Thumbtack/Angi). Customer selects a specific pro and fills their profile form.
- Closer to Google Maps + contact form. Customer chose the pro — no spam concern.
- Subscription model ($49-99/mo) not per-lead — aligns incentives.

**HVAC as beachhead vertical:**
- Equipment-first data model: Customer → Property → Equipment → Service History
- Phase 1 features to build: Equipment Records, Refrigerant Log, Maintenance Reminders
- Composable nav: `session.trade === "HVAC Technician"` → HVAC sidebar. All others unchanged.
- Full requirements in `ProGuild_HVAC_CRM_Requirements_v1.docx`

**Pipeline value architecture (implemented):**
- `quoted_amount` = system-managed only, set by estimate workflow
- No manual amount entry on leads
- See "Pipeline value overhaul" section above

**Go-to-market:**
- 5,690 emailable FL pros — warm outreach universe
- 4-wave campaign: Roofing+HVAC → Plumber+Electrician → Specialty → GC
- Multi-state: CA (CSLB) + TX (TDLR) after 200 claimed FL pros
- Submit sitemap to Google Search Console — SEO clock starts immediately

---

## HVAC CRM — Next Build (Phase 1, ~1 week)

**Pre-requisite:** Confirm exact `trade_categories.category_name` string for HVAC in Supabase staging.

### SQL to run first (staging, then prod):
```sql
-- v80-hvac-equipment.sql
CREATE TABLE equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id UUID REFERENCES pros(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL, -- AC_Unit, Furnace, Heat_Pump, Air_Handler, Mini_Split, Boiler, Other
  brand VARCHAR(100), model_number VARCHAR(100), serial_number VARCHAR(100),
  installation_date DATE, warranty_expiry DATE, filter_size VARCHAR(50),
  last_service_date DATE, next_service_date DATE,
  refrigerant_type TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_equipment_pro_id ON equipment(pro_id);
CREATE INDEX idx_equipment_client_id ON equipment(client_id);

CREATE TABLE refrigerant_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  pro_id UUID REFERENCES pros(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id),
  refrigerant_type TEXT NOT NULL,
  amount_added_lbs DECIMAL(6,2), amount_recovered_lbs DECIMAL(6,2),
  cylinder_id VARCHAR(50), leak_detected BOOLEAN DEFAULT false,
  technician_cert_number VARCHAR(50), notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE maintenance_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id UUID REFERENCES pros(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'Pending', -- Pending, Notified, Scheduled, Dismissed
  notified_at TIMESTAMPTZ,
  scheduled_lead_id UUID REFERENCES leads(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Build order:
1. API routes: `/api/equipment` CRUD + `/api/refrigerant-log` + `/api/maintenance-reminders`
2. Equipment tab on `app/dashboard/clients/[id]/page.tsx`
3. Refrigerant log section on invoice (HVAC trade only — check `session.trade`)
4. HVAC nav in `DashboardShell.tsx` — `buildNav()` accepts `trade` param, returns HVAC-specific groups
5. Maintenance alerts widget on `app/dashboard/page.tsx` (HVAC only)

### HVAC sidebar nav (when session.trade === "HVAC Technician"):
```
TODAY:        Dashboard · Jobs · Calendar · Messages
MONEY:        Estimates · Invoices · Revenue
MY EQUIPMENT: Customers · Equipment · Refrigerant Log
MY BUSINESS:  Compliance · Memberships (soon)
```

### Terminology changes (labels only, same pages):
- "Pipeline" → "Jobs" in sidebar
- "Overview" → "Dashboard" in sidebar
- "Clients" → "Customers" in sidebar

---

## Pending / Backlog

### Immediate (before HVAC build)
- [ ] Clear pipeline data for adamsmith@adam.com (SQL provided in chat — run in Supabase)
- [ ] Confirm HVAC trade_category_name string in Supabase
- [ ] Update wasimakram@wasim.com trade to HVAC Technician for testing

### P2 Workflow Warnings (from v76 backlog — not yet built)
| # | Fix | Trigger |
|---|---|---|
| P2-1 | Warn when moving to Scheduled with no approved estimate | `handleStageClick('Scheduled')` |
| P2-2 | Warn when moving to Completed with no invoice | `handleStageClick('Completed')` |
| P2-3 | Warn when creating estimate for New lead | `openEstimate()` when `lead_status === 'New'` |

### P3 Quick Wins
- Lost leads click-to-manage (`LeadPipeline.tsx`)
- Delete confirmation modal on estimates list (replace `confirm()`)
- Discount % recalc when items added

### Pre-Launch Infrastructure
- [ ] Run `v74-sql.sql` on PRODUCTION (clients table missing)
- [ ] Run `v76-invoices-sql.sql` on PRODUCTION
- [ ] Run `v76-estimates-schema-update.sql` on PRODUCTION
- [ ] Run `v76-discount-type.sql` on PRODUCTION
- [ ] Run `v78-scheduled-time.sql` on PRODUCTION
- [ ] Supabase Free → Pro ($25/mo) — DB pauses on inactivity
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod env vars
- [ ] `hello@proguild.ai` verify in Resend
- [ ] Cloudflare DNS orange-cloud
- [ ] Twilio 10DLC registration (1–2 weeks, needed for SMS)
- [ ] Submit sitemap to Google Search Console (https://proguild.ai/sitemap.xml)

### Deferred (v85+)
- Stripe payment processing
- Customer portal (QR code homeowner page)
- AI Insights / Lead Score
- HVAC Phase 2: checklists, QR portal, membership billing
- SMS/Twilio messaging
- Multiple estimates history view

---

## Key Files Reference
```
app/api/leads/[id]/route.ts               — PATCH: contact fields + stage (NOT quoted_amount)
app/api/estimates/[id]/route.ts           — PATCH: syncs quoted_amount on sent/approved/paid
app/dashboard/pipeline/[id]/page.tsx      — Lead detail + edit lead bottom sheet
app/dashboard/pipeline/page.tsx           — Pipeline kanban
app/dashboard/calendar/page.tsx           — Calendar (day/week/month, all views)
app/dashboard/clients/[id]/page.tsx       — Client detail (Equipment tab goes here)
app/dashboard/page.tsx                    — Overview dashboard
app/login/page.tsx                        — Login (redesigned this session)
components/layout/DashboardShell.tsx      — Sidebar + TopHeader + MobileNav
components/ui/LeadPipeline.tsx            — Kanban board + lead cards + amount badges
components/ui/AddLeadModal.tsx            — Add lead modal
components/estimate/EstimateItems.tsx     — Tax row hidden until items added
lib/design.ts                             — Single color source (stageStyle, eventStyle etc.)
lib/theme.ts                              — Dark mode tokens
```

---

## Design System
```
TEAL      #0F766E  — primary actions, CTAs
TEAL_L    #14B8A6  — lighter accents
NAVY      #0A1628  — primary text dark mode
CREAM     #F5F4F0  — page background light
BORDER    #E8E2D9  — card borders
MUTED     #9CA3AF  — timestamps, secondary
BODY      #6B7280  — descriptive sub-text

Stage colors (from design.ts stageStyle()):
New:       #D97706 amber    bg #FFFBEB
Contacted: #2563EB blue     bg #EFF6FF
Quoted:    #7C3AED purple   bg #F5F3FF
Scheduled: #0F766E teal     bg #F0FDFA
Completed: #374151 gray     bg #F9FAFB
Paid/Job Won: #15803D green (display label: "Job Won")

Pipeline card amount badges:
SENT:     amber  #FEF3C7 / #B45309
APPROVED: green  #DCFCE7 / #166534
INVOICED: teal   #F0FDFA / #0F766E
```

---

## New Page Boilerplate
```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/theme'

export default function MyPage() {
  const router = useRouter()
  const [session] = useState<Session|null>(() => {
    if (typeof window==='undefined') return null
    const s = sessionStorage.getItem('pg_pro')  // NOT localStorage
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window==='undefined') return false
    return localStorage.getItem('pg_darkmode')==='1'
  })

  useEffect(() => {
    if (!session) router.push('/login')
  }, [session, router])

  if (!session) return null
  const t = theme(dk)

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>
      {/* page content */}
    </DashboardShell>
  )
}
```

---

## Supabase — Useful Queries

### Clear pipeline for a user
```sql
DO $$
DECLARE v_pro_id UUID;
BEGIN
  SELECT id INTO v_pro_id FROM pros WHERE email = 'adamsmith@adam.com';
  IF v_pro_id IS NULL THEN RAISE EXCEPTION 'Pro not found'; END IF;
  DELETE FROM estimate_items WHERE estimate_id IN (SELECT id FROM estimates WHERE pro_id = v_pro_id);
  DELETE FROM estimate_template_items WHERE template_id IN (SELECT id FROM estimate_templates WHERE pro_id = v_pro_id);
  DELETE FROM estimates WHERE pro_id = v_pro_id;
  DELETE FROM estimate_templates WHERE pro_id = v_pro_id;
  DELETE FROM invoices WHERE pro_id = v_pro_id;
  DELETE FROM leads WHERE pro_id = v_pro_id;
  RAISE NOTICE 'Done. All pipeline data cleared.';
END $$;
```

### Dirty quoted_amount cleanup (leads with only draft estimates)
```sql
UPDATE leads l SET quoted_amount = NULL
WHERE EXISTS (SELECT 1 FROM estimates e WHERE e.lead_id = l.id AND e.status IN ('draft','declined','void'))
AND NOT EXISTS (SELECT 1 FROM estimates e WHERE e.lead_id = l.id AND e.status IN ('sent','viewed','approved','invoiced','paid'));
```

---

## Vercel Configuration
| Setting | Value |
|---|---|
| Project | `tradesnetwork` |
| Production branch | `main` → proguild.ai |
| Staging domain | `staging.proguild.ai` → staging branch |
| Node.js | 24.x |
| Build command | `npm run build` |
| Ignored Build Step | `bash -c 'exit 1'` — ALWAYS BUILD |

If build stuck on old version: Vercel → Deployments → three dots → Redeploy → **uncheck** "Use existing build cache"
