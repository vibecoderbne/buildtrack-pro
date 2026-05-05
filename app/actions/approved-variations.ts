'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface LineItemInput {
  type: 'modify_task' | 'change_value' | 'add_task'
  // modify_task + change_value
  taskId?: string
  prevStartDate?: string | null
  newStartDate?: string | null
  prevEndDate?: string | null
  newEndDate?: string | null
  // change_value
  prevContractValue?: number | null
  newContractValue?: number | null
  // add_task
  taskName?: string
  taskTrade?: string | null
  phaseId?: string
  startDate?: string
  endDate?: string
  contractValue?: number | null
}

export interface CreateVariationInput {
  projectId: string
  variationNumber: number
  title: string
  description: string | null
  approvedAt: string
  lineItems: LineItemInput[]
}

export async function createApprovedVariation(
  input: CreateVariationInput
): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorised' }

  const { projectId, variationNumber, title, description, approvedAt, lineItems } = input

  // Insert the variation header
  const { data: variation, error: varErr } = await supabase
    .from('approved_variations')
    .insert({
      project_id: projectId,
      variation_number: variationNumber,
      title,
      description: description || null,
      approved_at: approvedAt,
      approved_by: user.id,
    })
    .select('id')
    .single()

  if (varErr || !variation) return { error: varErr?.message ?? 'Failed to create variation' }

  const variationId = variation.id
  const now = new Date().toISOString()

  for (const item of lineItems) {
    if (item.type === 'add_task') {
      // Create the new task
      const { data: newTask, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          project_id: projectId,
          phase_id: item.phaseId!,
          name: item.taskName!,
          trade: item.taskTrade || null,
          current_start: item.startDate!,
          current_end: item.endDate!,
          planned_start: item.startDate!,
          planned_end: item.endDate!,
          duration_days: Math.max(1, Math.round(
            (new Date(item.endDate!).getTime() - new Date(item.startDate!).getTime()) / 86400000
          )),
          contract_value: item.contractValue ?? 0,
          progress_pct: 0,
          sort_order: 9999,
          is_milestone: false,
        })
        .select('id')
        .single()

      if (taskErr || !newTask) return { error: taskErr?.message ?? 'Failed to create task' }

      // Add to approved schedule (new tasks are not in baseline)
      await supabase.from('task_approved_schedule').insert({
        project_id: projectId,
        task_id: newTask.id,
        approved_start_date: item.startDate!,
        approved_end_date: item.endDate!,
        approved_contract_value: item.contractValue ?? null,
        last_updated_at: now,
      })

      // Record the change
      await supabase.from('approved_variation_changes').insert({
        variation_id: variationId,
        change_type: 'add_task',
        task_id: newTask.id,
        new_task_name: item.taskName!,
        new_task_trade: item.taskTrade || null,
        new_start_date: item.startDate!,
        new_end_date: item.endDate!,
        new_contract_value: item.contractValue ?? null,
      })
    }

    if (item.type === 'modify_task') {
      // Update approved schedule
      const updateApproved: Record<string, unknown> = { last_updated_at: now }
      if (item.newStartDate) updateApproved.approved_start_date = item.newStartDate
      if (item.newEndDate)   updateApproved.approved_end_date   = item.newEndDate

      await supabase
        .from('task_approved_schedule')
        .update(updateApproved)
        .eq('task_id', item.taskId!)
        .eq('project_id', projectId)

      // Snap current schedule to approved (current = new approved plan)
      const updateTask: Record<string, unknown> = {}
      if (item.newStartDate) { updateTask.current_start = item.newStartDate; updateTask.planned_start = item.newStartDate }
      if (item.newEndDate)   { updateTask.current_end   = item.newEndDate;   updateTask.planned_end   = item.newEndDate }
      if (Object.keys(updateTask).length > 0) {
        await supabase.from('tasks').update(updateTask).eq('id', item.taskId!)
      }

      // Record the change
      await supabase.from('approved_variation_changes').insert({
        variation_id: variationId,
        change_type: 'modify_task',
        task_id: item.taskId!,
        prev_start_date: item.prevStartDate ?? null,
        new_start_date:  item.newStartDate  ?? null,
        prev_end_date:   item.prevEndDate   ?? null,
        new_end_date:    item.newEndDate    ?? null,
      })
    }

    if (item.type === 'change_value') {
      // Update approved schedule
      await supabase
        .from('task_approved_schedule')
        .update({ approved_contract_value: item.newContractValue ?? null, last_updated_at: now })
        .eq('task_id', item.taskId!)
        .eq('project_id', projectId)

      // Update task contract value
      await supabase
        .from('tasks')
        .update({ contract_value: item.newContractValue ?? 0 })
        .eq('id', item.taskId!)

      // Record the change
      await supabase.from('approved_variation_changes').insert({
        variation_id: variationId,
        change_type: 'change_value',
        task_id: item.taskId!,
        prev_contract_value: item.prevContractValue ?? null,
        new_contract_value:  item.newContractValue  ?? null,
      })
    }
  }

  revalidatePath(`/projects/${projectId}/variations`)
  revalidatePath(`/projects/${projectId}/programme`)
  revalidatePath(`/projects/${projectId}`, 'layout')

  return { error: null, id: variationId }
}
