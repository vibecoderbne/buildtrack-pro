'use client'

import { useState, useTransition, useEffect } from 'react'
import type { CostPlusClaimSummary, CostPlusClaimDetail } from '@/app/actions/cost-plus-claims'
import {
  generateCostPlusClaim,
  refreshCostPlusClaimEntries,
  submitCostPlusClaim,
  deleteDraftCostPlusClaim,
  updateCostPlusClaimStatus,
  getCostPlusClaimDetail,
} from '@/app/actions/cost-plus-claims'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId:        string
  projectName:      string
  projectAddress:   string
  builderName:      string
  orgName:          string
  initialClaims:    CostPlusClaimSummary[]
  initialDraftDetail: CostPlusClaimDetail | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

const today = () => new Date().toISOString().split('T')[0]

const STATUS_BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  draft:     { label: 'Draft',     style: { background: 'var(--surface-2)', color: 'var(--ink-3)' } },
  submitted: { label: 'Submitted', style: { background: 'var(--info-soft)', color: 'var(--info)' } },
  approved:  { label: 'Approved',  style: { background: 'var(--ok-soft)',   color: 'var(--ok)'   } },
  paid:      { label: 'Paid',      style: { background: 'var(--ok-soft)',   color: 'var(--ok)'   } },
}

const CATEGORY_LABELS: Record<string, string> = { trade: 'Trade', materials: 'Materials', other: 'Other' }

const inputStyle = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }

// ── Claim breakdown display ───────────────────────────────────────────────────

