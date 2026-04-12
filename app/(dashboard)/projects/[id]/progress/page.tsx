import { createClient } from '@/lib/supabase/server'
import { getProgressReport } from '@/app/actions/progress'
import ProgressReportClient from './ProgressReportClient'

export default async function ProgressPage(props: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await props.params
  const sp      = await props.searchParams

  const today     = new Date().toISOString().split('T')[0]
  const claimDate = typeof sp.date === 'string' ? sp.date : today

  const supabase = await createClient()

  const [report, { data: project }] = await Promise.all([
    getProgressReport(id, claimDate),
    supabase.from('projects')
      .select('id, name, address, organisation_id')
      .eq('id', id)
      .single(),
  ])

  const orgId = project?.organisation_id ?? null

  const { data: org } = orgId
    ? await supabase.from('organisations').select('name, abn, address').eq('id', orgId).single()
    : { data: null }

  return (
    <ProgressReportClient
      projectId={id}
      report={report}
      projectName={project?.name ?? ''}
      projectAddress={project?.address ?? ''}
      orgName={org?.name ?? ''}
      orgAbn={org?.abn ?? null}
      orgAddress={org?.address ?? null}
    />
  )
}
