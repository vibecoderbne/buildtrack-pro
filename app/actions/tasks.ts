'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Updates any combination of editable task fields.
 * If progress_pct is included, also writes a task_progress_logs entry.
 */
export async function updateTaskFields(
  taskId: string,
  fields: Partial<{
    phase_id: string
    name: string
    current_start: string
    current_end: string
    planned_start: string
    planned_end: string
    duration_days: number
    progress_pct: number
    contract_value: number
    trade: string | null
    notes: string | null
    is_milestone: boolean
  }>
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: task } = await supabase
    .from('tasks')
    .select('project_id, progress_pct')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  // Clamp progress_pct if present
  const updates = { ...fields }
  if (typeof updates.progress_pct === 'number') {
    updates.progress_pct = Math.min(100, Math.max(0, Math.round(updates.progress_pct)))
  }

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId)
  if (error) throw new Error(error.message)

  // Log progress change if progress_pct was updated
  if (typeof updates.progress_pct === 'number') {
    const { error: logErr } = await supabase.from('task_progress_logs').insert({
      task_id:      taskId,
      progress_pct: updates.progress_pct,
      previous_pct: task.progress_pct,
      updated_by:   user.id,
      note:         null,
    })
    if (logErr) console.error('Progress log insert failed:', logErr.message)
  }

  revalidatePath(`/projects/${task.project_id}/programme`)
  revalidatePath(`/projects/${task.project_id}/progress`)
  revalidatePath(`/projects/${task.project_id}/tasks`)
}

/**
 * Creates a blank task in a phase and returns the full new row.
 */
export async function createProjectTask(
  projectId: string,
  phaseId: string,
  sortOrder: number
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id:    projectId,
      phase_id:      phaseId,
      name:          'New task',
      planned_start: today,
      planned_end:   today,
      current_start: today,
      current_end:   today,
      duration_days: 1,
      progress_pct:  0,
      sort_order:    sortOrder,
      is_milestone:  false,
    })
    .select('id, phase_id, name, current_start, current_end, planned_start, planned_end, duration_days, progress_pct, contract_value, trade, notes, is_milestone, sort_order')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}/programme`)
  revalidatePath(`/projects/${projectId}/tasks`)

  return data
}

/**
 * Deletes a task and all its dependencies.
 * (Mirrors deleteTask in gantt.ts but also revalidates /tasks.)
 */
export async function deleteProjectTask(taskId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: task } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  // claim_line_items has no ON DELETE CASCADE, so delete explicitly
  await supabase.from('claim_line_items').delete().eq('task_id', taskId)

  await supabase
    .from('task_dependencies')
    .delete()
    .or(`task_id.eq.${taskId},depends_on_task_id.eq.${taskId}`)

  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${task.project_id}/programme`)
  revalidatePath(`/projects/${task.project_id}/progress`)
  revalidatePath(`/projects/${task.project_id}/tasks`)
}

/**
 * Creates a task with user-supplied details. Returns the full new row.
 */
export async function createTaskWithDetails(input: {
  projectId: string
  phaseId: string
  name: string
  startDate: string
  endDate: string
  trade: string | null
  contractValue: number | null
  sortOrder: number
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const durationDays = Math.max(
    1,
    Math.round(
      (new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  )

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id:     input.projectId,
      phase_id:       input.phaseId,
      name:           input.name,
      planned_start:  input.startDate,
      planned_end:    input.endDate,
      current_start:  input.startDate,
      current_end:    input.endDate,
      duration_days:  durationDays,
      progress_pct:   0,
      sort_order:     input.sortOrder,
      is_milestone:   false,
      trade:          input.trade || null,
      contract_value: input.contractValue ?? 0,
    })
    .select(
      'id, phase_id, name, current_start, current_end, planned_start, planned_end, duration_days, progress_pct, contract_value, trade, notes, is_milestone, sort_order'
    )
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${input.projectId}/programme`)
  revalidatePath(`/projects/${input.projectId}/tasks`)

  return data
}

/**
 * Creates a new blank phase for a project and returns the new row.
 */
export async function createPhase(projectId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: existing } = await supabase
    .from('phases')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const maxOrder = existing?.[0]?.sort_order ?? -1

  const { data, error } = await supabase
    .from('phases')
    .insert({
      project_id: projectId,
      name: 'New phase',
      sort_order: maxOrder + 1,
      color: '#6366f1',
    })
    .select('id, name, sort_order')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}/programme`)
  revalidatePath(`/projects/${projectId}/tasks`)
  revalidatePath(`/projects/${projectId}/setup/tasks`)

  return data
}

/**
 * Updates the name of a phase.
 */
export async function updatePhaseName(phaseId: string, name: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: phase } = await supabase
    .from('phases')
    .select('project_id')
    .eq('id', phaseId)
    .single()

  if (!phase) throw new Error('Phase not found')

  const { error } = await supabase
    .from('phases')
    .update({ name })
    .eq('id', phaseId)

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${phase.project_id}/programme`)
  revalidatePath(`/projects/${phase.project_id}/tasks`)
  revalidatePath(`/projects/${phase.project_id}/setup/tasks`)
}

/**
 * Deletes a phase and all its tasks.
 * Explicitly removes claim_line_items first (no cascade on that FK).
 * Everything else (task_dependencies, task_progress_logs, task_photos,
 * delay_affected_tasks) cascades automatically via the DB schema.
 */
export async function deletePhase(phaseId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: phase } = await supabase
    .from('phases')
    .select('project_id')
    .eq('id', phaseId)
    .single()

  if (!phase) throw new Error('Phase not found')

  // Collect task IDs so we can clean up claim_line_items
  const { data: phaseTasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('phase_id', phaseId)

  const taskIds = (phaseTasks ?? []).map((t) => t.id)

  if (taskIds.length > 0) {
    await supabase.from('claim_line_items').delete().in('task_id', taskIds)
  }

  // Deleting the phase cascades to all tasks and their dependent rows
  const { error } = await supabase.from('phases').delete().eq('id', phaseId)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${phase.project_id}/programme`)
  revalidatePath(`/projects/${phase.project_id}/progress`)
  revalidatePath(`/projects/${phase.project_id}/tasks`)
  revalidatePath(`/projects/${phase.project_id}/payments`)
  revalidatePath(`/projects/${phase.project_id}/delays`)
}
