# ProGuild — New Session Starter
**Copy-paste this entire block into every new Claude chat.**

---

I am building ProGuild.ai — a contractor CRM + verified lead marketplace for FL licensed tradespeople. Solo founder.

**Current state (as of May 11 2026, commit `656bb74`):**

We are in the middle of Sprint 3 of the Roofing Satellite Measurement Report feature. This is a 5-page PDF report generated automatically from any property address using Google Solar API + Gemini Vision + NPS historic district data.

**What is working:**
- Full report pipeline: geocode → Solar API → 4 satellite images → 5-page PDF → Cloudflare R2 → roof_reports DB
- Nearest roofing supplier on page 5 (Google Places)
- Historic District badge on cover (NPS NRHP ArcGIS MapServer — point-in-polygon, verified ✅)
- All Sprint 1 + Sprint 2A features complete

**What needs verification next session:**
- Gemini Vision condition assessment (code complete, $10 AI Studio prepay loaded May 11 2026, billing propagation pending)
- Hit this URL first: `https://staging.proguild.ai/api/roofing/debug-sprint3?lat=30.310988&lng=-81.683345`
- Check `gemini.conditionText` — should be non-null string
- If working: DELETE FROM solar_cache; then generate fresh report for `2143 Riverside Ave, Jacksonville FL`
- Verify page 2 has blue Gemini box + cover has amber Historic District badge

**What is NOT started:**
- DSM + RANSAC Python microservice for linear footage (ridge/hip/valley/rake/eave)

**Critical rules:**
1. `lib/roofing/reportPdf.ts` MUST stay `.ts` not `.tsx` — never rename, never add JSX
2. All roofing routes need `export const runtime = 'nodejs'`
3. Git push always separate commands with full token URL (never &&)
4. NO Claude/Anthropic API in prod — Gemini only
5. DO NOT BUILD until I say "go"

**Staging:** staging.proguild.ai (password: proguild2026)
**Test account:** wasimakram@wasim.com
**Vercel project:** tradesnetwork
**Repo:** github.com/valktech11/ProGuild (token in Vercel env vars)

**Full context is in project knowledge:** HANDOVER_v84_Sprint3.md + ProGuild_Founders_Bible_v84.docx

Tell me what the immediate next action is.
