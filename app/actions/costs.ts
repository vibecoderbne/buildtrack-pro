'use server'

import { refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { InvoiceCategory } from '@/lib/types'

// ── Labour entries ────────────────────────────────────────────────────────────

export async function addLabourEntry(projectId: string, data: {
  entry_date: string
  worker_name: string
  description: string | null
  rate_type: 'hourly' | 'daily'
  units: number
  rate: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('labour_entries').insert({
    project_id:  projectId,
    entry_date:  data.entry_date,
    worker_name: data.worker_name,
    description: data.description,
    rate_type:   data.rate_type,
    units:       data.units,
    rate:        data.rate,
    created_by:  user.id,
  })
  if (error) throw new Error(error.message)
  refresh()
}

export async function updateLabourEntry(entryId: string, data: {
  entry_date: string
  worker_name: string
  description: string | null
  rate_type: 'hourly' | 'daily'
  units: number
  rate: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('labour_entries')
    .update({
      entry_date:  data.entry_date,
      worker_name: data.worker_name,
      description: data.description,
      rate_type:   data.rate_type,
      units:       data.units,
      rate:        data.rate,
    })
    .eq('id', entryId)
    .is('claim_period_id', null)
  if (error) throw new Error(error.message)
  refresh()
}

export async function deleteLabourEntry(entryId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('labour_entries')
    .delete()
    .eq('id', entryId)
    .is('claim_period_id', null)
  if (error) throw new Error(error.message)
  refresh()
}

// ── Cost invoices ─────────────────────────────────────────────────────────────

export async function addCostInvoice(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const projectId = formData.get('project_id') as string
  const file = formData.get('file') as File | null

  let file_url: string | null = null
  let file_name: string | null = null

  if (file && file.size > 0) {
    const bytes = await file.arrayBuffer()
    const sanitised = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${projectId}/${Date.now()}-${sanitised}`
    const { error: uploadError } = await supabase.storage
      .from('cost-invoices')
      .upload(path, Buffer.from(bytes), { contentType: file.type })
    if (uploadError) throw new Error(uploadError.message)
    file_url = path
    file_name = file.name
  }

  const { error } = await supabase.from('cost_invoices').insert({
    project_id:     projectId,
    invoice_date:   formData.get('invoice_date') as string,
    supplier_name:  formData.get('supplier_name') as string,
    category:       formData.get('category') as InvoiceCategory,
    trade_category: (formData.get('trade_category') as string) || null,
    invoice_number: (formData.get('invoice_number') as string) || null,
    description:    (formData.get('description') as string) || null,
    amount_ex_gst:  parseFloat(formData.get('amount_ex_gst') as string),
    gst_amount:     parseFloat((formData.get('gst_amount') as string) || '0') || 0,
    file_url,
    file_name,
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  refresh()
}

export async function updateCostInvoice(invoiceId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data: existing } = await supabase
    .from('cost_invoices')
    .select('project_id, file_url, file_name, claim_period_id')
    .eq('id', invoiceId)
    .single()
  if (!existing) throw new Error('Invoice not found')
  if (existing.claim_period_id) throw new Error('Cannot edit a locked invoice')

  const file = formData.get('file') as File | null
  let file_url = existing.file_url
  let file_name = existing.file_name

  if (file && file.size > 0) {
    const bytes = await file.arrayBuffer()
    const sanitised = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${existing.project_id}/${Date.now()}-${sanitised}`
    const { error: uploadError } = await supabase.storage
      .from('cost-invoices')
      .upload(path, Buffer.from(bytes), { contentType: file.type })
    if (uploadError) throw new Error(uploadError.message)
    file_url = path
    file_name = file.name
  }

  const { error } = await supabase
    .from('cost_invoices')
    .update({
      invoice_date:   formData.get('invoice_date') as string,
      supplier_name:  formData.get('supplier_name') as string,
      category:       formData.get('category') as InvoiceCategory,
      trade_category: (formData.get('trade_category') as string) || null,
      invoice_number: (formData.get('invoice_number') as string) || null,
      description:    (formData.get('description') as string) || null,
      amount_ex_gst:  parseFloat(formData.get('amount_ex_gst') as string),
      gst_amount:     parseFloat((formData.get('gst_amount') as string) || '0') || 0,
      file_url,
      file_name,
    })
    .eq('id', invoiceId)
    .is('claim_period_id', null)
  if (error) throw new Error(error.message)
  refresh()
}

export async function deleteCostInvoice(invoiceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('cost_invoices')
    .delete()
    .eq('id', invoiceId)
    .is('claim_period_id', null)
  if (error) throw new Error(error.message)
  refresh()
}

export async function getInvoiceFileUrl(filePath: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from('cost-invoices')
    .createSignedUrl(filePath, 300)
  if (!data?.signedUrl) throw new Error('Could not generate file URL')
  return data.signedUrl
}
