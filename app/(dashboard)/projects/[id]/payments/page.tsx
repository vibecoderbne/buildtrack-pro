import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContractPaymentsClient from './ContractPaymentsClient'

export default async function PaymentsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, address, start_date, builder_id, homeowner_id, organisation_id')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const [
    { data: contract },
    { data: phases },
    { data: tasks },
    { data: org },
    { data: builder },
    { data: homeowner },
  ] = await Promise.all([
    supabase.from('contracts').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('phases').select('id, name, color, sort_order').eq('project_id', id).order('sort_order'),
    supabase.from('tasks')
      .select('id, name, phase_id, contract_value, progress_pct, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase.from('organisations').select('name').eq('id', project.organisation_id).single(),
    supabase.from('users').select('full_name').eq('id', project.builder_id).single(),
    project.homeowner_id
      ? supabase.from('users').select('full_name').eq('id', project.homeowner_id).single()
      : Promise.resolve({ data: null }),
  ])

  return (
    <ContractPaymentsClient
      projectId={id}
      projectName={project.name}
      projectAddress={project.address}
      contractDate={project.start_date}
      builderName={builder?.full_name ?? ''}
      homeownerName={homeowner?.full_name ?? null}
      orgName={org?.name ?? ''}
      contract={contract ?? null}
      phases={phases ?? []}
      tasks={tasks ?? []}
    />
  )
}
