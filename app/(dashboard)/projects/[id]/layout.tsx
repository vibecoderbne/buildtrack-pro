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
    <div className="flex-1 flex flex-col min-h-0">
      <ProjectNav project={project} />
      {/* overflow-y-auto intentionally omitted: the Gantt chart manages its own
          internal scrollbars and needs an unclipped container. Other tab pages
          (delays, payments, etc.) that need scrolling add their own wrapper. */}
      <div className="flex-1 flex flex-col min-h-0">{props.children}</div>
    </div>
  )
}
