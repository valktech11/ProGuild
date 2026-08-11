import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'

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

      {/* Deposit */}
      {estimate.require_deposit && (
        <View style={s.depositBox}>
          <View>
            <Text style={s.depositLabel}>Deposit Required to Begin Work</Text>
            <Text style={s.depositSub}>{estimate.deposit_percent}% of total — due before job starts</Text>
          </View>
          <Text style={s.depositAmount}>{fmt(depositAmount)}</Text>
        </View>
      )}

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
