'use client'

import { Fragment, useRef, useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateTaskFields,
  createProjectTask,
  deleteProjectTask,
  createTaskWithDetails,
  deletePhase as deletePhaseAction,
} from '@/app/actions/tasks'
import { addWeekdays, countWeekdays, parseLocalDate, formatDate } from '@/lib/dateUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phase {
  id: string
  name: string
  sort_order: number
}

interface TaskRow {
  id: string
  phase_id: string
  phase_name: string
  name: string
  current_start: string | null
  current_end: string | null
  planned_start: string | null
  planned_end: string | null
  duration_days: number | null
  progress_pct: number | null
  contract_value: number | null
  trade: string | null
  notes: string | null
  is_milestone: boolean | null
  sort_order: number
}

type SaveableFields = Parameters<typeof updateTaskFields>[1]

interface Props {
  projectId: string
  phases: Phase[]
  initialTasks: TaskRow[]
}

type SortCol = keyof TaskRow | null
type SortDir = 'asc' | 'desc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null) {
  if (v == null) return ''
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(v)
}

// ─── Cell editors ─────────────────────────────────────────────────────────────

interface TextCellProps {
  value: string
  onSave: (v: string) => void
  placeholder?: string
}
function TextCell({ value, onSave, placeholder }: TextCellProps) {
  const [draft, setDraft] = useState(value)
  const savedRef = useRef(value)

  if (value !== savedRef.current && draft === savedRef.current) {
    setDraft(value)
    savedRef.current = value
  }

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== savedRef.current) {
          savedRef.current = draft
          onSave(draft)
        }
      }}
      className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 py-0.5 text-sm"
    />
  )
}

interface NumberCellProps {
  value: number | null
  min?: number
  max?: number
  onSave: (v: number) => void
  className?: string
}
function NumberCell({ value, min, max, onSave, className = '' }: NumberCellProps) {
  const str = value != null ? String(value) : ''
  const [draft, setDraft] = useState(str)
  const savedRef = useRef(str)

  if (str !== savedRef.current && draft === savedRef.current) {
    setDraft(str)
    savedRef.current = str
  }

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(draft)
        if (!isNaN(parsed) && draft !== savedRef.current) {
          const clamped =
            min != null
              ? Math.max(min, max != null ? Math.min(max, parsed) : parsed)
              : parsed
          savedRef.current = draft
          onSave(clamped)
        }
      }}
      className={`w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 py-0.5 text-sm ${className}`}
    />
  )
}

interface DateCellProps {
  value: string | null
  onSave: (v: string) => void
}
function DateCell({ value, onSave }: DateCellProps) {
  const str = value ?? ''
  const [draft, setDraft] = useState(str)
  const savedRef = useRef(str)

  if (str !== savedRef.current && draft === savedRef.current) {
    setDraft(str)
    savedRef.current = str
  }

  return (
    <input
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== savedRef.current) {
          savedRef.current = draft
          onSave(draft)
        }
      }}
      className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 py-0.5 text-xs"
    />
  )
}

// ─── Shared task row ──────────────────────────────────────────────────────────

const tdClass = 'px-1 py-0.5 border-b border-gray-100 align-middle'

