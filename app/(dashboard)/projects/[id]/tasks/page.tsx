import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TasksClient from './TasksClient'

export default async function TasksPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('job_type').eq('id', id).single()
  if (project?.job_type === 'cost_plus') redirect(`/projects/${id}/costs?msg=tasks-unavailable`)

  const [{ data: phases }, { data: tasks }] = await Promise.all([
    supabase
      .from('phases')
      .select('id, name, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('tasks')
      .select(
        'id, phase_id, name, current_start, current_end, planned_start, planned_end, duration_days, progress_pct, contract_value, trade, notes, is_milestone, sort_order'
      )
      .eq('project_id', id)
      .order('sort_order'),
  ])

  // Attach phase_name to each task for display
  const phaseMap = Object.fromEntries((phases ?? []).map((p) => [p.id, p.name]))

  const rows = (tasks ?? []).map((t) => ({
    ...t,
    phase_name: phaseMap[t.phase_id] ?? '',
    days_delayed: 0, // default until ALTER TABLE migration adds this column
  }))

  return (
    <TasksClient
      projectId={id}
      phases={phases ?? []}
      initialTasks={rows}
    />
  )
}
