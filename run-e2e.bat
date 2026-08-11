@echo off
set PLAYWRIGHT_BASE_URL=https://staging.proguild.ai
set TEST_ROOFER_EMAIL=samaltman@sam.com
set TEST_CLIENT_EMAIL=delivered@resend.dev
set SUPABASE_URL=https://zttsqqvaakblgbutviai.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_SERVICE_ROLE_KEY
set NEXT_PUBLIC_SUPABASE_ANON_KEY=REPLACE_WITH_ANON_KEY

npx playwright test tests/e2e/roofer-crm.spec.ts --headed --project="Desktop Chrome"
