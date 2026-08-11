# ProGuild.ai — Build Instructions for New Claude Session
## How to start, work, and ship code correctly

---

## Step 1: Clone the repo

```bash
git clone https://ghp_REDACTED_see_github_secrets@github.com/valktech11/ProGuild.git
cd ProGuild
git checkout dev
```

**GitHub token:** `ghp_REDACTED_see_github_secrets`
This token has not changed. Use it for all git operations.

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

For Claude's bash_tool environment, these are already available in the running environment — do NOT need to set them manually. Just clone and go.

---

## Step 4: Understand the deployment pipeline

```
Local dev
    ↓
git push origin dev         ← triggers GitHub Actions CI
    ↓
CI runs: 58 unit + 10 integration tests
    ↓ (if green)
Vercel auto-deploys to staging.proguild.ai

git push origin dev:staging ← manual push to staging (skips CI)
```

**Staging URL:** https://staging.proguild.ai
**Staging password:** `proguild2026`

**Vercel deploys automatically.** You do NOT need to log into Vercel or click anything. Just push to `dev` — Vercel picks it up automatically via GitHub integration. The GitHub token above gives Vercel access.

---

## Step 5: The TypeScript check ritual (CRITICAL)

**Vercel runs strict TypeScript. Local has filtered errors. They are NOT the same.**

Before EVERY commit, run this filtered check — if it outputs anything, fix it before committing:

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```

If the output is empty (exit code 1 with no stdout) → you're clean. Commit.
If the output has lines → fix those errors first.

Also run a file-specific check on anything you edited:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep "filename.tsx"
```

**Why this matters:** Vercel has failed builds multiple times this project because a TS error slipped through. It costs 5 minutes to check and potentially hours to diagnose a failed deploy.

---

## Step 6: Git commit and push pattern

**NEVER use && between commit and push.** TypeScript exits with code 1 even with pre-existing errors — `&&` will silently skip the push.

```bash
# WRONG — push may silently not happen
git commit -m "feat: my change" && git push origin dev

# CORRECT — always separate commands
git add app/dashboard/page.tsx components/ui/LeadPipeline.tsx
git commit -m "feat: my change description"
git push origin dev
git push origin dev:staging
```

**Always push to both `dev` AND `dev:staging`** so staging reflects your work immediately.

---

## Step 7: Git identity setup (needed in Claude's environment)

```bash
git config user.email "wasimakram@wasim.com"
git config user.name "Wasim Akram"
```

Run this once after cloning. Required for commits to work.

---

## Key rules when writing code

### Auth
```typescript
// Read session
const raw = sessionStorage.getItem('pg_pro')
const session = raw ? JSON.parse(raw) : null

// NOT localStorage — always sessionStorage for auth
// Dark mode uses localStorage('pg_darkmode') = '1' or '0'
```

### Contact names — always capitalize
```typescript
import { capName } from '@/lib/utils'

// DB stores lowercase — always use capName() for display
capName(lead.contact_name)  // "neha patel" → "Neha Patel"
```

### Theme tokens
```typescript
import { theme } from '@/lib/theme'
const t = theme(dk)  // dk = darkMode boolean

// Use tokens, not hardcoded colors
t.textMuted    // #4B5563 light / #94A3B8 dark
t.textSubtle   // #6B7280 light / #64748B dark
t.cardBg       // white light / #1E293B dark
t.inputBorder  // #E8E2D9 light / #334155 dark
```

### API routes
```typescript
// All API routes use service role — never client Supabase
import { getSupabaseAdmin } from '@/lib/supabase-admin'
const sb = getSupabaseAdmin()
```

### New dashboard pages
```typescript
// Always wrap in DashboardShell
return (
  <DashboardShell session={session} dk={dk} setDk={setDk}>
    {/* your content */}
  </DashboardShell>
)
```

### Mobile vs desktop separation
```tsx
{/* Mobile only */}
<div className="md:hidden">...</div>

{/* Desktop only */}
<div className="hidden md:flex">...</div>

{/* Both — be careful, changes affect both breakpoints */}
<div>...</div>
```

### Job Won / Paid
- Display everywhere: `"Job Won"`
- DB enum value: `'paid'`
- Filter mapping in `FilterPanel.tsx`: `Job Won → 'Paid'` for DB queries
- Do NOT run migrations to change the DB enum — just change display strings

