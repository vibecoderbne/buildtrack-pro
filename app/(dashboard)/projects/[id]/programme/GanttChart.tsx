'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { useEffect, useRef, useCallback, useState } from 'react'
import { updateTaskDates, updateTaskProgress, updateTaskName, updateTaskSortOrder, updatePhaseName, updatePhaseSortOrder, createTask, deleteTask, updateTaskMilestone } from '@/app/actions/gantt'
import type { Phase, Task, TaskDependency } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const LINK_TYPE: Record<string, number> = {
  finish_to_start: 0,
  start_to_start: 1,
  finish_to_finish: 2,
}

function toGanttDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  return dateStr.split('T')[0]
}

function fromGanttDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── Grid columns ──────────────────────────────────────────────────────────────
const COL_TASK_W = 250
const COL_DAYS_W = 50
const COL_PCT_W  = 40
const COL_ADD_W  = 30
const GRID_WIDTH = COL_TASK_W + COL_DAYS_W + COL_PCT_W + COL_ADD_W  // 370

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  phases: Phase[]
  tasks: Task[]
  dependencies: TaskDependency[]
}

interface EditState {
  ganttId:     string   // e.g. "task_abc123" or "phase_abc123"
  dbId:        string   // stripped UUID
  isPhase:     boolean
  text:        string
  start:       string   // YYYY-MM-DD (tasks only)
  duration:    number   // days (tasks only)
  progress:    number   // 0-100 integer (tasks only)
  isMilestone: boolean  // tasks only
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GanttChart({ projectId, phases, tasks, dependencies }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef     = useRef<any>(null)

  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving]       = useState(false)

  const phaseColour = Object.fromEntries(phases.map((p) => [p.id, p.color]))

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleTaskDrag = useCallback(async (id: string) => {
    if (!ganttRef.current || id.startsWith('phase_')) return
    const task = ganttRef.current.getTask(id)
    const dbId = id.replace('task_', '')
    try {
      await updateTaskDates(dbId, fromGanttDate(task.start_date), fromGanttDate(task.end_date))
    } catch (err) {
      console.error('Failed to save task dates:', err)
    }
  }, [])

  const handleProgressDrag = useCallback(async (id: string, progress: number) => {
    if (id.startsWith('phase_')) return
    const dbId = id.replace('task_', '')
    try {
      await updateTaskProgress(dbId, Math.round(progress * 100))
    } catch (err) {
      console.error('Failed to save task progress:', err)
    }
  }, [])

  // ── Lightbox save ─────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!editState || !ganttRef.current) return
    setSaving(true)
    const gantt = ganttRef.current
    const { ganttId, dbId, isPhase, text, start, duration, progress, isMilestone } = editState

    // Update the DHTMLX task/phase label and re-render
    const item = gantt.getTask(ganttId)
    item.text = text

