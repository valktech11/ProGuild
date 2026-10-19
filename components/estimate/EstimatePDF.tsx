import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { computeMilestones, computeHVACMilestones } from '@/lib/estimates/milestones'

// ── Types ─────────────────────────────────────────────────────────────────────
type PDFItem = {
  id: string
  name: string
  description: string
  qty: number
  unit_price: number
  amount: number
}

export type PDFEstimate = {
  estimate_number: string
  status: string
  lead_name: string
  lead_source: string
  trade: string
  created_at: string
  valid_until: string
  subtotal: number
  discount: number
  discount_type?: '$' | '%'
  tax_rate: number
  tax_amount: number
  total: number
  deposit_percent: number
  require_deposit: boolean
  terms: string
  notes?: string
  contact_phone?: string
  contact_email?: string
  items: PDFItem[]
  pro_name?: string
  pro_trade?: string
  pro_city?: string
  pro_state?: string
  pro_phone?: string
  // trade slug drives milestone style (roofing = 30/40/30, hvac = 50/50, other = deposit box)
  trade_slug?: string
  // Insurance claim panel
  insurance_claim?:   boolean
  approved_amount?:   number | null
  supplement_amount?: number | null
  deductible?:        number | null
  claim_status?:      string | null
  insurance_company?: string | null
  claim_number?:      string | null
  adjuster_name?:     string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// ── Styles ─────────────────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const NAVY   = '#111827'
const BODY   = '#374151'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'
const CREAM  = '#F9FAFB'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: BODY,
    backgroundColor: '#FFFFFF',
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: `1px solid ${BORDER}`,
  },
  brandName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: TEAL, letterSpacing: 0.5 },
  brandSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  estNumber: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right' },
  statusPill: {
    fontSize: 7.5, fontFamily: 'Helvetica-Bold',
    color: TEAL, backgroundColor: '#F0FDFA',
    paddingHorizontal: 7, paddingVertical: 2.5,
    borderRadius: 99, alignSelf: 'flex-end', marginTop: 4,
  },
  metaLine: { fontSize: 8, color: MUTED, textAlign: 'right', marginTop: 2 },
  billSection: { flexDirection: 'row', gap: 48, marginBottom: 24 },
  billBlock: { flex: 1 },
  billLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  billName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  billDetail: { fontSize: 8.5, color: MUTED, marginBottom: 1.5 },
  table: { marginBottom: 8 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: CREAM,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottom: `1px solid ${BORDER}`,
  },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  colItem: { flex: 3 },
  colQty: { flex: 0.8 },
  colPrice: { flex: 1.2 },
  colAmount: { flex: 1.2 },
  thText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.7 },
  itemName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  itemDesc: { fontSize: 8, color: MUTED, marginTop: 1.5 },
  cellText: { fontSize: 9, color: BODY },
  amountText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  totalsSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, marginBottom: 24 },
  totalsBox: { width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalDivider: { borderTop: `1px solid ${BORDER}`, marginVertical: 4 },
  totalLabel: { fontSize: 9, color: MUTED },
  totalValue: { fontSize: 9, color: BODY },
  totalDiscountValue: { fontSize: 9, color: '#16A34A', fontFamily: 'Helvetica-Bold' },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: TEAL },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: TEAL },
  depositBox: {
    backgroundColor: '#F0FDFA',
    borderLeft: `3px solid ${TEAL}`,
    borderRadius: 6,
    padding: 12,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depositLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL },
  depositSub: { fontSize: 8, color: MUTED, marginTop: 2 },
  depositAmount: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: TEAL },
  // Milestone table (roofing 30/40/30, hvac 50/50)
  milestoneSection: { marginBottom: 24 },
  milestoneHeader: {
    flexDirection: 'row',
    backgroundColor: CREAM,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 2,
  },
  milestoneRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottom: `1px solid ${BORDER}`,
    alignItems: 'center',
  },
  colMilestoneName: { flex: 2.5 },
  colMilestonePct:  { flex: 0.8 },
  colMilestoneWhen: { flex: 2 },
  colMilestoneAmt:  { flex: 1.2 },
  mthText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.7 },
  mName:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  mPct:    { fontSize: 8.5, color: MUTED },
  mWhen:   { fontSize: 8.5, color: MUTED },
  mAmt:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL, textAlign: 'right' },
  // Insurance claim panel
  insuranceSection: {
    borderLeft: `3px solid #F59E0B`,
    borderRadius: 6,
    backgroundColor: '#FFFBEB',
    padding: 12,
    marginBottom: 24,
  },
  insuranceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  insuranceTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.8 },
  insurancePill: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF', backgroundColor: '#16A34A',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 99,
  },
  insuranceMeta: { fontSize: 8, color: MUTED, marginLeft: 4 },
  insuranceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottom: `1px solid #FDE68A` },
  insuranceRowLast: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7, paddingBottom: 2 },
  insuranceLabel: { fontSize: 9, color: BODY },
  insuranceValue: { fontSize: 9, color: BODY },
  insuranceValueGreen: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#16A34A' },
  insuranceValueOrange: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#D97706' },
  insuranceBreakdown: { fontSize: 7.5, color: MUTED, marginTop: 1, textAlign: 'right' },
  insuranceAdjuster: { fontSize: 8, color: MUTED, marginTop: 8 },
  termsSection: { marginBottom: 24 },
  sectionLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  termsText: { fontSize: 8.5, color: MUTED, lineHeight: 1.6 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 10,
  },
  footerText: { fontSize: 7.5, color: MUTED },
  footerBrand: { fontSize: 7.5, color: TEAL, fontFamily: 'Helvetica-Bold' },
})

