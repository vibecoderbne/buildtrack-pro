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
