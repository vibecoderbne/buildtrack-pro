import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import VariationsClient from './VariationsClient'

// Local type for the nested variation query result
interface ApprovedVariationRow {
  id: string
  variation_number: number
  title: string
  description: string | null
  approved_at: string
  approved_by: string | null
  created_at: string
  approved_variation_changes: {
    id: string
    change_type: 'add_task' | 'modify_task' | 'change_value'
    task_id: string | null
    prev_start_date: string | null
    new_start_date: string | null
    prev_end_date: string | null
    new_end_date: string | null
    prev_contract_value: number | null
    new_contract_value: number | null
    new_task_name: string | null
    new_task_trade: string | null
  }[]
}

export default async function VariationsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, baseline_locked_at, baseline_locked_by')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const [
    { data: phases },
    { data: tasks },
    { data: approvedVariations },
    { data: approvedSchedule },
  ] = await Promise.all([
    supabase
      .from('phases')
      .select('id, name, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('tasks')
      .select('id, name, phase_id, current_start, current_end, contract_value, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('approved_variations')
      .select('*, approved_variation_changes(*)')
      .eq('project_id', id)
      .order('variation_number'),
    supabase
      .from('task_approved_schedule')
      .select('task_id, approved_start_date, approved_end_date, approved_contract_value')
      .eq('project_id', id),
  ])

  // Collect user IDs for approved_by name lookup
  const userIds = new Set<string>()
  if (project.baseline_locked_by) userIds.add(project.baseline_locked_by)
  for (const v of approvedVariations ?? []) {
    if (v.approved_by) userIds.add(v.approved_by)
  }

  const userNames: Record<string, string> = {}
  if (userIds.size > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', Array.from(userIds))
    for (const u of users ?? []) {
      userNames[u.id] = u.full_name
    }
  }

  const nextVariationNumber = ((approvedVariations ?? []).reduce((max, v) => Math.max(max, v.variation_number), 0)) + 1

  return (
    <VariationsClient
      projectId={id}
      baselineLockedAt={project.baseline_locked_at ?? null}
      lockedByName={project.baseline_locked_by ? (userNames[project.baseline_locked_by] ?? null) : null}
      phases={phases ?? []}
      tasks={tasks ?? []}
      approvedVariations={(approvedVariations ?? []) as unknown as ApprovedVariationRow[]}
      approvedSchedule={approvedSchedule ?? []}
      userNames={userNames}
      nextVariationNumber={nextVariationNumber}
    />
  )
}
