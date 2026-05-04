import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import GanttChart from './GanttChart'

export default async function ProgrammePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, start_date, job_type')
    .eq('id', id)
    .single()

  if (!project) notFound()
  if (project.job_type === 'cost_plus') redirect(`/projects/${id}/costs?msg=gantt-unavailable`)

  // Fetch phases ordered by sort_order
  const { data: phases, error: phasesErr } = await supabase
    .from('phases')
    .select('*')
    .eq('project_id', id)
    .order('sort_order')

  // Fetch tasks ordered by sort_order
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', id)
    .order('sort_order')

  // Fetch dependencies for all tasks in this project
  const { data: dependencies, error: depsErr } = await supabase
    .from('task_dependencies')
    .select('*')
    .in('task_id', (tasks ?? []).map((t) => t.id))

  // Debug logs (visible in `npm run dev` terminal output)
  console.log('[ProgrammePage] project_id:', id)
  console.log('[ProgrammePage] phases:', phases?.length ?? 0, phasesErr ?? 'ok')
  console.log('[ProgrammePage] tasks:', tasks?.length ?? 0, tasksErr ?? 'ok')
  console.log('[ProgrammePage] dependencies:', dependencies?.length ?? 0, depsErr ?? 'ok')
  if (tasks?.[0]) {
    console.log('[ProgrammePage] first task sample:', {
      id: tasks[0].id,
      name: tasks[0].name,
      planned_start: tasks[0].planned_start,
      planned_end: tasks[0].planned_end,
      current_start: tasks[0].current_start,
      current_end: tasks[0].current_end,
      phase_id: tasks[0].phase_id,
    })
  }

  return (
    <GanttChart
      projectId={id}
      phases={phases ?? []}
      tasks={tasks ?? []}
      dependencies={dependencies ?? []}
    />
  )
}
