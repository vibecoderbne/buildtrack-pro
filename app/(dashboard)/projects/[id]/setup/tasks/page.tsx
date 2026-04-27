import { createClient } from '@/lib/supabase/server'
import TasksClient from '../../tasks/TasksClient'
import SetupBanner from './SetupBanner'

export default async function SetupTasksPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

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

  const phaseMap = Object.fromEntries((phases ?? []).map((p) => [p.id, p.name]))

  const rows = (tasks ?? []).map((t) => ({
    ...t,
    phase_name: phaseMap[t.phase_id] ?? '',
    days_delayed: 0,
  }))

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <SetupBanner projectId={id} />
      <TasksClient
        projectId={id}
        phases={phases ?? []}
        initialTasks={rows}
      />
    </div>
  )
}
