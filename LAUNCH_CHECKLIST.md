# ProGuild.ai — Launch Checklist
**Owner:** Wasim  
**Updated:** v80 session (May 2026)  
**Rule:** This file is the single source of truth. Every session that adds a prod dependency updates this file in the same commit. No exceptions.

---

## How to use this

- `[ ]` = not done  
- `[x]` = done  
- `[~]` = in progress / started  
- Items marked **START NOW** have lead times — they block launch if you wait.

---

## 1. Database — SQL migrations on PRODUCTION

Run in this exact order. Each file is idempotent (safe to re-run).

| # | File | What it does | Staging | Production |
|---|---|---|---|---|
| 1 | `v74-sql.sql` | clients table | ✅ | ❌ |
| 2 | `v77-prod-migration.sql` | consolidates v74–v76 (invoices, estimates schema, discount_type) | ✅ | ❌ |
| 3 | `v78-scheduled-time.sql` | scheduled_time column on leads | ✅ | ❌ |
| 4 | `v80-hvac-equipment.sql` | hvac_equipment, hvac_refrigerant_log, hvac_maintenance_reminders | ✅ | ❌ |

**Run command (replace PASSWORD):**
```bash
psql "postgresql://postgres:PASSWORD@db.bzfauzqqxwtqqskjhrgq.supabase.co:5432/postgres" -f FILENAME.sql
```

**Do NOT run individually:** v77-prod-migration.sql already includes v74, v76-invoices, v76-estimates-schema-update, v76-discount-type. Running them separately after v77 will cause duplicate column errors.

### RLS — enable on new tables before production

```sql
ALTER TABLE hvac_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_refrigerant_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hvac_maintenance_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro owns equipment" ON hvac_equipment
  FOR ALL USING (pro_id = auth.uid());
CREATE POLICY "pro owns refrigerant log" ON hvac_refrigerant_log
  FOR ALL USING (pro_id = auth.uid());
CREATE POLICY "pro owns maintenance reminders" ON hvac_maintenance_reminders
  FOR ALL USING (pro_id = auth.uid());
```

Note: App routes use service role key (bypasses RLS). RLS is defense-in-depth for direct DB access only.

---

## 2. Vercel — environment variables

### Production env vars (not yet set)
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://proguild.ai`
- [ ] `RESEND_API_KEY` = from resend.com dashboard
- [ ] `GEMINI_API_KEY` = from Google AI Studio
- [ ] `STRIPE_SECRET_KEY` = from Stripe dashboard
- [ ] `R2_ACCOUNT_ID` = `ce9b722c50f97752636dcad9608dc23d`
- [ ] `R2_ACCESS_KEY_ID` = 32-char key (NOT the cfat_... token)
- [ ] `R2_SECRET_ACCESS_KEY` = from Cloudflare R2
- [ ] `R2_BUCKET_NAME` = `proguild-media` (production bucket, not staging)
- [ ] `R2_PUBLIC_BUCKET_URL` = production R2 public URL

### Preview/staging env vars (already set — verify)
- [x] `NEXT_PUBLIC_ENV` = `staging`
- [x] `MODERATION_MODE` = `off`
- [x] `STAGING_PASSWORD` = set by Wasim

### Vercel build settings (verify before go-live)
- [ ] Production branch = `main` → proguild.ai
- [ ] Ignored Build Step = `bash -c 'exit 1'` (always build)
- [ ] Node.js = 24.x

---

## 3. External services

### Resend (email)
- [ ] Verify `hello@proguild.ai` domain in Resend dashboard
- [ ] Test estimate send email end-to-end on staging
- [ ] Test invoice send email end-to-end on staging

### Cloudflare
- [ ] DNS: flip proguild.ai to orange cloud (proxy on) — takes 10 seconds, do day of launch
- [ ] R2: create production bucket `proguild-media` (separate from staging `proguild-media-staging`)
- [ ] R2: create production API token (Object Read & Write, bucket-scoped)

### Supabase
- [ ] **Upgrade Free → Pro ($25/mo)** — free tier pauses after 7 days inactivity. 134k records at risk. Do this at least 1 week before launch.
- [ ] Verify `/api/ping` cron is running (pings trade_categories daily, keeps DB awake)

