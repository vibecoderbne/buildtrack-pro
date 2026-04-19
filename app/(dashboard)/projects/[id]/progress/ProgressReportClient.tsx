'use client'

import { useState, useTransition, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgressReport, PhaseProgress, ClaimHistoryItem, ClaimLineItemDetail } from '@/app/actions/progress'
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
  if (Math.abs(delta) < 0.05) return <span className="text-gray-400">—</span>
  if (delta > 0) return <span className="text-green-600 font-medium">+{pct(delta)}</span>
  return <span className="text-red-500 font-medium">{pct(delta)}</span>
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' },
  approved:  { label: 'Approved',  cls: 'bg-green-100 text-green-700' },
  paid:      { label: 'Paid',      cls: 'bg-emerald-100 text-emerald-800' },
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
    const liveLineItems: ClaimLineItemDetail[] = phases.flatMap((phase) =>
      phase.movingTasks.map((task) => ({
        id:            task.id,
        taskId:        task.id,
        taskName:      task.name,
        phaseName:     phase.name,
        phaseColor:    phase.color,
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
          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
            {successMsg}
          </div>
        )}
        {actionError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* ── Claim Date + Generate Claim ──────────────────────────────────── */}
        <section>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-end gap-6 flex-wrap">

              {/* Claim Date input */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">Claim Date</span>
                <input
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                />
              </label>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={pending}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {pending ? 'Loading…' : 'Refresh Report'}
              </button>

              {/* Calculated period (read-only) */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-500">Claim Period</span>
                <span className="text-sm text-gray-700 font-medium py-2">
                  {fmtDate(report.periodStart)} → {fmtDate(report.periodEnd)}
                </span>
              </div>

              {/* Generate Claim button */}
              <div className="ml-auto flex items-end">
                {report.draftClaim ? (
                  <span className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded">
                    Draft claim exists — submit or delete it first
                  </span>
                ) : (
                  <button
                    onClick={handleGenerateClaim}
                    disabled={actionPending || claimSummary.thisClaimGross <= 0}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Draft Claim #{String(report.draftClaim.claimNumber).padStart(3, '0')}
            </h2>
            <div className="bg-white rounded-lg border border-amber-200 p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-gray-700">
                    Period:{' '}
                    <span className="font-medium">
                      {fmtDate(report.draftClaim.periodStart)} → {fmtDate(report.draftClaim.periodEnd)}
                    </span>
                  </p>
                  <p className="text-sm text-gray-700">
                    Net payable:{' '}
                    <span className="font-semibold text-gray-900">{fmt(report.draftClaim.netAmount)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => report.draftClaim && handleExportDraftPDF(report.draftClaim)}
                    disabled={exportingClaimId === report.draftClaim.id}
                    className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {exportingClaimId === report.draftClaim.id ? 'Exporting…' : 'Export PDF'}
                  </button>
                  <button
                    onClick={() => report.draftClaim && handleDeleteDraft(report.draftClaim.id)}
                    disabled={actionPending}
                    className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Delete Draft
                  </button>
                  <button
                    onClick={() => report.draftClaim && handleSubmitClaim(report.draftClaim.id)}
                    disabled={actionPending}
                    className="px-4 py-1.5 text-sm bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
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
          <h2 className="text-base font-semibold text-gray-900 mb-3">Overall Project Progress</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-baseline gap-4 mb-3">
              <span className="text-4xl font-bold text-gray-900">{pct(overall.currentPct)}</span>
              {overall.previousPct > 0 && (
                <span className="text-sm text-gray-500">
                  was {pct(overall.previousPct)} at period start
                  <span className="ml-2 text-green-600 font-medium">
                    (+{pct(overall.currentPct - overall.previousPct)})
                  </span>
                </span>
              )}
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, overall.currentPct)}%` }}
              />
            </div>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{overall.complete}</span> of{' '}
              <span className="font-medium text-gray-700">{overall.totalTasks}</span> tasks complete
              {overall.inProgress > 0 && (
                <>, <span className="font-medium text-gray-700">{overall.inProgress}</span> in progress</>
              )}
            </p>
          </div>
        </section>

        {/* ── Phase Summary Table ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Phase Summary</h2>
          <p className="text-xs text-gray-500 mb-3">Click a phase row to expand and edit task progress.</p>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-full">Phase</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Last Period %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">This Period %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Movement</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((phase) => {
                  const isOpen   = expandedPhaseIds.has(phase.id)
                  const tasks    = phaseTasks[phase.id] ?? []
                  const isLoading = loadingPhaseId === phase.id
                  return (
                    <Fragment key={phase.id}>
                      <tr
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50/60 transition-colors select-none"
                        onClick={() => handleTogglePhase(phase.id)}
                      >
                        <td className="w-8 px-3 py-2.5 text-gray-400 text-xs">
                          {isOpen ? '▾' : '▸'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                            style={{ background: phase.color }}
                          />
                          {phase.name}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{pct(phase.previousPct)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 font-medium">{pct(phase.currentPct)}</td>
                        <td className="px-4 py-2.5 text-right">{movementCell(phase.movement)}</td>
                      </tr>

                      {/* Expanded task rows */}
                      {isOpen && (
                        <tr className="border-b border-gray-100">
                          <td colSpan={5} className="p-0 bg-gray-50/40">
                            {isLoading ? (
                              <p className="px-10 py-3 text-xs text-gray-400">Loading tasks…</p>
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
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-3 py-3" />
                  <td className="px-4 py-3 text-sm font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{pct(overall.previousPct)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{pct(overall.currentPct)}</td>
                  <td className="px-4 py-3 text-right">{movementCell(overall.currentPct - overall.previousPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Task Detail Table ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Task Detail</h2>
          <p className="text-xs text-gray-500 mb-3">Tasks with progress movement during this period only.</p>

          {totalMovingTasks === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 px-6 py-10 text-center text-gray-400 text-sm">
              No task progress was recorded during this period.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-full">Task</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Previous %</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Current %</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Movement</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Claim $</th>
                  </tr>
                </thead>
                <tbody>
                  {phases
                    .filter((p): p is PhaseProgress => p.movingTasks.length > 0)
                    .map((phase) => (
                      <Fragment key={phase.id}>
                        <tr className="border-b border-gray-100 bg-gray-50/80">
                          <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                              style={{ background: phase.color }}
                            />
                            {phase.name}
                          </td>
                        </tr>
                        {phase.movingTasks.map((task) => (
                          <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                            <td className="pl-8 pr-4 py-2 text-gray-600">{task.name}</td>
                            <td className="px-4 py-2 text-right text-gray-500">{pct(task.previousPct)}</td>
                            <td className="px-4 py-2 text-right text-gray-700 font-medium">{pct(task.currentPct)}</td>
                            <td className="px-4 py-2 text-right">
                              <span className="text-green-600 font-medium">+{pct(task.movement)}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {task.contractValue > 0 ? fmt(task.claimAmount) : <span className="text-gray-400">—</span>}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900">
                      This period claim total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
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
          <h2 className="text-base font-semibold text-gray-900 mb-3">Delays</h2>
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-4 flex items-center gap-3 text-sm text-gray-500">
            <span className="text-gray-300 text-lg">⚠</span>
            No delays recorded this period. Delay register will be wired up in Stage 4.
          </div>
        </section>

        {/* ── Claim Summary ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Claim Summary</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 space-y-0">
              <ClaimLine label="Value of work to date"                value={fmt(claimSummary.valueToDate)}    />
              <ClaimLine
                label="Less previous claims (submitted/approved/paid)"
                value={`(${fmt(claimSummary.previousClaims)})`}
                muted
              />
              <div className="border-t border-gray-100 my-1" />
              <ClaimLine label="This claim (gross)"    value={fmt(claimSummary.thisClaimGross)} bold />
              <ClaimLine
                label={`Less retention (${claimSummary.retentionPct}%)`}
                value={`(${fmt(claimSummary.retention)})`}
                muted
              />
              <div className="border-t border-gray-200 my-1" />
              <ClaimLine label="Net payable" value={fmt(claimSummary.netPayable)} bold highlight />
            </div>
          </div>
        </section>

        {/* ── Claim History ────────────────────────────────────────────────── */}
        {(report.claimHistory.length > 0 || report.draftClaim) && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Claim History</h2>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Claim #</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Period</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Gross Amount</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Net Amount</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Submitted</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500" />
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
                          className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors cursor-pointer"
                          onClick={() => handleToggleClaimDetail(claim.id)}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            #{String(claim.claimNumber).padStart(3, '0')}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {fmtDate(claim.periodStart)} – {fmtDate(claim.periodEnd)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(claim.grossAmount)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(claim.netAmount)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {claim.submittedAt ? fmtDate(claim.submittedAt.substring(0, 10)) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                          </td>
                        </tr>

                        {/* Expanded detail / actions */}
                        {isExpanded && (
                          <tr className="border-b border-gray-100">
                            <td colSpan={7} className="px-6 py-4 bg-gray-50/70">

                              {/* Action buttons for this claim */}
                              <div className="flex gap-2 mb-4 flex-wrap">
                                {claim.status === 'draft' && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSubmitClaim(claim.id) }}
                                      disabled={actionPending}
                                      className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                      Submit Claim
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteDraft(claim.id) }}
                                      disabled={actionPending}
                                      className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                                    >
                                      Delete Draft
                                    </button>
                                  </>
                                )}
                                {claim.status === 'submitted' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(claim.id, 'approved') }}
                                    disabled={actionPending}
                                    className="px-3 py-1.5 text-xs bg-green-600 text-white font-medium rounded hover:bg-green-700 disabled:opacity-50"
                                  >
                                    Mark Approved
                                  </button>
                                )}
                                {claim.status === 'approved' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(claim.id, 'paid') }}
                                    disabled={actionPending}
                                    className="px-3 py-1.5 text-xs bg-emerald-600 text-white font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    Mark Paid
                                  </button>
                                )}
                                {detail && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // Build a summary approximation from line items
                                      const totalThisClaim = detail.lineItems.reduce((s, li) => s + li.thisClaimValue, 0)
                                      const totalPrev      = detail.lineItems.reduce((s, li) => s + li.valuePrevious, 0)
                                      const totalVtd       = detail.lineItems.reduce((s, li) => s + li.valueToDate, 0)
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
                                    className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-white disabled:opacity-50"
                                  >
                                    {exportingClaimId === claim.id ? 'Exporting…' : 'Export PDF'}
                                  </button>
                                )}
                              </div>

                              {/* Line items table */}
                              {isLoading ? (
                                <p className="text-xs text-gray-400 py-2">Loading line items…</p>
                              ) : detail ? (
                                <ClaimLineItemsTable lineItems={detail.lineItems} />
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
  return (
    <div className={`flex justify-between items-baseline py-2.5 ${highlight ? 'px-3 -mx-3 bg-indigo-50 rounded' : ''}`}>
      <span className={`text-sm ${muted ? 'text-gray-400' : bold ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums ${muted ? 'text-gray-400' : bold ? 'text-gray-900 font-bold' : 'text-gray-700'} ${highlight ? 'text-indigo-700 font-bold text-base' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function ClaimLineItemsTable({ lineItems }: { lineItems: ClaimLineItemDetail[] }) {
  const phases = [...new Set(lineItems.map((li) => li.phaseName))]
  if (lineItems.length === 0) {
    return <p className="text-xs text-gray-400 py-2">No line items on this claim.</p>
  }
  return (
    <div className="rounded border border-gray-200 overflow-hidden bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Task</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Contract Value</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium">Prev %</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium">Curr %</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Value to Date</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Previously Claimed</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">This Claim</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((phaseName) => {
            const phaseTasks = lineItems.filter((li) => li.phaseName === phaseName)
            const phaseColor = phaseTasks[0]?.phaseColor ?? '#888'
            return (
              <Fragment key={phaseName}>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <td colSpan={7} className="px-3 py-1.5 text-gray-600 font-semibold text-xs uppercase tracking-wide">
                    <span
                      className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
                      style={{ background: phaseColor }}
                    />
                    {phaseName}
                  </td>
                </tr>
                {phaseTasks.map((li) => (
                  <tr key={li.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="pl-7 pr-3 py-1.5 text-gray-600">{li.taskName}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(li.contractValue)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{li.previousPct.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 font-medium">{li.currentPct.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(li.valueToDate)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{fmt(li.valuePrevious)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(li.thisClaimValue)}</td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td colSpan={6} className="px-3 py-2 font-bold text-gray-900">Total</td>
            <td className="px-3 py-2 text-right font-bold text-gray-900">
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
    return <p className="px-10 py-3 text-xs text-gray-400">No tasks in this phase.</p>
  }
  return (
    <div className="border-t border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-100/70 border-b border-gray-200">
            <th className="text-left pl-10 pr-4 py-2 font-medium text-gray-500">Task</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500 whitespace-nowrap">Start</th>
            <th className="text-left px-4 py-2 font-medium text-gray-500 whitespace-nowrap">End</th>
            <th className="text-right px-4 py-2 font-medium text-gray-500 whitespace-nowrap">Progress</th>
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
                className="border-b border-gray-100 hover:bg-white/80 transition-colors"
              >
                {/* Task name */}
                <td className="pl-10 pr-4 py-2 text-gray-600">{task.name}</td>

                {/* Start date */}
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {startDate ? fmtDate(startDate) : <span className="text-gray-300">—</span>}
                </td>

                {/* End date */}
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {endDate ? fmtDate(endDate) : <span className="text-gray-300">—</span>}
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
                      className="w-14 px-2 py-1 border border-gray-300 rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                    />
                    <span className="text-gray-400">%</span>
                  </div>
                </td>

                {/* Save button + status indicator */}
                <td className="pl-2 pr-4 py-2">
                  <div className="flex items-center gap-2 justify-end">
                    {status === 'saved' && (
                      <span className="text-green-600 font-medium">✓ Saved</span>
                    )}
                    {status === 'error' && (
                      <span className="text-red-500">✗ Error</span>
                    )}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={(e) => { e.stopPropagation(); onSave(task.id) }}
                      className="px-2.5 py-1 bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
