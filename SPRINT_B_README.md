# ProGuild Sprint B — File Placement Guide
Generated: May 16, 2026

## What's in this sprint

Steps 2–7 from the confirmed build sequence.
Steps 1 (trade isolation) and 2 (unit tests) are already on dev/staging per handover v85.

---

## File placement — copy exactly

| File in this package | Destination in repo |
|---|---|
| `stage_route.ts` | `app/api/leads/[id]/stage/route.ts` (NEW file — new directory) |
| `calculator_page.tsx` | `app/dashboard/roofing/calculator/page.tsx` (NEW file — new directory) |
| `photos_route.ts` | `app/api/leads/[id]/photos/route.ts` (NEW file — new directory) |
| `InsuranceClaimFields.tsx` | `components/roofing/InsuranceClaimFields.tsx` (NEW file — new directory) |
| `JobPhotoLog.tsx` | `components/roofing/JobPhotoLog.tsx` (NEW file) |
| `GoodBetterBest.tsx` | `components/estimate/GoodBetterBest.tsx` (NEW file) |
| `WarrantyRecord.tsx` | `components/roofing/WarrantyRecord.tsx` (NEW file) |
| `v86-roofing-sprint.sql` | Run in Supabase SQL editor (staging first, then production) |

---

## SQL — run first, before pushing code

```bash
# 1. Open Supabase staging SQL editor
# 2. Paste contents of v86-roofing-sprint.sql
# 3. Run
# 4. Verify: SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='insurance_claim';
# 5. Verify: SELECT count(*) FROM lead_trigger_log;
```

---

## Supabase table needed — lead_photos

```sql
CREATE TABLE IF NOT EXISTS lead_photos (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id      UUID         NOT NULL,
  r2_key      TEXT         NOT NULL,
  url         TEXT         NOT NULL,
  phase       TEXT         NOT NULL DEFAULT 'Before',
  caption     TEXT,
  filename    TEXT,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_photos_lead_idx ON lead_photos(lead_id, created_at);

ALTER TABLE lead_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro owns photos"
  ON lead_photos
  FOR ALL
  USING (pro_id = auth.uid());
```

---

## Supabase table needed — roofing_warranties

```sql
CREATE TABLE IF NOT EXISTS roofing_warranties (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id        UUID         NOT NULL REFERENCES leads(id),
  pro_id         UUID         NOT NULL,
  property_id    UUID,
  shingle_brand  TEXT         NOT NULL,
  shingle_model  TEXT,
  warranty_term  TEXT         NOT NULL,
  install_date   DATE,
  expiry_date    TEXT,
  created_at     TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE roofing_warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro owns warranties"
  ON roofing_warranties
  FOR ALL
  USING (pro_id = auth.uid());
```

---

## API routes still needed (build next session or wire today)

These routes are called by the new components but don't exist yet:

| Route | Called by | What it does |
|---|---|---|
| `PATCH /api/leads/[id]` | InsuranceClaimFields | Needs insurance_claim + all 9 fields added to the writable fields list |
| `GET/DELETE /api/leads/[id]/photos/[photoId]` | JobPhotoLog delete | DELETE a single photo from R2 + DB |
| `GET /api/leads/[id]/photos/zip` | JobPhotoLog ZIP | Stream a ZIP of all photos for a lead (or filtered by phase) |
| `PUT /api/estimates/[id]/tiers` | GoodBetterBest | Save the 3-tier structure to estimates table (as JSONB column `tiers`) |
| `POST /api/roofing/warranties` | WarrantyRecord | Insert to roofing_warranties table |

Add `tiers JSONB` column to estimates table:
```sql
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS tiers JSONB;
```

---

## Wire InsuranceClaimFields into lead detail page

In `app/dashboard/pipeline/[id]/page.tsx`:

```tsx
import InsuranceClaimFields from '@/components/roofing/InsuranceClaimFields'
import { isRoofing } from '@/lib/trades/_registry'

// Inside the component, after loading lead and trade config:
const tradeConfig = getTradeConfig(session.trade_slug ?? '')

// In the JSX, after the stage section:
{isRoofing(tradeConfig) && (
  <InsuranceClaimFields
    leadId={lead.id}
    proId={session.id}
    initial={{
      insurance_claim:      lead.insurance_claim      ?? false,
      insurance_company:    lead.insurance_company    ?? '',
      claim_number:         lead.claim_number         ?? '',
      adjuster_name:        lead.adjuster_name        ?? '',
      adjuster_phone:       lead.adjuster_phone       ?? '',
      adjuster_appointment: lead.adjuster_appointment ?? '',
      claim_status:         lead.claim_status         ?? 'Filed',
      approved_amount:      String(lead.approved_amount ?? ''),
      supplement_amount:    String(lead.supplement_amount ?? ''),
      deductible:           String(lead.deductible ?? ''),
    }}
    darkMode={dk}
    onSaved={(data) => {
      // Update local state so UI reflects save without refetch
      setLead(prev => prev ? { ...prev, ...data } : prev)
    }}
  />
)}
```

