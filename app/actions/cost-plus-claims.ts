'use server'

import { refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ClaimStatus } from '@/lib/types'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface CostPlusClaimSummary {
  id: string
  claimNumber: number
  periodStart: string
  periodEnd: string
  status: ClaimStatus
  grandTotalExGst: number
  grandTotalIncGst: number
  submittedAt: string | null
  createdAt: string
  appliedLabourMarkup: number | null
  appliedMaterialsMarkup: number | null
}

export interface CostPlusLabourRow {
  id: string
  entry_date: string
  worker_name: string
  description: string | null
  rate_type: 'hourly' | 'daily'
  units: number
  rate: number
  amount: number
}

export interface CostPlusInvoiceRow {
  id: string
  invoice_date: string
  supplier_name: string
  category: 'trade' | 'materials' | 'other'
  trade_category: string | null
  invoice_number: string | null
  description: string | null
  amount_ex_gst: number
  gst_amount: number
  amount_inc_gst: number
}

export interface CostPlusClaimDetail {
  claim: CostPlusClaimSummary
  labourEntries: CostPlusLabourRow[]
  costInvoices: CostPlusInvoiceRow[]
  labourSubtotal: number
  labourMarkup: number
  labourTotalExGst: number
  invoicesSubtotal: number
  materialsMarkup: number
  invoicesTotalExGst: number
  grandTotalExGst: number
  gst: number
  grandTotalIncGst: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeTotals(
  labourEntries: CostPlusLabourRow[],
  costInvoices: CostPlusInvoiceRow[],
  labourMarkupPct: number,
  materialsMarkupPct: number,
) {
  const labourSubtotal     = labourEntries.reduce((s, e) => s + Number(e.amount), 0)
  const labourMarkup       = labourSubtotal * (labourMarkupPct / 100)
  const labourTotalExGst   = labourSubtotal + labourMarkup

  const invoicesSubtotal   = costInvoices.reduce((s, i) => s + Number(i.amount_ex_gst), 0)
  const materialsMarkup    = invoicesSubtotal * (materialsMarkupPct / 100)
  const invoicesTotalExGst = invoicesSubtotal + materialsMarkup

  const grandTotalExGst    = labourTotalExGst + invoicesTotalExGst
  const gst                = Math.round(grandTotalExGst * 0.1 * 100) / 100
  const grandTotalIncGst   = Math.round((grandTotalExGst + gst) * 100) / 100

  return { labourSubtotal, labourMarkup, labourTotalExGst, invoicesSubtotal, materialsMarkup, invoicesTotalExGst, grandTotalExGst, gst, grandTotalIncGst }
}

function mapClaim(c: {
  id: string; claim_number: number; claim_period_start: string; claim_period_end: string
  status: string; gross_claim_amount: number; net_claim_amount: number
  submitted_at: string | null; created_at: string
  applied_labour_markup_percent: number | null; applied_materials_markup_percent: number | null
}): CostPlusClaimSummary {
  return {
    id:                     c.id,
    claimNumber:            c.claim_number,
    periodStart:            c.claim_period_start,
    periodEnd:              c.claim_period_end,
    status:                 c.status as ClaimStatus,
    grandTotalExGst:        Number(c.gross_claim_amount),
    grandTotalIncGst:       Number(c.net_claim_amount),
    submittedAt:            c.submitted_at,
    createdAt:              c.created_at,
    appliedLabourMarkup:    c.applied_labour_markup_percent != null ? Number(c.applied_labour_markup_percent) : null,
    appliedMaterialsMarkup: c.applied_materials_markup_percent != null ? Number(c.applied_materials_markup_percent) : null,
  }
}

// ── List claims ───────────────────────────────────────────────────────────────

export async function getCostPlusClaims(projectId: string): Promise<CostPlusClaimSummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data } = await supabase
    .from('payment_claims')
    .select('id, claim_number, claim_period_start, claim_period_end, status, gross_claim_amount, net_claim_amount, submitted_at, created_at, applied_labour_markup_percent, applied_materials_markup_percent')
    .eq('project_id', projectId)
    .order('claim_number', { ascending: false })

  return (data ?? []).map(mapClaim)
}

