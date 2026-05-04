'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import {
  addLabourEntry, updateLabourEntry, deleteLabourEntry,
  addCostInvoice, updateCostInvoice, deleteCostInvoice,
  getInvoiceFileUrl,
} from '@/app/actions/costs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabourEntry {
  id: string
  entry_date: string
  worker_name: string
  description: string | null
  rate_type: 'hourly' | 'daily'
  units: number
  rate: number
  amount: number
  claim_period_id: string | null
}

interface CostInvoice {
  id: string
  invoice_date: string
  supplier_name: string
  category: 'trade' | 'materials' | 'other'
  trade_category: string | null
  invoice_number: string | null
  description: string | null
  amount_ex_gst: number
  gst_amount: number
  amount_inc_gst: number
  file_url: string | null
  file_name: string | null
  claim_period_id: string | null
}

interface ClaimPeriod {
  id: string
  claim_number: number
  claim_period_start: string
  claim_period_end: string
}

interface Props {
  project: {
    id: string
    name: string
    start_date: string
    default_hourly_rate: number | null
    default_daily_rate: number | null
  }
  initialLabourEntries: LabourEntry[]
  initialCostInvoices: CostInvoice[]
  claimPeriods: ClaimPeriod[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(n)

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const today = () => new Date().toISOString().split('T')[0]

const inputStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

const CATEGORY_LABELS: Record<string, string> = {
  trade: 'Trade', materials: 'Materials', other: 'Other',
}

// ── Empty form factories ──────────────────────────────────────────────────────

function emptyLabour(defaultHourlyRate: number | null): LabourForm {
  return {
    entry_date: today(),
    worker_name: '',
    description: '',
    rate_type: 'hourly',
    units: '',
    rate: defaultHourlyRate != null ? String(defaultHourlyRate) : '',
  }
}

function emptyInvoice(): InvoiceForm {
  return {
    invoice_date: today(),
    supplier_name: '',
    category: 'trade',
    trade_category: '',
    invoice_number: '',
    description: '',
    amount_ex_gst: '',
    gst_amount: '',
  }
}

interface LabourForm {
  entry_date: string
  worker_name: string
  description: string
  rate_type: 'hourly' | 'daily'
  units: string
  rate: string
}

interface InvoiceForm {
  invoice_date: string
  supplier_name: string
  category: 'trade' | 'materials' | 'other'
  trade_category: string
  invoice_number: string
  description: string
  amount_ex_gst: string
  gst_amount: string
}

// ── Backdrop ──────────────────────────────────────────────────────────────────

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CostsClient({
  project,
  initialLabourEntries,
  initialCostInvoices,
  claimPeriods,
}: Props) {
  const [activeTab, setActiveTab] = useState<'labour' | 'invoices'>('labour')

  // Re-sync when server re-renders
  const [labourEntries, setLabourEntries] = useState(initialLabourEntries)
  const [costInvoices, setCostInvoices]   = useState(initialCostInvoices)
  useEffect(() => setLabourEntries(initialLabourEntries), [initialLabourEntries])
  useEffect(() => setCostInvoices(initialCostInvoices), [initialCostInvoices])

  // Date filters — default: project start → today
  const [labourFrom, setLabourFrom] = useState(project.start_date)
  const [labourTo,   setLabourTo]   = useState(today())
  const [invFrom,    setInvFrom]    = useState(project.start_date)
  const [invTo,      setInvTo]      = useState(today())

  // Labour modal
  const [labourModal, setLabourModal] = useState<'add' | 'edit' | null>(null)
  const [editingLabour, setEditingLabour] = useState<LabourEntry | null>(null)
  const [labourForm, setLabourForm] = useState<LabourForm>(() => emptyLabour(project.default_hourly_rate))
  const [labourError, setLabourError] = useState<string | null>(null)
  const [labourPending, startLabour] = useTransition()

  // Invoice modal
  const [invoiceModal, setInvoiceModal] = useState<'add' | 'edit' | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<CostInvoice | null>(null)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoice)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [invoicePending, startInvoice] = useTransition()
  const [fileViewPending, startFileView] = useTransition()

  // ── Claim period lookup ──────────────────────────────────────────────────
  const claimMap = useMemo(() =>
    Object.fromEntries(claimPeriods.map(c => [c.id, c])),
    [claimPeriods]
  )

  function claimLabel(claimPeriodId: string | null) {
    if (!claimPeriodId) return null
    const c = claimMap[claimPeriodId]
    return c ? `Claim #${c.claim_number}` : 'Claimed'
  }

  function claimTitle(claimPeriodId: string | null) {
    if (!claimPeriodId) return ''
    const c = claimMap[claimPeriodId]
    return c ? `${fmtDate(c.claim_period_start)} – ${fmtDate(c.claim_period_end)}` : ''
  }

  // ── Filtered data ────────────────────────────────────────────────────────
  const filteredLabour = useMemo(() =>
    labourEntries.filter(e => e.entry_date >= labourFrom && e.entry_date <= labourTo),
    [labourEntries, labourFrom, labourTo]
  )

  const filteredInvoices = useMemo(() =>
    costInvoices.filter(i => i.invoice_date >= invFrom && i.invoice_date <= invTo),
    [costInvoices, invFrom, invTo]
  )

  // ── Totals ───────────────────────────────────────────────────────────────
  const labourTotal = useMemo(() =>
    filteredLabour.reduce((s, e) => s + Number(e.amount), 0),
    [filteredLabour]
  )

  const invTotals = useMemo(() => ({
    exGst:  filteredInvoices.reduce((s, i) => s + Number(i.amount_ex_gst), 0),
    gst:    filteredInvoices.reduce((s, i) => s + Number(i.gst_amount), 0),
    incGst: filteredInvoices.reduce((s, i) => s + Number(i.amount_inc_gst), 0),
  }), [filteredInvoices])

  // ── Labour form helpers ──────────────────────────────────────────────────
  function openAddLabour() {
    setEditingLabour(null)
    setLabourForm(emptyLabour(project.default_hourly_rate))
    setLabourError(null)
    setLabourModal('add')
  }

  function openEditLabour(entry: LabourEntry) {
    setEditingLabour(entry)
    setLabourForm({
      entry_date:   entry.entry_date,
      worker_name:  entry.worker_name,
      description:  entry.description ?? '',
      rate_type:    entry.rate_type,
      units:        String(entry.units),
      rate:         String(entry.rate),
    })
    setLabourError(null)
    setLabourModal('edit')
  }

  function closeLabourModal() {
    setLabourModal(null)
    setEditingLabour(null)
    setLabourError(null)
  }

  function onLabourRateTypeChange(rt: 'hourly' | 'daily') {
    const defaultRate = rt === 'hourly'
      ? project.default_hourly_rate
      : project.default_daily_rate
    setLabourForm(f => ({
      ...f,
      rate_type: rt,
      rate: f.rate === '' && defaultRate != null ? String(defaultRate) : f.rate,
    }))
  }

  function submitLabour(e: React.FormEvent) {
    e.preventDefault()
    setLabourError(null)
    const units = parseFloat(labourForm.units)
    const rate  = parseFloat(labourForm.rate)
    if (!labourForm.worker_name.trim()) return setLabourError('Worker name is required.')
    if (isNaN(units) || units <= 0)    return setLabourError('Units must be a positive number.')
    if (isNaN(rate)  || rate < 0)      return setLabourError('Rate must be a valid number.')

    const data = {
      entry_date:  labourForm.entry_date,
      worker_name: labourForm.worker_name.trim(),
      description: labourForm.description.trim() || null,
      rate_type:   labourForm.rate_type,
      units,
      rate,
    }

    startLabour(async () => {
      try {
        if (labourModal === 'add') {
          await addLabourEntry(project.id, data)
        } else if (editingLabour) {
          await updateLabourEntry(editingLabour.id, data)
        }
        closeLabourModal()
      } catch (err) {
        setLabourError(err instanceof Error ? err.message : 'An error occurred.')
      }
    })
  }

  function handleDeleteLabour(entry: LabourEntry) {
    if (!window.confirm(`Delete entry for ${entry.worker_name} on ${fmtDate(entry.entry_date)}?`)) return
    startLabour(async () => {
      try { await deleteLabourEntry(entry.id) }
      catch (err) { alert(err instanceof Error ? err.message : 'Delete failed.') }
    })
  }

  // ── Invoice form helpers ─────────────────────────────────────────────────
  function openAddInvoice() {
    setEditingInvoice(null)
    setInvoiceForm(emptyInvoice())
    setInvoiceError(null)
    setInvoiceModal('add')
  }

  function openEditInvoice(inv: CostInvoice) {
    setEditingInvoice(inv)
    setInvoiceForm({
      invoice_date:   inv.invoice_date,
      supplier_name:  inv.supplier_name,
      category:       inv.category,
      trade_category: inv.trade_category ?? '',
      invoice_number: inv.invoice_number ?? '',
      description:    inv.description ?? '',
      amount_ex_gst:  String(inv.amount_ex_gst),
      gst_amount:     String(inv.gst_amount),
    })
    setInvoiceError(null)
    setInvoiceModal('edit')
  }

  function closeInvoiceModal() {
    setInvoiceModal(null)
    setEditingInvoice(null)
    setInvoiceError(null)
  }

  function onExGstChange(val: string) {
    const exGst = parseFloat(val)
    const autoGst = !isNaN(exGst) ? String(Math.round(exGst * 0.1 * 100) / 100) : ''
    setInvoiceForm(f => ({ ...f, amount_ex_gst: val, gst_amount: autoGst }))
  }

  function submitInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setInvoiceError(null)
    const exGst = parseFloat(invoiceForm.amount_ex_gst)
    if (!invoiceForm.supplier_name.trim()) return setInvoiceError('Supplier name is required.')
    if (isNaN(exGst) || exGst < 0)        return setInvoiceError('Amount ex-GST must be a valid number.')

    const fd = new FormData(e.currentTarget)
    fd.set('project_id', project.id)

    startInvoice(async () => {
      try {
        if (invoiceModal === 'add') {
          await addCostInvoice(fd)
        } else if (editingInvoice) {
          await updateCostInvoice(editingInvoice.id, fd)
        }
        closeInvoiceModal()
      } catch (err) {
        setInvoiceError(err instanceof Error ? err.message : 'An error occurred.')
      }
    })
  }

