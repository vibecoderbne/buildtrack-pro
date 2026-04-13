import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getDelaysPageData } from '@/app/actions/delays'
import DelayRegisterClient from './DelayRegisterClient'

export default async function DelaysPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  // Verify project exists
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .single()

  if (!project) notFound()

  // Fetch all data in parallel
  const [data, { data: rawPhases }, { data: rawTasks }] = await Promise.all([
    getDelaysPageData(id),
    supabase.from('phases')
      .select('id, name, color, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase.from('tasks')
      .select('id, name, phase_id, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
  ])

  return (
    <DelayRegisterClient
      projectId={id}
      initialData={data}
      phases={rawPhases ?? []}
      tasks={rawTasks ?? []}
    />
  )
}
