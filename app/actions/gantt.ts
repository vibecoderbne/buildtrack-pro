'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Deletes a task and all its dependencies.
 */
export async function deleteTask(taskId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Fetch project_id before deleting (for revalidation)
  const { data: task } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  // Delete dependencies in both directions
  await supabase
    .from('task_dependencies')
    .delete()
    .or(`task_id.eq.${taskId},depends_on_task_id.eq.${taskId}`)

  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${task.project_id}/programme`)
}

/**
 * Creates a new task under a phase with default values.
 * Returns the new task's id.
 */
export async function createTask(input: {
  projectId: string
  phaseId: string
  name: string
  startDate: string
  endDate: string
  durationDays: number
  sortOrder: number
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id:   input.projectId,
      phase_id:     input.phaseId,
      name:         input.name,
      planned_start: input.startDate,
      planned_end:   input.endDate,
      current_start: input.startDate,
      current_end:   input.endDate,
      duration_days: input.durationDays,
      progress_pct:  0,
      sort_order:    input.sortOrder,
      is_milestone:  false,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${input.projectId}/programme`)

  return data as { id: string }
}

/**
 * Called when a user renames a phase via the lightbox.
 */
export async function updatePhaseName(phaseId: string, name: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('phases')
    .update({ name })
    .eq('id', phaseId)

  if (error) throw new Error(error.message)

  const { data: phase } = await supabase
    .from('phases')
    .select('project_id')
    .eq('id', phaseId)
    .single()

  if (phase) revalidatePath(`/projects/${phase.project_id}/programme`)
}

/**
 * Called when a user reorders phases by dragging rows in the grid.
 */
export async function updatePhaseSortOrder(
  projectId: string,
  updates: { id: string; sort_order: number }[]
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('phases').update({ sort_order }).eq('id', id).eq('project_id', projectId)
    )
  )

  revalidatePath(`/projects/${projectId}/programme`)
}

/**
 * Called when a user reorders tasks by dragging rows in the grid.
 * Updates sort_order for every task in the affected phase.
 */
export async function updateTaskSortOrder(
  projectId: string,
  updates: { id: string; sort_order: number }[]
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('tasks').update({ sort_order }).eq('id', id).eq('project_id', projectId)
    )
  )

  revalidatePath(`/projects/${projectId}/programme`)
}

/**
 * Called when a user drags a task bar to reschedule it.
 * Updates current_start and current_end only — planned dates never change.
 */
export async function updateTaskDates(
  taskId: string,
  currentStart: string,
  currentEnd: string
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('tasks')
    .update({ current_start: currentStart, current_end: currentEnd })
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  // Revalidate the programme page so a full refresh reflects the new state
  const { data: task } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single()

  if (task) revalidatePath(`/projects/${task.project_id}/programme`)
}

/**
 * Called when a user edits the task name via the lightbox.
 */
export async function updateTaskName(taskId: string, name: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('tasks')
    .update({ name })
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  const { data: task } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single()

  if (task) revalidatePath(`/projects/${task.project_id}/programme`)
}

/**
 * Called when a user toggles the milestone checkbox in the task edit modal.
 * When becoming a milestone, duration_days is set to 0.
 * When becoming a regular task, duration_days is restored to 1 (minimum).
 * Planned dates are NEVER modified.
 */
export async function updateTaskMilestone(taskId: string, isMilestone: boolean) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Fetch current task to get duration for restoration
  const { data: task } = await supabase
    .from('tasks')
    .select('project_id, duration_days, current_start, current_end')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  // When toggling TO milestone: set duration to 0, end date = start date
  // When toggling FROM milestone: restore duration to at least 1 day
  const updates: { is_milestone: boolean; duration_days?: number; current_end?: string } = {
    is_milestone: isMilestone,
  }

  if (isMilestone) {
    // Becoming a milestone - set duration to 0 and end = start
    updates.duration_days = 0
    if (task.current_start) {
      updates.current_end = task.current_start
    }
  } else if (task.duration_days === 0 && task.current_start) {
    // Was a milestone (duration 0), now becoming regular task - restore 1 day duration
    updates.duration_days = 1
    const startDate = new Date(task.current_start)
    startDate.setDate(startDate.getDate() + 1)
    updates.current_end = startDate.toISOString().split('T')[0]
  }

  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${task.project_id}/programme`)
}

/**
 * Called when a user drags the progress handle on a task bar.
 * Creates an audit log entry and updates the task's progress_pct.
 */
export async function updateTaskProgress(taskId: string, progressPct: number, note?: string | null) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const pct = Math.min(100, Math.max(0, Math.round(progressPct)))

  // Read current progress for the log
  const { data: task } = await supabase
    .from('tasks')
    .select('progress_pct, project_id')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  const [{ error: taskErr }, { error: logErr }] = await Promise.all([
    supabase.from('tasks').update({ progress_pct: pct }).eq('id', taskId),
    supabase.from('task_progress_logs').insert({
      task_id: taskId,
      progress_pct: pct,
      previous_pct: task.progress_pct,
      updated_by: user.id,
      note: note ?? null,
    }),
  ])

  if (taskErr) throw new Error(taskErr.message)
  if (logErr) console.error('Progress log insert failed:', logErr.message)

  revalidatePath(`/projects/${task.project_id}/programme`)
}