// ── Inner page content ─────────────────────────────────────────────────────────
function EstimatePage({ estimate }: { estimate: PDFEstimate }) {
  const depositAmount = Math.round(estimate.total * (estimate.deposit_percent / 100) * 100) / 100
  const statusLabel = estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)
  // Insurance claim panel — only shown when claim exists and supplement/approved is set
  const isInsuranceClaim = estimate.insurance_claim === true
  const claimStatus      = estimate.claim_status ?? ''
  const showInsurance    = isInsuranceClaim && (claimStatus === 'Approved' || claimStatus === 'Supplement Approved')
  const approved         = Number(estimate.approved_amount)   || 0
  const supplement       = Number(estimate.supplement_amount) || 0
  const deductible       = Number(estimate.deductible)        || 0
  const insurancePays    = Math.max(approved + supplement - deductible, 0)
  const outOfPocket      = Math.max((estimate.total || 0) - insurancePays, 0)
  const hasSupp          = supplement > 0 && claimStatus === 'Supplement Approved'

  const tradeSlug = estimate.trade_slug ?? estimate.pro_trade ?? ''
  const isRoofing = tradeSlug.includes('roof')
  const isHVAC    = tradeSlug.includes('hvac') || tradeSlug.includes('air-condition')
  // Compute milestones from locked schedule — never from stored deposit_percent
  const milestones = isRoofing
    ? computeMilestones(estimate.total)
    : isHVAC
    ? computeHVACMilestones(estimate.total)
    : null

  return (
    <Page size="A4" style={s.page}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.brandName}>ProGuild</Text>
          {estimate.pro_name ? <Text style={s.brandSub}>{estimate.pro_name}</Text> : null}
          {estimate.pro_trade ? <Text style={s.brandSub}>{estimate.pro_trade}</Text> : null}
          {(estimate.pro_city || estimate.pro_state)
            ? <Text style={s.brandSub}>{[estimate.pro_city, estimate.pro_state].filter(Boolean).join(', ')}</Text>
            : null}
          {estimate.pro_phone ? <Text style={s.brandSub}>{estimate.pro_phone}</Text> : null}
        </View>
        <View>
          <Text style={s.estNumber}>Estimate #{estimate.estimate_number}</Text>
          <Text style={s.statusPill}>{statusLabel}</Text>
          <Text style={s.metaLine}>Created: {fmtDate(estimate.created_at)}</Text>
          <Text style={s.metaLine}>Valid Until: {fmtDate(estimate.valid_until)}</Text>
        </View>
      </View>

      {/* Bill To / Job */}
      <View style={s.billSection}>
        <View style={s.billBlock}>
          <Text style={s.billLabel}>Bill To</Text>
          <Text style={s.billName}>{estimate.lead_name}</Text>
          {estimate.contact_phone ? <Text style={s.billDetail}>{estimate.contact_phone}</Text> : null}
          {estimate.contact_email ? <Text style={s.billDetail}>{estimate.contact_email}</Text> : null}
        </View>
        <View style={s.billBlock}>
          <Text style={s.billLabel}>Job Details</Text>
          {estimate.trade ? <Text style={s.billName}>{estimate.trade}</Text> : null}
          {estimate.lead_source ? <Text style={s.billDetail}>Source: {estimate.lead_source}</Text> : null}
        </View>
      </View>

      {/* Line Items */}
      <View style={s.table}>
        <View style={s.tableHeader}>
          <View style={s.colItem}><Text style={s.thText}>Item</Text></View>
          <View style={s.colQty}><Text style={s.thText}>Qty</Text></View>
          <View style={s.colPrice}><Text style={[s.thText, { textAlign: 'right' }]}>Unit Price</Text></View>
          <View style={s.colAmount}><Text style={[s.thText, { textAlign: 'right' }]}>Amount</Text></View>
        </View>
        {estimate.items.map((item, i) => (
          <View key={item.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <View style={s.colItem}>
              <Text style={s.itemName}>{item.name}</Text>
              {item.description ? <Text style={s.itemDesc}>{item.description}</Text> : null}
            </View>
            <View style={s.colQty}><Text style={s.cellText}>{item.qty}</Text></View>
            <View style={s.colPrice}><Text style={[s.cellText, { textAlign: 'right' }]}>{fmt(item.unit_price)}</Text></View>
            <View style={s.colAmount}><Text style={[s.amountText, { textAlign: 'right' }]}>{fmt(item.amount)}</Text></View>
          </View>
        ))}
      </View>

      {/* Totals */}
      <View style={s.totalsSection}>
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmt(estimate.subtotal)}</Text>
          </View>
          {estimate.discount > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>
                Discount{estimate.discount_type === '%'
                  ? ` (${Math.round(estimate.discount / Math.max(estimate.subtotal, 1) * 100 * 100) / 100}%)`
                  : ''}
              </Text>
              <Text style={s.totalDiscountValue}>−{fmt(estimate.discount)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Sales Tax ({estimate.tax_rate}%)</Text>
            <Text style={s.totalValue}>{fmt(estimate.tax_amount)}</Text>
          </View>
          <View style={s.totalDivider} />
          <View style={s.totalRow}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>{fmt(estimate.total)}</Text>
          </View>
        </View>
      </View>

      {/* Insurance Claim Panel — only when approved/supplement approved */}
      {showInsurance && (
        <View style={s.insuranceSection}>
          {/* Header row */}
          <View style={s.insuranceHeader}>
            <Text style={s.insuranceTitle}>Insurance Claim</Text>
            <Text style={s.insurancePill}>{claimStatus}</Text>
            {(estimate.insurance_company || estimate.claim_number) && (
              <Text style={s.insuranceMeta}>
                {[estimate.insurance_company, estimate.claim_number ? `Claim #${estimate.claim_number}` : null].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>

          {/* Full job cost */}
          <View style={s.insuranceRow}>
            <Text style={s.insuranceLabel}>Full job cost</Text>
            <Text style={s.insuranceValue}>{fmt(estimate.total || 0)}</Text>
          </View>

          {/* Insurance pays homeowner */}
          <View style={s.insuranceRow}>
            <View>
              <Text style={s.insuranceLabel}>Insurance pays homeowner</Text>
            </View>
            <View>
              <Text style={s.insuranceValueGreen}>{fmt(insurancePays)}</Text>
              <Text style={s.insuranceBreakdown}>
                {fmt(approved)}{hasSupp ? ` + ${fmt(supplement)}` : ''} − {fmt(deductible)}
              </Text>
            </View>
          </View>

          {/* Homeowner out of pocket */}
          <View style={s.insuranceRowLast}>
            <Text style={[s.insuranceLabel, { fontFamily: 'Helvetica-Bold', color: NAVY }]}>Homeowner out of pocket</Text>
            <Text style={s.insuranceValueOrange}>{fmt(outOfPocket)}</Text>
          </View>

          {estimate.adjuster_name && (
            <Text style={s.insuranceAdjuster}>Adjuster: {estimate.adjuster_name}</Text>
          )}
        </View>
      )}

      {/* Payment Schedule — milestone table for roofing/hvac, deposit box fallback for others */}
      {milestones ? (
        <View style={s.milestoneSection}>
          <Text style={[s.sectionLabel, { marginBottom: 6 }]}>Payment Schedule</Text>
          <View style={s.milestoneHeader}>
            <View style={s.colMilestoneName}><Text style={s.mthText}>Milestone</Text></View>
            <View style={s.colMilestonePct}><Text style={s.mthText}>%</Text></View>
            <View style={s.colMilestoneWhen}><Text style={s.mthText}>Due When</Text></View>
            <View style={s.colMilestoneAmt}><Text style={[s.mthText, { textAlign: 'right' }]}>Amount</Text></View>
          </View>
          {milestones.map((m) => (
            <View key={m.id} style={s.milestoneRow}>
              <View style={s.colMilestoneName}><Text style={s.mName}>{m.name}</Text></View>
              <View style={s.colMilestonePct}><Text style={s.mPct}>{m.pct}%</Text></View>
              <View style={s.colMilestoneWhen}><Text style={s.mWhen}>{m.due_when}</Text></View>
              <View style={s.colMilestoneAmt}><Text style={s.mAmt}>{fmt(m.amount)}</Text></View>
            </View>
          ))}
        </View>
      ) : estimate.require_deposit ? (
        <View style={s.depositBox}>
          <View>
            <Text style={s.depositLabel}>Deposit Required to Begin Work</Text>
            <Text style={s.depositSub}>{estimate.deposit_percent}% of total — due before job starts</Text>
          </View>
          <Text style={s.depositAmount}>{fmt(depositAmount)}</Text>
        </View>
      ) : null}

      {/* Terms */}
      {estimate.terms ? (
        <View style={s.termsSection}>
          <Text style={s.sectionLabel}>Terms & Conditions</Text>
          <Text style={s.termsText}>{estimate.terms}</Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerText}>
          {estimate.pro_name ? `${estimate.pro_name} · ` : ''}Generated {fmtDate(new Date().toISOString())}
        </Text>
        <Text style={s.footerBrand}>Powered by ProGuild.ai</Text>
      </View>
    </Page>
  )
}

// ── Named export used by API route ─────────────────────────────────────────────
export function EstimateDocumentPDF({ estimate }: { estimate: PDFEstimate }) {
  return (
    <Document>
      <EstimatePage estimate={estimate} />
    </Document>
  )
}
