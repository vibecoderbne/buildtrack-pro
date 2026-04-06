'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useCallback } from 'react'
import { updateTaskDates, updateTaskProgress } from '@/app/actions/gantt'
import type { Phase, Task, TaskDependency } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const LINK_TYPE: Record<string, string> = {
  finish_to_start: '0',
  start_to_start: '1',
  finish_to_finish: '2',
}

function toGanttDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  return dateStr.split('T')[0] // ensure YYYY-MM-DD
}

function fromGanttDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  phases: Phase[]
  tasks: Task[]
  dependencies: TaskDependency[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GanttChart({ phases, tasks, dependencies }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<any>(null)

  const phaseColour = Object.fromEntries(phases.map((p) => [p.id, p.color]))

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

  useEffect(() => {
    if (!containerRef.current) return

    const init = async () => {
      const mod = await import('dhtmlx-gantt')
      // Separate CSS dynamic import — avoids SSR issues
      const cssUrl = 'https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.css'
      if (!document.querySelector(`link[href="${cssUrl}"]`)) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = cssUrl
        document.head.appendChild(link)
      }

      const gantt: any = mod.gantt
      ganttRef.current = gantt

      // ── Plugins ─────────────────────────────────────────────────────────
      gantt.plugins({
        today_marker: true,
        critical_path: true,
        zoom: true,
      })

      // ── Config ──────────────────────────────────────────────────────────
      gantt.config.date_format = '%Y-%m-%d'
      gantt.config.work_time = true
      gantt.config.drag_progress = true
      gantt.config.drag_move = true
      gantt.config.drag_resize = true
      gantt.config.drag_links = false
      gantt.config.highlight_critical_path = true
      gantt.config.show_progress = true
      gantt.config.round_dnd_dates = true
      gantt.config.bar_height = 18
      gantt.config.row_height = 32
      gantt.config.open_tree_initially = true

      // Left panel columns
      gantt.config.columns = [
        { name: 'text', label: 'Task', width: 220, tree: true },
        {
          name: 'duration',
          label: 'Days',
          align: 'center',
          width: 48,
          template: (t: any) => (t.type === gantt.config.types.project ? '' : String(t.duration)),
        },
        {
          name: 'progress',
          label: '%',
          align: 'center',
          width: 46,
          template: (t: any) =>
            t.type === gantt.config.types.project ? '' : Math.round(t.progress * 100) + '%',
        },
      ]

      // ── Zoom ────────────────────────────────────────────────────────────
      gantt.ext.zoom.init({
        levels: [
          {
            name: 'day',
            scale_height: 50,
            min_column_width: 60,
            scales: [
              { unit: 'month', step: 1, format: '%F %Y' },
              { unit: 'day', step: 1, format: '%d %D' },
            ],
          },
          {
            name: 'week',
            scale_height: 50,
            min_column_width: 50,
            scales: [
              { unit: 'month', step: 1, format: '%F %Y' },
              { unit: 'week', step: 1, format: 'Wk %W' },
            ],
          },
          {
            name: 'month',
            scale_height: 50,
            min_column_width: 80,
            scales: [
              { unit: 'year', step: 1, format: '%Y' },
              { unit: 'month', step: 1, format: '%M' },
            ],
          },
        ],
        activeLevelIndex: 1, // start at week view
      })

      // ── Baseline layer (grey bar = planned dates) ────────────────────────
      gantt.addTaskLayer({
        renderer: {
          render(task: any) {
            if (task.type === gantt.config.types.project) return false
            if (!task.planned_start || !task.planned_end) return false

            const sizes = gantt.getTaskPosition(
              task,
              new Date(task.planned_start),
              new Date(task.planned_end)
            )

            const el = document.createElement('div')
            Object.assign(el.style, {
              position: 'absolute',
              left: `${sizes.left}px`,
              width: `${Math.max(sizes.width, 2)}px`,
              top: `${sizes.top + gantt.config.bar_height + 4}px`,
              height: '4px',
              background: '#94a3b8',
              borderRadius: '2px',
              opacity: '0.6',
            })
            el.title = `Planned: ${task.planned_start} → ${task.planned_end}`
            return el
          },
          getRectangle(task: any) {
            if (!task.planned_start || !task.planned_end) return null
            return gantt.getTaskPosition(
              task,
              new Date(task.planned_start),
              new Date(task.planned_end)
            )
          },
        },
      })

      // ── Events ──────────────────────────────────────────────────────────
      gantt.attachEvent('onBeforeTaskDrag', (id: string) => !id.startsWith('phase_'))
      gantt.attachEvent('onAfterTaskDrag', (id: string) => { handleTaskDrag(id) })
      gantt.attachEvent('onProgressDragEnd', (id: string, progress: number) => {
        handleProgressDrag(id, progress)
      })

      // ── Build data ───────────────────────────────────────────────────────
      const ganttData: any[] = []
      const ganttLinks: any[] = []

      for (const phase of phases) {
        const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)
        const starts = phaseTasks.map((t) => t.current_start ?? t.planned_start).filter(Boolean) as string[]
        const ends = phaseTasks.map((t) => t.current_end ?? t.planned_end).filter(Boolean) as string[]
        const phaseStart = starts.sort()[0] ?? toGanttDate(null)
        const phaseEnd = ends.sort().at(-1) ?? phaseStart

        ganttData.push({
          id: `phase_${phase.id}`,
          text: phase.name,
          start_date: phaseStart,
          end_date: phaseEnd,
          duration: 0,
          progress: 0,
          parent: 0,
          type: gantt.config.types.project,
          open: true,
          color: phase.color,
          planned_start: null,
          planned_end: null,
        })
      }

      for (const task of tasks) {
        ganttData.push({
          id: `task_${task.id}`,
          text: task.name,
          start_date: toGanttDate(task.current_start ?? task.planned_start),
          end_date: toGanttDate(task.current_end ?? task.planned_end),
          duration: task.duration_days,
          progress: task.progress_pct / 100,
          parent: `phase_${task.phase_id}`,
          type: task.is_milestone ? gantt.config.types.milestone : gantt.config.types.task,
          open: false,
          color: phaseColour[task.phase_id] ?? '#6366f1',
          planned_start: task.planned_start,
          planned_end: task.planned_end,
        })
      }

      for (const dep of dependencies) {
        ganttLinks.push({
          id: dep.id,
          source: `task_${dep.depends_on_task_id}`,
          target: `task_${dep.task_id}`,
          type: LINK_TYPE[dep.dependency_type] ?? '0',
        })
      }

      // ── Initialise ───────────────────────────────────────────────────────
      gantt.init(containerRef.current!)
      gantt.parse({ data: ganttData, links: ganttLinks })
    }

    init().catch(console.error)

    return () => {
      if (ganttRef.current) {
        try { ganttRef.current.clearAll() } catch { /* ignore */ }
      }
    }
  }, []) // intentionally mount-only

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
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

      {/* Gantt container */}
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  )
}
