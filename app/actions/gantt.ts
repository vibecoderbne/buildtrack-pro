'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
 * Called when a user drags the progress handle on a task bar.
 * Creates an audit log entry and updates the task's progress_pct.
 */
export async function updateTaskProgress(taskId: string, progressPct: number) {
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
    }),
  ])

  if (taskErr) throw new Error(taskErr.message)
  if (logErr) console.error('Progress log insert failed:', logErr.message)

  revalidatePath(`/projects/${task.project_id}/programme`)
}
