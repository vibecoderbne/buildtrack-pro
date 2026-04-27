import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SchedulePhase {
  name: string
  tasks: { name: string; contractValue: number }[]
}

export interface ScheduleOfWorksPDFProps {
  projectName:  string
  projectAddress: string
  contractDate: string
  builderName:  string
  homeownerName: string | null
  orgName:      string
  phases:       SchedulePhase[]
  grandTotal:   number
  generatedDate: string
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111',
    paddingTop: 44,
    paddingBottom: 60,
    paddingHorizontal: 44,
  },
  // Header block
  headerGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft: { flex: 1 },
  orgName:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', marginBottom: 3 },
  headerMeta: { fontSize: 8, color: '#4b5563', lineHeight: 1.5 },
  // Title block
  titleBlock: { alignItems: 'center', marginBottom: 16 },
  title:      { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 3 },
  subtitle:   { fontSize: 10, color: '#4f46e5', fontFamily: 'Helvetica-Bold' },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 16 },
  // Table
  table:    { borderWidth: 1, borderColor: '#d1d5db', marginBottom: 20, borderRadius: 2 },
  tHead:    { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
  tPhase:   { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
  tRow:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tRowAlt:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fafafa' },
  tTotal:   { flexDirection: 'row', backgroundColor: '#eff6ff', borderTopWidth: 1.5, borderTopColor: '#c7d2fe' },
  th:       { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6b7280', padding: 6 },
  td:       { fontSize: 8.5, color: '#374151', padding: 6 },
  tdBold:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111827', padding: 6 },
  tdPhase:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#374151', padding: 6, flex: 1 },
  colTask:  { flex: 5 },
  colPrice: { flex: 2, textAlign: 'right' },
  // Signature block
  sigSection: { marginTop: 32, marginBottom: 8 },
  sigTitle:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 20 },
  sigRow:     { flexDirection: 'row', gap: 48 },
  sigBlock:   { flex: 1 },
  sigLine:    { borderTopWidth: 1, borderTopColor: '#374151', marginBottom: 4 },
  sigLabel:   { fontSize: 8, color: '#374151', marginBottom: 16 },
  sigDateLine: { borderTopWidth: 1, borderTopColor: '#9ca3af', marginBottom: 4 },
  sigDateLabel: { fontSize: 7.5, color: '#9ca3af' },
  // Footer
  footer: {
    position: 'absolute', bottom: 24, left: 44, right: 44,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  footerNote: { fontSize: 7.5, color: '#9ca3af', flex: 1 },
  pageNum:    { fontSize: 7.5, color: '#9ca3af', textAlign: 'right' },
})

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

// ── Component ──────────────────────────────────────────────────────────────────

export default function ScheduleOfWorksPDF({
  projectName, projectAddress, contractDate, builderName, homeownerName,
  orgName, phases, grandTotal, generatedDate,
}: ScheduleOfWorksPDFProps) {
  return (
    <Document title={`Schedule of Works — ${projectName}`} author={orgName}>
      <Page size="A4" style={S.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={S.headerGrid}>
          <View style={S.headerLeft}>
            <Text style={S.orgName}>{orgName}</Text>
            <Text style={S.headerMeta}>Builder: {builderName}</Text>
            {homeownerName && <Text style={S.headerMeta}>Homeowner: {homeownerName}</Text>}
            <Text style={S.headerMeta}>Site: {projectAddress}</Text>
            <Text style={S.headerMeta}>Contract date: {fmtDate(contractDate)}</Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <View style={S.titleBlock}>
          <Text style={S.title}>Schedule of Works</Text>
          <Text style={S.subtitle}>Annexure to Building Contract</Text>
          <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 4 }}>{projectName}</Text>
        </View>

        <View style={S.divider} />

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <View style={S.table}>

          {/* Head */}
          <View style={S.tHead}>
            <Text style={[S.th, S.colTask]}>Task</Text>
            <Text style={[S.th, S.colPrice]}>Price (AUD)</Text>
          </View>

          {/* Phase sections */}
          {phases.map((phase) => (
            <View key={phase.name}>
              <View style={S.tPhase}>
                <Text style={S.tdPhase}>{phase.name.toUpperCase()}</Text>
              </View>
              {phase.tasks.map((task, idx) => (
                <View key={`${phase.name}-${idx}`} style={idx % 2 === 0 ? S.tRow : S.tRowAlt}>
                  <Text style={[S.td, S.colTask, { paddingLeft: 14 }]}>{task.name}</Text>
                  <Text style={[S.td, S.colPrice]}>{fmt(task.contractValue)}</Text>
                </View>
              ))}
            </View>
          ))}

          {/* Totals row */}
          <View style={S.tTotal}>
            <Text style={[S.tdBold, S.colTask]}>Total Contract Value</Text>
            <Text style={[S.tdBold, S.colPrice]}>{fmt(grandTotal)}</Text>
          </View>

        </View>

        {/* ── Signature block ─────────────────────────────────────────────── */}
        <View style={S.sigSection}>
          <Text style={S.sigTitle}>Executed as a deed by the parties</Text>
          <View style={S.sigRow}>
            <View style={S.sigBlock}>
              <View style={S.sigLine} />
              <Text style={S.sigLabel}>Builder</Text>
              <View style={S.sigDateLine} />
              <Text style={S.sigDateLabel}>Date</Text>
            </View>
            <View style={S.sigBlock}>
              <View style={S.sigLine} />
              <Text style={S.sigLabel}>Homeowner</Text>
              <View style={S.sigDateLine} />
              <Text style={S.sigDateLabel}>Date</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerNote}>
            Generated {generatedDate} · {projectName}
          </Text>
          <Text
            style={S.pageNum}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