function ClaimBreakdown({ d }: { d: CostPlusClaimDetail }) {
  const labourMarkupPct    = d.claim.appliedLabourMarkup ?? 0
  const materialsMarkupPct = d.claim.appliedMaterialsMarkup ?? 0

  const invoiceGroups = (['trade', 'materials', 'other'] as const)
    .map(cat => ({ cat, rows: d.costInvoices.filter(i => i.category === cat) }))
    .filter(g => g.rows.length > 0)

  return (
    <div className="space-y-6">
      {/* Labour */}
      {d.labourEntries.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Labour</h4>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Worker', 'Description', 'Type', 'Units', 'Rate', 'Amount'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.labourEntries.map((e, i) => (
                  <tr key={e.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{fmtDate(e.entry_date)}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--ink)' }}>{e.worker_name}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--ink-3)' }}>{e.description ?? '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--ink-3)' }}>{e.rate_type === 'hourly' ? 'Hourly' : 'Daily'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--ink-3)' }}>{e.units}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--ink-3)' }}>{fmt(e.rate)}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--ink)' }}>{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 space-y-0.5 text-sm">
            <div className="flex justify-between px-3 py-1.5 rounded" style={{ background: 'var(--surface-2)' }}>
              <span style={{ color: 'var(--ink-3)' }}>Labour subtotal</span>
              <span style={{ color: 'var(--ink-2)' }}>{fmt(d.labourSubtotal)}</span>
            </div>
            {labourMarkupPct > 0 && (
              <div className="flex justify-between px-3 py-1.5 rounded" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <span style={{ color: '#92400e' }}>+ Labour markup ({labourMarkupPct}%)</span>
                <span style={{ color: '#92400e' }}>{fmt(d.labourMarkup)}</span>
              </div>
            )}
            <div className="flex justify-between px-3 py-1.5 rounded font-semibold" style={{ background: 'var(--surface-2)' }}>
              <span style={{ color: 'var(--ink)' }}>Labour total (ex-GST)</span>
              <span style={{ color: 'var(--ink)' }}>{fmt(d.labourTotalExGst)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Invoices */}
      {d.costInvoices.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Invoices</h4>
          <div className="space-y-3">
            {invoiceGroups.map(({ cat, rows }) => (
              <div key={cat}>
                <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--ink-4)' }}>{CATEGORY_LABELS[cat]}</p>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Supplier', 'Inv #', 'Description', 'Ex-GST', 'GST', 'Inc-GST'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink-3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((inv, i) => (
                        <tr key={inv.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{fmtDate(inv.invoice_date)}</td>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--ink)' }}>{inv.supplier_name}{inv.trade_category ? ` (${inv.trade_category})` : ''}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--ink-3)' }}>{inv.invoice_number ?? '—'}</td>
                          <td className="px-3 py-2 max-w-xs truncate" style={{ color: 'var(--ink-3)' }}>{inv.description ?? '—'}</td>
                          <td className="px-3 py-2 text-right" style={{ color: 'var(--ink-2)' }}>{fmt(inv.amount_ex_gst)}</td>
                          <td className="px-3 py-2 text-right" style={{ color: 'var(--ink-3)' }}>{fmt(inv.gst_amount)}</td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--ink)' }}>{fmt(inv.amount_inc_gst)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-0.5 text-sm">
            <div className="flex justify-between px-3 py-1.5 rounded" style={{ background: 'var(--surface-2)' }}>
              <span style={{ color: 'var(--ink-3)' }}>Invoices subtotal (ex-GST)</span>
              <span style={{ color: 'var(--ink-2)' }}>{fmt(d.invoicesSubtotal)}</span>
            </div>
            {materialsMarkupPct > 0 && (
              <div className="flex justify-between px-3 py-1.5 rounded" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <span style={{ color: '#92400e' }}>+ Materials & trades markup ({materialsMarkupPct}%)</span>
                <span style={{ color: '#92400e' }}>{fmt(d.materialsMarkup)}</span>
              </div>
            )}
            <div className="flex justify-between px-3 py-1.5 rounded font-semibold" style={{ background: 'var(--surface-2)' }}>
              <span style={{ color: 'var(--ink)' }}>Invoices total (ex-GST)</span>
              <span style={{ color: 'var(--ink)' }}>{fmt(d.invoicesTotalExGst)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Grand totals */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex justify-between px-4 py-2.5 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--ink-2)' }}>Grand total ex-GST</span>
          <span style={{ color: 'var(--ink-2)' }}>{fmt(d.grandTotalExGst)}</span>
        </div>
        <div className="flex justify-between px-4 py-2.5 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--ink-3)' }}>GST (10%)</span>
          <span style={{ color: 'var(--ink-3)' }}>{fmt(d.gst)}</span>
        </div>
        <div className="flex justify-between px-4 py-3 text-base font-bold" style={{ background: 'var(--accent-soft, #eff6ff)' }}>
          <span style={{ color: 'var(--ink)' }}>Grand total inc-GST</span>
          <span style={{ color: 'var(--accent)' }}>{fmt(d.grandTotalIncGst)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CostPlusClaimsClient({
  projectId, projectName, projectAddress, builderName, orgName,
  initialClaims, initialDraftDetail,
}: Props) {
  const [claims, setClaims]           = useState(initialClaims)
  const [draftDetail, setDraftDetail] = useState<CostPlusClaimDetail | null>(initialDraftDetail)

  useEffect(() => { setClaims(initialClaims) }, [initialClaims])
  useEffect(() => { setDraftDetail(initialDraftDetail) }, [initialDraftDetail])

  const draft = claims.find(c => c.status === 'draft') ?? null

  // New claim form
  const [newPeriodStart, setNewPeriodStart] = useState(today())
  const [newPeriodEnd,   setNewPeriodEnd]   = useState(today())
  const [newClaimError,  setNewClaimError]  = useState<string | null>(null)
  const [genPending,     startGen]          = useTransition()

  // Action pending
  const [actionPending, startAction] = useTransition()
  const [actionError,   setActionError] = useState<string | null>(null)
  const [successMsg,    setSuccessMsg]  = useState<string | null>(null)

  // History expansion
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [detailCache,   setDetailCache]   = useState<Record<string, CostPlusClaimDetail>>({})
  const [loadingId,     setLoadingId]     = useState<string | null>(null)

  // PDF export
  const [exportingId, setExportingId] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  // ── New claim ──────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (!newPeriodStart || !newPeriodEnd) return
    if (newPeriodEnd < newPeriodStart) return setNewClaimError('End date must be on or after start date.')
    setNewClaimError(null)
    startGen(async () => {
      try {
        await generateCostPlusClaim(projectId, { periodStart: newPeriodStart, periodEnd: newPeriodEnd })
      } catch (err) {
        setNewClaimError(err instanceof Error ? err.message : 'Failed to generate claim.')
      }
    })
  }

  // ── Refresh entries ────────────────────────────────────────────────────
  const handleRefresh = (claimId: string) => {
    setActionError(null)
    startAction(async () => {
      try {
        await refreshCostPlusClaimEntries(claimId)
        showSuccess('Entries refreshed.')
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Refresh failed.')
      }
    })
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = (claimId: string) => {
    if (!window.confirm('Submit this claim? You won\'t be able to refresh entries after submission.')) return
    setActionError(null)
    startAction(async () => {
      try {
        await submitCostPlusClaim(claimId)
        showSuccess('Claim submitted.')
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Submit failed.')
      }
    })
  }

  // ── Delete draft ───────────────────────────────────────────────────────
  const handleDeleteDraft = (claimId: string) => {
    if (!window.confirm('Delete this draft? All locked entries will be unlocked.')) return
    setActionError(null)
    startAction(async () => {
      try {
        await deleteDraftCostPlusClaim(claimId)
        setDraftDetail(null)
        showSuccess('Draft deleted.')
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Delete failed.')
      }
    })
  }

  // ── Mark approved / paid ───────────────────────────────────────────────
  const handleStatusUpdate = (claimId: string, status: 'approved' | 'paid') => {
    setActionError(null)
    startAction(async () => {
      try {
        await updateCostPlusClaimStatus(claimId, status)
        showSuccess(`Claim marked as ${status}.`)
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Update failed.')
      }
    })
  }

  // ── Expand history item ────────────────────────────────────────────────
  const handleExpand = async (claimId: string) => {
    if (expandedId === claimId) { setExpandedId(null); return }
    setExpandedId(claimId)
    if (detailCache[claimId]) return
    setLoadingId(claimId)
    try {
      const d = await getCostPlusClaimDetail(claimId)
      setDetailCache(prev => ({ ...prev, [claimId]: d }))
    } catch { /* silent */ }
    finally { setLoadingId(null) }
  }

  // ── PDF export ─────────────────────────────────────────────────────────
  const handleExportPDF = async (claimId: string) => {
    setExportingId(claimId)
    try {
      const detail = detailCache[claimId]
        ?? (claimId === draft?.id && draftDetail ? draftDetail : null)
        ?? await getCostPlusClaimDetail(claimId)
      const { pdf }     = await import('@react-pdf/renderer')
      const { default: CostPlusClaimPDF } = await import('./CostPlusClaimPDF')
      const claim = claims.find(c => c.id === claimId)!
      const blob  = await pdf(
        <CostPlusClaimPDF
          projectName={projectName}
          projectAddress={projectAddress}
          builderName={builderName}
          orgName={orgName}
          generatedDate={new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          detail={detail}
        />
      ).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `Claim_${claim.claimNumber}_${projectName.replace(/[^a-z0-9]/gi, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF export failed', err)
    } finally {
      setExportingId(null)
    }
  }

  const historyItems = claims.filter(c => c.status !== 'draft')

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="overflow-y-auto flex-1">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-10">

        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Progress Claims</h1>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'var(--accent-soft, #eff6ff)', color: 'var(--accent)' }}
          >
            Cost Plus
          </span>
        </div>

        {successMsg && (
          <div className="px-4 py-3 rounded-lg text-sm font-medium" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
            {successMsg}
          </div>
        )}
        {actionError && (
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
            {actionError}
          </div>
        )}

        {/* ── Draft claim ──────────────────────────────────────────────── */}
        {draft && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                Draft — Claim #{draft.claimNumber}
              </h2>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                <span>{fmtDate(draft.periodStart)} – {fmtDate(draft.periodEnd)}</span>
                <span
                  className="px-2 py-0.5 rounded font-medium"
                  style={STATUS_BADGE.draft.style}
                >
                  Draft
                </span>
              </div>
            </div>

            <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {draftDetail
                ? <ClaimBreakdown d={draftDetail} />
                : <p className="text-sm" style={{ color: 'var(--ink-4)' }}>Loading breakdown…</p>
              }

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => handleRefresh(draft.id)}
                  disabled={actionPending}
                  className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
                  title="Pull in any new unclaimed entries within this claim period"
                >
                  {actionPending ? 'Working…' : 'Refresh entries'}
                </button>
                <button
                  onClick={() => handleSubmit(draft.id)}
                  disabled={actionPending}
                  className="rounded px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  Submit claim
                </button>
                <button
                  onClick={() => handleExportPDF(draft.id)}
                  disabled={exportingId === draft.id}
                  className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
                >
                  {exportingId === draft.id ? 'Generating…' : '↓ Export PDF'}
                </button>
                <button
                  onClick={() => handleDeleteDraft(draft.id)}
                  disabled={actionPending}
                  className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ml-auto"
                  style={{ color: 'var(--bad)', border: '1px solid var(--bad-soft)' }}
                >
                  Delete draft
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── New claim form (only when no draft) ──────────────────────── */}
        {!draft && (
          <section>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--ink)' }}>New claim</h2>
            <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-3)' }}>
                All unclaimed labour entries and invoices within the selected period will be locked into this claim.
              </p>
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Period start</label>
                  <input
                    type="date" value={newPeriodStart}
                    onChange={e => setNewPeriodStart(e.target.value)}
                    className="rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Period end</label>
                  <input
                    type="date" value={newPeriodEnd}
                    onChange={e => setNewPeriodEnd(e.target.value)}
                    className="rounded px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={genPending}
                  className="rounded px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                  style={{ background: 'var(--accent)' }}
                >
                  {genPending ? 'Generating…' : 'Generate claim'}
                </button>
              </div>
              {newClaimError && (
                <p className="mt-3 text-sm" style={{ color: 'var(--bad)' }}>{newClaimError}</p>
              )}
            </div>
          </section>
        )}

        {/* ── Claim history ─────────────────────────────────────────────── */}
        {historyItems.length > 0 && (
          <section>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--ink)' }}>Claim history</h2>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {historyItems.map((claim, i) => {
                const badge  = STATUS_BADGE[claim.status] ?? STATUS_BADGE.submitted
                const detail = detailCache[claim.id]
                return (
                  <div
                    key={claim.id}
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: 'var(--surface)' }}
                  >
                    {/* Row */}
                    <div className="flex items-center gap-4 px-5 py-3.5 flex-wrap">
                      <button
                        onClick={() => handleExpand(claim.id)}
                        className="flex items-center gap-2 text-sm font-semibold hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        <span style={{ fontSize: 10 }}>{expandedId === claim.id ? '▲' : '▼'}</span>
                        Claim #{claim.claimNumber}
                      </button>
                      <span className="text-sm" style={{ color: 'var(--ink-3)' }}>
                        {fmtDate(claim.periodStart)} – {fmtDate(claim.periodEnd)}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={badge.style}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm font-semibold ml-auto" style={{ color: 'var(--ink)' }}>
                        {fmt(claim.grandTotalIncGst)} inc-GST
                      </span>

                      {/* Status actions */}
                      {claim.status === 'submitted' && (
                        <button
                          onClick={() => handleStatusUpdate(claim.id, 'approved')}
                          disabled={actionPending}
                          className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                          style={{ border: '1px solid var(--ok)', color: 'var(--ok)' }}
                        >
                          Mark approved
                        </button>
                      )}
                      {claim.status === 'approved' && (
                        <button
                          onClick={() => handleStatusUpdate(claim.id, 'paid')}
                          disabled={actionPending}
                          className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                          style={{ border: '1px solid var(--ok)', color: 'var(--ok)' }}
                        >
                          Mark paid
                        </button>
                      )}
                      <button
                        onClick={() => handleExportPDF(claim.id)}
                        disabled={exportingId === claim.id}
                        className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                        style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
                      >
                        {exportingId === claim.id ? 'Generating…' : '↓ PDF'}
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {expandedId === claim.id && (
                      <div className="px-5 pb-5 pt-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                        {loadingId === claim.id && (
                          <p className="text-sm py-4 text-center" style={{ color: 'var(--ink-4)' }}>Loading…</p>
                        )}
                        {detail && <ClaimBreakdown d={detail} />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {claims.length === 0 && (
          <div
            className="rounded-xl flex items-center justify-center py-20 text-sm"
            style={{ border: '2px dashed var(--border)', color: 'var(--ink-4)' }}
          >
            No claims yet. Set the period dates above and generate your first claim.
          </div>
        )}

      </div>
    </div>
  )
}