### Twilio — **START NOW, 1–2 week approval**
- [ ] Register for 10DLC (10-digit long code) — required for SMS to US numbers
- [ ] Submit brand registration
- [ ] Submit campaign registration (use case: transactional — job notifications)
- [ ] Approval takes 1–2 weeks minimum. Without this, SMS is blocked for v86 messaging.

### Google Search Console
- [ ] Add proguild.ai property
- [ ] Submit sitemap: `https://proguild.ai/sitemap.xml`
- [ ] Do this the day the domain goes live — SEO clock starts from first crawl

### Stripe
- [ ] Activate Stripe account (currently test mode)
- [ ] Set up webhook endpoint: `https://proguild.ai/api/stripe/webhook`
- [ ] Test payment flow end-to-end on staging with test card

---

## 4. Code — items deferred from previous sessions

### P0 — must fix before any real users
- [ ] Email links in estimates/invoices use `NEXT_PUBLIC_SITE_URL` — verify this resolves to `https://proguild.ai` in prod, not staging URL
- [ ] Public estimate page (`/estimate/[id]`) tested with real client email flow
- [ ] Public invoice page (`/invoice/[id]`) tested with real client email flow

### P1 — fix in next 2 sprints
- [ ] P2-1: Warn when moving lead to Scheduled with no approved estimate
- [ ] P2-2: Warn when moving lead to Completed with no invoice
- [ ] P2-3: Warn when creating estimate for a New lead
- [ ] Delete confirmation modal on estimates list (replace browser `confirm()`)

### P2 — before wave 2 outreach
- [ ] Roofing trade section live and tested (nav, terminology)
- [ ] HVAC SQL migration run on production
- [ ] HVAC: confirm trade_category_name string in Supabase matches resolver map
- [ ] Update test account trade for HVAC testing:
  ```sql
  UPDATE pros SET trade_category_id = (
    SELECT id FROM trade_categories WHERE slug = 'hvac-technician' LIMIT 1
  ) WHERE email = 'wasimakram@wasim.com';
  ```

---

## 5. Pre-outreach gate (before sending wave 1 emails)

These must be true before the first cold email goes to 1,386 roofers:

- [ ] Claim flow works: pro clicks email link → lands on profile → claims in < 3 steps
- [ ] No login wall on first profile visit (70%+ drop-off if they hit login before seeing the profile)
- [ ] Dashboard not empty on day 1: onboarding CTA shows "Send your first estimate" even with 0 ProGuild leads
- [ ] Community feed has ≥ 15 seed posts (empty feed = "nobody is here")
- [ ] Mobile tested at 360px — this is the phone most tradespeople have
- [ ] Pro can add a lead manually and send an estimate without receiving a ProGuild lead first

---

## 6. Session-by-session update rule

At the end of every build session, the developer updates this file:
- Mark completed items `[x]`
- Add any new prod dependencies discovered during the session
- Add new SQL migration files to the table in section 1
- Commit this file in the same commit as the feature that created the dependency

**This file is committed to dev → staging → main. It is never in .gitignore.**

---

## Appendix — staging test accounts

| Email | ID | Use |
|---|---|---|
| `wasimakram@wasim.com` | `7e883161-f9af-4de8-8bc6-71933033100f` | Primary dev/test account |
| `test@proguild.ai` | `58b897e2-5723-4178-93d5-8bd29420b52f` | E2E fixture data only — do not use for manual testing |

## Appendix — key URLs

| Resource | URL |
|---|---|
| Staging | https://staging.proguild.ai (pw: `proguild2026`) |
| Production | https://proguild.ai |
| Vercel project | vercel.com/valk-ce03c4a0/tradesnetwork |
| Prod Supabase | app.supabase.com → bzfauzqqxwtqqskjhrgq |
| Staging Supabase | app.supabase.com → zttsqqvaakblgbutviai |
| Resend | resend.com → hello@proguild.ai |
| Cloudflare | dash.cloudflare.com → R2 + DNS |
