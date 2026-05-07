# ProGuild.ai — Build Instructions for New Claude Session
## v78 | Updated May 2026

---

## Step 1: Clone the repo

```bash
git clone https://ghp_YOUR_WRITE_TOKEN_HERE@github.com/valktech11/ProGuild.git
cd ProGuild
git checkout dev
```

**GitHub token:** `ghp_YOUR_WRITE_TOKEN_HERE`
This token has `repo` write scope and is verified working. Use it for all git operations.

---

## Step 2: Install dependencies

```bash
npm install
```

---

## Step 3: Set up environment

The `.env.local` file is NOT in the repo (gitignored). You need:

```env
NEXT_PUBLIC_SUPABASE_URL=https://zttsqqvaakblgbutviai.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase staging dashboard>
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase staging dashboard>
NEXT_PUBLIC_SITE_URL=https://staging.proguild.ai
```

For Claude's bash_tool environment, these are already available — do NOT need to set them manually. Just clone and go.

---

## Step 4: Git identity setup (run once after cloning)

```bash
git config user.email "wasimakram@wasim.com"
git config user.name "Wasim Akram"
```

Required for commits to work in Claude's environment.

---

## Step 5: Understand the deployment pipeline

```
Local dev
    ↓
git push (see Step 6 for exact commands)
    ↓
GitHub Actions CI: unit + integration tests
    ↓ (if green)
Vercel auto-deploys to staging.proguild.ai
```

**Staging URL:** https://staging.proguild.ai
**Staging password:** `proguild2026`

Vercel deploys automatically — no login needed, no clicking. Build takes ~35 seconds.

---

## Step 6: Git commit and push — EXACT COMMANDS

> ⚠️ CRITICAL: The previous token (`OLD_READ_ONLY_TOKEN`) was read-only and could NOT push.
> The current token (`CURRENT_WRITE_TOKEN`) has write scope and is confirmed working.

> ⚠️ CRITICAL: In Claude's environment, `git push origin dev` does NOT work because
> git cannot prompt for credentials interactively. You MUST use the full token URL.

```bash
# TypeScript check first (mandatory — see Step 7)
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"

# Stage and commit
git add -A
git commit -m "feat: description of change"

# Push to dev (triggers CI + Vercel preview)
git push https://ghp_YOUR_WRITE_TOKEN_HERE@github.com/valktech11/ProGuild.git HEAD:dev

# Push to staging (deploys to staging.proguild.ai)
git push https://ghp_YOUR_WRITE_TOKEN_HERE@github.com/valktech11/ProGuild.git HEAD:staging
```

**NEVER use `&&` between commit and push** — TypeScript exits with code 1 even for pre-existing errors, silently skipping the push.

**NEVER use `git push origin dev`** — fails with "could not read Password" in Claude's non-interactive environment. Always use the full token URL above.

---

## Step 7: TypeScript check ritual (CRITICAL)

Vercel runs strict TypeScript. Local has filtered pre-existing errors. They are NOT the same.

Before EVERY commit, run this filtered check — if it outputs anything, fix it before committing:

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```

Empty output = clean. Commit and push.

Also run file-specific check on files you edited:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep "your-changed-file.tsx"
```

---

## Step 8: Run unit tests

```bash
# Run all unit tests (124 cases, ~1.2s)
npm run test:unit

# Watch mode during development
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests cover: estimates (create/save/approve/decline/duplicate), invoices (create/mark-paid/void/partial payments), leads (create/stage transitions/updates), calendar, clients.

---

## Key rules when writing code

### Auth
```typescript
const raw = sessionStorage.getItem('pg_pro')   // NOT localStorage
const session = raw ? JSON.parse(raw) : null
// Dark mode: localStorage.getItem('pg_darkmode') === '1'
```

### Contact names — always capitalize
```typescript
import { capName } from '@/lib/utils'
capName(lead.contact_name)  // "neha patel" → "Neha Patel"
```

### Theme tokens
```typescript
import { theme } from '@/lib/theme'
const t = theme(dk)  // dk = darkMode boolean
// t.textMuted, t.cardBg, t.inputBorder, t.cardBorder, t.textSubtle etc.
```

### API routes — always use admin client
```typescript
import { getSupabaseAdmin } from '@/lib/supabase'
const sb = getSupabaseAdmin()
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
  const [dk, setDk] = useState(false)

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    setDk(localStorage.getItem('pg_darkmode') === '1')
  }, [session, router])

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

### Mobile vs desktop
```tsx
<div className="md:hidden">...</div>      {/* Mobile only */}
<div className="hidden md:flex">...</div>  {/* Desktop only */}
```

### Job Won / Paid
- Display: `"Job Won"` everywhere in UI
- DB enum: `'paid'` (do NOT migrate — just change display strings)
- FilterPanel.tsx maps `Job Won → 'Paid'` for DB queries

### useSearchParams — must be wrapped in Suspense
```tsx
function SearchReader({ onData }: { onData: (v: string) => void }) {
  const params = useSearchParams()
  useEffect(() => { ... }, [params])
  return null
}
// In parent:
<Suspense fallback={null}><SearchReader onData={...} /></Suspense>
```

---

## File structure quick reference

