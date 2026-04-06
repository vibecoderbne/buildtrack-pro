import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProjectNav from './ProjectNav'

export default async function ProjectLayout(props: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, address, status')
    .eq('id', id)
    .single()

  if (!project) notFound()

  return (
    <div className="flex flex-col h-full">
      <ProjectNav project={project} />
      <div className="flex-1 overflow-y-auto">{props.children}</div>
    </div>
  )
}
