'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { useEffect, useRef, useCallback, useState } from 'react'
import { updateTaskDates, updateTaskProgress, updateTaskName, updateTaskSortOrder, updatePhaseName, updatePhaseSortOrder, createTask, deleteTask, updateTaskMilestone, deleteTaskDependency } from '@/app/actions/gantt'
import { getTaskPhotos, createTaskPhoto, updateTaskPhoto, deleteTaskPhoto, type TaskPhotoRecord } from '@/app/actions/photos'
import { createClient } from '@/lib/supabase/client'
import type { Phase, Task, TaskDependency } from '@/lib/types'
import { PHASE_COLORS, getPhaseColor } from '@/lib/phase-colors'

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
  // Use local date components — toISOString() converts to UTC first, which shifts
  // the date backwards by 1 day in UTC+10/11 timezones (e.g. Australian builders).
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Grid columns ──────────────────────────────────────────────────────────────
const COL_TASK_W  = 250
const COL_TRADE_W = 80
const COL_DAYS_W  = 50
const COL_PCT_W   = 62
const COL_ADD_W   = 30
const GRID_WIDTH  = COL_TASK_W + COL_TRADE_W + COL_DAYS_W + COL_PCT_W + COL_ADD_W  // 472

// ── Types ─────────────────────────────────────────────────────────────────────

type Theme     = 'default' | 'msproject' | 'highcontrast'
type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

const ZOOM_LEVELS: { id: ZoomLevel; label: string }[] = [
  { id: 'day',     label: 'Day'     },
  { id: 'week',    label: 'Week'    },
  { id: 'month',   label: 'Month'   },
  { id: 'quarter', label: 'Quarter' },
]

// Row density levels — index 2 (100%) is the default.
// Zoom out (−) decreases index; zoom in (+) increases index.
const DENSITY_LEVELS: { pct: number; row_height: number; bar_height: number; scale_height: number }[] = [
  { pct:  70, row_height: 18, bar_height:  9, scale_height: 28 },
  { pct:  85, row_height: 22, bar_height: 12, scale_height: 34 },
  { pct: 100, row_height: 28, bar_height: 14, scale_height: 40 },
  { pct: 115, row_height: 34, bar_height: 18, scale_height: 46 },
  { pct: 130, row_height: 44, bar_height: 24, scale_height: 52 },
]
const DEFAULT_DENSITY_IDX = 2

interface TaskBaseline {
  task_id: string
  original_start_date: string
  original_end_date: string
}

interface Props {
  projectId: string
  phases: Phase[]
  tasks: Task[]
  dependencies: TaskDependency[]
  jobType?: string
  baselineLocked?: boolean
  taskBaselines?: TaskBaseline[]
}

interface EditState {
  ganttId:       string   // e.g. "task_abc123" or "phase_abc123"
  dbId:          string   // stripped UUID
  isPhase:       boolean
  text:          string
  start:         string   // current start YYYY-MM-DD (tasks only)
  duration:      number   // days (tasks only)
  progress:      number   // 0-100 integer (tasks only)
  isMilestone:   boolean  // tasks only
  note:          string   // optional progress log note (tasks only)
  // ── Slide-out panel fields (tasks only) ──────────────────────────────────
  trade:         string | null
  plannedStart:  string | null
  plannedEnd:    string | null
  currentEnd:    string | null
  contractValue: number | null
}

// ── Slide-out panel helpers ───────────────────────────────────────────────────

function dateSlip(current: string | null, planned: string | null): 'bad' | 'ok' | 'neutral' {
  if (!current || !planned) return 'neutral'
  if (current > planned) return 'bad'
  if (current < planned) return 'ok'
  return 'neutral'
}

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function DateBlock({ label, date, slip = 'neutral' }: { label: string; date: string | null; slip?: 'bad' | 'ok' | 'neutral' }) {
  const formatted = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  const color = slip === 'bad' ? 'var(--bad)' : slip === 'ok' ? 'var(--ok)' : 'var(--ink-2)'
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color }}>{formatted}</div>
    </div>
  )
}

// ── Toolbar sub-components ────────────────────────────────────────────────────