```
app/
  dashboard/
    page.tsx                    ← Overview dashboard
    pipeline/
      page.tsx                  ← Pipeline kanban
      [id]/page.tsx             ← Lead detail
    estimates/
      page.tsx                  ← Estimates list
      [id]/page.tsx             ← Estimate builder/detail
    invoices/
      page.tsx                  ← Invoices list
      [id]/page.tsx             ← Invoice detail
    clients/
      page.tsx                  ← Clients list
    calendar/
      page.tsx                  ← Calendar (rebuilt v78)
  estimate/[id]/page.tsx        ← PUBLIC client-facing estimate
  invoice/[id]/page.tsx         ← PUBLIC client-facing invoice

components/
  layout/
    DashboardShell.tsx          ← Sidebar + TopHeader + MobileNav + MoreDrawer
  ui/
    LeadPipeline.tsx            ← Kanban board + mobile tabs + lead cards
    FilterPanel.tsx             ← Lead filter drawer
    AddLeadModal.tsx            ← Add lead modal
  estimate/
    EstimateItems.tsx           ← Line item editor
    EstimateSummary.tsx         ← Subtotal/tax/total
    EstimateProgressBar.tsx     ← Status tracker
    PaymentPanel.tsx            ← Deposit config

lib/
  utils.ts                      ← capName, timeAgo, avatarColor, planLabel
  theme.ts                      ← theme(dk) token system
  supabase.ts                   ← getSupabaseAdmin() + getSupabase()

tests/
  unit/
    estimates-invoices-leads.test.ts  ← 124-case unit test suite (v78)
    api.test.ts                       ← leads + auth tests
    utils.test.ts                     ← utility function tests
  integration/
    leads.test.ts               ← integration tests (hits staging DB)

types/
  index.ts                      ← Session, Lead, Estimate, Invoice types
```

---

## Staging database

**Supabase:** `zttsqqvaakblgbutviai.supabase.co`

**Test account:**
- Email: `wasimakram@wasim.com`
- Pro ID: `7e883161-f9af-4de8-8bc6-71933033100f`
- Has: real leads, estimates, invoices for testing

**Do NOT use `test@proguild.ai`** — E2E fixture data only (leads named `E2E-Reload-...`).

Connect to staging DB:
```bash
psql "postgresql://postgres:PASSWORD@db.zttsqqvaakblgbutviai.supabase.co:5432/postgres"
```

---

## Production SQL — run before going live (in order)

```bash
psql "postgresql://postgres:PASSWORD@db.bzfauzqqxwtqqskjhrgq.supabase.co:5432/postgres" \
  -f v74-sql.sql
psql "..." -f v76-invoices-sql.sql
psql "..." -f v76-estimates-schema-update.sql
psql "..." -f v76-discount-type.sql
psql "..." -f v77-prod-migration.sql
```

---

## Common gotchas

| Gotcha | What happens | Fix |
|---|---|---|
| `git push origin dev` in Claude | Fails — no interactive TTY for credential prompt | Always use full token URL: `git push https://TOKEN@github.com/...` |
| Old read-only token `OLD_READ_ONLY_TOKEN` | Push returns 401 on write | Use `ghp_YOUR_WRITE_TOKEN_HERE` |
| `&&` on commit+push | Push silently skipped (TS exits code 1) | Always separate commands |
| Vercel TS strict | Build fails on errors local filtered check ignored | Run unfiltered check on changed files |
| `lead.contact_name` raw | Shows lowercase | Always wrap in `capName()` |
| `sessionStorage` vs `localStorage` | Auth breaks | Auth = sessionStorage, darkmode = localStorage |
| New file not `git add`ed | Vercel deploys without the file → 404 | `git add` every new file explicitly |
| `Phone_Call` in source | Underscores in UI | `.replace(/_/g, ' ')` on all lead_source displays |
| `useSearchParams` without Suspense | Prerender error on static routes | Wrap in Suspense boundary |
| Dashboard flicker | Session read in useEffect causes flash | Read session in useState initializer (synchronous) |
| Edit Profile 404 | Wrong link path | Route is `/edit-profile` not `/dashboard/edit-profile` |

---

## Design system tokens

```
TEAL      #0F766E  — primary actions, buttons, CTAs
TEAL_L    #14B8A6  — lighter accents
NAVY      #0A1628  — primary text dark mode
CREAM     #F5F4F0  — page background light
BORDER    #E8E2D9  — card borders
MUTED     #9CA3AF  — timestamps, secondary labels
BODY      #6B7280  — descriptive sub-text

Stage colors:
New        #D97706 amber    bg #FFFBEB
Contacted  #2563EB blue     bg #EFF6FF
Quoted     #7C3AED purple   bg #F5F3FF
Scheduled  #0F766E teal     bg #F0FDFA
Completed  #374151 gray     bg #F9FAFB
Paid       white on #4A7B4A muted forest green (display as "Job Won")
```

---

## Verify before shipping checklist

```bash
# 1. TypeScript clean
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|..."

# 2. Unit tests green
npm run test:unit

# 3. Commit
git add -A
git commit -m "feat: ..."

# 4. Push to dev
git push https://ghp_YOUR_WRITE_TOKEN_HERE@github.com/valktech11/ProGuild.git HEAD:dev

# 5. Push to staging
git push https://ghp_YOUR_WRITE_TOKEN_HERE@github.com/valktech11/ProGuild.git HEAD:staging

# 6. Check Vercel build (~35 seconds)
# Vercel dashboard or GitHub Actions tab

# 7. Test on staging
# https://staging.proguild.ai (password: proguild2026)
# Test mobile (360px) AND desktop
# Test dark mode if colors changed
```

---

## Always read the handover doc first

At the start of every new session, read the latest `HANDOVER_vXX.md` in the repo root for full context of what's been built, what's pending, and decisions made.

Current latest: `HANDOVER_v76_2.md` (v76 estimates + invoices sprint)
