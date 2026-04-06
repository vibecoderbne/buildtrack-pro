import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import GanttChart from './GanttChart'

export default async function ProgrammePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  // Verify project access
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, start_date')
    .eq('id', id)
    .single()

  if (!project) notFound()

  // Fetch phases ordered by sort_order
  const { data: phases } = await supabase
    .from('phases')
    .select('*')
    .eq('project_id', id)
    .order('sort_order')

  // Fetch tasks ordered by phase then sort_order
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', id)
    .order('sort_order')

  // Fetch dependencies
  const { data: dependencies } = await supabase
    .from('task_dependencies')
    .select('*')
    .in('task_id', (tasks ?? []).map((t) => t.id))

  return (
    <div className="flex flex-col h-full">
      <GanttChart
        projectId={id}
        phases={phases ?? []}
        tasks={tasks ?? []}
        dependencies={dependencies ?? []}
      />
    </div>
  )
}
