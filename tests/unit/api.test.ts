import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock Supabase ─────────────────────────────────────────────────────────────
const mockSelect  = vi.fn()
const mockInsert  = vi.fn()
const mockUpdate  = vi.fn()
const mockDelete  = vi.fn()
const mockEq      = vi.fn()
const mockSingle  = vi.fn()
const mockOrder   = vi.fn()
const mockFrom    = vi.fn()

// Chain builder — every method returns the chain so calls can be chained
function buildChain(terminal: any) {
  const chain: any = {
    select:      (...a: any[]) => { mockSelect(...a);  return chain },
    insert:      (...a: any[]) => { mockInsert(...a);  return chain },
    update:      (...a: any[]) => { mockUpdate(...a);  return chain },
    delete:      (...a: any[]) => { mockDelete(...a);  return chain },
    eq:          (...a: any[]) => { mockEq(...a);      return chain },
    ilike:       (...a: any[]) => {                    return chain },
    like:        (...a: any[]) => {                    return chain },
    order:       (...a: any[]) => { mockOrder(...a);   return terminal }, // terminal — GET /api/leads ends here
    single:      ()            => { mockSingle();      return terminal },
    maybeSingle: ()            => terminal,
    then:        (resolve: any, reject: any) => (terminal as Promise<any>).then(resolve, reject),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
  getSupabase:      () => ({ from: mockFrom }),
}))

vi.mock('@/lib/moderation', () => ({
  moderateContent: vi.fn().mockResolvedValue({ safe: true }),
}))

vi.mock('@/lib/email', () => ({
  leadNotificationEmail: vi.fn().mockReturnValue('<html>email</html>'),
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: 'email-id' }) },
  })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(method: string, url: string, body?: any): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ── GET /api/leads ────────────────────────────────────────────────────────────
describe('GET /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when pro_id is missing', async () => {
    const { GET } = await import('@/app/api/leads/route')
    const req = makeRequest('GET', 'http://localhost/api/leads')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('pro_id required')
  })

  it('returns leads array for valid pro_id', async () => {
    const fakeLead = { id: 'lead-1', pro_id: 'pro-1', lead_status: 'New', contact_name: 'John' }
    const terminal = Promise.resolve({ data: [fakeLead], error: null })
    mockFrom.mockReturnValue(buildChain(terminal))

    const { GET } = await import('@/app/api/leads/route')
    const req = makeRequest('GET', 'http://localhost/api/leads?pro_id=pro-1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.leads).toHaveLength(1)
    expect(body.leads[0].id).toBe('lead-1')
  })

  it('returns 500 on Supabase error', async () => {
    const terminal = Promise.resolve({ data: null, error: { message: 'DB down' } })
    mockFrom.mockReturnValue(buildChain(terminal))

    const { GET } = await import('@/app/api/leads/route')
    const req = makeRequest('GET', 'http://localhost/api/leads?pro_id=pro-1')
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})

// ── POST /api/leads ───────────────────────────────────────────────────────────
describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when required fields missing', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const req = makeRequest('POST', 'http://localhost/api/leads', { pro_id: 'pro-1' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates lead and returns 201', async () => {
    const fakeLead = { id: 'lead-new', pro_id: 'pro-1', contact_name: 'Jane', lead_status: 'New' }
    // First from() call = leads insert, second = pros select
    mockFrom
      .mockReturnValueOnce(buildChain(Promise.resolve({ data: fakeLead, error: null })))
      .mockReturnValueOnce(buildChain(Promise.resolve({ data: { full_name: 'Pro Name', email: 'pro@test.com', plan_tier: 'Free', city: 'Miami', state: 'FL' }, error: null })))

    const { POST } = await import('@/app/api/leads/route')
    const req = makeRequest('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Jane', message: 'Need plumbing', is_manual: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.lead.id).toBe('lead-new')
  })

  it('returns 400 when contact form lead missing email', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const req = makeRequest('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Jane', message: 'Need plumbing',
      // is_manual not set, contact_email not set
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Email required')
  })
})

// ── PATCH /api/leads/[id] ─────────────────────────────────────────────────────
describe('PATCH /api/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates lead_status and returns updated lead', async () => {
    const updated = { id: 'lead-1', lead_status: 'Contacted', pro_id: 'pro-1' }
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: updated, error: null })))

    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'Contacted' })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lead.lead_status).toBe('Contacted')
  })

  it('returns 400 when no fields provided', async () => {
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/leads/lead-1', {})
    const res = await PATCH(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 500 on Supabase error', async () => {
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: null, error: { message: 'Update failed' } })))

    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'Quoted' })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(500)
  })

  it('updates notes field', async () => {
    const updated = { id: 'lead-1', notes: 'Called back, interested' }
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: updated, error: null })))

    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/leads/lead-1', { notes: 'Called back, interested' })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Called back, interested' })
    )
  })

  it('updates quoted_amount', async () => {
    const updated = { id: 'lead-1', quoted_amount: 1500 }
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: updated, error: null })))

    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/leads/lead-1', { quoted_amount: 1500 })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ quoted_amount: 1500 })
    )
  })
})

// ── GET /api/leads/[id] ───────────────────────────────────────────────────────
describe('GET /api/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a single lead by id', async () => {
    const fakeLead = { id: 'lead-1', contact_name: 'John', lead_status: 'New' }
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: fakeLead, error: null })))

    const { GET } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('GET', 'http://localhost/api/leads/lead-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lead.id).toBe('lead-1')
  })
})

// ── DELETE /api/leads/[id] ────────────────────────────────────────────────────
describe('DELETE /api/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes lead and returns success', async () => {
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ error: null })))

    const { DELETE } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/leads/lead-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 if delete fails', async () => {
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ error: { message: 'Cannot delete' } })))

    const { DELETE } = await import('@/app/api/leads/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/leads/lead-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'lead-1' }) })
    expect(res.status).toBe(500)
  })
})

// ── POST /api/auth ────────────────────────────────────────────────────────────
describe('POST /api/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when email missing', async () => {
    const { POST } = await import('@/app/api/auth/route')
    const req = makeRequest('POST', 'http://localhost/api/auth', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when pro not found', async () => {
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: null, error: { message: 'Not found' } })))

    const { POST } = await import('@/app/api/auth/route')
    const req = makeRequest('POST', 'http://localhost/api/auth', { email: 'nobody@test.com' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 403 for suspended account', async () => {
    const suspendedPro = { id: 'pro-1', email: 'sus@test.com', profile_status: 'Suspended', slug: null, full_name: 'Sus Pro', plan_tier: 'Free', city: null, state: null, trade_category: null }
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: suspendedPro, error: null })))

    const { POST } = await import('@/app/api/auth/route')
    const req = makeRequest('POST', 'http://localhost/api/auth', { email: 'sus@test.com' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns session for valid pro', async () => {
    const pro = { id: 'pro-1', email: 'valid@test.com', profile_status: 'Active', slug: 'james-miller-plumber', full_name: 'James Miller', plan_tier: 'Pro', city: 'Miami', state: 'FL', trade_category: { category_name: 'Plumbing', slug: 'plumbing' } }
    mockFrom.mockReturnValue(buildChain(Promise.resolve({ data: pro, error: null })))

    const { POST } = await import('@/app/api/auth/route')
    const req = makeRequest('POST', 'http://localhost/api/auth', { email: 'valid@test.com' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session.id).toBe('pro-1')
    expect(body.session.plan).toBe('Pro')
  })
})
