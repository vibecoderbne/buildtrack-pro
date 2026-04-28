'use client'

import React, { useState, useTransition, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgressReport, PhaseProgress, ClaimHistoryItem, ClaimLineItemDetail } from '@/app/actions/progress'
import { getPhaseColor } from '@/lib/phase-colors'
import { getClaimWithLineItems } from '@/app/actions/progress'
import { generateClaim, submitClaim, deleteDraftClaim, updateClaimStatus } from '@/app/actions/payments'
import { updateTaskProgress } from '@/app/actions/gantt'
import { createClient } from '@/lib/supabase/client'
import type { ClaimPDFProps } from './ClaimPDF'

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)

const pct = (n: number) => `${n.toFixed(1)}%`

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

function movementCell(delta: number) {
  if (Math.abs(delta) < 0.05) return <span style={{ color: 'var(--ink-4)' }}>—</span>
  if (delta > 0) return <span className="font-medium" style={{ color: 'var(--ok)' }}>+{pct(delta)}</span>
  return <span className="font-medium" style={{ color: 'var(--bad)' }}>{pct(delta)}</span>
}

type BadgeStyle = { label: string; style: React.CSSProperties }
const STATUS_BADGE: Record<string, BadgeStyle> = {
  draft:     { label: 'Draft',     style: { background: 'var(--surface-2)', color: 'var(--ink-3)' } },
  submitted: { label: 'Submitted', style: { background: 'var(--info-soft)', color: 'var(--info)' } },
  approved:  { label: 'Approved',  style: { background: 'var(--ok-soft)',   color: 'var(--ok)'   } },
  paid:      { label: 'Paid',      style: { background: 'var(--ok-soft)',   color: 'var(--ok)'   } },
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface PhaseTaskRow {
  id:            string
  name:          string
  current_start: string | null
  planned_start: string | null
  current_end:   string | null
  planned_end:   string | null
  progress_pct:  number
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProgressReportClient({
  projectId,
  report,
  projectName,
  projectAddress,
  orgName,
  orgAbn,
  orgAddress,
}: {
  projectId: string
  report: ProgressReport
  projectName: string
  projectAddress: string
  orgName: string
  orgAbn: string | null
  orgAddress: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [claimDate, setClaimDate] = useState(report.periodEnd)

  useEffect(() => {
    setClaimDate(report.periodEnd)
  }, [report.periodEnd])

  const handleRefresh = () => {
    startTransition(() => {
      router.push(`/projects/${projectId}/progress?date=${claimDate}`)
    })
  }

  // ── Claim actions state ──────────────────────────────────────────────────
  const [actionPending, startAction] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  // ── PDF export state ─────────────────────────────────────────────────────
  const [exportingClaimId, setExportingClaimId] = useState<string | null>(null)

  // ── Claim history expansion ──────────────────────────────────────────────
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)
  const [claimDetails, setClaimDetails] = useState<Record<string, {
    lineItems: ClaimLineItemDetail[]
    claim: ClaimHistoryItem
  }>>({})
  const [loadingClaimId, setLoadingClaimId] = useState<string | null>(null)

  // ── Phase expansion & inline progress editing ────────────────────────────
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Set<string>>(new Set())
  const [phaseTasks,       setPhaseTasks]        = useState<Record<string, PhaseTaskRow[]>>({})
  const [loadingPhaseId,   setLoadingPhaseId]    = useState<string | null>(null)
  const [draftProgress,    setDraftProgress]     = useState<Record<string, number>>({})
  const [savingTaskId,     setSavingTaskId]      = useState<string | null>(null)
  const [taskSaveStatus,   setTaskSaveStatus]    = useState<Record<string, 'saved' | 'error'>>({})

  const { overall, phases, claimSummary } = report

  // Map phase name → design-token color (by sort position, overrides stale DB values)
  const phaseNameColorMap = useMemo(
    () => new Map(phases.map((p, i) => [p.name, getPhaseColor(i)])),
    [phases]
  )

  const totalMovingTasks = phases.reduce((s, p) => s + p.movingTasks.length, 0)

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleGenerateClaim = () => {
    setActionError(null)
    startAction(async () => {
      try {
        const allLineItems = phases.flatMap((phase) =>
          phase.movingTasks.map((task) => ({
            taskId:        task.id,
            contractValue: task.contractValue,
            previousPct:   task.previousPct,
            currentPct:    task.currentPct,
            valueToDate:   (task.currentPct / 100) * task.contractValue,
            valuePrevious: (task.previousPct / 100) * task.contractValue,
            thisClaimValue: task.claimAmount,
          }))
        )

        await generateClaim(projectId, {
          claimDate:             report.periodEnd,
          periodStart:           report.periodStart,
          gross_claim_amount:    claimSummary.valueToDate,
          less_previous_claims:  claimSummary.previousClaims,
          this_claim_amount:     claimSummary.thisClaimGross,
          less_retention:        claimSummary.retention,
          net_claim_amount:      claimSummary.netPayable,
          lineItems:             allLineItems,
        })
        showSuccess('Draft claim generated successfully.')
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Failed to generate claim')
      }
    })
  }

  const handleSubmitClaim = (claimId: string) => {
    setActionError(null)
    startAction(async () => {
      try {
        await submitClaim(claimId)
        showSuccess('Claim submitted.')
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Failed to submit claim')
      }
    })
  }

  const handleDeleteDraft = (claimId: string) => {
    setActionError(null)
    startAction(async () => {
      try {
        await deleteDraftClaim(claimId)
        showSuccess('Draft claim deleted.')
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Failed to delete draft')
      }
    })
  }

  const handleUpdateStatus = (claimId: string, status: 'approved' | 'paid') => {
    setActionError(null)
    startAction(async () => {
      try {
        await updateClaimStatus(claimId, status)
        showSuccess(`Claim marked as ${status}.`)
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Failed to update status')
      }
    })
  }

  const handleToggleClaimDetail = async (claimId: string) => {
    if (expandedClaimId === claimId) {
      setExpandedClaimId(null)
      return
    }
    setExpandedClaimId(claimId)
    if (claimDetails[claimId]) return
    setLoadingClaimId(claimId)
    try {
      const detail = await getClaimWithLineItems(claimId)
      setClaimDetails((prev) => ({ ...prev, [claimId]: detail }))
    } finally {
      setLoadingClaimId(null)
    }
  }

  // ── Phase task expansion ─────────────────────────────────────────────────

  const handleTogglePhase = async (phaseId: string) => {
    const isOpen = expandedPhaseIds.has(phaseId)
    setExpandedPhaseIds((prev) => {
      const next = new Set(prev)
      isOpen ? next.delete(phaseId) : next.add(phaseId)
      return next
    })
    // Already have tasks cached, or collapsing — nothing to fetch
    if (isOpen || phaseTasks[phaseId]) return
    setLoadingPhaseId(phaseId)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('id, name, current_start, planned_start, current_end, planned_end, progress_pct')
        .eq('project_id', projectId)
        .eq('phase_id', phaseId)
        .order('sort_order')
      if (error) throw error
      const rows = (data ?? []) as PhaseTaskRow[]
      setPhaseTasks((prev) => ({ ...prev, [phaseId]: rows }))
      // Seed draft progress values for any tasks not yet edited
      setDraftProgress((prev) => {
        const next = { ...prev }
        rows.forEach((t) => { if (!(t.id in next)) next[t.id] = t.progress_pct })
        return next
      })
    } catch (e) {
      console.error('Failed to load tasks for phase:', e)
    } finally {
      setLoadingPhaseId(null)
    }
  }

  const handleProgressSave = async (taskId: string) => {
    const newPct = draftProgress[taskId] ?? 0
    setSavingTaskId(taskId)
    setTaskSaveStatus((prev) => { const n = { ...prev }; delete n[taskId]; return n })
    try {
      await updateTaskProgress(taskId, newPct)
      // Update the cached task row so the input reflects the persisted value
      setPhaseTasks((prev) => {
        const next = { ...prev }
        for (const pid of Object.keys(next)) {
          next[pid] = next[pid].map((t) => t.id === taskId ? { ...t, progress_pct: newPct } : t)
        }
        return next
      })
      setTaskSaveStatus((prev) => ({ ...prev, [taskId]: 'saved' }))
      // Clear the indicator after 2 s
      setTimeout(() => setTaskSaveStatus((prev) => {
        const n = { ...prev }; delete n[taskId]; return n
      }), 2000)
    } catch (e) {
      setTaskSaveStatus((prev) => ({ ...prev, [taskId]: 'error' }))
      setActionError(e instanceof Error ? e.message : 'Failed to save task progress')
    } finally {
      setSavingTaskId(null)
    }
  }

  const handleExportPDF = async (
    claimId: string,
    claim: ClaimHistoryItem,
    lineItems: ClaimLineItemDetail[],
    summary: ProgressReport['claimSummary']
  ) => {
    setExportingClaimId(claimId)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { default: ClaimPDF } = await import('./ClaimPDF')
      const props: ClaimPDFProps = {
        claim,
        lineItems,
        claimSummary: summary,
        projectName,
        projectAddress,
        orgName,
        orgAbn,
        orgAddress,
        paymentTermsDays: report.paymentTermsDays,
      }
      const blob = await pdf(<ClaimPDF {...props} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payment-claim-${String(claim.claimNumber).padStart(3, '0')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setExportingClaimId(null)
    }
  }

  // Export PDF for the current draft claim (uses live report data, not stored line items)
  const handleExportDraftPDF = async (claim: ClaimHistoryItem) => {
    const liveLineItems: ClaimLineItemDetail[] = phases.flatMap((phase, i) =>
      phase.movingTasks.map((task) => ({
        id:            task.id,
        taskId:        task.id,
        taskName:      task.name,
        phaseName:     phase.name,
        phaseColor:    getPhaseColor(i),
        contractValue: task.contractValue,
        previousPct:   task.previousPct,
        currentPct:    task.currentPct,
        valueToDate:   (task.currentPct / 100) * task.contractValue,
        valuePrevious: (task.previousPct / 100) * task.contractValue,
        thisClaimValue: task.claimAmount,
      }))
    )
    await handleExportPDF(claim.id, claim, liveLineItems, claimSummary)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-y-auto flex-1">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">

        {/* ── Success / Error banners ──────────────────────────────────────── */}
        {successMsg && (
          <div className="px-4 py-3 rounded-lg text-sm font-medium" style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok)', color: 'var(--ok)' }}>
            {successMsg}
          </div>
        )}
        {actionError && (
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
            {actionError}
          </div>
        )}

        {/* ── Claim Date + Generate Claim ──────────────────────────────────── */}
        <section>
          <div className="rounded-lg p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-end gap-6 flex-wrap">

              {/* Claim Date input */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Claim Date</span>
                <input
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                  className="px-3 py-2 rounded text-sm focus:outline-none"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                />
              </label>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium rounded disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}
              >
                {pending ? 'Loading…' : 'Refresh Report'}
              </button>

              {/* Calculated period (read-only) */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Claim Period</span>
                <span className="text-sm font-medium py-2" style={{ color: 'var(--ink-2)' }}>
                  {fmtDate(report.periodStart)} → {fmtDate(report.periodEnd)}
                </span>
              </div>

              {/* Generate Claim button */}
              <div className="ml-auto flex items-end">
                {report.draftClaim ? (
                  <span className="px-4 py-2 text-sm font-medium rounded" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>
                    Draft claim exists — submit or delete it first
                  </span>
                ) : (
                  <button
                    onClick={handleGenerateClaim}
                    disabled={actionPending || claimSummary.thisClaimGross <= 0}
                    className="px-5 py-2 text-white text-sm font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ background: 'var(--accent)' }}
                  >
                    {actionPending ? 'Generating…' : 'Generate Claim'}
                  </button>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* ── Draft Claim Actions ──────────────────────────────────────────── */}
        {report.draftClaim && (
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--ink)' }}>
              Draft Claim #{String(report.draftClaim.claimNumber).padStart(3, '0')}
            </h2>
            <div className="rounded-lg p-5" style={{ background: 'var(--surface)', border: '1px solid var(--warn)' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                    Period:{' '}
                    <span className="font-medium">
                      {fmtDate(report.draftClaim.periodStart)} → {fmtDate(report.draftClaim.periodEnd)}
                    </span>
                  </p>
                  <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                    Net payable:{' '}
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(report.draftClaim.netAmount)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => report.draftClaim && handleExportDraftPDF(report.draftClaim)}
                    disabled={exportingClaimId === report.draftClaim.id}
                    className="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                    style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
                  >
                    {exportingClaimId === report.draftClaim.id ? 'Exporting…' : 'Export PDF'}
                  </button>
                  <button
                    onClick={() => report.draftClaim && handleDeleteDraft(report.draftClaim.id)}
                    disabled={actionPending}
                    className="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                    style={{ border: '1px solid var(--bad-soft)', color: 'var(--bad)' }}
                  >
                    Delete Draft
                  </button>
                  <button
                    onClick={() => report.draftClaim && handleSubmitClaim(report.draftClaim.id)}
                    disabled={actionPending}
                    className="px-4 py-1.5 text-sm text-white font-medium rounded transition-colors disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    {actionPending ? 'Submitting…' : 'Submit Claim'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Overall Progress ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--ink)' }}>Overall Project Progress</h2>
          <div className="rounded-lg p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-baseline gap-4 mb-3">
              <span className="text-4xl font-bold" style={{ color: 'var(--ink)' }}>{pct(overall.currentPct)}</span>
              {overall.previousPct > 0 && (
                <span className="text-sm" style={{ color: 'var(--ink-3)' }}>
                  was {pct(overall.previousPct)} at period start
                  <span className="ml-2 font-medium" style={{ color: 'var(--ok)' }}>
                    (+{pct(overall.currentPct - overall.previousPct)})
                  </span>
                </span>
              )}
            </div>
            <div className="w-full h-4 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, overall.currentPct)}%`, background: 'var(--accent)' }}
              />
            </div>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
              <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{overall.complete}</span> of{' '}
              <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{overall.totalTasks}</span> tasks complete
              {overall.inProgress > 0 && (
                <>, <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{overall.inProgress}</span> in progress</>
              )}
            </p>
          </div>
        </section>

        {/* ── Phase Summary Table ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--ink)' }}>Phase Summary</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>Click a phase row to expand and edit task progress.</p>
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="w-8 px-3 py-2.5" />
                  <th className="text-left px-4 py-2.5 text-xs font-medium w-full" style={{ color: 'var(--ink-3)' }}>Phase</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Last Period %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>This Period %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Movement</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((phase, i) => {
                  const isOpen   = expandedPhaseIds.has(phase.id)
                  const tasks    = phaseTasks[phase.id] ?? []
                  const isLoading = loadingPhaseId === phase.id
                  return (
                    <Fragment key={phase.id}>
                      <tr
                        className="cursor-pointer transition-colors select-none"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onClick={() => handleTogglePhase(phase.id)}
                      >
                        <td className="w-8 px-3 py-2.5 text-xs" style={{ color: 'var(--ink-4)' }}>
                          {isOpen ? '▾' : '▸'}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--ink-2)' }}>
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                            style={{ background: getPhaseColor(i) }}
                          />
                          {phase.name}
                        </td>
                        <td className="px-4 py-2.5 text-right" style={{ color: 'var(--ink-3)' }}>{pct(phase.previousPct)}</td>
                        <td className="px-4 py-2.5 text-right font-medium" style={{ color: 'var(--ink-2)' }}>{pct(phase.currentPct)}</td>
                        <td className="px-4 py-2.5 text-right">{movementCell(phase.movement)}</td>
                      </tr>

                      {/* Expanded task rows */}
                      {isOpen && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={5} className="p-0" style={{ background: 'var(--bg)' }}>
                            {isLoading ? (
                              <p className="px-10 py-3 text-xs" style={{ color: 'var(--ink-4)' }}>Loading tasks…</p>
                            ) : (
                              <PhaseTasksTable
                                tasks={tasks}
                                draftProgress={draftProgress}
                                savingTaskId={savingTaskId}
                                taskSaveStatus={taskSaveStatus}
                                onProgressChange={(id, val) =>
                                  setDraftProgress((prev) => ({ ...prev, [id]: val }))
                                }
                                onSave={handleProgressSave}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {/* Total row */}
                <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                  <td className="px-3 py-3" />
                  <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--ink)' }}>Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>{pct(overall.previousPct)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>{pct(overall.currentPct)}</td>
                  <td className="px-4 py-3 text-right">{movementCell(overall.currentPct - overall.previousPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Task Detail Table ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>Task Detail</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>Tasks with progress movement during this period only.</p>

          {totalMovingTasks === 0 ? (
            <div className="rounded-lg px-6 py-10 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-4)' }}>
              No task progress was recorded during this period.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <th className="text-left px-4 py-2.5 text-xs font-medium w-full" style={{ color: 'var(--ink-3)' }}>Task</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Previous %</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Current %</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Movement</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Claim $</th>
                  </tr>
                </thead>
                <tbody>
                  {phases
                    .filter((p): p is PhaseProgress => p.movingTasks.length > 0)
                    .map((phase) => (
                      <Fragment key={phase.id}>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                          <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                              style={{ background: getPhaseColor(phases.indexOf(phase)) }}
                            />
                            {phase.name}
                          </td>
                        </tr>
                        {phase.movingTasks.map((task) => (
                          <tr key={task.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="pl-8 pr-4 py-2" style={{ color: 'var(--ink-3)' }}>{task.name}</td>
                            <td className="px-4 py-2 text-right" style={{ color: 'var(--ink-3)' }}>{pct(task.previousPct)}</td>
                            <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--ink-2)' }}>{pct(task.currentPct)}</td>
                            <td className="px-4 py-2 text-right">
                              <span className="font-medium" style={{ color: 'var(--ok)' }}>+{pct(task.movement)}</span>
                            </td>
                            <td className="px-4 py-2 text-right" style={{ color: 'var(--ink-2)' }}>
                              {task.contractValue > 0 ? fmt(task.claimAmount) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={4} className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--ink)' }}>
                      This period claim total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>
                      {fmt(phases.reduce((s, p) => s + p.movingTasks.reduce((t, task) => t + task.claimAmount, 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Delays Placeholder ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--ink)' }}>Delays</h2>
          <div className="rounded-lg px-6 py-4 flex items-center gap-3 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-3)' }}>
            <span className="text-lg" style={{ color: 'var(--border)' }}>⚠</span>
            No delays recorded this period.
          </div>
        </section>

        {/* ── Claim Summary ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--ink)' }}>Claim Summary</h2>
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-5 space-y-0">
              <ClaimLine label="Value of work to date"                value={fmt(claimSummary.valueToDate)}    />
              <ClaimLine
                label="Less previous claims (submitted/approved/paid)"
                value={`(${fmt(claimSummary.previousClaims)})`}
                muted
              />
              <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
              <ClaimLine label="This claim (gross)"    value={fmt(claimSummary.thisClaimGross)} bold />
              <ClaimLine
                label={`Less retention (${claimSummary.retentionPct}%)`}
                value={`(${fmt(claimSummary.retention)})`}
                muted
              />
              <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
              <ClaimLine label="Net payable" value={fmt(claimSummary.netPayable)} bold highlight />
            </div>
          </div>
        </section>

        {/* ── Claim History ────────────────────────────────────────────────── */}
        {(report.claimHistory.length > 0 || report.draftClaim) && (
          <section>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--ink)' }}>Claim History</h2>
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Claim #</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Period</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Gross Amount</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Net Amount</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Submitted</th>
                    <th className="px-4 py-2.5 text-xs font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {[...(report.draftClaim ? [report.draftClaim] : []), ...report.claimHistory].map((claim) => {
                    const badge = STATUS_BADGE[claim.status] ?? STATUS_BADGE.draft
                    const isExpanded = expandedClaimId === claim.id
                    const detail = claimDetails[claim.id]
                    const isLoading = loadingClaimId === claim.id

                    return (
                      <Fragment key={claim.id}>
                        <tr
                          className="transition-colors cursor-pointer"
                          style={{ borderBottom: '1px solid var(--border)' }}
                          onClick={() => handleToggleClaimDetail(claim.id)}
                        >
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>
                            #{String(claim.claimNumber).padStart(3, '0')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                            {fmtDate(claim.periodStart)} – {fmtDate(claim.periodEnd)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={badge.style}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--ink-2)' }}>{fmt(claim.grossAmount)}</td>
                          <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink)' }}>{fmt(claim.netAmount)}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--ink-3)' }}>
                            {claim.submittedAt ? fmtDate(claim.submittedAt.substring(0, 10)) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs" style={{ color: 'var(--ink-4)' }}>{isExpanded ? '▲' : '▼'}</span>
                          </td>
                        </tr>

                        {/* Expanded detail / actions */}
                        {isExpanded && (
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={7} className="px-6 py-4" style={{ background: 'var(--bg)' }}>

                              {/* Action buttons for this claim */}
                              <div className="flex gap-2 mb-4 flex-wrap">
                                {claim.status === 'draft' && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSubmitClaim(claim.id) }}
                                      disabled={actionPending}
                                      className="px-3 py-1.5 text-xs text-white font-medium rounded disabled:opacity-50"
                                      style={{ background: 'var(--accent)' }}
                                    >
                                      Submit Claim
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteDraft(claim.id) }}
                                      disabled={actionPending}
                                      className="px-3 py-1.5 text-xs rounded disabled:opacity-50"
                                      style={{ border: '1px solid var(--bad-soft)', color: 'var(--bad)' }}
                                    >
                                      Delete Draft
                                    </button>
                                  </>
                                )}
                                {claim.status === 'submitted' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(claim.id, 'approved') }}
                                    disabled={actionPending}
                                    className="px-3 py-1.5 text-xs text-white font-medium rounded disabled:opacity-50"
                                    style={{ background: 'var(--ok)' }}
                                  >
                                    Mark Approved
                                  </button>
                                )}
                                {claim.status === 'approved' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(claim.id, 'paid') }}
                                    disabled={actionPending}
                                    className="px-3 py-1.5 text-xs text-white font-medium rounded disabled:opacity-50"
                                    style={{ background: 'var(--ok)' }}
                                  >
                                    Mark Paid
                                  </button>
                                )}
                                {detail && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const totalPrev = detail.lineItems.reduce((s, li) => s + li.valuePrevious, 0)
                                      const totalVtd  = detail.lineItems.reduce((s, li) => s + li.valueToDate, 0)
                                      const retPct = claimSummary.retentionPct
                                      const retAmt = claim.grossAmount * (retPct / 100)
                                      handleExportPDF(claim.id, claim, detail.lineItems, {
                                        valueToDate:    totalVtd,
                                        previousClaims: totalPrev,
                                        thisClaimGross: claim.grossAmount,
                                        retention:      retAmt,
                                        netPayable:     claim.netAmount,
                                        retentionPct:   retPct,
                                      })
                                    }}
                                    disabled={exportingClaimId === claim.id}
                                    className="px-3 py-1.5 text-xs rounded disabled:opacity-50"
                                    style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
                                  >
                                    {exportingClaimId === claim.id ? 'Exporting…' : 'Export PDF'}
                                  </button>
                                )}
                              </div>

                              {/* Line items table */}
                              {isLoading ? (
                                <p className="text-xs py-2" style={{ color: 'var(--ink-4)' }}>Loading line items…</p>
                              ) : detail ? (
                                <ClaimLineItemsTable lineItems={detail.lineItems} phaseNameToColor={phaseNameColorMap} />
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ClaimLine({
  label, value, bold, muted, highlight,
}: {
  label: string
  value: string
  bold?: boolean
  muted?: boolean
  highlight?: boolean
}) {
  const labelColor = muted ? 'var(--ink-4)' : bold ? 'var(--ink)' : 'var(--ink-3)'
  const valueColor = highlight ? 'var(--accent)' : muted ? 'var(--ink-4)' : bold ? 'var(--ink)' : 'var(--ink-2)'
  return (
    <div
      className={`flex justify-between items-baseline py-2.5 ${highlight ? 'px-3 -mx-3 rounded' : ''}`}
      style={highlight ? { background: 'var(--accent-soft)' } : undefined}
    >
      <span className={`text-sm ${bold ? 'font-semibold' : ''}`} style={{ color: labelColor }}>
        {label}
      </span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : ''} ${highlight ? 'text-base font-bold' : ''}`} style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  )
}

function ClaimLineItemsTable({
  lineItems,
  phaseNameToColor,
}: {
  lineItems: ClaimLineItemDetail[]
  phaseNameToColor?: Map<string, string>
}) {
  const phaseNames = [...new Set(lineItems.map((li) => li.phaseName))]
  if (lineItems.length === 0) {
    return <p className="text-xs py-2" style={{ color: 'var(--ink-4)' }}>No line items on this claim.</p>
  }
  return (
    <div className="rounded overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--ink-3)' }}>Task</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Contract Value</th>
            <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--ink-3)' }}>Prev %</th>
            <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--ink-3)' }}>Curr %</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Value to Date</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Previously Claimed</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>This Claim</th>
          </tr>
        </thead>
        <tbody>
          {phaseNames.map((phaseName) => {
            const phaseTasks = lineItems.filter((li) => li.phaseName === phaseName)
            const phaseColor = phaseNameToColor?.get(phaseName) ?? phaseTasks[0]?.phaseColor ?? '#888'
            return (
              <Fragment key={phaseName}>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={7} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                    <span
                      className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
                      style={{ background: phaseColor }}
                    />
                    {phaseName}
                  </td>
                </tr>
                {phaseTasks.map((li) => (
                  <tr key={li.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="pl-7 pr-3 py-1.5" style={{ color: 'var(--ink-3)' }}>{li.taskName}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--ink-2)' }}>{fmt(li.contractValue)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--ink-3)' }}>{li.previousPct.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: 'var(--ink-2)' }}>{li.currentPct.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--ink-2)' }}>{fmt(li.valueToDate)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--ink-3)' }}>{fmt(li.valuePrevious)}</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: 'var(--ink)' }}>{fmt(li.thisClaimValue)}</td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
          <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
            <td colSpan={6} className="px-3 py-2 font-bold" style={{ color: 'var(--ink)' }}>Total</td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--ink)' }}>
              {fmt(lineItems.reduce((s, li) => s + li.thisClaimValue, 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── PhaseTasksTable ────────────────────────────────────────────────────────────

interface PhaseTasksTableProps {
  tasks:            PhaseTaskRow[]
  draftProgress:    Record<string, number>
  savingTaskId:     string | null
  taskSaveStatus:   Record<string, 'saved' | 'error'>
  onProgressChange: (taskId: string, val: number) => void
  onSave:           (taskId: string) => void
}

function PhaseTasksTable({
  tasks, draftProgress, savingTaskId, taskSaveStatus, onProgressChange, onSave,
}: PhaseTasksTableProps) {
  if (tasks.length === 0) {
    return <p className="px-10 py-3 text-xs" style={{ color: 'var(--ink-4)' }}>No tasks in this phase.</p>
  }
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <th className="text-left pl-10 pr-4 py-2 font-medium" style={{ color: 'var(--ink-3)' }}>Task</th>
            <th className="text-left px-4 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Start</th>
            <th className="text-left px-4 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>End</th>
            <th className="text-right px-4 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Progress</th>
            <th className="px-4 py-2 w-32" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const draft     = draftProgress[task.id] ?? task.progress_pct
            const isSaving  = savingTaskId === task.id
            const status    = taskSaveStatus[task.id]
            const startDate = task.current_start ?? task.planned_start
            const endDate   = task.current_end   ?? task.planned_end

            return (
              <tr
                key={task.id}
                className="transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {/* Task name */}
                <td className="pl-10 pr-4 py-2" style={{ color: 'var(--ink-3)' }}>{task.name}</td>

                {/* Start date */}
                <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                  {startDate ? fmtDate(startDate) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* End date */}
                <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                  {endDate ? fmtDate(endDate) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* Editable progress */}
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1 justify-end">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onProgressChange(
                          task.id,
                          Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                        )
                      }
                      className="w-14 px-2 py-1 rounded text-right text-xs focus:outline-none"
                      style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                    <span style={{ color: 'var(--ink-4)' }}>%</span>
                  </div>
                </td>

                {/* Save button + status indicator */}
                <td className="pl-2 pr-4 py-2">
                  <div className="flex items-center gap-2 justify-end">
                    {status === 'saved' && (
                      <span className="font-medium" style={{ color: 'var(--ok)' }}>✓ Saved</span>
                    )}
                    {status === 'error' && (
                      <span style={{ color: 'var(--bad)' }}>✗ Error</span>
                    )}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={(e) => { e.stopPropagation(); onSave(task.id) }}
                      className="px-2.5 py-1 text-white font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ background: 'var(--accent)' }}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
