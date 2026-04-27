import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import VariationsClient from './VariationsClient'

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
    { data: baselines },
    { data: variations },
  ] = await Promise.all([
    supabase
      .from('phases')
      .select('id, name, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('tasks')
      .select('id, name, phase_id, current_start, current_end, duration_days, contract_value, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('task_baselines')
      .select('task_id, original_start_date, original_end_date, original_duration, original_contract_price')
      .eq('project_id', id),
    supabase
      .from('task_variations')
      .select('id, task_id, field_changed, old_value, new_value, changed_at, changed_by, reason')
      .eq('project_id', id)
      .order('changed_at', { ascending: false }),
  ])

  // Collect user IDs for name lookup
  const userIds = new Set<string>()
  if (project.baseline_locked_by) userIds.add(project.baseline_locked_by)
  for (const v of variations ?? []) {
    if (v.changed_by) userIds.add(v.changed_by)
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

  const taskCount = (tasks ?? []).filter(t => t.current_start && t.current_end).length

  return (
    <VariationsClient
      projectId={id}
      projectName={project.name}
      baselineLockedAt={project.baseline_locked_at ?? null}
      baselineLockedBy={project.baseline_locked_by ?? null}
      lockedByName={project.baseline_locked_by ? (userNames[project.baseline_locked_by] ?? null) : null}
      phases={phases ?? []}
      tasks={tasks ?? []}
      baselines={baselines ?? []}
      variations={variations ?? []}
      userNames={userNames}
      taskCount={taskCount}
    />
  )
}