  function handleDeleteInvoice(inv: CostInvoice) {
    if (!window.confirm(`Delete invoice from ${inv.supplier_name} dated ${fmtDate(inv.invoice_date)}?`)) return
    startInvoice(async () => {
      try { await deleteCostInvoice(inv.id) }
      catch (err) { alert(err instanceof Error ? err.message : 'Delete failed.') }
    })
  }

  function handleViewFile(filePath: string) {
    startFileView(async () => {
      try {
        const url = await getInvoiceFileUrl(filePath)
        window.open(url, '_blank')
      } catch { alert('Could not open file.') }
    })
  }

  // ── Live amount preview ──────────────────────────────────────────────────
  const labourPreview = useMemo(() => {
    const u = parseFloat(labourForm.units)
    const r = parseFloat(labourForm.rate)
    return !isNaN(u) && !isNaN(r) ? u * r : null
  }, [labourForm.units, labourForm.rate])

  const invoiceIncGst = useMemo(() => {
    const ex  = parseFloat(invoiceForm.amount_ex_gst)
    const gst = parseFloat(invoiceForm.gst_amount)
    return !isNaN(ex) && !isNaN(gst) ? ex + gst : null
  }, [invoiceForm.amount_ex_gst, invoiceForm.gst_amount])

  // ── Shared UI pieces ─────────────────────────────────────────────────────
  const lockedChip = (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
      title="Locked in a payment claim — cannot be edited"
    >
      Locked
    </span>
  )

