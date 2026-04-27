'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteProject(projectId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Consultant-only guard
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'consultant') throw new Error('Only consultants can delete projects')

  // All child tables have ON DELETE CASCADE from projects, so one delete suffices
  console.log('[deleteProject] deleting project:', projectId)
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) {
    console.error('[deleteProject] Supabase error:', error)
    throw new Error(error.message)
  }
  console.log('[deleteProject] deleted successfully')

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function createProject(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorised' }

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id) {
    return { error: 'No organisation found. Please contact your administrator.' }
  }

  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const startDate = formData.get('start_date') as string
  const targetCompletion = (formData.get('target_completion') as string) || null

  const projectId = crypto.randomUUID()

  const { error } = await supabase
    .from('projects')
    .insert({
      id: projectId,
      organisation_id: profile.organisation_id,
      name,
      address,
      start_date: startDate,
      target_completion: targetCompletion,
      builder_id: user.id,
      created_by: user.id,
      status: 'active',
    })

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  redirect(`/projects/${projectId}/setup/template`)
}
