'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function lockProjectBaseline(projectId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('lock_project_baseline', { p_project_id: projectId })

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/variations`)
  revalidatePath(`/projects/${projectId}/payments`)
  revalidatePath(`/projects/${projectId}`, 'layout')
  return { error: null }
}
