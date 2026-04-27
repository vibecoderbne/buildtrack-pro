import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('setup_completed')
    .eq('id', id)
    .single()

  if (project && !project.setup_completed) {
    redirect(`/projects/${id}/setup/tasks`)
  }

  redirect(`/projects/${id}/programme`)
}
