'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TEMPLATE } from '@/lib/template-data'
import type { Database } from '@/lib/types'

// ── Date helpers ──────────────────────────────────────────────────────────────

function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++ // skip Sat (6) and Sun (0)
  }
  return result
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

// ── Seeder ────────────────────────────────────────────────────────────────────

/**
 * Populates a newly created project with phases and tasks from the default
 * template. Dates are calculated sequentially from the project's start_date.
 * All dependencies are finish-to-start (each task starts when the previous ends;
 * each phase starts when the previous phase ends).
 */
export async function applyDefaultTemplate(
  projectId: string,
  startDate: string,
  supabase: SupabaseClient<Database>
) {
  const template = DEFAULT_TEMPLATE

  const phasesToInsert: Database['public']['Tables']['phases']['Insert'][] = []
  const tasksToInsert: Database['public']['Tables']['tasks']['Insert'][] = []
  const depsToInsert: Database['public']['Tables']['task_dependencies']['Insert'][] = []

  let currentDate = new Date(startDate)
  // Pre-generate all IDs so we can wire dependencies before inserting
  let prevTaskId: string | null = null

  for (let pi = 0; pi < template.phases.length; pi++) {
    const phaseData = template.phases[pi]
    const phaseId = crypto.randomUUID()

    phasesToInsert.push({
      id: phaseId,
      project_id: projectId,
      name: phaseData.name,
      sort_order: pi,
      color: phaseData.color,
    })

    for (let ti = 0; ti < phaseData.tasks.length; ti++) {
      const taskData = phaseData.tasks[ti]
      const taskId = crypto.randomUUID()
      const taskStart = new Date(currentDate)
      const taskEnd = addWorkingDays(taskStart, taskData.duration_days)

      tasksToInsert.push({
        id: taskId,
        phase_id: phaseId,
        project_id: projectId,
        name: taskData.name,
        sort_order: ti,
        planned_start: toDateString(taskStart),
        planned_end: toDateString(taskEnd),
        current_start: toDateString(taskStart),
        current_end: toDateString(taskEnd),
        duration_days: taskData.duration_days,
        progress_pct: 0,
        trade: taskData.trade,
        is_milestone: taskData.is_milestone,
        depends_on: prevTaskId ? [prevTaskId] : [],
      })

      if (prevTaskId) {
        depsToInsert.push({
          task_id: taskId,
          depends_on_task_id: prevTaskId,
          dependency_type: 'finish_to_start',
          lag_days: 0,
        })
      }

      prevTaskId = taskId
      currentDate = taskEnd // next task starts where this one ends
    }
  }

  // Batch insert — phases first, then tasks (FK constraint), then dependencies
  const { error: phaseErr } = await supabase.from('phases').insert(phasesToInsert)
  if (phaseErr) throw new Error(`Phase insert failed: ${phaseErr.message}`)

  const { error: taskErr } = await supabase.from('tasks').insert(tasksToInsert)
  if (taskErr) throw new Error(`Task insert failed: ${taskErr.message}`)

  if (depsToInsert.length > 0) {
    const { error: depErr } = await supabase.from('task_dependencies').insert(depsToInsert)
    if (depErr) throw new Error(`Dependency insert failed: ${depErr.message}`)
  }

  // Return the calculated programme end date for project.current_completion
  return toDateString(currentDate)
}

// ── Basic template (phases only — no tasks) ───────────────────────────────────

export async function applyBasicTemplate(
  projectId: string,
  supabase: SupabaseClient<Database>
) {
  const phasesToInsert = DEFAULT_TEMPLATE.phases.map((phaseData, pi) => ({
    id: crypto.randomUUID(),
    project_id: projectId,
    name: phaseData.name,
    sort_order: pi,
    color: phaseData.color,
  }))

  const { error } = await supabase.from('phases').insert(phasesToInsert)
  if (error) throw new Error(`Phase insert failed: ${error.message}`)
}

// ── Minimal template (one phase + one task) ───────────────────────────────────

export async function applyMinimalTemplate(
  projectId: string,
  startDate: string,
  supabase: SupabaseClient<Database>
) {
  const phaseId = crypto.randomUUID()
  const taskId = crypto.randomUUID()
  const taskStart = new Date(startDate)
  const taskEnd = addWorkingDays(taskStart, 5)

  const { error: phaseErr } = await supabase.from('phases').insert({
    id: phaseId,
    project_id: projectId,
    name: 'Phase 1',
    sort_order: 0,
    color: '#6366f1',
  })
  if (phaseErr) throw new Error(`Phase insert failed: ${phaseErr.message}`)

  const { error: taskErr } = await supabase.from('tasks').insert({
    id: taskId,
    phase_id: phaseId,
    project_id: projectId,
    name: 'Task 1',
    sort_order: 0,
    planned_start: toDateString(taskStart),
    planned_end: toDateString(taskEnd),
    current_start: toDateString(taskStart),
    current_end: toDateString(taskEnd),
    duration_days: 5,
    progress_pct: 0,
    trade: null,
    is_milestone: false,
    depends_on: [],
  })
  if (taskErr) throw new Error(`Task insert failed: ${taskErr.message}`)
}
