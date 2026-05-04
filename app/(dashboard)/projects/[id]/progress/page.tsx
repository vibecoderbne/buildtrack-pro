import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getProgressReport } from '@/app/actions/progress'
import { getCostPlusClaims, getCostPlusClaimDetail } from '@/app/actions/cost-plus-claims'
import ProgressReportClient from './ProgressReportClient'
import CostPlusClaimsClient from './CostPlusClaimsClient'

export default async function ProgressPage(props: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await props.params
  const sp      = await props.searchParams

  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, address, organisation_id, job_type, builder_id')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const orgId = project.organisation_id
  const { data: org } = await supabase
    .from('organisations')
    .select('name, abn, address')
    .eq('id', orgId)
    .single()

  const { data: builder } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', project.builder_id)
    .single()

  // ── Cost Plus branch ────────────────────────────────────────────────────────
  if (project.job_type === 'cost_plus') {
    const claims = await getCostPlusClaims(id)
    const draft  = claims.find(c => c.status === 'draft') ?? null
    const draftDetail = draft ? await getCostPlusClaimDetail(draft.id) : null

    return (
      <CostPlusClaimsClient
        projectId={id}
        projectName={project.name}
        projectAddress={project.address}
        builderName={builder?.full_name ?? ''}
        orgName={org?.name ?? ''}
        initialClaims={claims}
        initialDraftDetail={draftDetail}
      />
    )
  }

  // ── Fixed Price branch (unchanged) ──────────────────────────────────────────
  const today     = new Date().toISOString().split('T')[0]
  const claimDate = typeof sp.date === 'string' ? sp.date : today
  const report    = await getProgressReport(id, claimDate)

  return (
    <ProgressReportClient
      projectId={id}
      report={report}
      projectName={project.name}
      projectAddress={project.address}
      orgName={org?.name ?? ''}
      orgAbn={org?.abn ?? null}
      orgAddress={org?.address ?? null}
    />
  )
}