// ── Claim detail ──────────────────────────────────────────────────────────────

export async function getCostPlusClaimDetail(claimId: string): Promise<CostPlusClaimDetail> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const [{ data: claim }, { data: labour }, { data: invoices }] = await Promise.all([
    supabase
      .from('payment_claims')
      .select('id, claim_number, claim_period_start, claim_period_end, status, gross_claim_amount, net_claim_amount, submitted_at, created_at, applied_labour_markup_percent, applied_materials_markup_percent')
      .eq('id', claimId)
      .single(),
    supabase
      .from('labour_entries')
      .select('id, entry_date, worker_name, description, rate_type, units, rate, amount')
      .eq('claim_period_id', claimId)
      .order('entry_date'),
    supabase
      .from('cost_invoices')
      .select('id, invoice_date, supplier_name, category, trade_category, invoice_number, description, amount_ex_gst, gst_amount, amount_inc_gst')
      .eq('claim_period_id', claimId)
      .order('invoice_date'),
  ])

  if (!claim) throw new Error('Claim not found')

  const labourEntries  = (labour ?? []) as CostPlusLabourRow[]
  const costInvoices   = (invoices ?? []) as CostPlusInvoiceRow[]
  const labourMarkupPct    = Number(claim.applied_labour_markup_percent ?? 0)
  const materialsMarkupPct = Number(claim.applied_materials_markup_percent ?? 0)

  const totals = computeTotals(labourEntries, costInvoices, labourMarkupPct, materialsMarkupPct)

  return { claim: mapClaim(claim), labourEntries, costInvoices, ...totals }
}

// ── Generate claim ────────────────────────────────────────────────────────────

export async function generateCostPlusClaim(
  projectId: string,
  input: { periodStart: string; periodEnd: string },
): Promise<{ claimId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Block if draft exists
  const { data: existing } = await supabase
    .from('payment_claims')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .maybeSingle()
  if (existing) throw new Error('A draft claim already exists. Submit or delete it before generating a new one.')

  // Markup percentages snapshot
  const { data: project } = await supabase
    .from('projects')
    .select('labour_markup_percent, materials_markup_percent')
    .eq('id', projectId)
    .single()
  const labourMarkupPct    = Number(project?.labour_markup_percent ?? 0)
  const materialsMarkupPct = Number(project?.materials_markup_percent ?? 0)

  // Next claim number
  const { data: maxRow } = await supabase
    .from('payment_claims')
    .select('claim_number')
    .eq('project_id', projectId)
    .order('claim_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const claimNumber = (maxRow?.claim_number ?? 0) + 1

  // Insert claim with placeholder amounts; get its ID
  const { data: claim, error: claimErr } = await supabase
    .from('payment_claims')
    .insert({
      project_id:                      projectId,
      claim_number:                    claimNumber,
      claim_period_start:              input.periodStart,
      claim_period_end:                input.periodEnd,
      status:                          'draft' as ClaimStatus,
      gross_claim_amount:              0,
      less_previous_claims:            0,
      this_claim_amount:               0,
      less_retention:                  0,
      net_claim_amount:                0,
      generated_by:                    user.id,
      applied_labour_markup_percent:    labourMarkupPct,
      applied_materials_markup_percent: materialsMarkupPct,
    })
    .select('id')
    .single()

  if (claimErr || !claim) throw new Error(claimErr?.message ?? 'Failed to create claim')

  // Lock unclaimed entries within the date range
  await Promise.all([
    supabase
      .from('labour_entries')
      .update({ claim_period_id: claim.id })
      .eq('project_id', projectId)
      .is('claim_period_id', null)
      .gte('entry_date', input.periodStart)
      .lte('entry_date', input.periodEnd),
    supabase
      .from('cost_invoices')
      .update({ claim_period_id: claim.id })
      .eq('project_id', projectId)
      .is('claim_period_id', null)
      .gte('invoice_date', input.periodStart)
      .lte('invoice_date', input.periodEnd),
  ])

  // Recompute totals from locked entries and update claim
  await recomputeAndUpdateClaim(supabase, claim.id, labourMarkupPct, materialsMarkupPct)

  refresh()
  return { claimId: claim.id }
}

// ── Refresh entries ───────────────────────────────────────────────────────────

export async function refreshCostPlusClaimEntries(claimId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: claim } = await supabase
    .from('payment_claims')
    .select('project_id, claim_period_start, claim_period_end, status, applied_labour_markup_percent, applied_materials_markup_percent')
    .eq('id', claimId)
    .single()

  if (!claim) throw new Error('Claim not found')
  if (claim.status !== 'draft') throw new Error('Can only refresh a draft claim')

  // Pull in any newly added unclaimed entries within the period
  await Promise.all([
    supabase
      .from('labour_entries')
      .update({ claim_period_id: claimId })
      .eq('project_id', claim.project_id)
      .is('claim_period_id', null)
      .gte('entry_date', claim.claim_period_start)
      .lte('entry_date', claim.claim_period_end),
    supabase
      .from('cost_invoices')
      .update({ claim_period_id: claimId })
      .eq('project_id', claim.project_id)
      .is('claim_period_id', null)
      .gte('invoice_date', claim.claim_period_start)
      .lte('invoice_date', claim.claim_period_end),
  ])

  const labourMarkupPct    = Number(claim.applied_labour_markup_percent ?? 0)
  const materialsMarkupPct = Number(claim.applied_materials_markup_percent ?? 0)
  await recomputeAndUpdateClaim(supabase, claimId, labourMarkupPct, materialsMarkupPct)

  refresh()
}

