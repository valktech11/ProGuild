import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  // Only enforce on staging environment
  if (process.env.NEXT_PUBLIC_ENV !== 'staging') return NextResponse.next()

  // Allow health checks and static assets through
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/health')) {
    return NextResponse.next()
  }

  // Check for staging auth cookie
  const stagingAuth = req.cookies.get('staging_auth')?.value
  if (stagingAuth === process.env.STAGING_PASSWORD) return NextResponse.next()

  // Check for password in URL (first visit)
  const urlPassword = req.nextUrl.searchParams.get('staging_key')
  if (urlPassword && urlPassword === process.env.STAGING_PASSWORD) {
    const response = NextResponse.redirect(req.nextUrl.origin + pathname)
    response.cookies.set('staging_auth', urlPassword, {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })
    return response
  }

  // Show password gate
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