    if (!isPhase) {
      const startDate = new Date(start + 'T00:00:00')
      const endDate   = new Date(startDate)
      if (!isMilestone) endDate.setDate(endDate.getDate() + duration)
      const end = fromGanttDate(endDate)

      item.start_date = startDate
      item.type       = isMilestone ? 'milestone' : 'task'
      item.duration   = isMilestone ? 0 : duration
      item.end_date   = isMilestone ? new Date(startDate) : endDate
      item.progress   = progress / 100

      gantt.updateTask(ganttId)
      setEditState(null)
      setSaving(false)

      Promise.all([
        updateTaskName(dbId, text),
        updateTaskDates(dbId, start, end),
        updateTaskProgress(dbId, progress),
        updateTaskMilestone(dbId, isMilestone),
      ]).catch(console.error)
    } else {
      gantt.updateTask(ganttId)
      setEditState(null)
      setSaving(false)

      updatePhaseName(dbId, text).catch(console.error)
    }
  }, [editState])

  const handleCancel = useCallback(() => setEditState(null), [])

  const handleDelete = useCallback(async () => {
    if (!editState || editState.isPhase || !ganttRef.current) return
    if (!window.confirm('Are you sure you want to delete this task?')) return

    const { ganttId, dbId } = editState
    setEditState(null)

    // Remove from Gantt immediately
    try { ganttRef.current.deleteTask(ganttId) } catch { /* ignore if already gone */ }

    // Persist deletion (dependencies removed server-side)
    deleteTask(dbId).catch(console.error)
  }, [editState])

  // Stored in a ref so the mount-only DHTMLX click handler always calls the
  // latest version (which closes over current projectId / setEditState).
  const handleAddTaskRef = useRef<(phaseGanttId: string) => void>(() => {})

  const handleAddTask = useCallback(async (phaseGanttId: string) => {
    if (!ganttRef.current) return
    const gantt  = ganttRef.current
    const phaseId = phaseGanttId.replace('phase_', '')
    const phase   = gantt.getTask(phaseGanttId)

    // Use the latest child end date as the new task's start; fall back to phase start
    const children: string[] = gantt.getChildren(phaseGanttId)
    let startDate = new Date(phase.start_date)
    for (const childId of children) {
      const child = gantt.getTask(childId)
      if (child.end_date > startDate) startDate = new Date(child.end_date)
    }
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 1)
    const startStr = fromGanttDate(startDate)
    const endStr   = fromGanttDate(endDate)

    try {
      const newTask = await createTask({
        projectId,
        phaseId,
        name:         'New Task',
        startDate:    startStr,
        endDate:      endStr,
        durationDays: 1,
        sortOrder:    children.length,
      })

      const newGanttId = `task_${newTask.id}`

      gantt.addTask({
        id:         newGanttId,
        text:       'New Task',
        start_date: startDate,
        end_date:   endDate,
        duration:   1,
        progress:   0,
        parent:     phaseGanttId,
        type:       'task',
        open:       false,
        color:      phase.color ?? '#6366f1',
      }, phaseGanttId)

      // Open the edit modal so the user can rename it immediately
      setEditState({
        ganttId:     newGanttId,
        dbId:        newTask.id,
        isPhase:     false,
        text:        'New Task',
        start:       startStr,
        duration:    1,
        progress:    0,
        isMilestone: false,
      })
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }, [projectId])

  const handleTaskReorder = useCallback((parentId: string) => {
    if (!ganttRef.current) return
    const gantt = ganttRef.current
    const children: string[] = gantt.getChildren(parentId)
    const updates = children
      .filter((cid: string) => !String(cid).startsWith('phase_'))
      .map((cid: string, i: number) => ({ id: String(cid).replace('task_', ''), sort_order: i }))
    if (updates.length) {
      updateTaskSortOrder(projectId, updates).catch(console.error)
    }
  }, [projectId])

  const handlePhaseReorder = useCallback(() => {
    if (!ganttRef.current) return
    const gantt = ganttRef.current
    // Root id is 0 in DHTMLX; getChildren(0) returns top-level items in display order
    const rootChildren: string[] = gantt.getChildren(0)
    const updates = rootChildren
      .filter((id: string) => String(id).startsWith('phase_'))
      .map((id: string, i: number) => ({ id: String(id).replace('phase_', ''), sort_order: i }))
    if (updates.length) {
      updatePhaseSortOrder(projectId, updates).catch(console.error)
    }
  }, [projectId])

  useEffect(() => { handleAddTaskRef.current = handleAddTask }, [handleAddTask])

  // ── Gantt init ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const init = async () => {
      const mod = await import('dhtmlx-gantt')
      const gantt: any = mod.gantt || (mod as any).default?.gantt || (mod as any).default
      if (!gantt?.init) {
        console.log('DHTMLX module keys:', Object.keys(mod))
        return
      }
      ganttRef.current = gantt

      // ── Plugins ─────────────────────────────────────────────────────────
      gantt.plugins({ critical_path: true })

      // ── Config ──────────────────────────────────────────────────────────
      gantt.config.date_format             = '%Y-%m-%d'
      gantt.config.drag_progress           = true
      gantt.config.drag_move               = true
      gantt.config.drag_resize             = true
      gantt.config.drag_links              = true
      gantt.config.show_links              = true
      gantt.config.highlight_critical_path = true
      gantt.config.show_progress           = true
      gantt.config.round_dnd_dates         = false
      gantt.config.fit_tasks               = true
      gantt.config.order_branch            = true   // enable row drag-to-reorder in grid
      gantt.config.order_branch_free       = false  // tasks stay within their own phase
      gantt.config.open_tree_initially     = true
      gantt.config.row_height              = 28
      gantt.config.bar_height              = 18
      gantt.config.scale_height            = 40
      gantt.config.grid_width              = GRID_WIDTH

      if (gantt.config.baselines) {
        gantt.config.baselines.render_mode = 'taskRow'
        gantt.config.baselines.bar_height  = 6
      }

      // ── Templates ────────────────────────────────────────────────────────
      gantt.templates.task_text = () => ''

      // Phase rows get bracket style; milestones get custom diamond; regular tasks get flat edges
      gantt.templates.task_class = (_s: any, _e: any, task: any) => {
        if (task.id && String(task.id).startsWith('phase_')) return 'phase-bracket'
        if (task.type === 'milestone' || task.is_milestone) return 'milestone-diamond'
        return 'task-flat'
      }

      // ── Grid columns ─────────────────────────────────────────────────────
      gantt.config.columns = [
        {
          name: 'text', label: 'Task', width: COL_TASK_W, tree: true,
          template: (t: any) => {
            const milestoneIcon = t.type === 'milestone' ? '♦ ' : ''
            return milestoneIcon + t.text
          },
        },
        {
          name: 'duration', label: 'Days', align: 'center', width: COL_DAYS_W,
          template: (t: any) => {
            if (t.type === gantt.config.types.project) return ''
            if (t.type === 'milestone') return '—'
            return String(t.duration)
          },
        },
        {
          name: 'progress', label: '%', align: 'center', width: COL_PCT_W,
          template: (t: any) =>
            t.type === gantt.config.types.project ? '' : Math.round(t.progress * 100) + '%',
        },
        {
          name: 'add_child', label: '', align: 'center', width: COL_ADD_W,
          template: (t: any) =>
            t.type === gantt.config.types.project
              ? '<span class="gantt_phase_add_btn" title="Add task">+</span>'
              : '',
        },
      ]

      // ── Zoom ─────────────────────────────────────────────────────────────
      if (gantt.ext?.zoom) {
        gantt.ext.zoom.init({
          levels: [
            {
              name: 'day', scale_height: 50, min_column_width: 60,
              scales: [
                { unit: 'month', step: 1, format: '%F %Y' },
                { unit: 'day',   step: 1, format: '%d %D' },
              ],
            },
            {
              name: 'week', scale_height: 50, min_column_width: 70,
              scales: [
                { unit: 'month', step: 1, format: '%F %Y' },
                { unit: 'week',  step: 1, format: 'Wk %W' },
              ],
            },
            {
              name: 'month', scale_height: 50, min_column_width: 80,
              scales: [
                { unit: 'year',  step: 1, format: '%Y' },
                { unit: 'month', step: 1, format: '%M' },
              ],
            },
          ],
          activeLevelIndex: 1,
        })
      }

      // ── Layout ───────────────────────────────────────────────────────────
      gantt.config.layout = {
        css: 'gantt_container',
        rows: [
          {
            cols: [
              { view: 'grid',      scrollX: 'scrollHor', scrollY: 'scrollVer' },
              { resizer: true,     width: 1 },
              { view: 'timeline',  scrollX: 'scrollHor', scrollY: 'scrollVer' },
              { view: 'scrollbar', id: 'scrollVer' },
            ],
            gravity: 1,
          },
          { view: 'scrollbar', id: 'scrollHor', height: 20 },
        ],
      }

      // ── Events ───────────────────────────────────────────────────────────
      // "+" button in phase rows — use ref so the mount-only handler always
      // calls the latest handleAddTask without re-registering the event.
      gantt.attachEvent('onTaskClick', (id: string, e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.gantt_phase_add_btn')) {
          handleAddTaskRef.current(id)
          return false // prevent row selection
        }
        return true
      })

      gantt.attachEvent('onBeforeTaskDrag', (id: string) => !id.startsWith('phase_'))
      gantt.attachEvent('onAfterTaskDrag',  (id: string) => { handleTaskDrag(id) })
      gantt.attachEvent('onProgressDragEnd', (id: string, progress: number) => {
        handleProgressDrag(id, progress)
      })

      // Reorder: block phase rows from being moved; save new sort_order for tasks
      gantt.attachEvent('onBeforeTaskMove', (id: string, parent: string | number) => {
        if (id.startsWith('phase_')) {
          // Phases may only be reordered at root level (parent 0)
          return String(parent) === '0'
        }
        // Tasks may only be reordered within their own phase
        const task = gantt.getTask(id)
        return String(task.parent) === String(parent)
      })
      gantt.attachEvent('onAfterTaskMove', (id: string, parent: string) => {
        if (id.startsWith('phase_')) {
          handlePhaseReorder()
        } else {
          handleTaskReorder(parent)
        }
      })

      // Double-click opens our custom React modal; suppress DHTMLX lightbox entirely
      gantt.attachEvent('onTaskDblClick', (id: string) => {
        const item = gantt.getTask(id)
        if (id.startsWith('phase_')) {
          setEditState({
            ganttId:     id,
            dbId:        id.replace('phase_', ''),
            isPhase:     true,
            text:        item.text,
            start:       '', duration: 0, progress: 0, isMilestone: false, // unused for phases
          })
        } else {
          setEditState({
            ganttId:     id,
            dbId:        id.replace('task_', ''),
            isPhase:     false,
            text:        item.text,
            start:       fromGanttDate(item.start_date),
            duration:    item.duration,
            progress:    Math.round(item.progress * 100),
            isMilestone: item.type === 'milestone',
          })
        }
        return false // suppress DHTMLX lightbox in all cases
      })

      // ── Build data ────────────────────────────────────────────────────────
      const ganttData: any[] = []
      const ganttLinks: any[] = []

      for (const phase of phases) {
        const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)
        const starts = phaseTasks.map((t) => t.current_start ?? t.planned_start).filter(Boolean) as string[]
        const ends   = phaseTasks.map((t) => t.current_end   ?? t.planned_end).filter(Boolean) as string[]
        const phaseStart = starts.sort()[0]   ?? toGanttDate(null)
        const phaseEnd   = ends.sort().at(-1) ?? phaseStart

        ganttData.push({
          id: `phase_${phase.id}`, text: phase.name,
          start_date: phaseStart, end_date: phaseEnd,
          duration: 0, progress: 0, parent: 0,
          type: 'project', open: true, color: phase.color,
        })
      }

      for (const task of tasks) {
        const taskEntry: any = {
          id:         `task_${task.id}`,
          text:       task.name,
          start_date: toGanttDate(task.current_start ?? task.planned_start),
          end_date:   task.is_milestone
            ? toGanttDate(task.current_start ?? task.planned_start)
            : toGanttDate(task.current_end   ?? task.planned_end),
          duration:   task.is_milestone ? 0 : task.duration_days,
          progress:   task.progress_pct / 100,
          parent:     `phase_${task.phase_id}`,
          type:       task.is_milestone ? 'milestone' : 'task',
          open:       false,
          color:      phaseColour[task.phase_id] ?? '#6366f1',
        }

        if (task.planned_start && task.planned_end && gantt.config.baselines) {
          taskEntry.baselines = [{
            id: `bl_${task.id}`, task_id: `task_${task.id}`,
            start_date: toGanttDate(task.planned_start),
            end_date:   toGanttDate(task.planned_end),
          }]
        }

        ganttData.push(taskEntry)
      }

      for (const dep of dependencies) {
        ganttLinks.push({
          id:     dep.id,
          source: `task_${dep.depends_on_task_id}`,
          target: `task_${dep.task_id}`,
          type:   LINK_TYPE[dep.dependency_type] ?? 0,
        })
      }

      // ── Init ─────────────────────────────────────────────────────────────
      gantt.init(containerRef.current)
      gantt.parse({ data: ganttData, links: ganttLinks })

      // Custom today marker — drawn manually because the free-tier marker plugin
      // doesn't render in DHTMLX v9. Smart rendering clears the marker on scroll,
      // so we reattach it after every render and scroll event.
      const drawTodayMarker = () => {
        const area = containerRef.current?.querySelector('.gantt_data_area') as HTMLElement | null
        if (!area) return

        // Remove any existing marker to avoid duplicates
        const existing = area.querySelectorAll('.custom-today-marker')
        existing.forEach(el => el.remove())

        const today = new Date()
        const x = gantt.posFromDate(today)

        const marker = document.createElement('div')
        marker.className = 'custom-today-marker'
        marker.style.position = 'absolute'
        marker.style.left = x + 'px'
        marker.style.top = '0'
        marker.style.width = '2px'
        marker.style.height = area.scrollHeight + 'px'
        marker.style.background = '#ef4444'
        marker.style.zIndex = '999'
        marker.style.pointerEvents = 'none'

        // Small label at top
        const label = document.createElement('div')
        label.style.position = 'absolute'
        label.style.top = '0'
        label.style.left = '-20px'
        label.style.background = '#ef4444'
        label.style.color = '#fff'
        label.style.fontSize = '10px'
        label.style.padding = '2px 6px'
        label.style.borderRadius = '3px'
        label.style.fontWeight = '600'
        label.textContent = 'Today'

        marker.appendChild(label)
        area.appendChild(marker)
      }

      // Draw after a short delay to ensure DOM is ready
      setTimeout(drawTodayMarker, 100)
      gantt.attachEvent('onGanttRender', drawTodayMarker)
      gantt.attachEvent('onGanttScroll', drawTodayMarker)
    }

    init().catch(console.error)

    return () => {
      if (ganttRef.current) {
        try { ganttRef.current.clearAll() } catch { /* ignore */ }
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, []) // intentionally mount-only

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ width: '100%', height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
          <span className="text-xs font-medium text-gray-500 mr-1">Zoom:</span>
          {(['day', 'week', 'month'] as const).map((level) => (
            <button
              key={level}
              onClick={() => ganttRef.current?.ext?.zoom?.setLevel(level)}
              className="px-3 py-1 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50 capitalize"
            >
              {level}
            </button>
          ))}
          <div className="ml-4 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-3 rounded-sm bg-indigo-500 opacity-80" />
              Current
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-1 rounded-sm bg-slate-400 opacity-60" />
              Planned baseline
            </span>
          </div>
        </div>

        {/* ── Gantt container ───────────────────────────────────────────── */}
        <div ref={containerRef} style={{ width: '100%', flex: 1 }} />

      </div>

      {/* ── Edit task modal ───────────────────────────────────────────────── */}
      {editState && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={handleCancel}
        >
          <form
            style={{ background: '#fff', borderRadius: 10, padding: 28, width: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            onMouseDown={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); handleSave() }}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#111' }}>
              {editState.isPhase ? 'Edit Phase' : 'Edit Task'}
            </h2>

            <label style={labelStyle}>
              {editState.isPhase ? 'Phase name' : 'Task name'}
              <input
                style={inputStyle}
                type="text"
                value={editState.text}
                onChange={e => setEditState(s => s && ({ ...s, text: e.target.value }))}
                autoFocus
              />
            </label>

            {!editState.isPhase && (<>
              <label style={labelStyle}>
                Start date
                <input
                  style={inputStyle}
                  type="date"
                  value={editState.start}
                  onChange={e => setEditState(s => s && ({ ...s, start: e.target.value }))}
                />
              </label>

              {!editState.isMilestone && (
                <label style={labelStyle}>
                  Duration (days)
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={editState.duration}
                    onChange={e => setEditState(s => s && ({ ...s, duration: Math.max(1, parseInt(e.target.value) || 1) }))}
                  />
                </label>
              )}

              <label style={labelStyle}>
                Progress (%)
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  max={100}
                  value={editState.progress}
                  onChange={e => setEditState(s => s && ({ ...s, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editState.isMilestone}
                  onChange={e => setEditState(s => s && ({ ...s, isMilestone: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }}
                />
                Milestone
              </label>
            </>)}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              {!editState.isPhase && (
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#dc2626' }}
                >
                  Delete
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={handleCancel}
                style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ── Modal styles ──────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 14,
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 14, color: '#111', outline: 'none', width: '100%',
  boxSizing: 'border-box',
}
