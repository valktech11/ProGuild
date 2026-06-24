#!/usr/bin/env node
/**
 * check-route-cache.js
 * ---------------------------------------------------------------------------
 * Guard against silent Next.js response caching on data routes.
 *
 * WHY THIS EXISTS
 * Next.js App Router can cache a route handler's response. A GET handler that
 * takes its identifier purely from the URL path (e.g. /api/estimates/[id]) and
 * reads nothing else from the request cannot be auto-classified as dynamic, so
 * Next may serve a STALE Supabase response — even after the DB changed and the
 * user cleared their browser cache. This bit us on /api/leads/[id] (LF values
 * lingered after the row was nulled). The fix is one explicit line:
 *     export const dynamic = 'force-dynamic'
 *
 * WHAT THIS CHECKS
 * Every app/api/**\/route.ts that exports a GET handler must EITHER
 *   (a) declare an explicit cache posture (force-dynamic / revalidate = 0 /
 *       no-store), OR
 *   (b) read something request-scoped (searchParams / req.url / headers() /
 *       cookies()), which makes Next auto-dynamic.
 * Anything else is flagged and the check exits non-zero.
 *
 * Run:  node scripts/check-route-cache.js
 * Wired into:  npm run check:routes  (and the pre-commit validation sweep)
 */
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(process.cwd(), 'app', 'api');

const HAS_GET            = /export\s+(async\s+function|const)\s+GET\b/;
// A route is "safe" if it declares ANY explicit posture: force-dynamic, no-store,
// or an explicit revalidate (0 = always fresh, >0 = deliberately cached for N seconds).
// The point is that the caching decision is conscious and visible, not inferred.
const HAS_EXPLICIT_CACHE = /force-dynamic|no-store|export\s+const\s+revalidate\s*=\s*\d+/;
const READS_REQUEST      = /searchParams|req(uest)?\.url|\bheaders\s*\(\)|\bcookies\s*\(\)|\.headers\b|req(uest)?\.nextUrl/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(p);
  }
  return out;
}

if (!fs.existsSync(API_DIR)) {
  console.error('check-route-cache: no app/api directory found — run from repo root.');
  process.exit(2);
}

const offenders = [];
let getRoutes = 0;

for (const file of walk(API_DIR)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!HAS_GET.test(src)) continue;          // only GET handlers can serve cached reads
  getRoutes++;
  if (HAS_EXPLICIT_CACHE.test(src)) continue; // explicitly safe
  if (READS_REQUEST.test(src)) continue;      // auto-dynamic via request access
  offenders.push(path.relative(process.cwd(), file));
}

if (offenders.length === 0) {
  console.log(`check-route-cache: OK — ${getRoutes} GET route(s) scanned, all declare a cache posture or read the request.`);
  process.exit(0);
}

console.error('\ncheck-route-cache: FAIL — these GET routes can serve a STALE response.');
console.error('They take their id from the URL path only and never opt out of caching.');
console.error('Add `export const dynamic = \'force-dynamic\'` (and `export const revalidate = 0`)\n');
for (const f of offenders) console.error('  • ' + f);
console.error(`\n${offenders.length} route(s) need an explicit cache posture.\n`);
process.exit(1);
