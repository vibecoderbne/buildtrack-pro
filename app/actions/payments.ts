'use server'

import { revalidatePath, refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ContractType, ClaimStatus } from '@/lib/types'

/**
 * Creates or updates the contract record for a project.
 * Safe to call on first save (upsert on unique project_id).
 */
export async function upsertContract(
  projectId: string,
  data: {
    contract_sum: number
    current_contract_sum: number
    retention_pct: number
    payment_terms_days: number
    contract_type: ContractType
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('contracts')
    .upsert(
      {
        project_id:           projectId,
        contract_sum:         data.contract_sum,
        current_contract_sum: data.current_contract_sum,
        retention_pct:        data.retention_pct,
        payment_terms_days:   data.payment_terms_days,
        contract_type:        data.contract_type,
      },
      { onConflict: 'project_id' }
    )

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/payments`)
}

/**
 * Updates the contract_value on a single task.
 * Called on blur from the inline task value editor.
 */
export async function updateTaskContractValue(taskId: string, contractValue: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: task } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  const { error } = await supabase
    .from('tasks')
    .update({ contract_value: contractValue })
    .eq('id', taskId)

  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${task.project_id}/payments`)
}

// ── Claim generation ───────────────────────────────────────────────────────────

export interface GenerateClaimInput {
  claimDate: string     // period end
  periodStart: string
  gross_claim_amount: number   // valueToDate
  less_previous_claims: number
  this_claim_amount: number    // thisClaimGross
  less_retention: number
  net_claim_amount: number
  lineItems: {
    taskId: string
    contractValue: number
    previousPct: number
    currentPct: number
    valueToDate: number
    valuePrevious: number
    thisClaimValue: number
  }[]
}

export async function generateClaim(
  projectId: string,
  input: GenerateClaimInput
): Promise<{ claimId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Block if a draft already exists
  const { data: existing } = await supabase
    .from('payment_claims')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .maybeSingle()

  if (existing) throw new Error('A draft claim already exists for this project. Submit or delete it before generating a new one.')

  // Next claim number
  const { data: maxRow } = await supabase
    .from('payment_claims')
    .select('claim_number')
    .eq('project_id', projectId)
    .order('claim_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const claimNumber = (maxRow?.claim_number ?? 0) + 1

  // Insert claim
  const { data: claim, error: claimError } = await supabase
    .from('payment_claims')
    .insert({
      project_id:           projectId,
      claim_number:         claimNumber,
      claim_period_start:   input.periodStart,
      claim_period_end:     input.claimDate,
      status:               'draft' as ClaimStatus,
      gross_claim_amount:   input.gross_claim_amount,
      less_previous_claims: input.less_previous_claims,
      this_claim_amount:    input.this_claim_amount,
      less_retention:       input.less_retention,
      net_claim_amount:     input.net_claim_amount,
      generated_by:         user.id,
    })
    .select('id')
    .single()

  if (claimError || !claim) throw new Error(claimError?.message ?? 'Failed to create claim')

  // Insert line items
  if (input.lineItems.length > 0) {
    const { error: lineError } = await supabase
      .from('claim_line_items')
      .insert(
        input.lineItems.map((li) => ({
          claim_id:              claim.id,
          task_id:               li.taskId,
          contract_value:        li.contractValue,
          progress_pct_current:  li.currentPct,
          progress_pct_previous: li.previousPct,
          value_to_date:         li.valueToDate,
          value_previous:        li.valuePrevious,
          this_claim_value:      li.thisClaimValue,
        }))
      )
    if (lineError) throw new Error(lineError.message)
  }

  refresh()
  return { claimId: claim.id }
}

export async function submitClaim(claimId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('payment_claims')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)
  refresh()
}

export async function deleteDraftClaim(claimId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Line items deleted via DB cascade, but delete them explicitly to be safe
  await supabase.from('claim_line_items').delete().eq('claim_id', claimId)

  const { error } = await supabase
    .from('payment_claims')
    .delete()
    .eq('id', claimId)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)
  refresh()
}

export async function updateClaimStatus(
  claimId: string,
  status: 'approved' | 'paid'
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('payment_claims')
    .update({ status })
    .eq('id', claimId)

  if (error) throw new Error(error.message)
  refresh()
}