---

## File structure quick reference

```
app/
  dashboard/
    page.tsx                    ← Overview (hero strip + action center)
    pipeline/
      page.tsx                  ← Pipeline kanban list page
      [id]/page.tsx             ← Lead detail page
    estimates/
      page.tsx                  ← Estimates list
      [id]/page.tsx             ← Estimate builder/detail
    invoices/
      page.tsx                  ← Invoices list
      [id]/page.tsx             ← Invoice detail
    clients/
      page.tsx                  ← Clients list
  estimate/[id]/page.tsx        ← PUBLIC client-facing estimate
  invoice/[id]/page.tsx         ← PUBLIC client-facing invoice

components/
  layout/
    DashboardShell.tsx          ← Sidebar + TopHeader + MobileNav + MoreDrawer
  ui/
    LeadPipeline.tsx            ← Kanban board + mobile tabs + lead cards
    FilterPanel.tsx             ← Lead filter drawer
    ActionAlert.tsx             ← Attention banner
    AddLeadModal.tsx            ← Add lead modal
  estimate/
    EstimateItems.tsx           ← Line item editor
    EstimateSummary.tsx         ← Subtotal/tax/total
    EstimateProgressBar.tsx     ← Status tracker
    PaymentPanel.tsx            ← Deposit config

lib/
  utils.ts                      ← capName, timeAgo, avatarColor, planLabel, etc.
  theme.ts                      ← theme(dk) token system
  supabase-admin.ts             ← getSupabaseAdmin() for API routes

types/
  index.ts                      ← Session, Lead, Estimate, Invoice types
```

---

## Staging database

**Staging Supabase:** `zttsqqvaakblgbutviai.supabase.co`

**Test account for development:**
- Email: `wasimakram@wasim.com`
- Pro ID: `7e883161-f9af-4de8-8bc6-71933033100f`
- Has: 12 leads, 5 estimates, real data for testing

**Do NOT use `test@proguild.ai`** for UI testing — it only has E2E test fixture data (leads named E2E-Reload-...).

---

## Production SQL — before launch

**File:** `v77-prod-migration.sql` in repo root.

This file contains everything needed to bring production DB schema up to date with staging. Run it ONCE on prod before going live:

```bash
psql "postgresql://postgres:PASSWORD@db.<PROD_PROJECT>.supabase.co:5432/postgres" \
  -f v77-prod-migration.sql
```

**Covers:** clients table, invoices tables, estimates new columns, status constraint fix, leads columns, RPC functions, RLS policies, data cleanup.

**Verification queries are included at the bottom** — run them to confirm.

---

## Common gotchas

| Gotcha | What happens | Fix |
|---|---|---|
| `&&` on commit+push | Push silently skipped due to TS exit code 1 | Always separate commands |
| Vercel TS strict | Build fails on errors local filtered check ignored | Run unfiltered check on changed files |
| `lead.contact_name` raw | Shows "neha patel" lowercase | Always wrap in `capName()` |
| `sessionStorage` vs `localStorage` | Auth breaks if wrong storage used | Auth = sessionStorage, darkmode = localStorage |
| New file not git added | Vercel deploys without the file, 404s | `git add` every new file explicitly |
| `Phone_Call` in source | Underscores show in UI | `.replace(/_/g, ' ')` on all lead_source displays |
| `lead_id` in EstimateSummary | Vercel TS error if not in type | Type must include `lead_id: string \| null` |

---

## How to verify a change before pushing

1. **TS check** (mandatory):
   ```bash
   npx tsc --noEmit 2>&1 | grep "error TS" | grep "your-file.tsx"
   ```

2. **Test on staging** after push:
   - Open staging.proguild.ai on mobile (360px) AND desktop
   - Test the specific flow you changed
   - Check dark mode if you changed colors

3. **Check Vercel build** in GitHub → Actions tab, or Vercel dashboard
   - Build takes ~35 seconds
   - If it fails, check the error in the Vercel dashboard logs

---

## Handover document location

Always read `HANDOVER_v77.md` (or latest version) at the start of a new session to get full context of what was built, what's pending, and what decisions were made.
