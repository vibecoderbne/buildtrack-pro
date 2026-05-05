import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import GanttChart from './GanttChart'

export default async function ProgrammePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, start_date, job_type, baseline_locked_at')
    .eq('id', id)
    .single()

  if (!project) notFound()

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

  // Fetch task baselines if the baseline is locked
  const baselineLocked = !!project?.baseline_locked_at
  const { data: taskBaselines } = baselineLocked
    ? await supabase
        .from('task_baselines')
        .select('task_id, original_start_date, original_end_date')
        .eq('project_id', id)
    : { data: [] }

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
      jobType={project.job_type}
      baselineLocked={baselineLocked}
      taskBaselines={taskBaselines ?? []}
    />
  )
}
