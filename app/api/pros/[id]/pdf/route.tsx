import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image as PDFImage, Font } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', backgroundColor: '#ffffff', padding: 40 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: '#0F6E56' },
  logo:        { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0F6E56' },
  logoSub:     { fontSize: 9, color: '#888', marginTop: 2 },
  docTitle:    { fontSize: 11, color: '#555', textAlign: 'right' },
  timestamp:   { fontSize: 8, color: '#aaa', textAlign: 'right', marginTop: 3 },
  proSection:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 16 },
  proName:     { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 4 },
  proTrade:    { fontSize: 13, color: '#0F6E56', marginBottom: 3 },
  proMeta:     { fontSize: 10, color: '#666', marginBottom: 2 },
  verified:    { fontSize: 10, color: '#0F6E56', marginTop: 6, fontFamily: 'Helvetica-Bold' },
  sectionHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0F6E56', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 20, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#E1F5EE' },
  credCard:    { backgroundColor: '#F9FAFB', borderRadius: 6, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  credTitle:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 3 },
  credMeta:    { fontSize: 9, color: '#666', marginBottom: 2 },
  statusActive:{ fontSize: 9, color: '#3B6D11', fontFamily: 'Helvetica-Bold' },
  statusWarn:  { fontSize: 9, color: '#854F0B', fontFamily: 'Helvetica-Bold' },
  statusExp:   { fontSize: 9, color: '#A32D2D', fontFamily: 'Helvetica-Bold' },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer:      { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  footerText:  { fontSize: 8, color: '#aaa', textAlign: 'center' },
})

function statusStyle(s: string) {
  if (s === 'active') return styles.statusActive
  if (s === 'expiring_soon') return styles.statusWarn
  return styles.statusExp
}
function statusLabel(s: string) {
  if (s === 'active') return 'Active'
  if (s === 'expiring_soon') return 'Expiring Soon'
  return 'Expired'
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const sb = getSupabaseAdmin()

  const [{ data: pro }, { data: licenses }, { data: insurance }] = await Promise.all([
    sb.from('pros').select('*, trade_category:trade_categories(category_name)').eq('id', id).single(),
    sb.from('pro_licenses').select('*').eq('pro_id', id).order('is_primary', { ascending: false }),
    sb.from('pro_insurance').select('*').eq('pro_id', id).order('created_at', { ascending: false }).limit(1),
  ])

  if (!pro) return NextResponse.json({ error: 'Pro not found' }, { status: 404 })

  const firstName = pro.full_name.split(' ')[0]
  const location  = [pro.city, pro.state].filter(Boolean).join(', ')
  const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const profileUrl = `https://proguild.ai/pro/${id}`

  const doc = (
    <Document title={`${pro.full_name} — Credential Report`} author="ProGuild.ai">
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>ProGuild.ai</Text>
            <Text style={styles.logoSub}>Florida's Verified Trades Network</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Verified Credential Report</Text>
            <Text style={styles.timestamp}>Generated: {generatedAt}</Text>
            <Text style={styles.timestamp}>{profileUrl}</Text>
          </View>
        </View>

        {/* Pro Identity */}
        <View style={styles.proSection}>
          <View style={{ flex: 1 }}>
            <Text style={styles.proName}>{pro.full_name}</Text>
            {pro.trade_category?.category_name && <Text style={styles.proTrade}>{pro.trade_category.category_name}</Text>}
            {pro.business_name && <Text style={styles.proMeta}>{pro.business_name}</Text>}
            {location && <Text style={styles.proMeta}>{location}</Text>}
            {pro.years_experience && <Text style={styles.proMeta}>{pro.years_experience} yrs experience</Text>}
            {pro.phone && <Text style={styles.proMeta}>Phone: {pro.phone}</Text>}
            {pro.is_verified && <Text style={styles.verified}>✓ Verified by ProGuild.ai — Florida DBPR</Text>}
          </View>
        </View>

        {/* Licenses */}
        {(licenses || []).length > 0 && (
          <View>
            <Text style={styles.sectionHead}>Licenses & Certifications</Text>
            {(licenses || []).map((lic: any) => (
              <View key={lic.id} style={styles.credCard}>
                <View style={styles.row}>
                  <Text style={styles.credTitle}>{lic.trade_name}</Text>
                  <Text style={statusStyle(lic.license_status)}>{statusLabel(lic.license_status)}</Text>
                </View>
                <Text style={styles.credMeta}>License No: {lic.license_number}</Text>
                {lic.license_expiry_date && (
                  <Text style={styles.credMeta}>Expires: {new Date(lic.license_expiry_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                )}
                <Text style={styles.credMeta}>Verify: myfloridalicense.com/DBPR</Text>
              </View>
            ))}
          </View>
        )}

        {/* OSHA */}
        {pro.osha_card_type && (
          <View>
            <Text style={styles.sectionHead}>Safety Certification</Text>
            <View style={styles.credCard}>
              <View style={styles.row}>
                <Text style={styles.credTitle}>{pro.osha_card_type} Safety Certification</Text>
                <Text style={styles.statusActive}>Active</Text>
              </View>
              {pro.osha_card_expiry && (
                <Text style={styles.credMeta}>Expires: {new Date(pro.osha_card_expiry).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              )}
            </View>
          </View>
        )}

        {/* Insurance */}
        {insurance && insurance.length > 0 && (
          <View>
            <Text style={styles.sectionHead}>Insurance</Text>
            {insurance.map((ins: any) => (
              <View key={ins.id} style={styles.credCard}>
                <View style={styles.row}>
                  <Text style={styles.credTitle}>General Liability Insurance</Text>
                  <Text style={statusStyle(ins.insurance_status)}>{statusLabel(ins.insurance_status)}</Text>
                </View>
                {ins.insurer_name && <Text style={styles.credMeta}>Insurer: {ins.insurer_name}</Text>}
                {ins.policy_number && <Text style={styles.credMeta}>Policy: {ins.policy_number}</Text>}
                {ins.expiry_date && (
                  <Text style={styles.credMeta}>Expires: {new Date(ins.expiry_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            This report was generated by ProGuild.ai. License data sourced from the Florida Department of Business &amp; Professional Regulation (DBPR).
            Verify at myfloridalicense.com. Report generated for onboarding purposes only.
          </Text>
        </View>

      </Page>
    </Document>
  )

  try {
    const buffer = await renderToBuffer(doc)
    const slug   = pro.full_name.toLowerCase().replace(/\s+/g, '-')
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="proguild-${slug}-credentials.pdf"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