function GanttToggleBtn({ active, onClick, disabled, title, children }: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
      style={{
        height: 30,
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? '#fff' : 'var(--ink-3)',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--border)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

function TbBaselineIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="6" width="14" height="2.5" rx="1" />
      <rect x="1" y="11" width="14" height="1.5" rx="0.75" opacity="0.45" />
    </svg>
  )
}
function TbCriticalIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 14 16" fill="currentColor">
      <path d="M8 1L2 9h5l-1 6 7-9H8l1-5z" />
    </svg>
  )
}
function TbDepsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  )
}
function TbFilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
function TbExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GanttChart({ projectId, phases, tasks, dependencies, jobType, baselineLocked = false, taskBaselines = [] }: Props) {
  const isCP = jobType === 'cost_plus'
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef     = useRef<any>(null)

  // ── Theme ─────────────────────────────────────────────────────────────────
  const themeRef           = useRef<Theme>('default')
  const drawTodayMarkerRef = useRef<() => void>(() => {})
  const [theme, setTheme]  = useState<Theme>('default')

  // ── Row density & zoom level ──────────────────────────────────────────────
  const [densityIdx, setDensityIdx] = useState<number>(DEFAULT_DENSITY_IDX)
  const [zoomLevel,  setZoomLevel]  = useState<ZoomLevel>('week')

  // ── Toolbar display toggles ───────────────────────────────────────────────
  const showBaselineRef                  = useRef(true)
  const [showBaseline,  setShowBaseline] = useState(true)
  const [showCritPath,  setShowCritPath] = useState(true)
  const [showDeps,      setShowDeps]     = useState(true)

  // Hydrate ALL localStorage-dependent state after first paint.
  // MUST be declared before any write effects so it reads saved values
  // before those effects can overwrite them with defaults.
  useEffect(() => {
    const savedTheme   = localStorage.getItem('gantt-theme')       as Theme     | null
    const savedDensity = localStorage.getItem('gantt_density_idx')
    const savedZoom    = localStorage.getItem('gantt_zoom_level')  as ZoomLevel | null
    if (savedTheme) setTheme(savedTheme)
    if (savedDensity !== null) {
      const idx = parseInt(savedDensity, 10)
      if (idx >= 0 && idx < DENSITY_LEVELS.length) setDensityIdx(idx)
    }
    if (savedZoom) setZoomLevel(savedZoom)
  }, [])

  useEffect(() => {
    themeRef.current = theme
    if (theme !== 'default') localStorage.setItem('gantt-theme', theme)
    else localStorage.removeItem('gantt-theme')
    drawTodayMarkerRef.current()
  }, [theme])

  useEffect(() => {
    localStorage.setItem('gantt_density_idx', String(densityIdx))
    const gantt = ganttRef.current
    if (!gantt) return
    const d = DENSITY_LEVELS[densityIdx]
    gantt.config.row_height   = d.row_height
    gantt.config.bar_height   = d.bar_height
    gantt.config.scale_height = d.scale_height
    gantt.render()
  }, [densityIdx])

  useEffect(() => {
    localStorage.setItem('gantt_zoom_level', zoomLevel)
    const gantt = ganttRef.current
    if (!gantt) return
    if (gantt.ext?.zoom) {
      gantt.ext.zoom.setLevel(zoomLevel)
    }
  }, [zoomLevel])

  useEffect(() => {
    showBaselineRef.current = showBaseline
    ganttRef.current?.render()
  }, [showBaseline])

  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt) return
    gantt.config.highlight_critical_path = showCritPath
    gantt.render()
  }, [showCritPath])

  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt) return
    gantt.config.show_links = showDeps
    gantt.render()
  }, [showDeps])

  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving]       = useState(false)

  // ── Photos tab state ──────────────────────────────────────────────────────
  const [modalTab,      setModalTab]      = useState<'details' | 'photos'>('details')
  const [photos,        setPhotos]        = useState<TaskPhotoRecord[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  // Load photos whenever a task modal opens
  useEffect(() => {
    if (editState && !editState.isPhase) {
      setModalTab('details')
      setPhotos([])
      setPhotosLoading(true)
      getTaskPhotos(editState.dbId)
        .then(setPhotos)
        .catch(() => {})
        .finally(() => setPhotosLoading(false))
    }
  }, [editState?.dbId, editState?.isPhase])

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleTaskDrag = useCallback(async (id: string) => {
    if (!ganttRef.current || id.startsWith('phase_')) return
    const task = ganttRef.current.getTask(id)
    const dbId = id.replace('task_', '')
    try {
      // DHTMLX end_date is exclusive (midnight of the day after the task ends).
      // Subtract 1 day to convert to the inclusive convention used in the DB.
      const endExclusive = task.end_date instanceof Date ? task.end_date : new Date(task.end_date)
      const endInclusive = new Date(endExclusive)
      endInclusive.setDate(endInclusive.getDate() - 1)
      await updateTaskDates(dbId, fromGanttDate(task.start_date), fromGanttDate(endInclusive), task.duration)
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
    const { ganttId, dbId, isPhase, text, start, duration, progress, isMilestone, note } = editState

    // Update the DHTMLX task/phase label and re-render
    const item = gantt.getTask(ganttId)
    item.text = text

    if (!isPhase) {
      const startDate = new Date(start + 'T00:00:00')

      // Compute exclusive end_date via explicit calendar arithmetic.
      // gantt.calculateEndDate has proven unreliable with work_time=false in v9
      // (returns inclusive rather than exclusive), causing a double-subtraction
      // bug when we then convert exclusive→inclusive for DB storage.
      // Convention: DB stores INCLUSIVE end; DHTMLX receives EXCLUSIVE end (= inclusive + 1 day).
      const endExcl = new Date(startDate)
      endExcl.setDate(endExcl.getDate() + (isMilestone ? 0 : duration))

      item.start_date = startDate
      item.type       = isMilestone ? 'milestone' : 'task'
      item.duration   = isMilestone ? 0 : duration
      item.end_date   = endExcl   // exclusive — DHTMLX renders bar correctly
      item.progress   = progress / 100

      gantt.updateTask(ganttId)

      // One subtraction at the DHTMLX boundary: exclusive → inclusive for DB
      const incl = new Date(endExcl)
      if (!isMilestone) incl.setDate(incl.getDate() - 1)
      const end = isMilestone ? start : fromGanttDate(incl)

      setEditState(null)
      setSaving(false)

      Promise.all([
        updateTaskName(dbId, text),
        updateTaskDates(dbId, start, end, isMilestone ? 0 : duration),
        ...(!isCP ? [updateTaskProgress(dbId, progress, note.trim() || null)] : []),
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

  // ── Photo handlers ────────────────────────────────────────────────────────

  const handlePhotoUpload = useCallback(async (file: File) => {
    if (!editState || editState.isPhase) return
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${editState.dbId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('task-photos').upload(path, file)
      if (upErr) throw upErr
      const record = await createTaskPhoto(editState.dbId, path, null, false)
      setPhotos(prev => [...prev, record])
    } catch (err) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }, [editState])

  const handlePhotoCaption = useCallback(async (photoId: string, caption: string, isVisible: boolean) => {
    try {
      await updateTaskPhoto(photoId, caption || null, isVisible)
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption: caption || null, isVisibleToHomeowner: isVisible } : p))
    } catch { /* ignore */ }
  }, [])

  const handlePhotoDelete = useCallback(async (photoId: string) => {
    if (!window.confirm('Delete this photo?')) return
    try {
      await deleteTaskPhoto(photoId)
      setPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }, [])

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
    // DB stores inclusive end; for a 1-day task the inclusive end equals the start date.
    // DHTMLX needs the exclusive end (start + 1) for correct bar rendering.
    const endDateExcl = new Date(startDate)
    endDateExcl.setDate(endDateExcl.getDate() + 1)
    const startStr = fromGanttDate(startDate)
    const endStr   = startStr  // inclusive: 1-day task ends on the day it starts

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
        end_date:   endDateExcl,  // exclusive for DHTMLX
        duration:   1,
        progress:   0,
        parent:     phaseGanttId,
        type:       'task',
        open:       false,
        color:      phase.color ?? getPhaseColor(0),
      }, phaseGanttId)

      // Open the slide-out panel so the user can rename it immediately
      setEditState({
        ganttId:       newGanttId,
        dbId:          newTask.id,
        isPhase:       false,
        text:          'New Task',
        start:         startStr,
        duration:      1,
        progress:      0,
        isMilestone:   false,
        note:          '',
        trade:         null,
        plannedStart:  startStr,
        plannedEnd:    endStr,
        currentEnd:    endStr,
        contractValue: null,
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

  const handleAddTaskFromToolbar = () => {
    if (phases.length === 0) return
    handleAddTaskRef.current(`phase_${phases[0].id}`)
  }

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
      gantt.config.drag_progress           = !isCP  // disabled on Cost Plus (planning only)
      gantt.config.drag_move               = true
      gantt.config.drag_resize             = true
      gantt.config.drag_links              = true
      gantt.config.show_links              = true
      gantt.config.highlight_critical_path = true
      gantt.config.show_progress           = !isCP  // no progress fill on Cost Plus
      gantt.config.round_dnd_dates         = false
      gantt.config.fit_tasks               = true
      gantt.config.order_branch            = true   // enable row drag-to-reorder in grid
      gantt.config.order_branch_free       = false  // tasks stay within their own phase
      gantt.config.open_tree_initially     = true
      // Apply persisted row density before first render
      const savedDensityIdx = localStorage.getItem('gantt_density_idx')
      const initIdx = savedDensityIdx !== null
        ? Math.min(Math.max(parseInt(savedDensityIdx, 10), 0), DENSITY_LEVELS.length - 1)
        : DEFAULT_DENSITY_IDX
      const initD = DENSITY_LEVELS[initIdx]
      gantt.config.row_height              = initD.row_height
      gantt.config.bar_height              = initD.bar_height
      gantt.config.scale_height            = initD.scale_height
      gantt.config.schedule_from_end       = false   // duration edits move end_date, never start_date

      // Note: gantt.config.baselines is PRO-only — we implement baseline rendering
      // manually via addTaskLayer below.

      // ── Templates ────────────────────────────────────────────────────────
      // Phase bars show no text; milestone name floats right of diamond;
      // task bars show % label at right edge + delayed badge if applicable.
      gantt.templates.task_text = (_s: any, _e: any, task: any) => {
        if (task.id && String(task.id).startsWith('phase_')) return ''
        if (task.type === 'milestone' || task.is_milestone) {
          return `<span style="position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);font-size:11px;font-weight:500;white-space:nowrap;color:#1a1714;pointer-events:none">◆ ${task.text}</span>`
        }
        const delayed = task.is_delayed ? '<span style="font-size:9px;color:#ef4444;font-weight:700;margin-right:3px">▲</span>' : ''
        if (isCP) return delayed
        const pct = Math.round(task.progress * 100)
        const label = pct > 0 ? `<span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.95)">${pct}%</span>` : ''
        return `<span style="position:absolute;right:4px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:2px">${delayed}${label}</span>`
      }

      // Tooltip text (requires tooltip plugin enabled below)
      gantt.templates.tooltip_text = (start: any, _end: any, task: any) => {
        const name = `<b>${task.text}</b>`
        if (task.is_delayed && task.delay_days_total > 0) {
          const planned = task.planned_start_raw ?? '?'
          const current = start instanceof Date
            ? start.toISOString().split('T')[0]
            : String(start).split(' ')[0]
          return `${name}<br>⚠ Delayed ${task.delay_days_total} day${task.delay_days_total !== 1 ? 's' : ''}<br>Planned start: ${planned}<br>Current start: ${current}`
        }
        return name
      }

      // Phase rows get solid bar; milestones get diamond; critical tasks get outline
      gantt.templates.task_class = (_s: any, _e: any, task: any) => {
        if (task.id && String(task.id).startsWith('phase_')) return 'phase-bar'
        if (task.type === 'milestone' || task.is_milestone) return 'milestone-diamond'
        return task.critical ? 'critical-task' : ''
      }

      // ── Grid columns ─────────────────────────────────────────────────────
      gantt.config.columns = [
        {
          name: 'text', label: 'TASK', width: COL_TASK_W, tree: true,
          template: (t: any) => {
            const isPhase = String(t.id).startsWith('phase_')
            if (isPhase) {
              const children: string[] = gantt.getChildren(t.id)
              const taskCount = children.filter((cid: string) => !String(cid).startsWith('phase_')).length
              const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.color ?? '#6366f1'};flex-shrink:0;vertical-align:middle;margin-right:6px"></span>`
              const badge = taskCount > 0 ? `<span style="color:#9ca3af;font-weight:400;font-size:11px;margin-left:4px">· ${taskCount}</span>` : ''
              return `${dot}<span style="vertical-align:middle;font-weight:600">${t.text}</span>${badge}`
            }
            if (t.type === 'milestone' || t.is_milestone) return `♦ ${t.text}`
            return t.text
          },
        },
        {
          name: 'trade', label: 'TRADE', width: COL_TRADE_W,
          template: (t: any) => {
            if (String(t.id).startsWith('phase_')) return ''
            return t.trade ?? ''
          },
        },
        {
          name: 'duration', label: 'DAYS', align: 'center', width: COL_DAYS_W,
          template: (t: any) => {
            if (String(t.id).startsWith('phase_')) return ''
            if (t.type === 'milestone') return '—'
            return `${t.duration}d`
          },
        },
        ...(!isCP ? [{
          name: 'progress', label: '%', align: 'center', width: COL_PCT_W,
          template: (t: any) => {
            const isPhase = String(t.id).startsWith('phase_')
            if (isPhase) {
              const children: string[] = gantt.getChildren(t.id)
              const childTasks = children.filter((cid: string) => !String(cid).startsWith('phase_'))
              if (childTasks.length === 0) return ''
              const avg = Math.round(
                childTasks.reduce((sum: number, cid: string) => sum + gantt.getTask(cid).progress * 100, 0) / childTasks.length
              )
              return `<strong style="font-size:12px">${avg}%</strong>`
            }
            const pct = Math.round(t.progress * 100)
            return `<div style="position:absolute;left:0;top:0;right:0;bottom:0;background:linear-gradient(to right,rgba(34,197,94,0.15) ${pct}%,transparent ${pct}%);display:flex;align-items:center;padding:0 6px;box-sizing:border-box"><span style="font-size:12px;font-weight:500;position:relative">${pct}%</span></div>`
          },
        }] : []),
        {
          name: 'add_child', label: '', align: 'center', width: COL_ADD_W,
          template: (t: any) =>
            String(t.id).startsWith('phase_')
              ? '<span class="gantt_phase_add_btn" title="Add task">+</span>'
              : '',
        },
      ]
      gantt.config.grid_width = isCP ? GRID_WIDTH - COL_PCT_W : GRID_WIDTH

      // ── Zoom ─────────────────────────────────────────────────────────────
      const initZoom      = (localStorage.getItem('gantt_zoom_level') as ZoomLevel) ?? 'week'
      const zoomLevelIds: ZoomLevel[] = ['day', 'week', 'month', 'quarter']
      const activeLevelIndex = Math.max(0, zoomLevelIds.indexOf(initZoom))

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
            {
              name: 'quarter', scale_height: 50, min_column_width: 90,
              scales: [
                { unit: 'year',    step: 1, format: '%Y'  },
                { unit: 'quarter', step: 1, format: 'Q%q' },
              ],
            },
          ],
          activeLevelIndex,
        })
      } else {
        // Fallback for environments where ext.zoom is unavailable
        const fallbackScales: Record<ZoomLevel, { unit: string; step: number; format: string }> = {
          day:     { unit: 'day',     step: 1, format: '%d %M' },
          week:    { unit: 'week',    step: 1, format: 'Wk %W' },
          month:   { unit: 'month',   step: 1, format: '%M %Y' },
          quarter: { unit: 'quarter', step: 1, format: 'Q%q %Y' },
        }
        const fb = fallbackScales[initZoom]
        gantt.config.scale_unit = fb.unit
        gantt.config.step       = fb.step
        gantt.config.date_scale = fb.format
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
      gantt.attachEvent('onAfterTaskDrag',  (id: string, mode: string) => {
        if (mode === 'progress') {
          const task = gantt.getTask(id)
          handleProgressDrag(id, task.progress) // task.progress is 0–1
        } else {
          handleTaskDrag(id) // move or resize
        }
      })

      // Link deletion — id is the Supabase task_dependencies UUID (set via gantt.parse)
      gantt.attachEvent('onAfterLinkDelete', (id: string, link: any) => {
        deleteTaskDependency(id).catch((err) => {
          console.error('[onAfterLinkDelete] Failed to delete dependency:', err)
          // Re-add the link so the UI stays consistent with the DB
          gantt.addLink(link)
        })
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
            ganttId: id, dbId: id.replace('phase_', ''), isPhase: true,
            text: item.text,
            start: '', duration: 0, progress: 0, isMilestone: false, note: '',
            trade: null, plannedStart: null, plannedEnd: null, currentEnd: null, contractValue: null,
          })
        } else {
          setEditState({
            ganttId:       id,
            dbId:          id.replace('task_', ''),
            isPhase:       false,
            text:          item.text,
            start:         fromGanttDate(item.start_date),
            duration:      item.duration,
            progress:      Math.round(item.progress * 100),
            isMilestone:   item.type === 'milestone',
            note:          '',
            trade:         item.trade ?? null,
            plannedStart:  item.planned_start_raw ?? null,
            plannedEnd:    item.planned_end_raw ?? null,
            currentEnd:    item.current_end_raw ?? null,
            contractValue: item.contract_value ?? null,
          })
        }
        return false // suppress DHTMLX lightbox in all cases
      })

      // ── Build data ────────────────────────────────────────────────────────
      const ganttData: any[] = []
      const ganttLinks: any[] = []

      // Assign each phase a colour by its sort_order position
      const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order)
      const phaseColorMap = new Map(sortedPhases.map((p, i) => [p.id, getPhaseColor(i)]))

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
          type: 'task', open: true, color: phaseColorMap.get(phase.id) ?? getPhaseColor(0),
        })
      }

      for (const task of tasks) {
        const currentStart = toGanttDate(task.current_start ?? task.planned_start)

        const taskEntry: any = {
          id:         `task_${task.id}`,
          text:       task.name,
          start_date: currentStart,
          // end_date intentionally omitted: DHTMLX treats end_date as exclusive but
          // we store current_end as inclusive, causing DHTMLX to recalculate duration
          // as (end − start) calendar days = N−1. Omitting end_date lets DHTMLX
          // derive it from start_date + duration, so the grid shows duration_days
          // exactly as the Tasks table does.
          duration:   task.is_milestone ? 0 : task.duration_days,
          progress:   task.progress_pct / 100,
          parent:     `phase_${task.phase_id}`,
          type:       task.is_milestone ? 'milestone' : 'task',
          open:       false,
          color:          task.is_milestone ? '#f97316' : (phaseColorMap.get(task.phase_id) ?? getPhaseColor(0)),
          trade:          task.trade ?? null,
          contract_value: task.contract_value ?? null,
          // Delay metadata — used by tooltip template and baseline layer below
          is_delayed:        (task.days_delayed ?? 0) > 0,
          delay_days_total:  task.days_delayed ?? 0,
          planned_start_raw: task.planned_start ?? null,
          planned_end_raw:   task.planned_end   ?? null,
          current_start_raw: task.current_start ?? task.planned_start ?? null,
          current_end_raw:   task.current_end   ?? task.planned_end   ?? null,
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

      // ── Clay skin override ────────────────────────────────────────────────
      const ganttStyle = document.createElement('style')
      ganttStyle.innerHTML = `
        .gantt_container, .gantt_grid, .gantt_task { background: #faf9f7; }
        .gantt_grid_head_cell, .gantt_scale_cell { background: #f4f2ee; color: #9ca3af; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; border-color: #e8e4dc; }
        .gantt_row, .gantt_task_row { border-color: #e8e4dc; }
        .gantt_row:hover, .gantt_task_row:hover { background: #f4f2ee; }
        .gantt_cell { color: #1a1714; font-size: 12.5px; border-color: #e8e4dc; position: relative; overflow: hidden; }
        .gantt_tree_content { font-size: 12.5px; color: #1a1714; }
        .gantt_task_line { border-radius: 3px; }
        .gantt_task_line.phase-bar { background: #2C3E50 !important; color: #fff !important; font-weight: 600 !important; }
        .gantt_task_line.milestone-diamond { overflow: visible !important; }
        .gantt_today_line { background: #c2410c; width: 1px !important; opacity: 0.8; }
        .gantt_scale_line { border-color: #e8e4dc; }
        .critical-task .gantt_task_line { border: 1.5px solid #b91c1c !important; }
      `
      document.head.appendChild(ganttStyle)

      // ── Baseline layer ────────────────────────────────────────────────────
      // Renders a thin grey bar (below the current bar) for each task that has
      // a locked baseline. Only visible when showBaseline toggle is on AND
      // the project baseline is locked. Uses task_baselines data, not planned dates.
      if (baselineLocked && typeof gantt.addTaskLayer === 'function') {
        const baselineMap = new Map(taskBaselines.map(b => [b.task_id, b]))

        gantt.addTaskLayer((task: any) => {
          if (!showBaselineRef.current) return false
          if (String(task.id).startsWith('phase_')) return false
          if (task.type === 'milestone' || task.is_milestone) return false

          const dbId = String(task.id).replace('task_', '')
          const baseline = baselineMap.get(dbId)
          if (!baseline) return false

          const baselineStart = new Date(baseline.original_start_date + 'T00:00:00')
          // DB stores inclusive end date; DHTMLX needs exclusive (add 1 day)
          const baselineEnd = new Date(baseline.original_end_date + 'T00:00:00')
          baselineEnd.setDate(baselineEnd.getDate() + 1)

          const pos = gantt.getTaskPosition(task, baselineStart, baselineEnd)
          if (!pos) return false

          const el = document.createElement('div')
          el.style.cssText = [
            `left:${pos.left}px`,
            `width:${Math.max(pos.width, 2)}px`,
            `top:${pos.top + pos.height - 4}px`,
            'height:3px',
            'position:absolute',
            'background:#9ca3af',
            'border-radius:2px',
            'opacity:0.85',
            'pointer-events:none',
            'z-index:1',
          ].join(';')
          el.title = `Baseline: ${baseline.original_start_date} → ${baseline.original_end_date}`
          return el
        })
      }

      // ── Hatch overlay for incomplete bar portion (Fixed Price only) ──────────
      // Diagonal stripe from the progress point to the right end of each bar,
      // indicating the portion of work not yet done.
      if (!isCP && typeof gantt.addTaskLayer === 'function') {
        gantt.addTaskLayer((task: any) => {
          if (String(task.id).startsWith('phase_')) return false
          if (task.type === 'milestone' || task.is_milestone) return false
          const progress = task.progress ?? 0
          if (progress >= 1) return false  // 100% complete: no hatch

          const pos = gantt.getTaskPosition(task, task.start_date, task.end_date)
          if (!pos || pos.width < 2) return false

          const completedW = Math.round(pos.width * progress)
          const remainW = pos.width - completedW
          if (remainW < 2) return false

          const el = document.createElement('div')
          el.style.cssText = [
            `left:${pos.left + completedW}px`,
            `width:${remainW}px`,
            `top:${pos.top + 1}px`,
            `height:${pos.height - 2}px`,
            'position:absolute',
            'border-radius:0 3px 3px 0',
            'background:repeating-linear-gradient(135deg,rgba(255,255,255,0.14) 0,rgba(255,255,255,0.14) 3px,rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 6px)',
            'pointer-events:none',
            'z-index:2',
          ].join(';')
          return el
        })
      }

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

        const t = themeRef.current
        const markerColor = t === 'msproject' ? '#FF0000' : t === 'highcontrast' ? '#000000' : '#ef4444'

        const marker = document.createElement('div')
        marker.className = 'custom-today-marker'
        marker.style.position = 'absolute'
        marker.style.left = x + 'px'
        marker.style.top = '0'
        marker.style.width = '1px'
        marker.style.height = area.scrollHeight + 'px'
        marker.style.background = `repeating-linear-gradient(to bottom,${markerColor} 0,${markerColor} 5px,transparent 5px,transparent 10px)`
        marker.style.zIndex = '999'
        marker.style.pointerEvents = 'none'

        // Small label at top
        const label = document.createElement('div')
        label.style.position = 'absolute'
        label.style.top = '0'
        label.style.left = '-20px'
        label.style.background = markerColor
        label.style.color = '#fff'
        label.style.fontSize = '10px'
        label.style.padding = '2px 6px'
        label.style.borderRadius = '3px'
        label.style.fontWeight = '600'
        label.textContent = 'Today'

        marker.appendChild(label)
        area.appendChild(marker)
      }

      drawTodayMarkerRef.current = drawTodayMarker

      // Phase rows get a CSS class so their row background can be reset to transparent
      gantt.templates.task_row_class = (_s: any, _e: any, task: any) =>
        task.id && String(task.id).startsWith('phase_') ? 'phase-row' : ''

      // After every render, forcibly clear the inline background-color DHTMLX
      // sets on phase task rows — it paints the phase colour across all child rows
      gantt.attachEvent('onGanttRender', () => {
        document.querySelectorAll<HTMLElement>('.gantt_task_row.phase-row').forEach((row) => {
          row.style.setProperty('background-color', 'transparent', 'important')
        })
      })

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
      <div
        className={theme !== 'default' ? `theme-${theme}` : undefined}
        style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div
          className="flex items-center px-4 flex-shrink-0 overflow-x-auto"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', height: 44, gap: 0 }}
        >
          {/* Zoom: Day / Week / Month */}
          <div className="flex items-stretch mr-3 flex-shrink-0">
            {(['day', 'week', 'month'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                className="px-3 text-sm capitalize"
                style={{
                  height: 44,
                  color: zoomLevel === level ? 'var(--ink)' : 'var(--ink-4)',
                  fontWeight: zoomLevel === level ? 600 : 400,
                  borderBottom: `2px solid ${zoomLevel === level ? 'var(--ink)' : 'transparent'}`,
                  background: 'none',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>

          <div className="w-px h-5 mx-3 flex-shrink-0" style={{ background: 'var(--border)' }} />

          {/* Display toggles */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <GanttToggleBtn
              active={showBaseline && baselineLocked}
              onClick={() => baselineLocked && setShowBaseline(v => !v)}
              disabled={!baselineLocked}
              title={!baselineLocked ? 'Lock contract to enable baseline view' : undefined}
            >
              <TbBaselineIcon /> Baseline
            </GanttToggleBtn>
            {!isCP && (
              <GanttToggleBtn active={showCritPath} onClick={() => setShowCritPath(v => !v)}>
                <TbCriticalIcon /> Critical path
              </GanttToggleBtn>
            )}
            <GanttToggleBtn active={showDeps} onClick={() => setShowDeps(v => !v)}>
              <TbDepsIcon /> Dependencies
            </GanttToggleBtn>
            <GanttToggleBtn active={false} onClick={() => {}}>
              <TbFilterIcon /> Filter
            </GanttToggleBtn>
          </div>

          <div className="flex-1" />

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs flex-shrink-0 mr-3" style={{ color: 'var(--ink-4)' }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#94a3b8' }} />
              Baseline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#f97316' }} />
              Current
            </span>
            {!isCP && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#ef4444' }} />
                Critical
              </span>
            )}
          </div>

          <div className="w-px h-5 mx-3 flex-shrink-0" style={{ background: 'var(--border)' }} />

          {/* Export + Add Task */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="flex items-center gap-1.5 px-3 text-xs font-medium rounded-md"
              style={{ height: 30, border: '1px solid var(--border)', color: 'var(--ink-3)', background: 'var(--surface)', cursor: 'pointer' }}
            >
              <TbExportIcon /> Export
            </button>
            {!isCP && (
              <button
                onClick={handleAddTaskFromToolbar}
                className="flex items-center gap-1.5 px-3 text-xs font-medium rounded-md"
                style={{ height: 30, background: 'var(--ink)', color: '#fff', border: '1px solid var(--ink)', cursor: 'pointer' }}
              >
                + Task
              </button>
            )}
          </div>

        </div>

        {/* ── Gantt container + task slide-out ──────────────────────────── */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

          {/* ── Task detail slide-out panel ─────────────────────────────── */}
          {editState && !editState.isPhase && (
            <div
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: 360,
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                boxShadow: '-6px 0 24px rgba(0,0,0,0.09)',
                display: 'flex', flexDirection: 'column',
                zIndex: 100,
              }}
            >
              {/* Panel header: name + close */}
              <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      style={{ width: '100%', fontSize: 15, fontWeight: 600, color: 'var(--ink)', background: 'none', border: 'none', outline: 'none', padding: 0 }}
                      value={editState.text}
                      onChange={e => setEditState(s => s && ({ ...s, text: e.target.value }))}
                      autoFocus
                    />
                    {editState.isMilestone && (
                      <div style={{ fontSize: 11, color: '#f97316', fontWeight: 600, marginTop: 2 }}>◆ Milestone</div>
                    )}
                  </div>
                  <button onClick={handleCancel} style={{ fontSize: 20, color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>×</button>
                </div>
              </div>

              {/* Panel body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

                {/* Trade */}
                <PanelSection label="Trade">
                  <span style={{ fontSize: 13, color: editState.trade ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                    {editState.trade ?? '—'}
                    {/* TODO: wire subcontractor from subcontractors table */}
                  </span>
                </PanelSection>

                {/* Schedule */}
                <PanelSection label="Schedule">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                    <DateBlock label="Planned start" date={editState.plannedStart} />
                    <DateBlock label="Current start" date={editState.start} slip={dateSlip(editState.start, editState.plannedStart)} />
                    <DateBlock label="Planned end" date={editState.plannedEnd} />
                    <DateBlock label="Current end" date={editState.currentEnd} slip={dateSlip(editState.currentEnd, editState.plannedEnd)} />
                  </div>
                </PanelSection>

                {/* Progress */}
                {!isCP && (
                  <PanelSection label={`Progress — ${editState.progress}%`}>
                    <input
                      type="range" min={0} max={100} value={editState.progress}
                      onChange={e => setEditState(s => s && ({ ...s, progress: parseInt(e.target.value) }))}
                      style={{ width: '100%', accentColor: '#f97316', cursor: 'pointer', marginBottom: 2 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {[0, 25, 50, 75, 100].map(v => (
                        <span key={v} style={{ fontSize: 10, color: 'var(--ink-4)' }}>{v}</span>
                      ))}
                    </div>
                    <label style={{ ...labelStyle, marginTop: 10, marginBottom: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Note</span>
                      <textarea
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 50, fontSize: 12, marginTop: 4 }}
                        value={editState.note}
                        onChange={e => setEditState(s => s && ({ ...s, note: e.target.value }))}
                        placeholder="e.g. Formwork complete, waiting for pour"
                      />
                    </label>
                  </PanelSection>
                )}

                {/* Start date edit (for scheduling) */}
                {!editState.isMilestone && (
                  <PanelSection label="Reschedule">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>Start</span>
                        <input type="date" value={editState.start} onChange={e => setEditState(s => s && ({ ...s, start: e.target.value }))}
                          style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }} />
                      </label>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>Duration (days)</span>
                        <input type="number" min={1} value={editState.duration} onChange={e => setEditState(s => s && ({ ...s, duration: Math.max(1, parseInt(e.target.value) || 1) }))}
                          style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }} />
                      </label>
                    </div>
                  </PanelSection>
                )}

                {/* Contract value */}
                <PanelSection label="Contract Value">
                  {editState.contractValue !== null && editState.contractValue > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
                        ${editState.contractValue.toLocaleString()}
                      </span>
                      {!isCP && (
                        <span style={{ fontSize: 12, color: 'var(--ok)' }}>
                          ${Math.round(editState.contractValue * editState.progress / 100).toLocaleString()} earned
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>—</span>
                  )}
                </PanelSection>

                {/* Dependencies */}
                <PanelSection label="Dependencies">
                  <span style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
                    {/* TODO: wire to task_dependencies table */}
                    No dependency data loaded
                  </span>
                </PanelSection>

                {/* Activity */}
                <PanelSection label="Activity">
                  <span style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
                    {/* TODO: wire to task_progress_logs table */}
                    No activity history loaded
                  </span>
                </PanelSection>

                {/* Photos */}
                <PanelSection label={photos.length > 0 ? `Photos (${photos.length})` : 'Photos'}>
                  <PhotosTab
                    photos={photos}
                    loading={photosLoading}
                    uploading={uploading}
                    supabaseUrl={supabaseUrl}
                    onUpload={handlePhotoUpload}
                    onCaptionChange={handlePhotoCaption}
                    onDelete={handlePhotoDelete}
                  />
                </PanelSection>

              </div>

              {/* Panel footer */}
              <div style={{ padding: '10px 20px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={handleDelete} style={{ fontSize: 12, color: 'var(--bad)', border: '1px solid var(--bad)', background: 'transparent', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Delete</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer', marginLeft: 2 }}>
                  <input type="checkbox" checked={editState.isMilestone} onChange={e => setEditState(s => s && ({ ...s, isMilestone: e.target.checked }))}
                    style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  Milestone
                </label>
                <div style={{ flex: 1 }} />
                <button onClick={handleCancel} style={{ fontSize: 12, color: 'var(--ink-2)', border: '1px solid var(--border)', background: 'transparent', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ fontSize: 12, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Phase edit modal (centered overlay) ────────────────────────────── */}
      {editState && editState.isPhase && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={handleCancel}
        >
          <div
            style={{ background: 'var(--surface)', borderRadius: 10, width: 380, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Edit Phase</h2>
            </div>
            <form style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }} onSubmit={e => { e.preventDefault(); handleSave() }}>
              <label style={labelStyle}>
                Phase name
                <input
                  style={inputStyle}
                  type="text"
                  value={editState.text}
                  onChange={e => setEditState(s => s && ({ ...s, text: e.target.value }))}
                  autoFocus
                />
              </label>
            </form>
            <div style={{ padding: '12px 24px 20px', flexShrink: 0, display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={handleCancel} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── PhotosTab sub-component ───────────────────────────────────────────────────

interface PhotosTabProps {
  photos:     TaskPhotoRecord[]
  loading:    boolean
  uploading:  boolean
  supabaseUrl: string
  onUpload:   (file: File) => Promise<void>
  onCaptionChange: (photoId: string, caption: string, isVisible: boolean) => Promise<void>
  onDelete:   (photoId: string) => Promise<void>
}

function PhotosTab({ photos, loading, uploading, supabaseUrl, onUpload, onCaptionChange, onDelete }: PhotosTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-4)', fontSize: 13 }}>Loading photos…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Upload button */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) await onUpload(file)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '7px 16px', borderRadius: 6, border: '1px dashed var(--border)',
            background: 'var(--surface-2)', fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer',
            color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <span>📷</span>
          {uploading ? 'Uploading…' : 'Upload photo'}
        </button>
      </div>

      {/* Photo grid */}
      {photos.length === 0 && !uploading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-4)', fontSize: 13 }}>
          No photos yet — upload one above
        </div>
      )}

      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          supabaseUrl={supabaseUrl}
          onSave={onCaptionChange}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

interface PhotoCardProps {
  photo:       TaskPhotoRecord
  supabaseUrl: string
  onSave:      (photoId: string, caption: string, isVisible: boolean) => Promise<void>
  onDelete:    (photoId: string) => Promise<void>
}

function PhotoCard({ photo, supabaseUrl, onSave, onDelete }: PhotoCardProps) {
  const [caption,   setCaption]   = useState(photo.caption ?? '')
  const [visible,   setVisible]   = useState(photo.isVisibleToHomeowner)
  const [savingMeta, setSavingMeta] = useState(false)
  const imgUrl = `${supabaseUrl}/storage/v1/object/public/task-photos/${photo.storagePath}`

  async function handleBlur() {
    if (caption === (photo.caption ?? '') && visible === photo.isVisibleToHomeowner) return
    setSavingMeta(true)
    await onSave(photo.id, caption, visible)
    setSavingMeta(false)
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
      <img
        src={imgUrl}
        alt={caption || 'Task photo'}
        style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
      />
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          style={{ ...inputStyle, fontSize: 12 }}
          type="text"
          value={caption}
          placeholder="Caption (optional)"
          onChange={e => setCaption(e.target.value)}
          onBlur={handleBlur}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={visible}
              onChange={e => { setVisible(e.target.checked); onSave(photo.id, caption, e.target.checked) }}
              style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            Visible to homeowner
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {savingMeta && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Saving…</span>}
            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              style={{ fontSize: 11, color: 'var(--bad)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal styles ──────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', marginBottom: 14,
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
  fontSize: 14, color: 'var(--ink)', outline: 'none', width: '100%',
  boxSizing: 'border-box', background: 'var(--surface)',
}
