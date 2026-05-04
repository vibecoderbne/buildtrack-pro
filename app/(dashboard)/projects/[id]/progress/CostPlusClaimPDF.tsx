import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CostPlusClaimDetail } from '@/app/actions/cost-plus-claims'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CostPlusClaimPDFProps {
  projectName:    string
  projectAddress: string
  builderName:    string
  orgName:        string
  generatedDate:  string
  detail:         CostPlusClaimDetail
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 9, color: '#111', paddingTop: 44, paddingBottom: 60, paddingHorizontal: 44 },
  headerGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft: { flex: 1 },
  orgName:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', marginBottom: 3 },
  headerMeta: { fontSize: 8, color: '#4b5563', lineHeight: 1.5 },
  divider:    { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 16 },
  titleBlock: { alignItems: 'center', marginBottom: 16 },
  title:      { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 3 },
  subtitle:   { fontSize: 10, color: '#4f46e5', fontFamily: 'Helvetica-Bold' },
  badge:      { fontSize: 8, color: '#4f46e5', marginTop: 4 },
  // Sections
  section:       { marginBottom: 16 },
  sectionTitle:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 6 },
  // Table
  table:    { borderWidth: 1, borderColor: '#d1d5db', marginBottom: 4, borderRadius: 2 },
  tHead:    { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
  tRow:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tRowAlt:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fafafa' },
  tSubtotal:{ flexDirection: 'row', backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#d1d5db' },
  th:       { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6b7280', padding: 5 },
  td:       { fontSize: 8, color: '#374151', padding: 5 },
  tdBold:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827', padding: 5 },
  // Totals block
  totalsBlock: { marginTop: 8, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 2 },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', padding: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  totalRowFinal: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#eff6ff' },
  totalLabel:  { fontSize: 8.5, color: '#374151' },
  totalValue:  { fontSize: 8.5, color: '#374151', textAlign: 'right' },
  totalLabelBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  totalValueBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827', textAlign: 'right' },
  markupRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 4, backgroundColor: '#fffbeb' },
  // Footer
  footer:    { position: 'absolute', bottom: 24, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerNote: { fontSize: 7.5, color: '#9ca3af', flex: 1 },
  pageNum:    { fontSize: 7.5, color: '#9ca3af', textAlign: 'right' },
  // Cols
  colDate:     { width: 52 },
  colName:     { flex: 3 },
  colType:     { width: 36 },
  colUnits:    { width: 36, textAlign: 'right' },
  colRate:     { width: 52, textAlign: 'right' },
  colAmount:   { width: 60, textAlign: 'right' },
  colDesc:     { flex: 3 },
  colInvNum:   { width: 50 },
  colExGst:    { width: 60, textAlign: 'right' },
  colGst:      { width: 50, textAlign: 'right' },
  colIncGst:   { width: 60, textAlign: 'right' },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

const CATEGORY_LABELS: Record<string, string> = { trade: 'Trade', materials: 'Materials', other: 'Other' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CostPlusClaimPDF({
  projectName, projectAddress, builderName, orgName, generatedDate, detail,
}: CostPlusClaimPDFProps) {
  const { claim, labourEntries, costInvoices, labourSubtotal, labourMarkup, labourTotalExGst, invoicesSubtotal, materialsMarkup, invoicesTotalExGst, grandTotalExGst, gst, grandTotalIncGst } = detail
  const labourMarkupPct    = claim.appliedLabourMarkup ?? 0
  const materialsMarkupPct = claim.appliedMaterialsMarkup ?? 0

  const invoicesByCategory = (['trade', 'materials', 'other'] as const).map(cat => ({
    cat,
    rows: costInvoices.filter(i => i.category === cat),
  })).filter(g => g.rows.length > 0)

  return (
    <Document title={`Payment Claim #${claim.claimNumber} — ${projectName}`} author={orgName}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.headerGrid}>
          <View style={S.headerLeft}>
            <Text style={S.orgName}>{orgName}</Text>
            <Text style={S.headerMeta}>Builder: {builderName}</Text>
            <Text style={S.headerMeta}>Site: {projectAddress}</Text>
            <Text style={S.headerMeta}>Period: {fmtDate(claim.periodStart)} – {fmtDate(claim.periodEnd)}</Text>
          </View>
        </View>
        <View style={S.divider} />

        {/* Title */}
        <View style={S.titleBlock}>
          <Text style={S.title}>Payment Claim #{claim.claimNumber}</Text>
          <Text style={S.subtitle}>{projectName}</Text>
          <Text style={S.badge}>Cost Plus</Text>
        </View>
        <View style={S.divider} />

        {/* Labour section */}
        {labourEntries.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Labour</Text>
            <View style={S.table}>
              <View style={S.tHead}>
                <Text style={[S.th, S.colDate]}>Date</Text>
                <Text style={[S.th, S.colName]}>Worker</Text>
                <Text style={[S.th, S.colType]}>Type</Text>
                <Text style={[S.th, S.colUnits]}>Units</Text>
                <Text style={[S.th, S.colRate]}>Rate</Text>
                <Text style={[S.th, S.colAmount]}>Amount</Text>
              </View>
              {labourEntries.map((e, idx) => (
                <View key={e.id} style={idx % 2 === 0 ? S.tRow : S.tRowAlt}>
                  <Text style={[S.td, S.colDate]}>{fmtDate(e.entry_date)}</Text>
                  <Text style={[S.td, S.colName]}>{e.worker_name}</Text>
                  <Text style={[S.td, S.colType]}>{e.rate_type === 'hourly' ? 'Hrly' : 'Daily'}</Text>
                  <Text style={[S.td, S.colUnits]}>{e.units}</Text>
                  <Text style={[S.td, S.colRate]}>{fmt(e.rate)}</Text>
                  <Text style={[S.td, S.colAmount]}>{fmt(e.amount)}</Text>
                </View>
              ))}
              <View style={S.tSubtotal}>
                <Text style={[S.tdBold, S.colDate, S.colName, { flex: 4 }]}>Labour subtotal</Text>
                <Text style={[S.tdBold, S.colAmount]}>{fmt(labourSubtotal)}</Text>
              </View>
            </View>
            {labourMarkupPct > 0 && (
              <View style={S.markupRow}>
                <Text style={{ fontSize: 8, color: '#92400e' }}>+ Labour markup ({labourMarkupPct}%)</Text>
                <Text style={{ fontSize: 8, color: '#92400e' }}>{fmt(labourMarkup)}</Text>
              </View>
            )}
            <View style={[S.totalRow, { borderTopWidth: 1, borderTopColor: '#d1d5db' }]}>
              <Text style={S.totalLabelBold}>Labour total (ex-GST)</Text>
              <Text style={S.totalValueBold}>{fmt(labourTotalExGst)}</Text>
            </View>
          </View>
        )}

        {/* Invoices section */}
        {costInvoices.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Invoices</Text>
            {invoicesByCategory.map(({ cat, rows }) => (
              <View key={cat} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 3 }}>{CATEGORY_LABELS[cat]}</Text>
                <View style={S.table}>
                  <View style={S.tHead}>
                    <Text style={[S.th, S.colDate]}>Date</Text>
                    <Text style={[S.th, S.colName]}>Supplier</Text>
                    <Text style={[S.th, S.colInvNum]}>Inv #</Text>
                    <Text style={[S.th, S.colExGst]}>Ex-GST</Text>
                    <Text style={[S.th, S.colGst]}>GST</Text>
                    <Text style={[S.th, S.colIncGst]}>Inc-GST</Text>
                  </View>
                  {rows.map((inv, idx) => (
                    <View key={inv.id} style={idx % 2 === 0 ? S.tRow : S.tRowAlt}>
                      <Text style={[S.td, S.colDate]}>{fmtDate(inv.invoice_date)}</Text>
                      <Text style={[S.td, S.colName]}>{inv.supplier_name}{inv.trade_category ? ` (${inv.trade_category})` : ''}</Text>
                      <Text style={[S.td, S.colInvNum]}>{inv.invoice_number ?? '—'}</Text>
                      <Text style={[S.td, S.colExGst]}>{fmt(inv.amount_ex_gst)}</Text>
                      <Text style={[S.td, S.colGst]}>{fmt(inv.gst_amount)}</Text>
                      <Text style={[S.td, S.colIncGst]}>{fmt(inv.amount_inc_gst)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            <View style={[S.tSubtotal, { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 2, paddingVertical: 4, paddingHorizontal: 5 }]}>
              <Text style={[S.tdBold, { flex: 1 }]}>Invoices subtotal (ex-GST)</Text>
              <Text style={S.tdBold}>{fmt(invoicesSubtotal)}</Text>
            </View>
            {materialsMarkupPct > 0 && (
              <View style={S.markupRow}>
                <Text style={{ fontSize: 8, color: '#92400e' }}>+ Materials & trades markup ({materialsMarkupPct}%)</Text>
                <Text style={{ fontSize: 8, color: '#92400e' }}>{fmt(materialsMarkup)}</Text>
              </View>
            )}
            <View style={[S.totalRow, { borderTopWidth: 1, borderTopColor: '#d1d5db' }]}>
              <Text style={S.totalLabelBold}>Invoices total (ex-GST)</Text>
              <Text style={S.totalValueBold}>{fmt(invoicesTotalExGst)}</Text>
            </View>
          </View>
        )}

        {/* Totals block */}
        <View style={S.totalsBlock}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Grand total ex-GST</Text>
            <Text style={S.totalValue}>{fmt(grandTotalExGst)}</Text>
          </View>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>GST (10%)</Text>
            <Text style={S.totalValue}>{fmt(gst)}</Text>
          </View>
          <View style={S.totalRowFinal}>
            <Text style={S.totalLabelBold}>Grand total inc-GST</Text>
            <Text style={S.totalValueBold}>{fmt(grandTotalIncGst)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerNote}>Generated {generatedDate} · {projectName}</Text>
          <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
