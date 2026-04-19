'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { useEffect, useRef, useCallback, useState } from 'react'
import { updateTaskDates, updateTaskProgress, updateTaskName, updateTaskSortOrder, updatePhaseName, updatePhaseSortOrder, createTask, deleteTask, updateTaskMilestone, deleteTaskDependency } from '@/app/actions/gantt'
import { getTaskPhotos, createTaskPhoto, updateTaskPhoto, deleteTaskPhoto, type TaskPhotoRecord } from '@/app/actions/photos'
import { createClient } from '@/lib/supabase/client'
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
  // Use local date components — toISOString() converts to UTC first, which shifts
  // the date backwards by 1 day in UTC+10/11 timezones (e.g. Australian builders).
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Grid columns ──────────────────────────────────────────────────────────────
const COL_TASK_W = 250
const COL_DAYS_W = 50
const COL_PCT_W  = 40
const COL_ADD_W  = 30
const GRID_WIDTH = COL_TASK_W + COL_DAYS_W + COL_PCT_W + COL_ADD_W  // 370

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
  { pct:  70, row_height: 20, bar_height: 12, scale_height: 28 },
  { pct:  85, row_height: 26, bar_height: 16, scale_height: 34 },
  { pct: 100, row_height: 32, bar_height: 22, scale_height: 40 },
  { pct: 115, row_height: 40, bar_height: 28, scale_height: 46 },
  { pct: 130, row_height: 50, bar_height: 34, scale_height: 52 },
]
const DEFAULT_DENSITY_IDX = 2

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
  note:        string   // optional progress log note (tasks only)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GanttChart({ projectId, phases, tasks, dependencies }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef     = useRef<any>(null)

  // ── Theme ─────────────────────────────────────────────────────────────────
  const themeRef           = useRef<Theme>('default')
  const drawTodayMarkerRef = useRef<() => void>(() => {})
  const [theme, setTheme]  = useState<Theme>('default')

  // ── Row density & zoom level ──────────────────────────────────────────────
  const [densityIdx, setDensityIdx] = useState<number>(DEFAULT_DENSITY_IDX)
  const [zoomLevel,  setZoomLevel]  = useState<ZoomLevel>('week')

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
    const { ganttId, dbId, isPhase, text, start, duration, progress, isMilestone, note } = editState

    // Update the DHTMLX task/phase label and re-render
    const item = gantt.getTask(ganttId)
    item.text = text

    if (!isPhase) {
      const startDate = new Date(start + 'T00:00:00')
      // Use gantt.calculateEndDate so duration (working days) and end_date are
      // internally consistent. Manual calendar-day arithmetic mismatches DHTMLX's
      // working-day units, causing gantt.updateTask() to recalculate start_date.
      const endDate   = isMilestone ? new Date(startDate) : gantt.calculateEndDate(startDate, duration)
      const end = fromGanttDate(endDate)

      item.start_date = startDate
      item.type       = isMilestone ? 'milestone' : 'task'
      item.duration   = isMilestone ? 0 : duration
      item.end_date   = endDate
      item.progress   = progress / 100

      gantt.updateTask(ganttId)
      setEditState(null)
      setSaving(false)

      Promise.all([
        updateTaskName(dbId, text),
        updateTaskDates(dbId, start, end),
        updateTaskProgress(dbId, progress, note.trim() || null),
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
        note:        '',
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
      // Apply persisted row density before first render
      const savedDensityIdx = localStorage.getItem('gantt_density_idx')
      const initIdx = savedDensityIdx !== null
        ? Math.min(Math.max(parseInt(savedDensityIdx, 10), 0), DENSITY_LEVELS.length - 1)
        : DEFAULT_DENSITY_IDX
      const initD = DENSITY_LEVELS[initIdx]
      gantt.config.row_height              = initD.row_height
      gantt.config.bar_height              = initD.bar_height
      gantt.config.scale_height            = initD.scale_height
      gantt.config.grid_width              = GRID_WIDTH
      gantt.config.schedule_from_end       = false   // duration edits move end_date, never start_date

      // Note: gantt.config.baselines is PRO-only — we implement baseline rendering
      // manually via addTaskLayer below.

      // ── Templates ────────────────────────────────────────────────────────
      // Tasks show a delayed badge if applicable; phase bars show no text
      gantt.templates.task_text = (_s: any, _e: any, task: any) => {
        if (task.id && String(task.id).startsWith('phase_')) return ''
        if (task.is_delayed) {
          return '<span style="font-size:10px;color:#ef4444;font-weight:700;padding:0 3px;">▲</span>'
        }
        return ''
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

      // Phase rows get solid bar; milestones get custom diamond; regular tasks get flat edges
      gantt.templates.task_class = (_s: any, _e: any, task: any) => {
        if (task.id && String(task.id).startsWith('phase_')) return 'phase-bar'
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
            if (String(t.id).startsWith('phase_')) return ''
            if (t.type === 'milestone') return '—'
            return String(t.duration)
          },
        },
        {
          name: 'progress', label: '%', align: 'center', width: COL_PCT_W,
          template: (t: any) =>
            String(t.id).startsWith('phase_') ? '' : Math.round(t.progress * 100) + '%',
        },
        {
          name: 'add_child', label: '', align: 'center', width: COL_ADD_W,
          template: (t: any) =>
            String(t.id).startsWith('phase_')
              ? '<span class="gantt_phase_add_btn" title="Add task">+</span>'
              : '',
        },
      ]

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
            ganttId:     id,
            dbId:        id.replace('phase_', ''),
            isPhase:     true,
            text:        item.text,
            start:       '', duration: 0, progress: 0, isMilestone: false, note: '', // unused for phases
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
            note:        '',
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
          type: 'task', open: true, color: phase.color,
        })
      }

      for (const task of tasks) {
        const currentStart = toGanttDate(task.current_start ?? task.planned_start)
        const currentEnd   = task.is_milestone
          ? currentStart
          : toGanttDate(task.current_end ?? task.planned_end)

        const taskEntry: any = {
          id:         `task_${task.id}`,
          text:       task.name,
          start_date: currentStart,
          end_date:   currentEnd,
          duration:   task.is_milestone ? 0 : task.duration_days,
          progress:   task.progress_pct / 100,
          parent:     `phase_${task.phase_id}`,
          type:       task.is_milestone ? 'milestone' : 'task',
          open:       false,
          color:      '#1B6EC2',
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

      // ── Baseline layer (planned start/end) ───────────────────────────────
      // Must be registered AFTER gantt.init(). Renders a thin slate bar at the
      // bottom of each delayed task's row showing the original planned dates.
      if (typeof gantt.addTaskLayer === 'function') {
        gantt.addTaskLayer((task: any) => {
          if (!task.is_delayed || !task.planned_start_raw || !task.planned_end_raw) return false
          if (String(task.id).startsWith('phase_')) return false

          const plannedStart = new Date(task.planned_start_raw + 'T00:00:00')
          // Add 1 day so DHTMLX treats planned_end as an inclusive end
          const plannedEnd = new Date(task.planned_end_raw + 'T00:00:00')
          plannedEnd.setDate(plannedEnd.getDate() + 1)

          const pos = gantt.getTaskPosition(task, plannedStart, plannedEnd)
          if (!pos) return false

          const el = document.createElement('div')
          el.style.cssText = [
            `left:${pos.left}px`,
            `width:${Math.max(pos.width, 2)}px`,
            `top:${pos.top + pos.height - 5}px`,
            'height:3px',
            'position:absolute',
            'background:#475569',
            'border-radius:2px',
            'opacity:0.75',
            'pointer-events:none',
            'z-index:1',
          ].join(';')
          el.title = `Planned: ${task.planned_start_raw} → ${task.planned_end_raw}`
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
        marker.style.width = '2px'
        marker.style.height = area.scrollHeight + 'px'
        marker.style.background = markerColor
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
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0 overflow-x-auto">

          {/* Zoom */}
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Zoom:</span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {ZOOM_LEVELS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setZoomLevel(id)}
                className={`px-2.5 py-1 text-xs font-medium rounded border ${
                  zoomLevel === id
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          {/* Row density — zoom out/in control */}
          <div className="flex items-center gap-0 flex-shrink-0 border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setDensityIdx((i) => Math.max(0, i - 1))}
              disabled={densityIdx === 0}
              className="px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border-r border-gray-300 leading-none"
              title="Zoom out (larger rows)"
            >
              −
            </button>
            <button
              onClick={() => setDensityIdx(DEFAULT_DENSITY_IDX)}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 tabular-nums w-12 text-center"
              title="Reset to 100%"
            >
              {DENSITY_LEVELS[densityIdx].pct}%
            </button>
            <button
              onClick={() => setDensityIdx((i) => Math.min(DENSITY_LEVELS.length - 1, i + 1))}
              disabled={densityIdx === DENSITY_LEVELS.length - 1}
              className="px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border-l border-gray-300 leading-none"
              title="Zoom in (smaller rows)"
            >
              +
            </button>
          </div>

          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-2.5 rounded-sm bg-indigo-500 opacity-80" />
              Current
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 rounded-sm bg-slate-400 opacity-60" />
              Baseline
            </span>
          </div>

          {/* Theme — pushed to right */}
          <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 mr-1 whitespace-nowrap">Theme:</span>
            {([
              { id: 'default',      label: 'Default'  },
              { id: 'msproject',    label: 'MS Proj'  },
              { id: 'highcontrast', label: 'Hi-Con'   },
            ] as { id: Theme; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={`px-2.5 py-1 text-xs font-medium rounded border ${
                  theme === id
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

        </div>

        {/* ── Gantt container ───────────────────────────────────────────── */}
        <div ref={containerRef} style={{ width: '100%', flex: 1 }} />

      </div>

      {/* ── Edit task / phase modal ────────────────────────────────────────── */}
      {editState && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={handleCancel}
        >
          <div
            style={{
              background: '#fff', borderRadius: 10,
              width: editState.isPhase ? 380 : 460,
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111' }}>
                {editState.isPhase ? 'Edit Phase' : 'Edit Task'}
              </h2>

              {/* Tab bar — only for tasks */}
              {!editState.isPhase && (
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 0 }}>
                  {(['details', 'photos'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setModalTab(tab)}
                      style={{
                        padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        background: 'none', border: 'none',
                        borderBottom: modalTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                        color: modalTab === tab ? '#6366f1' : '#6b7280',
                        marginBottom: -1,
                        textTransform: 'capitalize',
                      }}
                    >
                      {tab}
                      {tab === 'photos' && photos.length > 0 && (
                        <span style={{
                          marginLeft: 6, fontSize: 11, background: '#e0e7ff', color: '#4338ca',
                          borderRadius: 99, padding: '1px 6px',
                        }}>
                          {photos.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal body */}
            <form
              style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}
              onSubmit={e => { e.preventDefault(); handleSave() }}
            >
              {/* ── Details tab (or phase) ─────────────────────────────── */}
              {(editState.isPhase || modalTab === 'details') && (
                <>
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
                        onFocus={e => e.target.select()}
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

                    <label style={labelStyle}>
                      Progress note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                      <textarea
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
                        value={editState.note}
                        onChange={e => setEditState(s => s && ({ ...s, note: e.target.value }))}
                        placeholder="e.g. Formwork complete, waiting for pour"
                      />
                    </label>
                  </>)}
                </>
              )}

              {/* ── Photos tab ────────────────────────────────────────── */}
              {!editState.isPhase && modalTab === 'photos' && (
                <PhotosTab
                  photos={photos}
                  loading={photosLoading}
                  uploading={uploading}
                  supabaseUrl={supabaseUrl}
                  onUpload={handlePhotoUpload}
                  onCaptionChange={handlePhotoCaption}
                  onDelete={handlePhotoDelete}
                />
              )}
            </form>

            {/* Modal footer */}
            <div style={{ padding: '12px 24px 20px', flexShrink: 0, display: 'flex', gap: 10 }}>
              {!editState.isPhase && modalTab === 'details' && (
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
                {modalTab === 'photos' ? 'Close' : 'Cancel'}
              </button>
              {(editState.isPhase || modalTab === 'details') && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
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
    return <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>Loading photos…</div>
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
            padding: '7px 16px', borderRadius: 6, border: '1px dashed #d1d5db',
            background: '#f9fafb', fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer',
            color: '#374151', display: 'flex', alignItems: 'center', gap: 6,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <span>📷</span>
          {uploading ? 'Uploading…' : 'Upload photo'}
        </button>
      </div>

      {/* Photo grid */}
      {photos.length === 0 && !uploading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
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
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#f9fafb' }}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={visible}
              onChange={e => { setVisible(e.target.checked); onSave(photo.id, caption, e.target.checked) }}
              style={{ width: 14, height: 14, accentColor: '#6366f1', cursor: 'pointer' }}
            />
            Visible to homeowner
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {savingMeta && <span style={{ fontSize: 11, color: '#9ca3af' }}>Saving…</span>}
            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
  fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 14,
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 14, color: '#111', outline: 'none', width: '100%',
  boxSizing: 'border-box',
}
