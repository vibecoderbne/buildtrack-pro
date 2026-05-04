import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('setup_completed, job_type')
    .eq('id', id)
    .single()

  if (project?.job_type === 'cost_plus') {
    redirect(`/projects/${id}/costs`)
  }

  if (project && !project.setup_completed) {
    redirect(`/projects/${id}/setup/tasks`)
  }

  redirect(`/projects/${id}/programme`)
}