// ── Status transitions (reuse existing patterns) ──────────────────────────────

export async function submitCostPlusClaim(claimId: string): Promise<void> {
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

export async function deleteDraftCostPlusClaim(claimId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Unlock the entries before deleting the claim
  await Promise.all([
    supabase.from('labour_entries').update({ claim_period_id: null }).eq('claim_period_id', claimId),
    supabase.from('cost_invoices').update({ claim_period_id: null }).eq('claim_period_id', claimId),
  ])

  const { error } = await supabase
    .from('payment_claims')
    .delete()
    .eq('id', claimId)
    .eq('status', 'draft')
  if (error) throw new Error(error.message)
  refresh()
}

export async function updateCostPlusClaimStatus(claimId: string, status: 'approved' | 'paid'): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('payment_claims').update({ status }).eq('id', claimId)
  if (error) throw new Error(error.message)
  refresh()
}

// ── Internal: recompute totals and update claim row ───────────────────────────

async function recomputeAndUpdateClaim(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  claimId: string,
  labourMarkupPct: number,
  materialsMarkupPct: number,
) {
  const [{ data: labour }, { data: invoices }] = await Promise.all([
    supabase.from('labour_entries').select('amount').eq('claim_period_id', claimId),
    supabase.from('cost_invoices').select('amount_ex_gst').eq('claim_period_id', claimId),
  ])

  const labourEntries  = (labour ?? []) as { amount: number }[]
  const costInvoices   = (invoices ?? []) as { amount_ex_gst: number }[]

  const labourSubtotal     = labourEntries.reduce((s, e) => s + Number(e.amount), 0)
  const labourMarkup       = labourSubtotal * (labourMarkupPct / 100)
  const labourTotalExGst   = labourSubtotal + labourMarkup
  const invoicesSubtotal   = costInvoices.reduce((s, i) => s + Number(i.amount_ex_gst), 0)
  const materialsMarkup    = invoicesSubtotal * (materialsMarkupPct / 100)
  const invoicesTotalExGst = invoicesSubtotal + materialsMarkup
  const grandTotalExGst    = labourTotalExGst + invoicesTotalExGst
  const gst                = Math.round(grandTotalExGst * 0.1 * 100) / 100
  const grandTotalIncGst   = Math.round((grandTotalExGst + gst) * 100) / 100

  await supabase
    .from('payment_claims')
    .update({
      gross_claim_amount:   grandTotalExGst,
      less_previous_claims: 0,
      this_claim_amount:    grandTotalIncGst,
      less_retention:       0,
      net_claim_amount:     grandTotalIncGst,
    })
    .eq('id', claimId)
}