  const unclaimedChip = (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
    >
      Unclaimed
    </span>
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>Costs</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Labour entries and invoices for this project</p>
          </div>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'var(--accent-soft, #eff6ff)', color: 'var(--accent)' }}
          >
            Cost Plus
          </span>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex gap-1 px-6 pt-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {(['labour', 'invoices'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize"
              style={activeTab === tab
                ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                : { borderColor: 'transparent', color: 'var(--ink-3)' }}
            >
              {tab === 'labour' ? 'Labour' : 'Invoices'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">

          {/* ── LABOUR TAB ──────────────────────────────────────────────── */}
          {activeTab === 'labour' && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm" style={{ color: 'var(--ink-3)' }}>From</label>
                  <input
                    type="date" value={labourFrom}
                    onChange={e => setLabourFrom(e.target.value)}
                    className="rounded px-2 py-1 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                  <label className="text-sm" style={{ color: 'var(--ink-3)' }}>To</label>
                  <input
                    type="date" value={labourTo}
                    onChange={e => setLabourTo(e.target.value)}
                    className="rounded px-2 py-1 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={openAddLabour}
                  className="rounded px-3 py-1.5 text-sm font-medium text-white transition-colors"
                  style={{ background: 'var(--accent)' }}
                >
                  + Add
                </button>
              </div>

              {/* Summary strip */}
              <div
                className="flex items-center gap-6 px-4 py-3 rounded-lg text-sm"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <span style={{ color: 'var(--ink-3)' }}>
                  {filteredLabour.length} {filteredLabour.length === 1 ? 'entry' : 'entries'}
                </span>
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                  Total: {fmt(labourTotal)}
                </span>
              </div>

              {/* Table */}
              {filteredLabour.length === 0 ? (
                <div
                  className="rounded-xl flex items-center justify-center py-20 text-sm"
                  style={{ border: '2px dashed var(--border)', color: 'var(--ink-4)' }}
                >
                  No labour entries yet. Click + Add to log hours.
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Worker', 'Description', 'Type', 'Units', 'Rate', 'Amount', 'Claim period', ''].map(h => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs font-semibold"
                            style={{ color: 'var(--ink-3)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabour.map((entry, i) => {
                        const locked = entry.claim_period_id !== null
                        return (
                          <tr
                            key={entry.id}
                            style={{
                              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                              background: 'var(--surface)',
                            }}
                          >
                            <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                              {fmtDate(entry.entry_date)}
                            </td>
                            <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>
                              {entry.worker_name}
                            </td>
                            <td className="px-4 py-3 max-w-xs truncate" style={{ color: 'var(--ink-3)' }}>
                              {entry.description ?? '—'}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--ink-2)' }}>
                              {entry.rate_type === 'hourly' ? 'Hourly' : 'Daily'}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--ink-2)' }}>
                              {entry.units} {entry.rate_type === 'hourly' ? 'hrs' : 'days'}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--ink-2)' }}>
                              {fmt(entry.rate)}
                            </td>
                            <td className="px-4 py-3 font-semibold" style={{ color: 'var(--ink)' }}>
                              {fmt(entry.amount)}
                            </td>
                            <td className="px-4 py-3">
                              {locked ? (
                                <span title={claimTitle(entry.claim_period_id)}>
                                  {lockedChip}
                                </span>
                              ) : unclaimedChip}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={locked || labourPending}
                                  onClick={() => openEditLabour(entry)}
                                  className="text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  style={{ color: 'var(--accent)' }}
                                  title={locked ? 'Locked in a claim' : 'Edit'}
                                >
                                  Edit
                                </button>
                                <button
                                  disabled={locked || labourPending}
                                  onClick={() => handleDeleteLabour(entry)}
                                  className="text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  style={{ color: 'var(--bad)' }}
                                  title={locked ? 'Locked in a claim' : 'Delete'}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── INVOICES TAB ────────────────────────────────────────────── */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm" style={{ color: 'var(--ink-3)' }}>From</label>
                  <input
                    type="date" value={invFrom}
                    onChange={e => setInvFrom(e.target.value)}
                    className="rounded px-2 py-1 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                  <label className="text-sm" style={{ color: 'var(--ink-3)' }}>To</label>
                  <input
                    type="date" value={invTo}
                    onChange={e => setInvTo(e.target.value)}
                    className="rounded px-2 py-1 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={openAddInvoice}
                  className="rounded px-3 py-1.5 text-sm font-medium text-white transition-colors"
                  style={{ background: 'var(--accent)' }}
                >
                  + Add
                </button>
              </div>

              {/* Summary strip */}
              <div
                className="flex items-center gap-6 px-4 py-3 rounded-lg text-sm flex-wrap"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <span style={{ color: 'var(--ink-3)' }}>
                  {filteredInvoices.length} {filteredInvoices.length === 1 ? 'invoice' : 'invoices'}
                </span>
                <span style={{ color: 'var(--ink-3)' }}>Ex-GST: <strong style={{ color: 'var(--ink)' }}>{fmt(invTotals.exGst)}</strong></span>
                <span style={{ color: 'var(--ink-3)' }}>GST: <strong style={{ color: 'var(--ink)' }}>{fmt(invTotals.gst)}</strong></span>
                <span style={{ color: 'var(--ink-3)' }}>Inc-GST: <strong style={{ color: 'var(--ink)' }}>{fmt(invTotals.incGst)}</strong></span>
              </div>

              {/* Table */}
              {filteredInvoices.length === 0 ? (
                <div
                  className="rounded-xl flex items-center justify-center py-20 text-sm"
                  style={{ border: '2px dashed var(--border)', color: 'var(--ink-4)' }}
                >
                  No invoices yet. Click + Add to record one.
                </div>
              ) : (
                <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Supplier', 'Category', 'Trade', 'Invoice #', 'Ex-GST', 'GST', 'Inc-GST', 'File', 'Claim period', ''].map(h => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap"
                            style={{ color: 'var(--ink-3)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((inv, i) => {
                        const locked = inv.claim_period_id !== null
                        return (
                          <tr
                            key={inv.id}
                            style={{
                              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                              background: 'var(--surface)',
                            }}
                          >
                            <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                              {fmtDate(inv.invoice_date)}
                            </td>
                            <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>
                              {inv.supplier_name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                              {CATEGORY_LABELS[inv.category]}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--ink-3)' }}>
                              {inv.trade_category ?? '—'}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--ink-3)' }}>
                              {inv.invoice_number ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                              {fmt(inv.amount_ex_gst)}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                              {fmt(inv.gst_amount)}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap font-semibold" style={{ color: 'var(--ink)' }}>
                              {fmt(inv.amount_inc_gst)}
                            </td>
                            <td className="px-4 py-3">
                              {inv.file_url ? (
                                <button
                                  onClick={() => handleViewFile(inv.file_url!)}
                                  disabled={fileViewPending}
                                  className="text-xs font-medium transition-colors disabled:opacity-50"
                                  style={{ color: 'var(--accent)' }}
                                  title={inv.file_name ?? 'View file'}
                                >
                                  View
                                </button>
                              ) : (
                                <span style={{ color: 'var(--ink-4)' }}>—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {locked ? (
                                <span title={claimTitle(inv.claim_period_id)}>
                                  {lockedChip}
                                </span>
                              ) : unclaimedChip}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={locked || invoicePending}
                                  onClick={() => openEditInvoice(inv)}
                                  className="text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  style={{ color: 'var(--accent)' }}
                                  title={locked ? 'Locked in a claim' : 'Edit'}
                                >
                                  Edit
                                </button>
                                <button
                                  disabled={locked || invoicePending}
                                  onClick={() => handleDeleteInvoice(inv)}
                                  className="text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  style={{ color: 'var(--bad)' }}
                                  title={locked ? 'Locked in a claim' : 'Delete'}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── LABOUR MODAL ──────────────────────────────────────────────────── */}
      {labourModal && (
        <>
          <Backdrop onClose={closeLabourModal} />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl shadow-2xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                {labourModal === 'add' ? 'Add labour entry' : 'Edit labour entry'}
              </h2>
            </div>
            <form onSubmit={submitLabour} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Date</label>
                  <input
                    type="date" required
                    value={labourForm.entry_date}
                    onChange={e => setLabourForm(f => ({ ...f, entry_date: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Rate type</label>
                  <div className="flex gap-3 pt-1">
                    {(['hourly', 'daily'] as const).map(rt => (
                      <label key={rt} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                        <input
                          type="radio" name="rate_type_labour"
                          checked={labourForm.rate_type === rt}
                          onChange={() => onLabourRateTypeChange(rt)}
                        />
                        {rt === 'hourly' ? 'Hourly' : 'Daily'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Worker name</label>
                <input
                  type="text" required
                  value={labourForm.worker_name}
                  onChange={e => setLabourForm(f => ({ ...f, worker_name: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                  placeholder="e.g. John Smith"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Description</label>
                <input
                  type="text"
                  value={labourForm.description}
                  onChange={e => setLabourForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
                    {labourForm.rate_type === 'hourly' ? 'Hours' : 'Days'}
                  </label>
                  <input
                    type="number" required min="0.01" step="0.01"
                    value={labourForm.units}
                    onChange={e => setLabourForm(f => ({ ...f, units: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
                    Rate (AUD/{labourForm.rate_type === 'hourly' ? 'hr' : 'day'})
                  </label>
                  <input
                    type="number" required min="0" step="0.01"
                    value={labourForm.rate}
                    onChange={e => setLabourForm(f => ({ ...f, rate: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {labourPreview !== null && (
                <div
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg text-sm"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--ink-3)' }}>Amount</span>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(labourPreview)}</span>
                </div>
              )}

              {labourError && (
                <p className="text-sm" style={{ color: 'var(--bad)' }}>{labourError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit" disabled={labourPending}
                  className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
                  style={{ background: 'var(--accent)' }}
                >
                  {labourPending ? 'Saving…' : labourModal === 'add' ? 'Add entry' : 'Save changes'}
                </button>
                <button
                  type="button" onClick={closeLabourModal}
                  className="rounded px-4 py-2 text-sm font-semibold transition-colors"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── INVOICE MODAL ─────────────────────────────────────────────────── */}
      {invoiceModal && (
        <>
          <Backdrop onClose={closeInvoiceModal} />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl shadow-2xl overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                {invoiceModal === 'add' ? 'Add invoice' : 'Edit invoice'}
              </h2>
            </div>
            <form onSubmit={submitInvoice} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Date</label>
                  <input
                    type="date" name="invoice_date" required
                    value={invoiceForm.invoice_date}
                    onChange={e => setInvoiceForm(f => ({ ...f, invoice_date: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Invoice #</label>
                  <input
                    type="text" name="invoice_number"
                    value={invoiceForm.invoice_number}
                    onChange={e => setInvoiceForm(f => ({ ...f, invoice_number: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Supplier name</label>
                <input
                  type="text" name="supplier_name" required
                  value={invoiceForm.supplier_name}
                  onChange={e => setInvoiceForm(f => ({ ...f, supplier_name: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                  placeholder="e.g. Acme Plumbing"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Category</label>
                <div className="flex gap-4">
                  {(['trade', 'materials', 'other'] as const).map(cat => (
                    <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                      <input
                        type="radio" name="category"
                        value={cat}
                        checked={invoiceForm.category === cat}
                        onChange={() => setInvoiceForm(f => ({ ...f, category: cat }))}
                      />
                      {CATEGORY_LABELS[cat]}
                    </label>
                  ))}
                </div>
              </div>

              {invoiceForm.category === 'trade' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Trade category</label>
                  <input
                    type="text" name="trade_category"
                    value={invoiceForm.trade_category}
                    onChange={e => setInvoiceForm(f => ({ ...f, trade_category: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                    placeholder="e.g. Plumbing, Electrical"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Description</label>
                <input
                  type="text" name="description"
                  value={invoiceForm.description}
                  onChange={e => setInvoiceForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Amount ex-GST (AUD)</label>
                  <input
                    type="number" name="amount_ex_gst" required min="0" step="0.01"
                    value={invoiceForm.amount_ex_gst}
                    onChange={e => onExGstChange(e.target.value)}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>GST (AUD)</label>
                  <input
                    type="number" name="gst_amount" min="0" step="0.01"
                    value={invoiceForm.gst_amount}
                    onChange={e => setInvoiceForm(f => ({ ...f, gst_amount: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {invoiceIncGst !== null && (
                <div
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg text-sm"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--ink-3)' }}>Inc-GST total</span>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(invoiceIncGst)}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
                  Invoice file
                  <span className="ml-1 font-normal" style={{ color: 'var(--ink-4)' }}>PDF, JPG, PNG — max 10 MB</span>
                </label>
                {editingInvoice?.file_name && (
                  <p className="text-xs mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Current: {editingInvoice.file_name} — uploading a new file replaces it.
                  </p>
                )}
                <input
                  type="file" name="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="w-full text-sm"
                  style={{ color: 'var(--ink-2)' }}
                />
              </div>

              {invoiceError && (
                <p className="text-sm" style={{ color: 'var(--bad)' }}>{invoiceError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit" disabled={invoicePending}
                  className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
                  style={{ background: 'var(--accent)' }}
                >
                  {invoicePending ? 'Saving…' : invoiceModal === 'add' ? 'Add invoice' : 'Save changes'}
                </button>
                <button
                  type="button" onClick={closeInvoiceModal}
                  className="rounded px-4 py-2 text-sm font-semibold transition-colors"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  )
}