---

## Wire JobPhotoLog into lead detail page

```tsx
import JobPhotoLog from '@/components/roofing/JobPhotoLog'

// After InsuranceClaimFields:
<JobPhotoLog
  leadId={lead.id}
  proId={session.id}
  isRoofing={isRoofing(tradeConfig)}
  darkMode={dk}
/>
```

---

## Wire GoodBetterBest into estimate builder

In `app/dashboard/estimates/[id]/page.tsx`:

```tsx
import GoodBetterBest from '@/components/estimate/GoodBetterBest'
import { isRoofing } from '@/lib/trades/_registry'

// Inside the estimate builder, after the standard line items section:
{isRoofing(tradeConfig) && (
  <GoodBetterBest
    estimateId={estimateId}
    proId={session.id}
    initial={estimate.tiers ?? []}
    darkMode={dk}
    onSaved={(tiers) => setEstimate(prev => prev ? { ...prev, tiers } : prev)}
  />
)}
```

---

## Wire WarrantyRecord — show on Job Won stage change

In `app/dashboard/pipeline/[id]/page.tsx`, when stage changes to `job_won`:

```tsx
import WarrantyRecord from '@/components/roofing/WarrantyRecord'

// State:
const [showWarranty, setShowWarranty] = useState(false)

// In stage change handler, after successful PATCH to /api/leads/[id]/stage:
if (newStage === 'job_won' && isRoofing(tradeConfig)) {
  setShowWarranty(true)
}

// In JSX — overlay/modal:
{showWarranty && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  }}>
    <WarrantyRecord
      leadId={lead.id}
      proId={session.id}
      propertyId={lead.property_id ?? null}
      darkMode={dk}
      onSaved={() => setShowWarranty(false)}
      onDismiss={() => setShowWarranty(false)}
    />
  </div>
)}
```

---

## Wire calculator page — report pushes to sessionStorage

In `app/dashboard/roofing/property/[id]/page.tsx`, after report generates:

```tsx
// After successful report generation response:
const { measurements, reportId } = await res.json()

sessionStorage.setItem('pg_report_data', JSON.stringify({
  squares:  measurements.totalSquaresOrder,
  pitch:    measurements.dominantPitch,
  waste:    10,
  address:  address,
  reportId: reportId,
}))

// Navigate to calculator, pass lead_id if available
router.push(`/dashboard/roofing/calculator?lead_id=${leadId ?? ''}`)
```

---

## TypeScript check after placing files

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006|TS2307|TS2875|TS7026|jsx-runtime|implicitly" | \
  grep -v "Cannot find module|TS2503|TS2591|TS2345" | \
  grep -v "GroupLandingPage|TradeLandingClient|CitySearch|[state]"
```

Empty output = clean. Fix any before pushing.

---

## Git push sequence

```bash
git add -A
git commit -m "feat(roofing): stage API guard, calculator, insurance fields, photo log, G/B/B tiers, warranty record"

git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev

git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
```

---

## QA checklist after deployment

- [ ] PATCH /api/leads/[id]/stage with valid transition returns 200
- [ ] PATCH /api/leads/[id]/stage with invalid transition (e.g. lead_in → job_won) returns 422
- [ ] Calculator page loads from /dashboard/roofing/calculator
- [ ] Calculator pre-fills when sessionStorage has pg_report_data
- [ ] Insurance claim toggle reveals 9 fields on roofing lead detail
- [ ] Insurance toggle hidden on HVAC lead detail (trade guard working)
- [ ] Photo upload accepts JPEG/PNG, rejects non-images
- [ ] Photo upload rejects files > 10MB
- [ ] Photos display in 3-column grid with phase labels
- [ ] Good/Better/Best renders 3 columns in estimate builder
- [ ] Warranty modal appears on Job Won stage change for roofer
- [ ] Warranty modal does NOT appear for HVAC pro
- [ ] All above tested at 360px mobile width