interface TaskRowProps {
  task: TaskRow
  phases: Phase[]
  showPhaseCol: boolean
  confirmDeleteId: string | null
  onSave: (taskId: string, fields: SaveableFields) => void
  onPhaseChange: (taskId: string, phaseId: string, phaseName: string) => void
  onConfirmDelete: (taskId: string | null) => void
  onDelete: (taskId: string) => void
}
function TaskTableRow({
  task,
  phases,
  showPhaseCol,
  confirmDeleteId,
  onSave,
  onPhaseChange,
  onConfirmDelete,
  onDelete,
}: TaskRowProps) {
  return (
    <tr className="hover:bg-indigo-50/30 group">

      {/* Phase — only shown in single-phase filter view */}
      {showPhaseCol && (
        <td className={`${tdClass} min-w-[176px]`}>
          <select
            value={task.phase_id}
            onChange={(e) => {
              const phaseId = e.target.value
              const phaseName = phases.find((p) => p.id === phaseId)?.name ?? ''
              onPhaseChange(task.id, phaseId, phaseName)
            }}
            className="text-sm bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 py-0.5 w-full"
          >
            {phases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </td>
      )}

      {/* Name */}
      <td className={`${tdClass} min-w-[256px]`}>
        <TextCell
          value={task.name}
          placeholder="Task name"
          onSave={(v) => onSave(task.id, { name: v })}
        />
      </td>

      {/* Start — recalculates end date keeping duration fixed */}
      <td className={tdClass}>
        <DateCell
          value={task.current_start}
          onSave={(v) => {
            const duration = task.duration_days ?? 1
            const newEnd = formatDate(addWeekdays(parseLocalDate(v), duration))
            onSave(task.id, { current_start: v, current_end: newEnd })
          }}
        />
      </td>

      {/* End — recalculates duration keeping start fixed */}
      <td className={tdClass}>
        <DateCell
          value={task.current_end}
          onSave={(v) => {
            const start = task.current_start
            if (start) {
              const newDuration = countWeekdays(parseLocalDate(start), parseLocalDate(v))
              onSave(task.id, { current_end: v, duration_days: newDuration })
            } else {
              onSave(task.id, { current_end: v })
            }
          }}
        />
      </td>

      {/* Duration — recalculates end date keeping start fixed */}
      <td className={tdClass}>
        <NumberCell
          value={task.duration_days}
          min={1}
          onSave={(v) => {
            const start = task.current_start
            if (start) {
              const newEnd = formatDate(addWeekdays(parseLocalDate(start), v))
              onSave(task.id, { duration_days: v, current_end: newEnd })
            } else {
              onSave(task.id, { duration_days: v })
            }
          }}
        />
      </td>

      {/* Progress */}
      <td className={tdClass}>
        <div className="flex items-center gap-1.5">
          <NumberCell
            value={task.progress_pct}
            min={0}
            max={100}
            onSave={(v) => onSave(task.id, { progress_pct: v })}
            className="w-14"
          />
          <span className="text-xs text-gray-400">%</span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[28px]">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${task.progress_pct ?? 0}%` }}
            />
          </div>
        </div>
      </td>

      {/* Contract value */}
      <td className={tdClass}>
        <NumberCell
          value={task.contract_value}
          min={0}
          onSave={(v) => onSave(task.id, { contract_value: v })}
        />
      </td>

      {/* Trade */}
      <td className={tdClass}>
        <TextCell
          value={task.trade ?? ''}
          placeholder="Trade"
          onSave={(v) => onSave(task.id, { trade: v || null })}
        />
      </td>

      {/* Milestone */}
      <td className={`${tdClass} text-center`}>
        <input
          type="checkbox"
          checked={task.is_milestone ?? false}
          onChange={(e) => onSave(task.id, { is_milestone: e.target.checked })}
          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-400 cursor-pointer"
        />
      </td>

      {/* Notes */}
      <td className={`${tdClass} min-w-[160px]`}>
        <TextCell
          value={task.notes ?? ''}
          placeholder="Notes"
          onSave={(v) => onSave(task.id, { notes: v || null })}
        />
      </td>

      {/* Delete */}
      <td className={`${tdClass} text-center`}>
        {confirmDeleteId === task.id ? (
          <span className="flex items-center justify-center gap-1">
            <button
              onClick={() => onDelete(task.id)}
              className="text-xs text-red-600 font-medium hover:underline"
            >
              Yes
            </button>
            <span className="text-gray-300">/</span>
            <button
              onClick={() => onConfirmDelete(null)}
              className="text-xs text-gray-500 hover:underline"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => onConfirmDelete(task.id)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity text-lg leading-none px-1"
            title="Delete task"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TasksClient({ projectId, phases: initialPhases, initialTasks }: Props) {
  const router = useRouter()

  const [phases, setPhases] = useState<Phase[]>(initialPhases)
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks)
  const [filterPhase, setFilterPhase] = useState<string>('all')
  const [filterText, setFilterText] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('sort_order')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [collapsedPhaseIds, setCollapsedPhaseIds] = useState<Set<string>>(new Set())
  const [addingPhaseId, setAddingPhaseId] = useState<string>(initialPhases[0]?.id ?? '')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Add task modal state ─────────────────────────────────────────────────────
  const [addTaskModal, setAddTaskModal] = useState<{ phaseId: string; phaseName: string } | null>(null)
  const [addTaskForm, setAddTaskForm] = useState({ name: '', startDate: '', endDate: '', trade: '', contractValue: '' })

  // ── Delete phase modal state ─────────────────────────────────────────────────
  const [deletePhaseModal, setDeletePhaseModal] = useState<{ phaseId: string; phaseName: string } | null>(null)
  const [deletePhaseConfirm, setDeletePhaseConfirm] = useState('')

  function togglePhaseCollapse(phaseId: string) {
    setCollapsedPhaseIds((prev) => {
      const next = new Set(prev)
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId)
      return next
    })
  }

  // ── Filtered + sorted view ──────────────────────────────────────────────────

  const visible = useMemo(() => {
    let rows = [...tasks]

    if (filterPhase !== 'all') rows = rows.filter((t) => t.phase_id === filterPhase)
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      rows = rows.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.trade ?? '').toLowerCase().includes(q) ||
          (t.notes ?? '').toLowerCase().includes(q)
      )
    }

    if (sortCol) {
      rows.sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        let cmp = 0
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
        else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv)
        else cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [tasks, filterPhase, filterText, sortCol, sortDir])

  // ── Totals ──────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const contractSum = visible.reduce((s, t) => s + (t.contract_value ?? 0), 0)
    const totalDays   = visible.reduce((s, t) => s + (t.duration_days ?? 0), 0)
    const avgProgress = visible.length
      ? Math.round(visible.reduce((s, t) => s + (t.progress_pct ?? 0), 0) / visible.length)
      : 0
    return { contractSum, totalDays, avgProgress }
  }, [visible])

  // ── Sort toggle ─────────────────────────────────────────────────────────────

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="ml-0.5 text-gray-300">↕</span>
    return <span className="ml-0.5 text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Save helper ─────────────────────────────────────────────────────────────

  function saveField(taskId: string, fields: SaveableFields) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...fields } : t)))
    startTransition(async () => {
      try {
        await updateTaskFields(taskId, fields)
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  function handlePhaseChange(taskId: string, phaseId: string, phaseName: string) {
    saveField(taskId, { phase_id: phaseId })
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, phase_id: phaseId, phase_name: phaseName } : t))
    )
  }

  // ── Add task (toolbar button — blank row) ───────────────────────────────────

  function handleAddTask() {
    const phaseId = addingPhaseId || phases[0]?.id
    if (!phaseId) {
      setGlobalError('No phases available. Create a phase first via the Programme tab.')
      return
    }
    const maxOrder = tasks
      .filter((t) => t.phase_id === phaseId)
      .reduce((m, t) => Math.max(m, t.sort_order), 0)
    const phaseName = phases.find((p) => p.id === phaseId)?.name ?? ''

    startTransition(async () => {
      try {
        const newTask = await createProjectTask(projectId, phaseId, maxOrder + 1)
        setTasks((prev) => [...prev, { ...newTask, phase_name: phaseName } as TaskRow])
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : 'Failed to create task')
      }
    })
  }

  // ── Add task modal (per-phase header button) ────────────────────────────────

  function openAddTaskModal(phaseId: string, phaseName: string) {
    const today = new Date().toISOString().split('T')[0]
    setAddTaskForm({ name: '', startDate: today, endDate: today, trade: '', contractValue: '' })
    setAddTaskModal({ phaseId, phaseName })
  }

  function handleAddTaskWithDetails() {
    if (!addTaskModal) return
    if (!addTaskForm.name.trim() || !addTaskForm.startDate || !addTaskForm.endDate) return

    const { phaseId, phaseName } = addTaskModal
    const maxOrder = tasks
      .filter((t) => t.phase_id === phaseId)
      .reduce((m, t) => Math.max(m, t.sort_order), 0)

    startTransition(async () => {
      try {
        const newTask = await createTaskWithDetails({
          projectId,
          phaseId,
          name: addTaskForm.name.trim(),
          startDate: addTaskForm.startDate,
          endDate: addTaskForm.endDate,
          trade: addTaskForm.trade.trim() || null,
          contractValue: addTaskForm.contractValue ? parseFloat(addTaskForm.contractValue) : null,
          sortOrder: maxOrder + 1,
        })
        setTasks((prev) => [...prev, { ...newTask, phase_name: phaseName } as TaskRow])
        setAddTaskModal(null)
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : 'Failed to create task')
      }
    })
  }

  // ── Delete task ─────────────────────────────────────────────────────────────

  function handleDelete(taskId: string) {
    setConfirmDeleteId(null)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    startTransition(async () => {
      try {
        await deleteProjectTask(taskId)
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : 'Delete failed')
      }
    })
  }

  // ── Delete phase modal ──────────────────────────────────────────────────────

  function openDeletePhaseModal(phaseId: string, phaseName: string) {
    setDeletePhaseConfirm('')
    setDeletePhaseModal({ phaseId, phaseName })
  }

  function handleDeletePhase() {
    if (!deletePhaseModal) return
    if (deletePhaseConfirm !== deletePhaseModal.phaseName) return

    const { phaseId } = deletePhaseModal

    startTransition(async () => {
      try {
        await deletePhaseAction(phaseId)
        setPhases((prev) => prev.filter((p) => p.id !== phaseId))
        setTasks((prev) => prev.filter((t) => t.phase_id !== phaseId))
        setDeletePhaseModal(null)
        setDeletePhaseConfirm('')
        // Refresh server component props (phases list in toolbar, etc.)
        router.refresh()
      } catch (e) {
        setGlobalError(e instanceof Error ? e.message : 'Failed to delete phase')
      }
    })
  }

  // ─── Shared row props ────────────────────────────────────────────────────────

  const sharedRowProps = {
    phases,
    confirmDeleteId,
    onSave:          saveField,
    onPhaseChange:   handlePhaseChange,
    onConfirmDelete: setConfirmDeleteId,
    onDelete:        handleDelete,
  }

  // ─── Column count (varies by view) ───────────────────────────────────────────

  const colCount = filterPhase === 'all' ? 10 : 11

  // ─── Render ──────────────────────────────────────────────────────────────────

  const thClass =
    'px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap select-none cursor-pointer hover:text-gray-700'

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 flex-shrink-0 flex-wrap">
        <select
          value={filterPhase}
          onChange={(e) => setFilterPhase(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Phases</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Search tasks…"
          className="text-sm border border-gray-300 rounded px-2 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          {phases.length > 1 && (
            <select
              value={addingPhaseId}
              onChange={(e) => setAddingPhaseId(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleAddTask}
            disabled={isPending || phases.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="text-base leading-none">+</span> Add Task
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {globalError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex-shrink-0">
          <span>{globalError}</span>
          <button
            onClick={() => setGlobalError(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-base leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
            <tr>
              {/* Phase column — only in single-phase filter view */}
              {filterPhase !== 'all' && (
                <th className={`${thClass} w-44`} onClick={() => toggleSort('phase_name')}>
                  Phase <SortIcon col="phase_name" />
                </th>
              )}
              <th className={`${thClass} w-64`} onClick={() => toggleSort('name')}>
                Task Name <SortIcon col="name" />
              </th>
              <th className={`${thClass} w-32`} onClick={() => toggleSort('current_start')}>
                Start <SortIcon col="current_start" />
              </th>
              <th className={`${thClass} w-32`} onClick={() => toggleSort('current_end')}>
                End <SortIcon col="current_end" />
              </th>
              <th className={`${thClass} w-16`} onClick={() => toggleSort('duration_days')}>
                Days <SortIcon col="duration_days" />
              </th>
              <th className={`${thClass} w-32`} onClick={() => toggleSort('progress_pct')}>
                Progress <SortIcon col="progress_pct" />
              </th>
              <th className={`${thClass} w-32`} onClick={() => toggleSort('contract_value')}>
                Contract $ <SortIcon col="contract_value" />
              </th>
              <th className={`${thClass} w-28`} onClick={() => toggleSort('trade')}>
                Trade <SortIcon col="trade" />
              </th>
              <th className={`${thClass} w-20 text-center`} onClick={() => toggleSort('is_milestone')}>
                Milestone <SortIcon col="is_milestone" />
              </th>
              <th className={thClass}>Notes</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="text-center py-12 text-sm text-gray-400">
                  {tasks.length === 0
                    ? 'No tasks yet. Click "+ Add Task" to create one.'
                    : 'No tasks match the current filters.'}
                </td>
              </tr>
            )}

            {filterPhase === 'all'
              ? /* ── Grouped by phase with collapsible headers ── */
                phases.map((phase) => {
                  const phaseRows = visible.filter((t) => t.phase_id === phase.id)
                  const isCollapsed = collapsedPhaseIds.has(phase.id)
                  return (
                    <Fragment key={`phase-group-${phase.id}`}>
                      <tr
                        className="bg-gray-100 border-y border-gray-300 cursor-pointer select-none"
                        onClick={() => togglePhaseCollapse(phase.id)}
                      >
                        <td colSpan={colCount} className="px-3 py-1.5">
                          <span className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide w-full">
                            <span className="text-gray-400 text-sm leading-none">
                              {isCollapsed ? '▶' : '▼'}
                            </span>
                            {phase.name}
                            <span className="font-normal normal-case text-gray-400 tracking-normal">
                              ({phaseRows.length} task{phaseRows.length !== 1 ? 's' : ''})
                            </span>
                            <span className="flex-1" />
                            <button
                              onClick={(e) => { e.stopPropagation(); openAddTaskModal(phase.id, phase.name) }}
                              className="font-medium normal-case tracking-normal text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded px-2 py-0.5 transition-colors"
                            >
                              + Add Task
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openDeletePhaseModal(phase.id, phase.name) }}
                              className="font-normal normal-case tracking-normal text-gray-400 hover:text-red-500 hover:bg-red-50 rounded px-1.5 py-0.5 transition-colors"
                              title="Delete phase"
                            >
                              ✕
                            </button>
                          </span>
                        </td>
                      </tr>
                      {!isCollapsed && phaseRows.map((task) => (
                        <TaskTableRow
                          key={task.id}
                          task={task}
                          showPhaseCol={false}
                          {...sharedRowProps}
                        />
                      ))}
                    </Fragment>
                  )
                })
              : /* ── Flat list for single-phase filter ── */
                visible.map((task) => (
                  <TaskTableRow
                    key={task.id}
                    task={task}
                    showPhaseCol={true}
                    {...sharedRowProps}
                  />
                ))
            }
          </tbody>

          {/* ── Totals row ── */}
          {visible.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-medium text-sm text-gray-600">
                <td className="px-3 py-2" colSpan={filterPhase === 'all' ? 1 : 2}>
                  {visible.length} task{visible.length !== 1 ? 's' : ''}
                </td>
                {filterPhase !== 'all' && <td />}
                <td colSpan={2} />
                <td className="px-3 py-2">{totals.totalDays}d</td>
                <td className="px-3 py-2">{totals.avgProgress}% avg</td>
                <td className="px-3 py-2">{fmtCurrency(totals.contractSum)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Add Task Modal ── */}
      {addTaskModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { if (!isPending) setAddTaskModal(null) }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">
                Add Task — {addTaskModal.phaseName}
              </h2>
              <button
                onClick={() => setAddTaskModal(null)}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Task name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addTaskForm.name}
                  onChange={(e) => setAddTaskForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTaskWithDetails() }}
                  placeholder="e.g. Install roof trusses"
                  autoFocus
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Start date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addTaskForm.startDate}
                    onChange={(e) => {
                      const newStart = e.target.value
                      setAddTaskForm((f) => {
                        // Preserve the current weekday-duration when start moves
                        if (newStart && f.startDate && f.endDate) {
                          const duration = countWeekdays(parseLocalDate(f.startDate), parseLocalDate(f.endDate))
                          const newEnd = formatDate(addWeekdays(parseLocalDate(newStart), duration))
                          return { ...f, startDate: newStart, endDate: newEnd }
                        }
                        return { ...f, startDate: newStart }
                      })
                    }}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    End date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addTaskForm.endDate}
                    onChange={(e) => setAddTaskForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Trade</label>
                <input
                  type="text"
                  value={addTaskForm.trade}
                  onChange={(e) => setAddTaskForm((f) => ({ ...f, trade: e.target.value }))}
                  placeholder="e.g. Framing, Electrical"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Contract value (AUD)
                </label>
                <input
                  type="number"
                  value={addTaskForm.contractValue}
                  onChange={(e) => setAddTaskForm((f) => ({ ...f, contractValue: e.target.value }))}
                  placeholder="0"
                  min={0}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => setAddTaskModal(null)}
                disabled={isPending}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTaskWithDetails}
                disabled={isPending || !addTaskForm.name.trim() || !addTaskForm.startDate || !addTaskForm.endDate}
                className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Adding…' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Phase Modal ── */}
      {deletePhaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-800">Delete Phase</h2>
              <button
                onClick={() => { setDeletePhaseModal(null); setDeletePhaseConfirm('') }}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-700">
                Deleting{' '}
                <span className="font-semibold text-gray-900">{deletePhaseModal.phaseName}</span>{' '}
                will permanently remove all tasks within it, along with their progress logs,
                photos, Gantt dependencies, and delay links. This cannot be undone.
              </p>
              <p className="text-sm text-gray-500">
                Type the phase name to confirm:
              </p>
              <input
                type="text"
                value={deletePhaseConfirm}
                onChange={(e) => setDeletePhaseConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDeletePhase() }}
                placeholder={deletePhaseModal.phaseName}
                autoFocus
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => { setDeletePhaseModal(null); setDeletePhaseConfirm('') }}
                disabled={isPending}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePhase}
                disabled={isPending || deletePhaseConfirm !== deletePhaseModal.phaseName}
                className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Deleting…' : 'Delete Phase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
