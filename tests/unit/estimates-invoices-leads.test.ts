/**
 * ProGuild.ai — Estimates, Invoices & Pipeline Lead Tests
 * 121 use cases: happy path, negative, corner cases, regression guards
 *
 * Architecture: stateful in-memory mock DB — no network, no Supabase, ~3s total runtime
 * Each describe block resets DB state via beforeEach
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Mock DB — stateful in-memory store mutated by mock Supabase calls
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>

interface MockDB {
  estimates:      Record<string, Row>
  estimate_items: Record<string, Row>
  invoices:       Record<string, Row>
  leads:          Record<string, Row>
  clients:        Record<string, Row>
  pros:           Record<string, Row>
}

let db: MockDB

function resetDB() {
  db = { estimates: {}, estimate_items: {}, invoices: {}, leads: {}, clients: {}, pros: {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock — chainable builder that mutates db and returns real-ish results
// ─────────────────────────────────────────────────────────────────────────────

function future(daysFromNow = 14): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString()
}
function past(daysAgo = 1): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString()
}

let rpcNextEstimateNumber = 1100 // incrementing fake estimate numbers

function makeSupabaseMock() {
  function fromTable(table: keyof MockDB) {
    const store = db[table] as Record<string, Row>
    let _method = ''
    let _insertData: Row | null = null
    let _updateData: Row | null = null
    let _filters: Array<{ key: string; op: string; value: any }> = []
    let _inFilters:  Array<{ key: string; values: any[] }> = []
    let _notInFilters: Array<{ key: string; values: any[] }> = []
    let _neqFilters: Array<{ key: string; value: any }> = []
    let _upsertData: Row[] | null = null
    let _limitN: number | null = null
    let _orderKey: string | null = null
    let _countOnly = false

    function applyFilters(rows: Row[]): Row[] {
      let result = [...rows]
      for (const f of _filters) {
        if (f.op === 'eq')       result = result.filter(r => String(r[f.key]) === String(f.value))
        if (f.op === 'gte')      result = result.filter(r => r[f.key] >= f.value)
        if (f.op === 'lte')      result = result.filter(r => r[f.key] <= f.value)
        if (f.op === 'is_null')  result = result.filter(r => r[f.key] == null)
        if (f.op === 'not_null') result = result.filter(r => r[f.key] != null)
      }
      for (const f of _inFilters)    result = result.filter(r => f.values.includes(r[f.key]))
      for (const f of _notInFilters) result = result.filter(r => !f.values.includes(r[f.key]))
      for (const f of _neqFilters)   result = result.filter(r => r[f.key] !== f.value)
      return result
    }

    function doResolve(): Promise<any> {
      const rows = Object.values(store)

      if (_method === 'insert') {
        const rawData = _insertData!
        // Handle both single row insert and array insert
        const dataArray = Array.isArray(rawData) ? rawData : [rawData]
        const inserted = dataArray.map(data => {
          const id = data.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
          const row = { ...data, id }
          store[id] = row
          return row
        })
        // Return as array so .single() can unwrap it
        return Promise.resolve({ data: inserted, error: null })
      }

      if (_method === 'upsert' && _upsertData) {
        for (const item of _upsertData) {
          const id = item.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
          store[id] = { ...item, id }
        }
        return Promise.resolve({ data: _upsertData, error: null })
      }

      if (_method === 'update') {
        const filtered = applyFilters(rows)
        for (const row of filtered) {
          Object.assign(store[row.id], _updateData)
        }
        const updated = filtered.map(r => store[r.id])
        return Promise.resolve({ data: updated, error: null })
      }

      if (_method === 'delete') {
        const filtered = applyFilters(rows)
        for (const row of filtered) delete store[row.id]
        return Promise.resolve({ data: null, error: null })
      }

      if (_method === 'select') {
        if (_countOnly) {
          const filtered = applyFilters(rows)
          return Promise.resolve({ count: filtered.length, error: null })
        }
        let filtered = applyFilters(rows)
        if (_orderKey) {
          filtered = [...filtered].sort((a, b) =>
            new Date(b[_orderKey!] || 0).getTime() - new Date(a[_orderKey!] || 0).getTime()
          )
        }
        if (_limitN !== null) filtered = filtered.slice(0, _limitN)
        // Simulate nested join: estimates with items:estimate_items(*)
        if (table === 'estimates') {
          filtered = filtered.map(est => ({
            ...est,
            items: Object.values(db.estimate_items).filter((i: any) => i.estimate_id === est.id),
          }))
        }
        return Promise.resolve({ data: filtered, error: null })
      }

      return Promise.resolve({ data: null, error: null })
    }

    const chain: any = {
      select(cols?: string, opts?: any) {
        if (!_method) _method = 'select'
        if (opts?.count === 'exact' && opts?.head) _countOnly = true
        return chain
      },
      insert(data: Row) {
        _method = 'insert'
        _insertData = data
        return chain
      },
      update(data: Row) {
        _method = 'update'
        _updateData = data
        return chain
      },
      delete() {
        _method = 'delete'
        return chain
      },
      upsert(data: Row[], _opts?: any) {
        _method = 'upsert'
        _upsertData = data
        return chain
      },
      eq(key: string, value: any) {
        _filters.push({ key, op: 'eq', value })
        return chain
      },
      neq(key: string, value: any) {
        _neqFilters.push({ key, value })
        return chain
      },
      not(key: string, op: string, value: any) {
        if (op === 'in') {
          // .not('status', 'in', '("void","declined")') or .not('lead_status', 'in', '(Lost,Archived)')
          const vals = String(value).replace(/[()\"]/g, '').split(',').map((s: string) => s.trim())
          _notInFilters.push({ key, values: vals })
        }
        if (op === 'is' && value === null) {
          _filters.push({ key, op: 'not_null', value: null })
        }
        return chain
      },
      in(key: string, values: any[]) {
        _inFilters.push({ key, values })
        return chain
      },
      is(key: string, value: any) {
        if (value === null) _filters.push({ key, op: 'is_null', value: null })
        return chain
      },
      gte(key: string, value: any) {
        _filters.push({ key, op: 'gte', value })
        return chain
      },
      lte(key: string, value: any) {
        _filters.push({ key, op: 'lte', value })
        return chain
      },
      order(key: string) {
        _orderKey = key
        return chain
      },
      limit(n: number) {
        _limitN = n
        return chain
      },
      single() {
        return doResolve().then((r: any) => {
          if (r.error) return r
          const rows = Array.isArray(r.data) ? r.data : (r.data ? [r.data] : [])
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } }
          return { data: rows[0], error: null }
        })
      },
      then(resolve_: any, reject: any) {
        return doResolve().then(resolve_, reject)
      },
    }
    return chain
  }

  return {
    from: (table: string) => fromTable(table as keyof MockDB),
    rpc: (fn: string) => {
      if (fn === 'next_estimate_number') {
        return Promise.resolve({ data: `EST-${rpcNextEstimateNumber++}`, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire mocks before any imports
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => makeSupabaseMock(),
  getSupabase:      () => makeSupabaseMock(),
}))

vi.mock('@/lib/moderation', () => ({
  moderateContent: vi.fn().mockResolvedValue({ safe: true }),
}))

vi.mock('@/lib/email', () => ({
  leadNotificationEmail: vi.fn().mockReturnValue('<html>email</html>'),
}))

const mockResendSend = vi.fn().mockResolvedValue({ id: 'email-id' })
vi.mock('resend', () => {
  const MockResend = vi.fn(function(this: any) {
    this.emails = { send: mockResendSend }
  })
  return { Resend: MockResend }
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function req(method: string, url: string, body?: any): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function seedEstimate(id: string, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id,
    pro_id:          'pro-1',
    lead_id:         'lead-1',
    estimate_number: `EST-${id}`,
    status:          'draft',
    lead_name:       'Test Client',
    subtotal:        1000,
    discount:        0,
    discount_type:   '$',
    tax_rate:        6,
    tax_amount:      60,
    total:           1060,
    deposit_percent: 50,
    require_deposit: true,
    valid_until:     future(14),
    contact_email:   'client@test.com',
    contact_phone:   '555-0001',
    terms:           'Payment due on completion.',
    notes:           '',
    viewed_count:    0,
    viewed_at:       null,
    sent_at:         null,
    approved_at:     null,
    declined_at:     null,
    voided_at:       null,
    invoiced_at:     null,
    paid_at:         null,
    ...overrides,
  }
  db.estimates[id] = row
  return row
}

function seedItem(id: string, estimateId: string, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id, estimate_id: estimateId,
    name: 'Labor', description: '', qty: 2, unit_price: 500, amount: 1000,
    ...overrides,
  }
  db.estimate_items[id] = row
  return row
}

function seedInvoice(id: string, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id,
    pro_id:         'pro-1',
    lead_id:        'lead-1',
    estimate_id:    'est-1',
    invoice_number: `INV-${id}`,
    status:         'draft',
    lead_name:      'Test Client',
    trade:          'Plumbing',
    total:          1000,
    subtotal:       1000,
    discount:       0,
    tax_rate:       0,
    tax_amount:     0,
    deposit_paid:   0,
    balance_due:    1000,
    amount_paid:    0,
    payment_terms:  'due_on_receipt',
    due_date:       future(0),
    sent_at:        null,
    viewed_at:      null,
    paid_at:        null,
    notes:          '',
    ...overrides,
  }
  db.invoices[id] = row
  return row
}

function seedLead(id: string, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id,
    pro_id:        'pro-1',
    contact_name:  'Test Contact',
    contact_email: 'contact@test.com',
    contact_phone: '555-0002',
    message:       'Need work done',
    lead_status:   'New',
    lead_source:   'Profile_Page',
    quoted_amount: null,
    scheduled_date: null,
    follow_up_date: null,
    client_id:     null,
    is_manual:     true,
    created_at:    new Date().toISOString(),
    ...overrides,
  }
  db.leads[id] = row
  return row
}

function seedClient(id: string, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id, pro_id: 'pro-1', full_name: 'Test Client',
    phone: null, email: null, preferred_contact: 'call', tags: [], notes: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
  db.clients[id] = row
  return row
}

// ─────────────────────────────────────────────────────────────────────────────
// ██████████████████ ESTIMATES ████████████████████████████████████████████████
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/estimates — Create', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-01
  it('E-01 creates a new draft estimate with correct defaults', async () => {
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', {
      pro_id: 'pro-1', lead_name: 'Neha Patel', trade: 'Plumbing', state: 'FL',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.existed).toBe(false)
    expect(body.estimate.status).toBe('draft')
    expect(body.estimate.tax_rate).toBe(6.0)   // FL rate
    expect(body.estimate.deposit_percent).toBe(50)
    expect(body.estimate.total).toBe(0)
    // valid_until should be ~14 days from now
    const diff = new Date(body.estimate.valid_until).getTime() - Date.now()
    expect(diff).toBeGreaterThan(13 * 86400000)
  })

  // E-02
  it('E-02 returns 400 when pro_id missing', async () => {
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', { lead_name: 'Test' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('pro_id required')
  })

  // E-03
  it('E-03 auto-fills correct state tax rates', async () => {
    const { POST } = await import('@/app/api/estimates/route')
    const cases = [
      { state: 'FL', rate: 6.0 },
      { state: 'OR', rate: 0.0 },
      { state: 'CA', rate: 7.25 },
      { state: 'TX', rate: 6.25 },
    ]
    for (const { state, rate } of cases) {
      resetDB()
      const res = await POST(req('POST', 'http://localhost/api/estimates', { pro_id: 'pro-1', state }))
      const body = await res.json()
      expect(body.estimate.tax_rate).toBe(rate)
    }
  })

  // E-03 (unknown state)
  it('E-03b unknown state defaults tax_rate to 0', async () => {
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', { pro_id: 'pro-1', state: 'XX' }))
    const body = await res.json()
    expect(body.estimate.tax_rate).toBe(0)
  })

  // E-04
  it('E-04 returns existing active estimate when one exists for lead (existed: true)', async () => {
    seedEstimate('est-existing', { status: 'sent', lead_id: 'lead-1' })
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', {
      pro_id: 'pro-1', lead_id: 'lead-1',
    }))
    const body = await res.json()
    expect(body.existed).toBe(true)
    expect(body.estimate.id).toBe('est-existing')
    // Should not have created a new estimate
    expect(Object.keys(db.estimates)).toHaveLength(1)
  })

  // E-05
  it('E-05 returns highest-priority estimate when multiple exist (sent over draft)', async () => {
    seedEstimate('est-draft', { status: 'draft', lead_id: 'lead-1' })
    seedEstimate('est-sent',  { status: 'sent',  lead_id: 'lead-1' })
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', {
      pro_id: 'pro-1', lead_id: 'lead-1',
    }))
    const body = await res.json()
    expect(body.existed).toBe(true)
    expect(body.estimate.id).toBe('est-sent')
  })

  // E-06
  it('E-06 force_new bypasses existing estimate check', async () => {
    seedEstimate('est-existing', { status: 'sent', lead_id: 'lead-1' })
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', {
      pro_id: 'pro-1', lead_id: 'lead-1', force_new: true,
    }))
    const body = await res.json()
    expect(body.existed).toBe(false)
    expect(Object.keys(db.estimates)).toHaveLength(2)
  })

  // E-07
  it('E-07 void and declined estimates are ignored — creates fresh draft', async () => {
    seedEstimate('est-void',     { status: 'void',     lead_id: 'lead-1' })
    seedEstimate('est-declined', { status: 'declined', lead_id: 'lead-1' })
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', {
      pro_id: 'pro-1', lead_id: 'lead-1',
    }))
    const body = await res.json()
    expect(body.existed).toBe(false)
    expect(body.estimate.status).toBe('draft')
  })

  // E-08
  it('E-08 no lead_id creates standalone estimate without checking for existing', async () => {
    seedEstimate('est-other', { status: 'sent', lead_id: 'lead-1' })
    const { POST } = await import('@/app/api/estimates/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates', {
      pro_id: 'pro-1', // no lead_id
    }))
    const body = await res.json()
    expect(body.existed).toBe(false)
    expect(body.estimate.lead_id).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/estimates/[id] — Save', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-09
  it('E-09 saves items with amount calculated as qty × unit_price', async () => {
    seedEstimate('est-1')
    const { PATCH } = await import('@/app/api/estimates/[id]/route')
    const res = await PATCH(
      req('PATCH', 'http://localhost/api/estimates/est-1', {
        items: [
          { id: 'item-1', name: 'Labor', qty: 3, unit_price: 200, description: '' },
          { id: 'item-2', name: 'Parts', qty: 1, unit_price: 150.555, description: '' },
        ],
        subtotal: 751.11, discount: 0, discount_type: '$',
        tax_rate: 6, tax_amount: 45.07, total: 796.18,
        require_deposit: true, deposit_percent: 50, terms: 'Net 14', status: 'draft', notes: '',
      }),
      params('est-1')
    )
    expect(res.status).toBe(200)
    // item amounts stored rounded to 2dp
    expect(db.estimate_items['item-1'].amount).toBe(600)
    expect(db.estimate_items['item-2'].amount).toBe(150.56) // 1 × 150.555 rounded
  })

  // E-10
  it('E-10 empty items array deletes all existing items (B10)', async () => {
    seedEstimate('est-1')
    seedItem('item-1', 'est-1')
    seedItem('item-2', 'est-1')
    expect(Object.keys(db.estimate_items)).toHaveLength(2)

    const { PATCH } = await import('@/app/api/estimates/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/estimates/est-1', {
        items: [], subtotal: 0, discount: 0, discount_type: '$',
        tax_rate: 0, tax_amount: 0, total: 0,
        require_deposit: true, deposit_percent: 50, terms: '', status: 'draft', notes: '',
      }),
      params('est-1')
    )
    expect(Object.keys(db.estimate_items)).toHaveLength(0)
  })

  // E-11
  it('E-11 removing one item from three deletes only that item', async () => {
    seedEstimate('est-1')
    seedItem('item-1', 'est-1')
    seedItem('item-2', 'est-1')
    seedItem('item-3', 'est-1')

    const { PATCH } = await import('@/app/api/estimates/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/estimates/est-1', {
        items: [
          { id: 'item-1', name: 'Labor', qty: 1, unit_price: 500, description: '' },
          { id: 'item-2', name: 'Parts', qty: 1, unit_price: 200, description: '' },
          // item-3 omitted
        ],
        subtotal: 700, discount: 0, discount_type: '$',
        tax_rate: 6, tax_amount: 42, total: 742,
        require_deposit: true, deposit_percent: 50, terms: '', status: 'draft', notes: '',
      }),
      params('est-1')
    )
    expect(db.estimate_items['item-1']).toBeDefined()
    expect(db.estimate_items['item-2']).toBeDefined()
    expect(db.estimate_items['item-3']).toBeUndefined()
  })

  // E-12
  it('E-12 draft save does NOT sync quoted_amount to lead (A4)', async () => {
    seedEstimate('est-1', { status: 'draft', lead_id: 'lead-1' })
    seedLead('lead-1', { quoted_amount: null })

    const { PATCH } = await import('@/app/api/estimates/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/estimates/est-1', {
        items: [], subtotal: 500, discount: 0, discount_type: '$',
        tax_rate: 0, tax_amount: 0, total: 500,
        require_deposit: true, deposit_percent: 50, terms: '', status: 'draft', notes: '',
      }),
      params('est-1')
    )
    expect(db.leads['lead-1'].quoted_amount).toBeNull()
  })

  // E-13
  it('E-13 approved save DOES sync quoted_amount to lead (A4)', async () => {
    seedEstimate('est-1', { status: 'approved', lead_id: 'lead-1' })
    seedLead('lead-1', { quoted_amount: null })

    const { PATCH } = await import('@/app/api/estimates/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/estimates/est-1', {
        items: [], subtotal: 1166, discount: 0, discount_type: '$',
        tax_rate: 0, tax_amount: 0, total: 1166,
        require_deposit: true, deposit_percent: 50, terms: '', status: 'approved', notes: '',
      }),
      params('est-1')
    )
    expect(db.leads['lead-1'].quoted_amount).toBe(1166)
  })

  // E-14
  it('E-14 void saves voided_at and void_reason', async () => {
    seedEstimate('est-1', { status: 'sent' })

    const { PATCH } = await import('@/app/api/estimates/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/estimates/est-1', {
        items: [], subtotal: 0, discount: 0, discount_type: '$',
        tax_rate: 0, tax_amount: 0, total: 0,
        require_deposit: false, deposit_percent: 0, terms: '', status: 'void', notes: '',
        voided_at: new Date().toISOString(), void_reason: 'Client changed mind',
      }),
      params('est-1')
    )
    expect(db.estimates['est-1'].status).toBe('void')
    expect(db.estimates['est-1'].void_reason).toBe('Client changed mind')
    expect(db.estimates['est-1'].voided_at).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/estimates/public/[id] — Public View', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-15
  it('E-15 draft estimate returns 404 to client (B3)', async () => {
    seedEstimate('est-1', { status: 'draft' })
    const { GET } = await import('@/app/api/estimates/public/[id]/route')
    const res = await GET(req('GET', 'http://localhost/estimate/est-1'), params('est-1'))
    expect(res.status).toBe(404)
  })

  // E-16
  it('E-16 void estimate returns 404 to client (B3)', async () => {
    seedEstimate('est-1', { status: 'void' })
    const { GET } = await import('@/app/api/estimates/public/[id]/route')
    const res = await GET(req('GET', 'http://localhost/estimate/est-1'), params('est-1'))
    expect(res.status).toBe(404)
  })

  // E-17
  it('E-17 sent estimate returns estimate data to client', async () => {
    seedEstimate('est-1', { status: 'sent' })
    const { GET } = await import('@/app/api/estimates/public/[id]/route')
    const res = await GET(req('GET', 'http://localhost/estimate/est-1'), params('est-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.estimate.id).toBe('est-1')
  })

  // E-18
  it('E-18 sensitive fields stripped from public response', async () => {
    seedEstimate('est-1', { status: 'sent', pro_id: 'pro-secret', contact_email: 'private@test.com', contact_phone: '555-secret' })
    const { GET } = await import('@/app/api/estimates/public/[id]/route')
    const res = await GET(req('GET', 'http://localhost/estimate/est-1'), params('est-1'))
    const body = await res.json()
    expect(body.estimate.pro_id).toBeUndefined()
    expect(body.estimate.contact_email).toBeUndefined()
    expect(body.estimate.contact_phone).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/estimates/public/[id]/view — View Tracking', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-19
  it('E-19 draft view tracking is silently skipped (B4)', async () => {
    seedEstimate('est-1', { status: 'draft', viewed_count: 0 })
    const { POST } = await import('@/app/api/estimates/public/[id]/view/route')
    const res = await POST(req('POST', 'http://localhost/estimate/est-1/view'), params('est-1'))
    expect(res.status).toBe(200)
    expect(db.estimates['est-1'].viewed_count).toBe(0)
    expect(db.estimates['est-1'].status).toBe('draft')
  })

  // E-20
  it('E-20 first view transitions sent → viewed and sets viewed_at', async () => {
    seedEstimate('est-1', { status: 'sent', viewed_count: 0, viewed_at: null })
    const { POST } = await import('@/app/api/estimates/public/[id]/view/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/view'), params('est-1'))
    expect(db.estimates['est-1'].status).toBe('viewed')
    expect(db.estimates['est-1'].viewed_count).toBe(1)
    expect(db.estimates['est-1'].viewed_at).toBeTruthy()
  })

  // E-21
  it('E-21 second view increments count but does not reset viewed_at', async () => {
    const firstViewedAt = '2026-05-01T10:00:00Z'
    seedEstimate('est-1', { status: 'viewed', viewed_count: 1, viewed_at: firstViewedAt })
    const { POST } = await import('@/app/api/estimates/public/[id]/view/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/view'), params('est-1'))
    expect(db.estimates['est-1'].viewed_count).toBe(2)
    expect(db.estimates['est-1'].viewed_at).toBe(firstViewedAt) // unchanged
  })

  // E-22
  it('E-22 approved estimate stays approved after re-view — not reset to viewed', async () => {
    seedEstimate('est-1', { status: 'approved', viewed_count: 1, viewed_at: '2026-05-01T10:00:00Z' })
    const { POST } = await import('@/app/api/estimates/public/[id]/view/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/view'), params('est-1'))
    expect(db.estimates['est-1'].status).toBe('approved')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/estimates/public/[id]/approve — Approve', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-23
  it('E-23 approves a sent estimate successfully', async () => {
    seedEstimate('est-1', { status: 'sent', valid_until: future(14) })
    const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
    const res = await POST(req('POST', 'http://localhost/estimate/est-1/approve'), params('est-1'))
    expect(res.status).toBe(200)
    expect(db.estimates['est-1'].status).toBe('approved')
    expect(db.estimates['est-1'].approved_at).toBeTruthy()
  })

  // E-24
  it('E-24 approves a viewed estimate successfully', async () => {
    seedEstimate('est-1', { status: 'viewed', valid_until: future(14) })
    const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
    const res = await POST(req('POST', 'http://localhost/estimate/est-1/approve'), params('est-1'))
    expect(res.status).toBe(200)
    expect(db.estimates['est-1'].status).toBe('approved')
  })

  // E-25 to E-28 — status guard
  it.each(['draft', 'approved', 'declined', 'void', 'invoiced', 'paid'])(
    'E-25/26/27/28 blocks approval of "%s" estimate with 400',
    async (status) => {
      resetDB()
      seedEstimate('est-1', { status, valid_until: future(14) })
      const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
      const res = await POST(req('POST', 'http://localhost/estimate/est-1/approve'), params('est-1'))
      expect(res.status).toBe(400)
      expect(db.estimates['est-1'].status).toBe(status) // unchanged
    }
  )

  // E-29
  it('E-29 blocks approval of expired estimate', async () => {
    seedEstimate('est-1', { status: 'sent', valid_until: past(1) })
    const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
    const res = await POST(req('POST', 'http://localhost/estimate/est-1/approve'), params('est-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('expired')
    expect(db.estimates['est-1'].status).toBe('sent')
  })

  // E-30 + E-31
  it('E-30 approving EST-A auto-voids sibling draft and sent estimates for same lead', async () => {
    seedEstimate('est-a', { status: 'sent',  lead_id: 'lead-1', estimate_number: 'EST-A', valid_until: future(14) })
    seedEstimate('est-b', { status: 'draft', lead_id: 'lead-1', estimate_number: 'EST-B' })
    seedEstimate('est-c', { status: 'sent',  lead_id: 'lead-1', estimate_number: 'EST-C' })

    const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
    await POST(req('POST', 'http://localhost/estimate/est-a/approve'), params('est-a'))

    expect(db.estimates['est-a'].status).toBe('approved')
    expect(db.estimates['est-b'].status).toBe('void')
    expect(db.estimates['est-b'].void_reason).toContain('EST-A')
    expect(db.estimates['est-c'].status).toBe('void')
  })

  // E-32
  it('E-32 standalone estimate with no lead_id approves without sibling voiding', async () => {
    seedEstimate('est-1', { status: 'sent', lead_id: null, valid_until: future(14) })
    seedEstimate('est-other', { status: 'draft', lead_id: null }) // unrelated
    const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/approve'), params('est-1'))
    expect(db.estimates['est-1'].status).toBe('approved')
    expect(db.estimates['est-other'].status).toBe('draft') // untouched
  })

  // E-33
  it('E-33 non-existent estimate returns 404', async () => {
    const { POST } = await import('@/app/api/estimates/public/[id]/approve/route')
    const res = await POST(req('POST', 'http://localhost/estimate/bad-id/approve'), params('bad-id'))
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/estimates/public/[id]/decline — Decline', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-34
  it('E-34 declines viewed estimate with reason', async () => {
    seedEstimate('est-1', { status: 'viewed' })
    const { POST } = await import('@/app/api/estimates/public/[id]/decline/route')
    const res = await POST(
      req('POST', 'http://localhost/estimate/est-1/decline', { reason: 'Too expensive' }),
      params('est-1')
    )
    expect(res.status).toBe(200)
    expect(db.estimates['est-1'].status).toBe('declined')
    expect(db.estimates['est-1'].decline_reason).toBe('Too expensive')
    expect(db.estimates['est-1'].declined_at).toBeTruthy()
  })

  // E-35
  it('E-35 declines with no reason — decline_reason is null', async () => {
    seedEstimate('est-1', { status: 'sent' })
    const { POST } = await import('@/app/api/estimates/public/[id]/decline/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/decline', {}), params('est-1'))
    expect(db.estimates['est-1'].status).toBe('declined')
    expect(db.estimates['est-1'].decline_reason).toBeNull()
  })

  // E-36
  it('E-36 draft estimate is silently ignored by decline guard (B6)', async () => {
    seedEstimate('est-1', { status: 'draft' })
    const { POST } = await import('@/app/api/estimates/public/[id]/decline/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/decline', {}), params('est-1'))
    // Guard .in('status',['sent','viewed']) means draft row is not touched
    expect(db.estimates['est-1'].status).toBe('draft')
  })

  // E-37
  it('E-37 approved estimate cannot be declined after the fact (B6)', async () => {
    seedEstimate('est-1', { status: 'approved' })
    const { POST } = await import('@/app/api/estimates/public/[id]/decline/route')
    await POST(req('POST', 'http://localhost/estimate/est-1/decline', {}), params('est-1'))
    expect(db.estimates['est-1'].status).toBe('approved')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/estimates/duplicate — Duplicate', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // E-38
  it('E-38 duplicates estimate with all fields and items as new draft', async () => {
    seedEstimate('est-1', { status: 'approved', total: 1060, terms: 'Net 30' })
    seedItem('item-1', 'est-1', { name: 'Labor', qty: 2, unit_price: 500, amount: 1000 })
    seedItem('item-2', 'est-1', { name: 'Parts', qty: 1, unit_price: 60, amount: 60 })

    const { POST } = await import('@/app/api/estimates/duplicate/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates/duplicate', {
      estimate_id: 'est-1', pro_id: 'pro-1',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.estimate.status).toBe('draft')
    expect(body.estimate.id).not.toBe('est-1')
    expect(body.estimate.total).toBe(1060)
    expect(body.estimate.terms).toBe('Net 30')
    // valid_until reset to ~14 days
    const diff = new Date(body.estimate.valid_until).getTime() - Date.now()
    expect(diff).toBeGreaterThan(13 * 86400000)
    // Items should be copied — check db directly (mock doesn't support nested joins)
    const newId = body.estimate.id
    const allItems = Object.values(db.estimate_items)
    const copiedItems = allItems.filter((i: any) => i.estimate_id === newId)
    expect(copiedItems.length).toBeGreaterThanOrEqual(1) // at least 1 item copied
  })

  // E-39
  it('E-39 returns 400 when estimate_id or pro_id missing', async () => {
    const { POST } = await import('@/app/api/estimates/duplicate/route')
    const res1 = await POST(req('POST', 'http://localhost/api/estimates/duplicate', { pro_id: 'pro-1' }))
    expect(res1.status).toBe(400)
    const res2 = await POST(req('POST', 'http://localhost/api/estimates/duplicate', { estimate_id: 'est-1' }))
    expect(res2.status).toBe(400)
  })

  // E-40
  it('E-40 non-existent estimate returns 404', async () => {
    const { POST } = await import('@/app/api/estimates/duplicate/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates/duplicate', {
      estimate_id: 'bad-id', pro_id: 'pro-1',
    }))
    expect(res.status).toBe(404)
  })

  // E-41
  it('E-41 estimate with no items duplicates with no items', async () => {
    seedEstimate('est-1', { status: 'sent' })
    // No items seeded

    const { POST } = await import('@/app/api/estimates/duplicate/route')
    const res = await POST(req('POST', 'http://localhost/api/estimates/duplicate', {
      estimate_id: 'est-1', pro_id: 'pro-1',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    const copiedItems = Object.values(db.estimate_items).filter(i => i.estimate_id === body.estimate.id)
    expect(copiedItems).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ██████████████████ INVOICES ████████████████████████████████████████████████
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/invoices — Create Invoice', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // I-01
  it('I-01 creates invoice from approved estimate with correct fields', async () => {
    seedEstimate('est-1', {
      status: 'approved', estimate_number: 'EST-1009',
      total: 1060, subtotal: 1000, tax_rate: 6, tax_amount: 60,
      discount: 0, discount_type: '$', deposit_percent: 50,
      lead_id: 'lead-1', lead_name: 'Neha Patel', trade: 'Plumbing',
      terms: 'Net 14', notes: '',
    })
    seedItem('item-1', 'est-1', { name: 'Labor', qty: 2, unit_price: 500, amount: 1000 })
    seedLead('lead-1')

    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', {
      pro_id: 'pro-1', estimate_id: 'est-1',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.invoice.invoice_number).toBe('INV-1009')
    expect(body.invoice.total).toBe(1060)
    expect(body.invoice.status).toBe('draft')
    // Estimate should now be marked invoiced
    expect(db.estimates['est-1'].status).toBe('invoiced')
    expect(db.estimates['est-1'].invoice_id).toBe(body.invoice.id)
  })

  // I-02 + I-03
  it('I-02/03 deposit_paid defaults to 0, balance_due equals full total (A2/A3)', async () => {
    seedEstimate('est-1', {
      status: 'approved', total: 1060, subtotal: 1000,
      deposit_percent: 50, require_deposit: true,
      tax_rate: 6, tax_amount: 60, discount: 0,
    })
    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', {
      pro_id: 'pro-1', estimate_id: 'est-1',
    }))
    const body = await res.json()
    expect(body.invoice.deposit_paid).toBe(0)     // not assumed from deposit_percent
    expect(body.invoice.balance_due).toBe(1060)   // full total, not total - deposit
  })

  // I-04
  it('I-04 blocks invoice creation from sent estimate', async () => {
    seedEstimate('est-1', { status: 'sent' })
    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', {
      pro_id: 'pro-1', estimate_id: 'est-1',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('approved')
  })

  // I-05
  it('I-05 blocks invoice creation from draft estimate', async () => {
    seedEstimate('est-1', { status: 'draft' })
    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', {
      pro_id: 'pro-1', estimate_id: 'est-1',
    }))
    expect(res.status).toBe(400)
  })

  // I-06
  it('I-06 estimate is marked invoiced after invoice created', async () => {
    seedEstimate('est-1', { status: 'approved', total: 500, subtotal: 500, tax_rate: 0, tax_amount: 0, discount: 0 })
    const { POST } = await import('@/app/api/invoices/route')
    await POST(req('POST', 'http://localhost/api/invoices', { pro_id: 'pro-1', estimate_id: 'est-1' }))
    expect(db.estimates['est-1'].status).toBe('invoiced')
    expect(db.estimates['est-1'].invoiced_at).toBeTruthy()
  })

  // I-07
  it('I-07 non-existent estimate returns 404', async () => {
    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', {
      pro_id: 'pro-1', estimate_id: 'bad-id',
    }))
    expect(res.status).toBe(404)
  })

  // I-08
  it('I-08 creates blank invoice with no estimate_id', async () => {
    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', {
      pro_id: 'pro-1', lead_name: 'Walk-in Client',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.invoice.total).toBe(0)
    expect(body.invoice.balance_due).toBe(0)
    expect(body.invoice.invoice_number).toMatch(/^INV-/)
  })

  // I-09
  it('I-09 missing pro_id returns 400', async () => {
    const { POST } = await import('@/app/api/invoices/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices', { lead_name: 'Test' }))
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/invoices — List', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // I-10
  it('I-10 excludes void invoices from list', async () => {
    seedInvoice('inv-1', { status: 'sent' })
    seedInvoice('inv-2', { status: 'paid' })
    seedInvoice('inv-3', { status: 'void' })

    const { GET } = await import('@/app/api/invoices/route')
    const res = await GET(req('GET', 'http://localhost/api/invoices?pro_id=pro-1'))
    const body = await res.json()
    expect(body.invoices).toHaveLength(2)
    expect(body.invoices.find((i: any) => i.id === 'inv-3')).toBeUndefined()
  })

  // I-11
  it('I-11 deduplicates rows by id', async () => {
    // Seed same invoice twice (simulates join returning duplicate rows)
    db.invoices['inv-dup-a'] = { id: 'inv-1', pro_id: 'pro-1', status: 'sent', created_at: new Date().toISOString() }
    db.invoices['inv-dup-b'] = { id: 'inv-1', pro_id: 'pro-1', status: 'sent', created_at: new Date().toISOString() }

    const { GET } = await import('@/app/api/invoices/route')
    const res = await GET(req('GET', 'http://localhost/api/invoices?pro_id=pro-1'))
    const body = await res.json()
    expect(body.invoices).toHaveLength(1)
  })

  // I-12
  it('I-12 filters by lead_id when provided', async () => {
    seedInvoice('inv-1', { lead_id: 'lead-1', status: 'sent' })
    seedInvoice('inv-2', { lead_id: 'lead-2', status: 'sent' })

    const { GET } = await import('@/app/api/invoices/route')
    const res = await GET(req('GET', 'http://localhost/api/invoices?pro_id=pro-1&lead_id=lead-1'))
    const body = await res.json()
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0].id).toBe('inv-1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/mark-paid — Payments', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // I-13
  it('I-13 full payment marks invoice paid and cascades to lead and estimate', async () => {
    seedInvoice('inv-1', { total: 1000, balance_due: 1000, amount_paid: 0, lead_id: 'lead-1', estimate_id: 'est-1' })
    seedLead('lead-1', { lead_status: 'Scheduled' })
    seedEstimate('est-1', { status: 'invoiced' })

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'inv-1', amount: 1000,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('paid')
    expect(body.balance_due).toBe(0)
    expect(db.invoices['inv-1'].status).toBe('paid')
    expect(db.invoices['inv-1'].paid_at).toBeTruthy()
    expect(db.leads['lead-1'].lead_status).toBe('Paid')
    expect(db.estimates['est-1'].status).toBe('paid')
  })

  // I-14
  it('I-14 no lead_id — no lead cascade on full payment', async () => {
    seedInvoice('inv-1', { total: 500, balance_due: 500, amount_paid: 0, lead_id: null, estimate_id: null })
    seedLead('lead-1', { lead_status: 'Scheduled' }) // unrelated lead — should not change

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    await POST(req('POST', 'http://localhost/api/invoices/mark-paid', { invoice_id: 'inv-1', amount: 500 }))
    expect(db.leads['lead-1'].lead_status).toBe('Scheduled') // unchanged
  })

  // I-15
  it('I-15 no estimate_id — no estimate cascade on full payment', async () => {
    seedInvoice('inv-1', { total: 500, balance_due: 500, amount_paid: 0, lead_id: null, estimate_id: null })
    seedEstimate('est-1', { status: 'invoiced' }) // unrelated — should not change

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    await POST(req('POST', 'http://localhost/api/invoices/mark-paid', { invoice_id: 'inv-1', amount: 500 }))
    expect(db.estimates['est-1'].status).toBe('invoiced') // unchanged
  })

  // I-16
  it('I-16 first partial payment reduces balance_due correctly (A1)', async () => {
    seedInvoice('inv-1', { total: 1000, balance_due: 1000, amount_paid: 0 })

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'inv-1', amount: 400,
    }))
    const body = await res.json()
    expect(body.status).toBe('partial_payment')
    expect(body.balance_due).toBe(600)
    expect(db.invoices['inv-1'].amount_paid).toBe(400)
    expect(db.invoices['inv-1'].balance_due).toBe(600)
    expect(db.invoices['inv-1'].paid_at).toBeNull()
  })

  // I-17 + I-18
  it('I-17/18 second partial payment accumulates correctly — not overwritten (A1)', async () => {
    seedInvoice('inv-1', { total: 1000, balance_due: 600, amount_paid: 400 })

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'inv-1', amount: 600,
    }))
    const body = await res.json()
    expect(body.status).toBe('paid')
    expect(body.balance_due).toBe(0)
    expect(db.invoices['inv-1'].amount_paid).toBe(1000)  // 400 + 600, not just 600
    expect(db.invoices['inv-1'].status).toBe('paid')
  })

  // I-19
  it('I-19 overpayment floors balance_due at 0, never negative', async () => {
    seedInvoice('inv-1', { total: 1000, balance_due: 1000, amount_paid: 0 })

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'inv-1', amount: 1200,
    }))
    const body = await res.json()
    expect(body.balance_due).toBe(0)
    expect(db.invoices['inv-1'].balance_due).toBeGreaterThanOrEqual(0)
  })

  // I-20
  it('I-20 no amount in body defaults to paying off full balance_due', async () => {
    seedInvoice('inv-1', { total: 1000, balance_due: 350, amount_paid: 650 })

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'inv-1',
      // no amount
    }))
    const body = await res.json()
    expect(body.status).toBe('paid')
    expect(body.balance_due).toBe(0)
  })

  // I-21
  it('I-21 missing invoice_id returns 400', async () => {
    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', { amount: 100 }))
    expect(res.status).toBe(400)
  })

  // I-22
  it('I-22 non-existent invoice returns 404', async () => {
    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    const res = await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'bad-id', amount: 100,
    }))
    expect(res.status).toBe(404)
  })

  // I-23
  it('I-23 payment note appended to existing invoice notes', async () => {
    seedInvoice('inv-1', { total: 1000, balance_due: 1000, amount_paid: 0, notes: 'Customer prefers evening calls.' })

    const { POST } = await import('@/app/api/invoices/mark-paid/route')
    await POST(req('POST', 'http://localhost/api/invoices/mark-paid', {
      invoice_id: 'inv-1', amount: 1000, notes: 'Paid cash on-site',
    }))
    expect(db.invoices['inv-1'].notes).toContain('Customer prefers evening calls.')
    expect(db.invoices['inv-1'].notes).toContain('Payment note: Paid cash on-site')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/invoices/[id] — Void', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // I-24
  it('I-24 void invoice soft-deletes (sets status void, row remains)', async () => {
    seedInvoice('inv-1', { status: 'sent' })

    const { DELETE } = await import('@/app/api/invoices/[id]/route')
    const res = await DELETE(req('DELETE', 'http://localhost/api/invoices/inv-1'), params('inv-1'))
    expect(res.status).toBe(200)
    expect(db.invoices['inv-1']).toBeDefined()   // row still exists
    expect(db.invoices['inv-1'].status).toBe('void')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ██████████████████ PIPELINE — LEADS ████████████████████████████████████████
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/leads — Create Lead', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks(); mockResendSend.mockClear() })

  // L-01
  it('L-01 creates manual lead with correct defaults', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', full_name: 'James Miller', plan_tier: 'Free', city: 'Miami', state: 'FL' }
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Neha Patel',
      message: 'Need bathroom retile', is_manual: true,
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.lead.lead_status).toBe('New')
    expect(body.lead.lead_source).toBe('Profile_Page')
    expect(body.lead.contact_email).toBeNull()
  })

  // L-02
  it('L-02 manual lead does not require email', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Walk-in', message: 'Needs quote', is_manual: true,
    }))
    expect(res.status).toBe(201)
  })

  // L-03
  it('L-03 email is lowercased and trimmed on save', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'John', message: 'Test',
      contact_email: '  John@GMAIL.COM  ', is_manual: true,
    }))
    const body = await res.json()
    expect(body.lead.contact_email).toBe('john@gmail.com')
  })

  // L-04
  it('L-04 phone stored as-is without transformation', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Test',
      contact_phone: '(305) 555-1234', is_manual: true,
    }))
    const body = await res.json()
    expect(body.lead.contact_phone).toBe('(305) 555-1234')
  })

  // L-05
  it('L-05 job_id stored when provided', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Test',
      job_id: 'job-abc', is_manual: true,
    }))
    const body = await res.json()
    expect(body.lead.job_id).toBe('job-abc')
  })

  // L-06
  it('L-06 client_id stored when provided', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Test',
      client_id: 'client-abc', is_manual: true,
    }))
    const body = await res.json()
    expect(body.lead.client_id).toBe('client-abc')
  })

  // L-07
  it('L-07 missing pro_id returns 400', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      contact_name: 'Test', message: 'Test',
    }))
    expect(res.status).toBe(400)
  })

  // L-08
  it('L-08 missing contact_name returns 400', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', message: 'Test',
    }))
    expect(res.status).toBe(400)
  })

  // L-09
  it('L-09 missing message returns 400', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test',
    }))
    expect(res.status).toBe(400)
  })

  // L-10
  it('L-10 contact form lead without email returns 400', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Test',
      // is_manual not set
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Email required')
  })

  // L-11
  it('L-11 moderation blocks profanity with 422', async () => {
    const { moderateContent } = await import('@/lib/moderation')
    vi.mocked(moderateContent).mockResolvedValueOnce({ safe: false, reason: 'Profanity detected' })

    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'bad word here', is_manual: true,
    }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('Profanity detected')
  })

  // L-12
  it('L-12 moderation service down — route throws (no try/catch around moderateContent)', async () => {
    const { moderateContent } = await import('@/lib/moderation')
    vi.mocked(moderateContent).mockRejectedValueOnce(new Error('Moderation service down'))

    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    const { POST } = await import('@/app/api/leads/route')
    // Current code has no try/catch around moderateContent — it throws unhandled
    // This test documents the gap: moderation outage = route crash
    // To fix: wrap moderateContent call in try/catch and fail open
    await expect(POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Normal message', is_manual: true,
    }))).rejects.toThrow('Moderation service down')
  })

  // L-13
  it('L-13 email notification sent on successful lead creation', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', full_name: 'James Miller', plan_tier: 'Pro', city: 'Miami', state: 'FL' }
    process.env.RESEND_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/leads/route')
    await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Neha', message: 'Need work', is_manual: true,
    }))
    expect(mockResendSend).toHaveBeenCalled()
  })

  // L-14
  it('L-14 email failure does not fail the request — lead still returns 201', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', full_name: 'James', plan_tier: 'Free', city: 'Miami', state: 'FL' }
    process.env.RESEND_API_KEY = 'test-key'
    mockResendSend.mockRejectedValueOnce(new Error('Resend is down'))

    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Test', is_manual: true,
    }))
    expect(res.status).toBe(201)
  })

  // L-15
  it('L-15 no RESEND_API_KEY means no email attempted', async () => {
    db.pros['pro-1'] = { id: 'pro-1', email: 'pro@test.com', plan_tier: 'Free' }
    delete process.env.RESEND_API_KEY

    const { POST } = await import('@/app/api/leads/route')
    await POST(req('POST', 'http://localhost/api/leads', {
      pro_id: 'pro-1', contact_name: 'Test', message: 'Test', is_manual: true,
    }))
    expect(mockResendSend).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/leads — List', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-17
  it('L-17 returns all leads for pro ordered by created_at desc', async () => {
    seedLead('lead-1', { created_at: '2026-05-01T10:00:00Z' })
    seedLead('lead-2', { created_at: '2026-05-03T10:00:00Z' })
    const { GET } = await import('@/app/api/leads/route')
    const res = await GET(req('GET', 'http://localhost/api/leads?pro_id=pro-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.leads).toHaveLength(2)
    // Most recent first
    expect(body.leads[0].id).toBe('lead-2')
  })

  // L-18
  it('L-18 missing pro_id returns 400', async () => {
    const { GET } = await import('@/app/api/leads/route')
    const res = await GET(req('GET', 'http://localhost/api/leads'))
    expect(res.status).toBe(400)
  })

  // L-19
  it('L-19 pro with no leads returns empty array not null', async () => {
    const { GET } = await import('@/app/api/leads/route')
    const res = await GET(req('GET', 'http://localhost/api/leads?pro_id=pro-empty'))
    const body = await res.json()
    expect(body.leads).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/leads/[id] — Single Lead', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-20
  it('L-20 returns single lead', async () => {
    seedLead('lead-1')
    const { GET } = await import('@/app/api/leads/[id]/route')
    const res = await GET(
      req('GET', 'http://localhost/api/leads/lead-1?pro_id=pro-1'),
      params('lead-1')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lead.id).toBe('lead-1')
  })

  // L-21
  it('L-21 returns lead even without pro_id filter (C5 — filter optional)', async () => {
    seedLead('lead-1')
    const { GET } = await import('@/app/api/leads/[id]/route')
    const res = await GET(
      req('GET', 'http://localhost/api/leads/lead-1'), // no pro_id
      params('lead-1')
    )
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/leads/[id] — Stage Transitions & Updates', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-23 to L-27 — forward stage moves
  it.each([
    ['L-23', 'New',       'Contacted'],
    ['L-24', 'Contacted', 'Quoted'],
    ['L-25', 'Quoted',    'Scheduled'],
    ['L-26', 'Scheduled', 'Completed'],
    ['L-27', 'Completed', 'Paid'],
  ])('%s moves lead from %s to %s', async (_id, from, to) => {
    resetDB()
    seedLead('lead-1', { lead_status: from })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const res = await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: to }),
      params('lead-1')
    )
    expect(res.status).toBe(200)
    expect(db.leads['lead-1'].lead_status).toBe(to)
  })

  // L-28
  it('L-28 allows backward stage move — API has no forward-only guard', async () => {
    seedLead('lead-1', { lead_status: 'Quoted' })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const res = await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'Contacted' }),
      params('lead-1')
    )
    expect(res.status).toBe(200)
    expect(db.leads['lead-1'].lead_status).toBe('Contacted')
  })

  // L-29
  it('L-29 allows moving Paid → New (reopen) — UI shows modal, API has no guard', async () => {
    seedLead('lead-1', { lead_status: 'Paid' })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const res = await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'New' }),
      params('lead-1')
    )
    expect(res.status).toBe(200)
    expect(db.leads['lead-1'].lead_status).toBe('New')
  })

  // L-30
  it('L-30 moves lead to Lost', async () => {
    seedLead('lead-1', { lead_status: 'Quoted' })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'Lost' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].lead_status).toBe('Lost')
  })

  // L-31
  it('L-31 reopens Lost lead back to New', async () => {
    seedLead('lead-1', { lead_status: 'Lost' })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'New' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].lead_status).toBe('New')
  })

  // L-32
  it('L-32 only lead_status updated — other fields unchanged', async () => {
    seedLead('lead-1', { lead_status: 'New', notes: 'Existing notes', quoted_amount: 500 })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'Contacted' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].lead_status).toBe('Contacted')
    expect(db.leads['lead-1'].notes).toBe('Existing notes')
    expect(db.leads['lead-1'].quoted_amount).toBe(500)
  })

  // L-33
  it('L-33 empty body returns 400 — no fields to update', async () => {
    seedLead('lead-1')
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    const res = await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', {}),
      params('lead-1')
    )
    expect(res.status).toBe(400)
  })

  // L-35
  it('L-35 updates notes field', async () => {
    seedLead('lead-1', { notes: '' })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { notes: 'Called, no answer' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].notes).toBe('Called, no answer')
  })

  // L-36
  it('L-36 updates quoted_amount', async () => {
    seedLead('lead-1', { quoted_amount: null })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { quoted_amount: 1500 }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].quoted_amount).toBe(1500)
  })

  // L-37
  it('L-37 updates scheduled_date', async () => {
    seedLead('lead-1')
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { scheduled_date: '2026-06-01T09:00:00Z' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].scheduled_date).toBe('2026-06-01T09:00:00Z')
  })

  // L-38
  it('L-38 updates follow_up_date', async () => {
    seedLead('lead-1')
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { follow_up_date: '2026-05-15T09:00:00Z' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].follow_up_date).toBe('2026-05-15T09:00:00Z')
  })

  // L-39
  it('L-39 updates client_id — links lead to client', async () => {
    seedLead('lead-1', { client_id: null })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { client_id: 'client-abc' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].client_id).toBe('client-abc')
  })

  // L-40
  it('L-40 updates multiple fields at once', async () => {
    seedLead('lead-1', { lead_status: 'New', notes: '', quoted_amount: null })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', {
        lead_status: 'Quoted', notes: 'Sent estimate', quoted_amount: 1200,
      }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].lead_status).toBe('Quoted')
    expect(db.leads['lead-1'].notes).toBe('Sent estimate')
    expect(db.leads['lead-1'].quoted_amount).toBe(1200)
  })

  // L-41
  it('L-41 updated_at is always set on any PATCH', async () => {
    seedLead('lead-1', { lead_status: 'New' })
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await PATCH(
      req('PATCH', 'http://localhost/api/leads/lead-1', { lead_status: 'Contacted' }),
      params('lead-1')
    )
    expect(db.leads['lead-1'].updated_at).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/leads/[id]', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-43
  it('L-43 deletes lead and returns success', async () => {
    seedLead('lead-1')
    const { DELETE } = await import('@/app/api/leads/[id]/route')
    const res = await DELETE(
      req('DELETE', 'http://localhost/api/leads/lead-1'),
      params('lead-1')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(db.leads['lead-1']).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/calendar — Calendar Events', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-45
  it('L-45 returns scheduled jobs in date range with _type job', async () => {
    seedLead('lead-1', { scheduled_date: '2026-05-10T09:00:00Z', lead_status: 'Scheduled' })
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1&from=2026-05-01&to=2026-05-31'))
    const body = await res.json()
    const job = body.events.find((e: any) => e.id === 'lead-1' && e._type === 'job')
    expect(job).toBeDefined()
  })

  // L-46
  it('L-46 returns follow-ups in date range with _type followup', async () => {
    seedLead('lead-2', { follow_up_date: '2026-05-12T09:00:00Z', lead_status: 'Quoted', scheduled_date: null })
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1&from=2026-05-01&to=2026-05-31'))
    const body = await res.json()
    const fu = body.events.find((e: any) => e.id === 'lead-2' && e._type === 'followup')
    expect(fu).toBeDefined()
  })

  // L-47
  it('L-47 lead with both scheduled and follow_up dates emits job + followup entries', async () => {
    seedLead('lead-3', {
      scheduled_date:  '2026-05-10T09:00:00Z',
      follow_up_date:  '2026-05-10T14:00:00Z',
      lead_status: 'Scheduled',
    })
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1&from=2026-05-01&to=2026-05-31'))
    const body = await res.json()
    const entries = body.events.filter((e: any) => e.id === 'lead-3')
    expect(entries.length).toBe(2)
    expect(entries.map((e: any) => e._type).sort()).toEqual(['followup', 'job'])
  })

  // L-48
  it('L-48 Lost and Archived leads excluded from calendar events', async () => {
    seedLead('lead-lost',     { scheduled_date: '2026-05-10T09:00:00Z', lead_status: 'Lost' })
    seedLead('lead-archived', { scheduled_date: '2026-05-11T09:00:00Z', lead_status: 'Archived' })
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1&from=2026-05-01&to=2026-05-31'))
    const body = await res.json()
    expect(body.events.find((e: any) => e.id === 'lead-lost')).toBeUndefined()
    expect(body.events.find((e: any) => e.id === 'lead-archived')).toBeUndefined()
  })

  // L-49
  it('L-49 unscheduled Quoted and Contacted leads appear in unscheduled array', async () => {
    seedLead('lead-q', { lead_status: 'Quoted',    scheduled_date: null })
    seedLead('lead-c', { lead_status: 'Contacted', scheduled_date: null })
    seedLead('lead-n', { lead_status: 'New',       scheduled_date: null }) // should NOT appear
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1'))
    const body = await res.json()
    const ids = body.unscheduled.map((l: any) => l.id)
    expect(ids).toContain('lead-q')
    expect(ids).toContain('lead-c')
    expect(ids).not.toContain('lead-n')
  })

  // L-50
  it('L-50 unscheduled capped at 10 even if more exist', async () => {
    for (let i = 0; i < 15; i++) {
      seedLead(`lead-u${i}`, { lead_status: 'Quoted', scheduled_date: null })
    }
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1'))
    const body = await res.json()
    expect(body.unscheduled.length).toBeLessThanOrEqual(10)
  })

  // L-51
  it('L-51 missing pro_id returns 400', async () => {
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar'))
    expect(res.status).toBe(400)
  })

  // L-52
  it('L-52 no date range returns all scheduled leads', async () => {
    seedLead('lead-past',   { scheduled_date: '2025-01-01T09:00:00Z', lead_status: 'Scheduled' })
    seedLead('lead-future', { scheduled_date: '2027-01-01T09:00:00Z', lead_status: 'Scheduled' })
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1'))
    const body = await res.json()
    const ids = body.events.map((e: any) => e.id)
    expect(ids).toContain('lead-past')
    expect(ids).toContain('lead-future')
  })

  // L-53
  it('L-53 lead in both scheduled and followup queries is not triple-counted', async () => {
    seedLead('lead-both', {
      scheduled_date:  '2026-05-10T09:00:00Z',
      follow_up_date:  '2026-05-10T14:00:00Z',
      lead_status: 'Scheduled',
    })
    const { GET } = await import('@/app/api/calendar/route')
    const res = await GET(req('GET', 'http://localhost/api/calendar?pro_id=pro-1&from=2026-05-01&to=2026-05-31'))
    const body = await res.json()
    const entries = body.events.filter((e: any) => e.id === 'lead-both')
    // Exactly 2: one job + one followup (not 3)
    expect(entries.length).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/clients — Create Client', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-54
  it('L-54 creates client with correct defaults', async () => {
    const { POST } = await import('@/app/api/clients/route')
    const res = await POST(req('POST', 'http://localhost/api/clients', {
      pro_id: 'pro-1', full_name: 'Neha Patel',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.client.full_name).toBe('Neha Patel')
  })

  // L-55
  it('L-55 missing pro_id returns 400', async () => {
    const { POST } = await import('@/app/api/clients/route')
    const res = await POST(req('POST', 'http://localhost/api/clients', { full_name: 'Test' }))
    expect(res.status).toBe(400)
  })

  // L-56
  it('L-56 missing full_name returns 400', async () => {
    const { POST } = await import('@/app/api/clients/route')
    const res = await POST(req('POST', 'http://localhost/api/clients', { pro_id: 'pro-1' }))
    expect(res.status).toBe(400)
  })

  // L-57
  it('L-57 preferred_contact defaults to call', async () => {
    const { POST } = await import('@/app/api/clients/route')
    const res = await POST(req('POST', 'http://localhost/api/clients', {
      pro_id: 'pro-1', full_name: 'Test Client',
    }))
    const body = await res.json()
    expect(body.client.preferred_contact).toBe('call')
  })

  // L-58
  it('L-58 tags defaults to empty array', async () => {
    const { POST } = await import('@/app/api/clients/route')
    const res = await POST(req('POST', 'http://localhost/api/clients', {
      pro_id: 'pro-1', full_name: 'Test Client',
    }))
    const body = await res.json()
    expect(body.client.tags).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/clients — List with Enrichment', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-59
  it('L-59 lifetime_value counts only Paid leads with quoted_amount', async () => {
    seedClient('client-1')
    seedLead('lead-paid',   { client_id: 'client-1', lead_status: 'Paid',   quoted_amount: 500 })
    seedLead('lead-quoted', { client_id: 'client-1', lead_status: 'Quoted', quoted_amount: 300 })

    const { GET } = await import('@/app/api/clients/route')
    const res = await GET(req('GET', 'http://localhost/api/clients?pro_id=pro-1'))
    const body = await res.json()
    const client = body.clients.find((c: any) => c.id === 'client-1')
    expect(client.lifetime_value).toBe(500)  // only Paid, not Quoted
  })

  // L-60
  it('L-60 job_count includes leads in all statuses', async () => {
    seedClient('client-1')
    seedLead('lead-new',  { client_id: 'client-1', lead_status: 'New' })
    seedLead('lead-q',    { client_id: 'client-1', lead_status: 'Quoted', quoted_amount: 300 })
    seedLead('lead-paid', { client_id: 'client-1', lead_status: 'Paid',   quoted_amount: 500 })

    const { GET } = await import('@/app/api/clients/route')
    const res = await GET(req('GET', 'http://localhost/api/clients?pro_id=pro-1'))
    const body = await res.json()
    const client = body.clients.find((c: any) => c.id === 'client-1')
    expect(client.job_count).toBe(3)
  })

  // L-61
  it('L-61 new client with no leads has 0 lifetime_value and 0 job_count', async () => {
    seedClient('client-new')
    const { GET } = await import('@/app/api/clients/route')
    const res = await GET(req('GET', 'http://localhost/api/clients?pro_id=pro-1'))
    const body = await res.json()
    const client = body.clients.find((c: any) => c.id === 'client-new')
    expect(client.lifetime_value).toBe(0)
    expect(client.job_count).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH + DELETE /api/clients — Update & Delete', () => {
  beforeEach(() => { resetDB(); vi.clearAllMocks() })

  // L-62
  it('L-62 updates only allowed fields, ignores unknown fields', async () => {
    seedClient('client-1', { full_name: 'Old Name', phone: null })

    const { PATCH } = await import('@/app/api/clients/route')
    const res = await PATCH(req('PATCH', 'http://localhost/api/clients', {
      id: 'client-1',
      full_name: 'New Name',
      phone: '555-9999',
      secret_field: 'should be ignored',  // not in allowed list
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.client.full_name).toBe('New Name')
    expect(body.client.phone).toBe('555-9999')
    expect((body.client as any).secret_field).toBeUndefined()
  })

  // L-63
  it('L-63 deletes client and returns success', async () => {
    seedClient('client-1')
    const { DELETE } = await import('@/app/api/clients/route')
    const res = await DELETE(req('DELETE', 'http://localhost/api/clients?id=client-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(db.clients['client-1']).toBeUndefined()
  })

  // L-64
  it('L-64 delete without id returns 400', async () => {
    const { DELETE } = await import('@/app/api/clients/route')
    const res = await DELETE(req('DELETE', 'http://localhost/api/clients'))
    expect(res.status).toBe(400)
  })
})
