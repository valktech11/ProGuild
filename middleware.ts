import { NextRequest, NextResponse } from 'next/server'

// ── Prod lock allowlist (active only when PROD_LOCKED === 'true') ──
// PAGES publicly reachable while prod is locked. Every other page redirects to '/'.
// All /api/ routes pass through (they enforce their own auth), so the homepage's
// fetches (zip, match-trade, waitlist, etc.) keep working without enumerating them.
const PUBLIC_PAGES = new Set(['/', '/supplement', '/privacy', '/terms'])
const SEO_PATHS = new Set(['/robots.txt', '/sitemap.xml'])

function publicPageOnLockedProd(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname) || SEO_PATHS.has(pathname)) return true
  if (pathname.startsWith('/sitemaps')) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Staging password gate (unchanged) ──
  if (process.env.NEXT_PUBLIC_ENV === 'staging') {
    if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) {
      return NextResponse.next()
    }
    const stagingAuth = req.cookies.get('staging_auth')?.value
    if (stagingAuth === process.env.STAGING_PASSWORD) return NextResponse.next()

    const urlPassword = req.nextUrl.searchParams.get('staging_key')
    if (urlPassword && urlPassword === process.env.STAGING_PASSWORD) {
      const response = NextResponse.redirect(req.nextUrl.origin + pathname)
      response.cookies.set('staging_auth', urlPassword, {
        httpOnly: true,
        secure: true,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
      return response
    }

    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>ProGuild Staging</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0A1628; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 16px; padding: 40px 36px; width: 100%;
      max-width: 360px; text-align: center; }
    .logo { color: #0F766E; font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .badge { display: inline-block; background: #FEF3C7; color: #B45309; font-size: 11px;
      font-weight: 600; padding: 3px 10px; border-radius: 20px; margin-bottom: 24px; }
    p { color: #6B7280; font-size: 14px; margin-bottom: 20px; }
    input { width: 100%; padding: 12px 16px; border: 1.5px solid #E5E7EB; border-radius: 10px;
      font-size: 15px; outline: none; margin-bottom: 12px; }
    input:focus { border-color: #0F766E; }
    button { width: 100%; padding: 12px; background: #0F766E; color: white; border: none;
      border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
    button:hover { background: #0C5F57; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ProGuild.ai</div>
    <div class="badge">Staging environment</div>
    <p>Internal testing only. Enter the staging password to continue.</p>
    <form method="GET">
      <input type="password" name="staging_key" placeholder="Staging password" autofocus />
      <button type="submit">Enter →</button>
    </form>
  </div>
</body>
</html>`,
      { status: 401, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // ── Prod lock: expose only the landing pages until launch ──
  // Locks automatically on the production deployment (VERCEL_ENV === 'production'),
  // so it no longer depends on a hand-set env var being picked up correctly.
  // To OPEN the app at launch, set PROD_UNLOCK=true in the production environment.
  const lockOn =
    (process.env.VERCEL_ENV === 'production' || process.env.PROD_LOCKED === 'true') &&
    process.env.PROD_UNLOCK !== 'true'
  if (lockOn) {
    if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) {
      return NextResponse.next()
    }
    if (publicPageOnLockedProd(pathname)) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
