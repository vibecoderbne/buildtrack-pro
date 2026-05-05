import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import CostsClient from './CostsClient'

export default async function CostsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, start_date, job_type, default_hourly_rate, default_daily_rate')
    .eq('id', id)
    .single()

  if (!project) notFound()
  if (project.job_type === 'fixed_price') redirect(`/projects/${id}/programme?msg=labour-invoices-unavailable`)

  const [
    { data: labourEntries },
    { data: costInvoices },
    { data: claimPeriods },
  ] = await Promise.all([
    supabase
      .from('labour_entries')
      .select('id, entry_date, worker_name, description, rate_type, units, rate, amount, claim_period_id')
      .eq('project_id', id)
      .order('entry_date', { ascending: false }),
    supabase
      .from('cost_invoices')
      .select('id, invoice_date, supplier_name, category, trade_category, invoice_number, description, amount_ex_gst, gst_amount, amount_inc_gst, file_url, file_name, claim_period_id')
      .eq('project_id', id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('payment_claims')
      .select('id, claim_number, claim_period_start, claim_period_end')
      .eq('project_id', id)
      .order('claim_number'),
  ])

  return (
    <CostsClient
      project={{
        id: project.id,
        name: project.name,
        start_date: project.start_date,
        default_hourly_rate: project.default_hourly_rate,
        default_daily_rate: project.default_daily_rate,
      }}
      initialLabourEntries={labourEntries ?? []}
      initialCostInvoices={costInvoices ?? []}
      claimPeriods={claimPeriods ?? []}
    />
  )
}
