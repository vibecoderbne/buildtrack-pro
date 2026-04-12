import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContractPaymentsClient from './ContractPaymentsClient'

export default async function PaymentsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const [
    { data: contract },
    { data: phases },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('contracts').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('phases').select('id, name, color, sort_order').eq('project_id', id).order('sort_order'),
    supabase.from('tasks')
      .select('id, name, phase_id, contract_value, progress_pct, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
  ])

  return (
    <ContractPaymentsClient
      projectId={id}
      contract={contract ?? null}
      phases={phases ?? []}
      tasks={tasks ?? []}
    />
  )
}
