// lib/auth-trace.ts
// Diagnostic auth tracing — DISABLED. Both functions are no-ops so no logging or
// localStorage writes happen in prod. The call-sites across SessionProvider /
// login / claim / callback / dashboard are inert and will be removed cleanly in
// the follow-up that touches those files for the /api/auth/me perf work.
export function authTrace(_event: string, _detail?: Record<string, unknown>): void {}
export function clearAuthTrace(): void {}
