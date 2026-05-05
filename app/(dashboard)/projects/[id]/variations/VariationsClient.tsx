'use client'

import React, { useState, useTransition, useMemo } from 'react'
import { lockProjectBaseline } from '@/app/actions/variations'

// ─── Local types ──────────────────────────────────────────────────────────────

interface Phase { id: string; name: string; sort_order: number }

interface Task {
  id: string
  name: string
  phase_id: string
  current_start: string | null
  current_end: string | null
  duration_days: number
  contract_value: number
  sort_order: number
}

interface TaskBaseline {
  task_id: string
  original_start_date: string
  original_end_date: string
  original_duration: number
  original_contract_price: number
}

interface TaskVariation {
  id: string
  task_id: string
  field_changed: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  changed_by: string | null
  reason: string | null
}

interface Props {
  projectId: string
  projectName: string
  baselineLockedAt: string | null
  baselineLockedBy: string | null
  lockedByName: string | null
  phases: Phase[]
  tasks: Task[]
  baselines: TaskBaseline[]
  variations: TaskVariation[]
  userNames: Record<string, string>
  taskCount: number
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate()
  const month = MONTHS[d.getMonth()]
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year}, ${hh}:${mm}`
}

function fmtCurrency(val: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(val)
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function calendarDaysDiff(dateA: string, dateB: string): number {
  const a = parseLocalDate(dateA)
  const b = parseLocalDate(dateB)
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

function formatVariationValue(field: string, value: string | null): string {
  if (value === null || value === '') return '—'
  switch (field) {
    case 'start_date':
    case 'end_date':
      return fmtDate(value)
    case 'duration':
      return `${value} days`
    case 'contract_price':
      return fmtCurrency(Number(value))
    default:
      return value
  }
}

const FIELD_LABELS: Record<string, string> = {
  start_date: 'Start Date',
  end_date: 'End Date',
  duration: 'Duration',
  contract_price: 'Contract Price',
}

function varianceColour(val: number): string {
  if (val > 0) return 'var(--bad)'
  if (val < 0) return 'var(--ok)'
  return 'var(--ink-3)'
}

function varianceStyle(val: number | null): React.CSSProperties {
  if (val === null) return { color: 'var(--ink-4)' }
  return { color: varianceColour(val) }
}

function variancePrefix(val: number): string {
  if (val > 0) return '+'
  return ''
}

// Groups consecutive variations by same user within the same minute
function groupVariationsByMinute(vars: TaskVariation[]): TaskVariation[][] {
  const groups: TaskVariation[][] = []
  for (const v of vars) {
    const last = groups[groups.length - 1]
    if (
      last &&
      last[0].changed_by === v.changed_by &&
      Math.abs(new Date(last[0].changed_at).getTime() - new Date(v.changed_at).getTime()) < 60_000
    ) {
      last.push(v)
    } else {
      groups.push([v])
    }
  }
  return groups
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariationsClient({
  projectId,
  baselineLockedAt,
  baselineLockedBy,
  lockedByName,
  phases,
  tasks,
  baselines,
  variations,
  userNames,
  taskCount,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lightboxTaskId, setLightboxTaskId] = useState<string | null>(null)
  const [lockError, setLockError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ─── Derived data ───────────────────────────────────────────────────────────

  const baselineMap = useMemo(() => {
    const m = new Map<string, TaskBaseline>()
    for (const b of baselines) m.set(b.task_id, b)
    return m
  }, [baselines])

  const variationsByTask = useMemo(() => {
    const m = new Map<string, TaskVariation[]>()
    for (const v of variations) {
      const arr = m.get(v.task_id) ?? []
      arr.push(v)
      m.set(v.task_id, arr)
    }
    return m
  }, [variations])

  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.sort_order - b.sort_order),
    [phases]
  )

  const tasksByPhase = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      const arr = m.get(t.phase_id) ?? []
      arr.push(t)
      m.set(t.phase_id, arr)
    }
    // Sort each phase's tasks by sort_order
    for (const [k, v] of m) m.set(k, v.sort((a, b) => a.sort_order - b.sort_order))
    return m
  }, [tasks])

  // ─── Summary stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!baselineLockedAt) return null
    let tasksWithVars = 0
    let netSchedule = 0
    let netPrice = 0
    for (const task of tasks) {
      const baseline = baselineMap.get(task.id)
      if (!baseline) continue
      const hasVars = (variationsByTask.get(task.id)?.length ?? 0) > 0
      if (hasVars) tasksWithVars++
      if (task.current_end) {
        netSchedule += calendarDaysDiff(task.current_end, baseline.original_end_date)
      }
      netPrice += task.contract_value - baseline.original_contract_price
    }
    return {
      tasksWithVars,
      netSchedule,
      netPrice,
      totalEvents: variations.length,
    }
  }, [baselineLockedAt, tasks, baselines, variationsByTask, variations, baselineMap])

  // ─── Lock handler ───────────────────────────────────────────────────────────

  function handleLockConfirm() {
    setLockError(null)
    startTransition(async () => {
      const { error } = await lockProjectBaseline(projectId)
      if (error) {
        setLockError(error)
      } else {
        setConfirmOpen(false)
      }
    })
  }

  // ─── Lightbox task data ─────────────────────────────────────────────────────

  const lightboxTask = lightboxTaskId ? tasks.find(t => t.id === lightboxTaskId) ?? null : null
  const lightboxBaseline = lightboxTask ? baselineMap.get(lightboxTask.id) ?? null : null
  const lightboxVariations = lightboxTask ? (variationsByTask.get(lightboxTask.id) ?? []) : []
  const lightboxGroups = groupVariationsByMinute(lightboxVariations)
  const lightboxPhase = lightboxTask
    ? phases.find(p => p.id === lightboxTask.phase_id)
    : null

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Fixed top: baseline + stats ───────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-8 pb-4">

      {/* ── Baseline status block ─────────────────────────────────────────── */}
      <div className="mb-6">
        {!baselineLockedAt ? (
          <div className="rounded-lg p-5" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
            <p className="text-sm mb-4" style={{ color: 'var(--accent-ink)' }}>
              Lock the baseline once your contract programme is finalised. After locking, any
              changes to task dates, duration, or contract price will be tracked as variations.
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              className="px-4 py-2 text-white text-sm font-medium rounded-md transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              Lock Baseline
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-3)' }}>
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ok)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>
              Baseline locked on <strong>{fmtDate(baselineLockedAt.split('T')[0])}</strong>
              {lockedByName ? <> by <strong>{lockedByName}</strong></> : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Summary stats strip ───────────────────────────────────────────── */}
      {baselineLockedAt && stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Tasks with Variations"
            value={String(stats.tasksWithVars)}
          />
          <StatCard
            label="Net Schedule Variance"
            value={`${variancePrefix(stats.netSchedule)}${stats.netSchedule} days`}
            colour={varianceColour(stats.netSchedule)}
          />
          <StatCard
            label="Net Contract Variance"
            value={`${variancePrefix(stats.netPrice)}${fmtCurrency(stats.netPrice)}`}
            colour={varianceColour(stats.netPrice)}
          />
          <StatCard
            label="Total Variation Events"
            value={String(stats.totalEvents)}
          />
        </div>
      )}

      </div>{/* end fixed-top */}

      {/* ── Scrollable table area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-8 pb-8">

      {/* ── Main table ────────────────────────────────────────────────────── */}
      {baselineLockedAt && (
        <>
          {tasks.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--ink-3)' }}>
              No tasks found for this project.{' '}
              <a href="../programme" className="hover:underline" style={{ color: 'var(--accent)' }}>Go to Programme</a>
            </div>
          ) : (
            <>
              {stats && stats.totalEvents === 0 && (
                <p className="text-sm mb-3" style={{ color: 'var(--ink-3)' }}>No variations recorded yet.</p>
              )}
              <div className="rounded-lg overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <th className="px-4 py-3 text-left font-medium w-48" style={{ color: 'var(--ink-3)' }}>Task</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ink-3)' }}>Orig Start</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ink-3)' }}>Curr Start</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ink-3)' }}>Orig End</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ink-3)' }}>Curr End</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink-3)' }}>Orig Days</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink-3)' }}>Curr Days</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink-3)' }}>Orig Price</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink-3)' }}>Curr Price</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink-3)' }}>Sched Var</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ink-3)' }}>Price Var</th>
                      <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ink-3)' }}>Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPhases.map(phase => {
                      const phaseTasks = tasksByPhase.get(phase.id) ?? []
                      if (phaseTasks.length === 0) return null
                      return (
                        <PhaseGroup
                          key={phase.id}
                          phase={phase}
                          tasks={phaseTasks}
                          baselineMap={baselineMap}
                          variationsByTask={variationsByTask}
                          onOpenLightbox={setLightboxTaskId}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      </div>{/* end scrollable table area */}

      {/* ── Lock confirmation modal ───────────────────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg shadow-xl w-full max-w-md mx-4" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Lock Baseline</h2>
              <button
                onClick={() => { setConfirmOpen(false); setLockError(null) }}
                style={{ color: 'var(--ink-4)' }}
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
                This will snapshot the current start date, end date, duration, and contract price
                for all <strong>{taskCount}</strong> tasks as the original baseline. This cannot
                be undone. Continue?
              </p>
              {lockError && (
                <p className="text-sm mb-3" style={{ color: 'var(--bad)' }}>{lockError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setConfirmOpen(false); setLockError(null) }}
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleLockConfirm}
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-colors"
                style={{ background: 'var(--accent)' }}
              >
                {isPending ? 'Locking…' : 'Lock Baseline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Variation history lightbox ────────────────────────────────────── */}
      {lightboxTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setLightboxTaskId(null) }}
        >
          <div className="rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" style={{ background: 'var(--surface)' }}>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{lightboxTask.name}</h2>
                {lightboxPhase && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{lightboxPhase.name}</p>
                )}
              </div>
              <button
                onClick={() => setLightboxTaskId(null)}
                className="mt-0.5"
                style={{ color: 'var(--ink-4)' }}
              >
                ✕
              </button>
            </div>

            {/* Summary strip */}
            {lightboxBaseline && (
              <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <LightboxSummaryField
                    label="Start Date"
                    original={fmtDate(lightboxBaseline.original_start_date)}
                    current={fmtDate(lightboxTask.current_start)}
                    delta={
                      lightboxTask.current_start
                        ? calendarDaysDiff(lightboxTask.current_start, lightboxBaseline.original_start_date)
                        : null
                    }
                    unit="days"
                  />
                  <LightboxSummaryField
                    label="End Date"
                    original={fmtDate(lightboxBaseline.original_end_date)}
                    current={fmtDate(lightboxTask.current_end)}
                    delta={
                      lightboxTask.current_end
                        ? calendarDaysDiff(lightboxTask.current_end, lightboxBaseline.original_end_date)
                        : null
                    }
                    unit="days"
                  />
                  <LightboxSummaryField
                    label="Duration"
                    original={`${lightboxBaseline.original_duration} days`}
                    current={`${lightboxTask.duration_days} days`}
                    delta={lightboxTask.duration_days - lightboxBaseline.original_duration}
                    unit="days"
                  />
                  <LightboxSummaryField
                    label="Contract Price"
                    original={fmtCurrency(lightboxBaseline.original_contract_price)}
                    current={fmtCurrency(lightboxTask.contract_value)}
                    delta={lightboxTask.contract_value - lightboxBaseline.original_contract_price}
                    unit="$"
                    isCurrency
                  />
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {lightboxVariations.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--ink-3)' }}>
                  No variations recorded for this task.
                </p>
              ) : (
                <div className="space-y-4">
                  {lightboxGroups.map((group, gi) => (
                    <div key={gi} className="rounded-md p-3" style={{ border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                          {fmtDateTime(group[0].changed_at)}
                        </span>
                        {group[0].changed_by && (
                          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                            — {userNames[group[0].changed_by] ?? 'Unknown user'}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {group.map(v => (
                          <div key={v.id} className="text-sm" style={{ color: 'var(--ink-2)' }}>
                            changed{' '}
                            <span className="font-medium">{FIELD_LABELS[v.field_changed] ?? v.field_changed}</span>{' '}
                            from{' '}
                            <span className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>
                              {formatVariationValue(v.field_changed, v.old_value)}
                            </span>{' '}
                            to{' '}
                            <span className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>
                              {formatVariationValue(v.field_changed, v.new_value)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {group[0].reason && (
                        <p className="text-xs mt-2 italic" style={{ color: 'var(--ink-3)' }}>{group[0].reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="rounded-lg px-4 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs mb-1" style={{ color: 'var(--ink-3)' }}>{label}</p>
      <p className="text-xl font-semibold" style={{ color: colour ?? 'var(--ink)' }}>{value}</p>
    </div>
  )
}

function PhaseGroup({
  phase,
  tasks,
  baselineMap,
  variationsByTask,
  onOpenLightbox,
}: {
  phase: Phase
  tasks: Task[]
  baselineMap: Map<string, TaskBaseline>
  variationsByTask: Map<string, TaskVariation[]>
  onOpenLightbox: (id: string) => void
}) {
  return (
    <>
      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <td colSpan={12} className="px-4 py-2 font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
          {phase.name}
        </td>
      </tr>
      {tasks.map(task => {
        const baseline = baselineMap.get(task.id)
        const taskVars = variationsByTask.get(task.id) ?? []
        const hasVars = taskVars.length > 0
        const isNewScope = !baseline

        const schedVar =
          baseline && task.current_end
            ? calendarDaysDiff(task.current_end, baseline.original_end_date)
            : null
        const priceVar = baseline ? task.contract_value - baseline.original_contract_price : null

        const rowBg = isNewScope
          ? 'var(--info-soft)'
          : hasVars
          ? 'var(--warn-soft)'
          : 'var(--surface)'

        return (
          <tr
            key={task.id}
            className="hover:brightness-95 cursor-pointer transition-colors"
            style={{ background: rowBg, borderBottom: '1px solid var(--border)' }}
            onDoubleClick={() => onOpenLightbox(task.id)}
          >
            {/* Task name + badges */}
            <td className="px-4 py-2.5">
              <span className="font-medium" style={{ color: 'var(--ink)' }}>{task.name}</span>
              {isNewScope && (
                <span
                  className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
                >
                  New scope
                </span>
              )}
            </td>

            {/* Orig start */}
            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
              {baseline ? fmtDate(baseline.original_start_date) : '—'}
            </td>
            {/* Curr start */}
            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
              {fmtDate(task.current_start)}
            </td>
            {/* Orig end */}
            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
              {baseline ? fmtDate(baseline.original_end_date) : '—'}
            </td>
            {/* Curr end */}
            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
              {fmtDate(task.current_end)}
            </td>
            {/* Orig duration */}
            <td className="px-4 py-2.5 text-right" style={{ color: 'var(--ink-3)' }}>
              {baseline ? baseline.original_duration : '—'}
            </td>
            {/* Curr duration */}
            <td className="px-4 py-2.5 text-right" style={{ color: 'var(--ink-2)' }}>
              {task.duration_days}
            </td>
            {/* Orig price */}
            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
              {baseline ? fmtCurrency(baseline.original_contract_price) : '—'}
            </td>
            {/* Curr price */}
            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
              {fmtCurrency(task.contract_value)}
            </td>
            {/* Schedule variance */}
            <td className="px-4 py-2.5 text-right font-medium" style={varianceStyle(schedVar)}>
              {schedVar !== null
                ? `${variancePrefix(schedVar)}${schedVar}d`
                : '—'}
            </td>
            {/* Price variance */}
            <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap" style={varianceStyle(priceVar)}>
              {priceVar !== null
                ? `${variancePrefix(priceVar)}${fmtCurrency(priceVar)}`
                : '—'}
            </td>
            {/* Changes badge */}
            <td className="px-4 py-2.5 text-center">
              {taskVars.length > 0 ? (
                <button
                  onClick={e => { e.stopPropagation(); onOpenLightbox(task.id) }}
                  className="text-xs font-medium px-2 py-0.5 rounded transition-colors"
                  style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
                >
                  {taskVars.length} {taskVars.length === 1 ? 'change' : 'changes'}
                </button>
              ) : (
                <span style={{ color: 'var(--ink-4)' }}>—</span>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function LightboxSummaryField({
  label,
  original,
  current,
  delta,
  unit,
  isCurrency,
}: {
  label: string
  original: string
  current: string
  delta: number | null
  unit: string
  isCurrency?: boolean
}) {
  const deltaStr = delta !== null
    ? isCurrency
      ? `${variancePrefix(delta)}${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(delta)}`
      : `${variancePrefix(delta)}${delta} ${unit}`
    : null

  return (
    <div>
      <p className="font-medium mb-1" style={{ color: 'var(--ink-3)' }}>{label}</p>
      <p style={{ color: 'var(--ink-4)' }}>{original}</p>
      <p className="font-medium" style={{ color: 'var(--ink)' }}>{current}</p>
      {deltaStr !== null && delta !== null && (
        <p className="mt-0.5" style={varianceStyle(delta)}>{deltaStr}</p>
      )}
    </div>
  )
}
