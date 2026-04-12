import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { ClaimHistoryItem, ClaimLineItemDetail } from '@/app/actions/progress'

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111',
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
  },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  orgBlock: { flex: 1 },
  orgName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', marginBottom: 2 },
  orgDetail: { fontSize: 8, color: '#6b7280', lineHeight: 1.4 },
  claimBadge: { alignItems: 'flex-end' },
  claimTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1e1b4b' },
  claimNum: { fontSize: 10, color: '#4f46e5', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 12 },
  // Project / claim info grid
  infoGrid: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 9, color: '#111827', fontFamily: 'Helvetica-Bold' },
  infoSub: { fontSize: 8, color: '#4b5563' },
  // Period banner
  periodBanner: {
    backgroundColor: '#eef2ff',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodLabel: { fontSize: 8, color: '#4f46e5', fontFamily: 'Helvetica-Bold' },
  periodValue: { fontSize: 9, color: '#1e1b4b', fontFamily: 'Helvetica-Bold' },
  // Table
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 6 },
  table: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 16 },
  tHead: { flexDirection: 'row', backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fafafa' },
  tPhaseRow: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tTotalRow: { flexDirection: 'row', backgroundColor: '#eff6ff', borderTopWidth: 1.5, borderTopColor: '#c7d2fe' },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', padding: 5 },
  td: { fontSize: 8, color: '#374151', padding: 5 },
  tdBold: { fontSize: 8, color: '#111827', fontFamily: 'Helvetica-Bold', padding: 5 },
  // Column widths
  colTask:     { flex: 4 },
  colRight:    { flex: 2, textAlign: 'right' },
  colRightNarrow: { flex: 1.5, textAlign: 'right' },
  // Summary
  summaryBox: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 16,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '6 10', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  summaryLabel: { fontSize: 9, color: '#4b5563' },
  summaryValue: { fontSize: 9, color: '#111827' },
  summaryLabelBold: { fontSize: 9, color: '#111827', fontFamily: 'Helvetica-Bold' },
  summaryValueBold: { fontSize: 9, color: '#111827', fontFamily: 'Helvetica-Bold' },
  summaryHighlight: { flexDirection: 'row', justifyContent: 'space-between', padding: '8 10', backgroundColor: '#eff6ff' },
  summaryHighLabel: { fontSize: 10, color: '#1e1b4b', fontFamily: 'Helvetica-Bold' },
  summaryHighValue: { fontSize: 10, color: '#4338ca', fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: {
    position: 'absolute', bottom: 24, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  footerNote: { fontSize: 7.5, color: '#9ca3af', flex: 1 },
  signatureLine: { width: 140 },
  signatureRule: { borderTopWidth: 1, borderTopColor: '#d1d5db', marginBottom: 3 },
  signatureLabel: { fontSize: 7, color: '#9ca3af', textAlign: 'center' },
  pageNum: { fontSize: 7, color: '#d1d5db', textAlign: 'right' },
})

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const pct = (n: number) => `${n.toFixed(1)}%`

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ClaimPDFProps {
  claim: ClaimHistoryItem
  lineItems: ClaimLineItemDetail[]
  claimSummary: {
    valueToDate: number
    previousClaims: number
    thisClaimGross: number
    retention: number
    netPayable: number
    retentionPct: number
  }
  projectName: string
  projectAddress: string
  orgName: string
  orgAbn: string | null
  orgAddress: string | null
  paymentTermsDays: number
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ClaimPDF({
  claim,
  lineItems,
  claimSummary,
  projectName,
  projectAddress,
  orgName,
  orgAbn,
  orgAddress,
  paymentTermsDays,
}: ClaimPDFProps) {
  // Group line items by phase
  const phases = [...new Set(lineItems.map((li) => li.phaseName))]

  return (
    <Document
      title={`Payment Claim ${claim.claimNumber} — ${projectName}`}
      author={orgName}
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={S.header}>
          <View style={S.orgBlock}>
            <Text style={S.orgName}>{orgName}</Text>
            {orgAbn && <Text style={S.orgDetail}>ABN: {orgAbn}</Text>}
            {orgAddress && <Text style={S.orgDetail}>{orgAddress}</Text>}
          </View>
          <View style={S.claimBadge}>
            <Text style={S.claimTitle}>Payment Claim</Text>
            <Text style={S.claimNum}>#{String(claim.claimNumber).padStart(3, '0')}</Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* ── Project & Claim Info ────────────────────────────────────────── */}
        <View style={S.infoGrid}>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Project</Text>
            <Text style={S.infoValue}>{projectName}</Text>
            <Text style={S.infoSub}>{projectAddress}</Text>
          </View>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Claim Date</Text>
            <Text style={S.infoValue}>{fmtDate(claim.periodEnd)}</Text>
          </View>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Status</Text>
            <Text style={S.infoValue}>{claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}</Text>
          </View>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Payment Terms</Text>
            <Text style={S.infoValue}>{paymentTermsDays} business days</Text>
            <Text style={S.infoSub}>Security of Payment Act</Text>
          </View>
        </View>

        {/* ── Period Banner ───────────────────────────────────────────────── */}
        <View style={S.periodBanner}>
          <Text style={S.periodLabel}>CLAIM PERIOD</Text>
          <Text style={S.periodValue}>
            {fmtDate(claim.periodStart)} — {fmtDate(claim.periodEnd)}
          </Text>
        </View>

        {/* ── Line Items Table ────────────────────────────────────────────── */}
        <Text style={S.sectionTitle}>Progress Claim — Line Items</Text>
        <View style={S.table}>
          {/* Head */}
          <View style={S.tHead}>
            <Text style={[S.th, S.colTask]}>Task</Text>
            <Text style={[S.th, S.colRight]}>Contract Value</Text>
            <Text style={[S.th, S.colRightNarrow]}>Prev %</Text>
            <Text style={[S.th, S.colRightNarrow]}>Curr %</Text>
            <Text style={[S.th, S.colRight]}>Value to Date</Text>
            <Text style={[S.th, S.colRight]}>Previously Claimed</Text>
            <Text style={[S.th, S.colRight]}>This Claim</Text>
          </View>

          {phases.map((phaseName, pIdx) => {
            const phaseTasks = lineItems.filter((li) => li.phaseName === phaseName)
            return (
              <View key={phaseName}>
                {/* Phase row */}
                <View style={S.tPhaseRow}>
                  <Text style={[S.td, { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#374151' }]}>
                    {phaseName}
                  </Text>
                </View>
                {/* Task rows */}
                {phaseTasks.map((li, idx) => (
                  <View key={li.id} style={idx % 2 === 0 ? S.tRow : S.tRowAlt}>
                    <Text style={[S.td, S.colTask, { paddingLeft: 12 }]}>{li.taskName}</Text>
                    <Text style={[S.td, S.colRight]}>{fmt(li.contractValue)}</Text>
                    <Text style={[S.td, S.colRightNarrow]}>{pct(li.previousPct)}</Text>
                    <Text style={[S.td, S.colRightNarrow]}>{pct(li.currentPct)}</Text>
                    <Text style={[S.td, S.colRight]}>{fmt(li.valueToDate)}</Text>
                    <Text style={[S.td, S.colRight]}>{fmt(li.valuePrevious)}</Text>
                    <Text style={[S.td, S.colRight]}>{fmt(li.thisClaimValue)}</Text>
                  </View>
                ))}
              </View>
            )
          })}

          {/* Total row */}
          <View style={S.tTotalRow}>
            <Text style={[S.tdBold, S.colTask]}>Total</Text>
            <Text style={[S.tdBold, S.colRight]}>
              {fmt(lineItems.reduce((s, li) => s + li.contractValue, 0))}
            </Text>
            <Text style={[S.td, S.colRightNarrow]} />
            <Text style={[S.td, S.colRightNarrow]} />
            <Text style={[S.tdBold, S.colRight]}>
              {fmt(lineItems.reduce((s, li) => s + li.valueToDate, 0))}
            </Text>
            <Text style={[S.tdBold, S.colRight]}>
              {fmt(lineItems.reduce((s, li) => s + li.valuePrevious, 0))}
            </Text>
            <Text style={[S.tdBold, S.colRight]}>
              {fmt(lineItems.reduce((s, li) => s + li.thisClaimValue, 0))}
            </Text>
          </View>
        </View>

        {/* ── Summary ─────────────────────────────────────────────────────── */}
        <Text style={S.sectionTitle}>Claim Summary</Text>
        <View style={S.summaryBox}>
          <View style={S.summaryRow}>
            <Text style={S.summaryLabel}>Value of work to date</Text>
            <Text style={S.summaryValue}>{fmt(claimSummary.valueToDate)}</Text>
          </View>
          <View style={S.summaryRow}>
            <Text style={S.summaryLabel}>Less previous claims (submitted / approved / paid)</Text>
            <Text style={S.summaryValue}>({fmt(claimSummary.previousClaims)})</Text>
          </View>
          <View style={S.summaryRow}>
            <Text style={S.summaryLabelBold}>This claim (gross)</Text>
            <Text style={S.summaryValueBold}>{fmt(claimSummary.thisClaimGross)}</Text>
          </View>
          <View style={S.summaryRow}>
            <Text style={S.summaryLabel}>Less retention ({claimSummary.retentionPct}%)</Text>
            <Text style={S.summaryValue}>({fmt(claimSummary.retention)})</Text>
          </View>
          <View style={S.summaryHighlight}>
            <Text style={S.summaryHighLabel}>Net Payable</Text>
            <Text style={S.summaryHighValue}>{fmt(claimSummary.netPayable)}</Text>
          </View>
        </View>

        {/* ── Payment Terms Note ──────────────────────────────────────────── */}
        <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 12 }}>
          Payment is due within {paymentTermsDays} business days of this claim, in accordance with the
          Security of Payment Act and the terms of the contract.
        </Text>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerNote}>
            {orgName} · {projectName} · Claim #{String(claim.claimNumber).padStart(3, '0')}
          </Text>
          <View style={S.signatureLine}>
            <View style={S.signatureRule} />
            <Text style={S.signatureLabel}>Authorised Signature / Date</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
