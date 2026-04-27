import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplatePickerClient from './TemplatePickerClient'

export default async function TemplatePickerPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('start_date')
    .eq('id', id)
    .single()

  if (!project) notFound()

  return (
    <TemplatePickerClient
      projectId={id}
      startDate={project.start_date}
    />
  )
}
