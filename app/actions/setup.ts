'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  applyDefaultTemplate,
  applyBasicTemplate,
  applyMinimalTemplate,
} from '@/app/actions/templates'

// Guards against double-seeding if the user somehow revisits the picker.
async function hasPhases(projectId: string): Promise<boolean> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('phases')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  return (count ?? 0) > 0
}

export async function seedFullTemplate(projectId: string, startDate: string) {
  if (!(await hasPhases(projectId))) {
    const supabase = await createClient()
    const completionDate = await applyDefaultTemplate(projectId, startDate, supabase)
    await supabase
      .from('projects')
      .update({ current_completion: completionDate })
      .eq('id', projectId)
  }
  redirect(`/projects/${projectId}/setup/tasks`)
}

export async function seedBasicTemplate(projectId: string) {
  if (!(await hasPhases(projectId))) {
    const supabase = await createClient()
    await applyBasicTemplate(projectId, supabase)
  }
  redirect(`/projects/${projectId}/setup/tasks`)
}

export async function seedOwnTemplate(projectId: string, startDate: string) {
  if (!(await hasPhases(projectId))) {
    const supabase = await createClient()
    await applyMinimalTemplate(projectId, startDate, supabase)
  }
  redirect(`/projects/${projectId}/setup/tasks`)
}

export async function completeSetup(projectId: string) {
  const supabase = await createClient()
  await supabase
    .from('projects')
    .update({ setup_completed: true })
    .eq('id', projectId)
  redirect(`/projects/${projectId}/programme`)
}
