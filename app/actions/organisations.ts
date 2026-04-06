'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createOrganisation(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = formData.get('name') as string
  const abn = (formData.get('abn') as string).trim() || null
  const address = (formData.get('address') as string).trim() || null

  // Pre-generate the UUID so we never need to SELECT back the org immediately
  // after INSERT (the user has no organisation_id yet, so the SELECT policy
  // would deny it — using the known ID avoids that entirely).
  const orgId = crypto.randomUUID()

  const { error: orgError } = await supabase
    .from('organisations')
    .insert({ id: orgId, name, abn, address })

  if (orgError) return { error: orgError.message }

  // Link the user to their new org and promote to consultant role
  const { error: userError } = await supabase
    .from('users')
    .update({ organisation_id: orgId, role: 'consultant' })
    .eq('id', user.id)

  if (userError) return { error: userError.message }

  redirect('/dashboard')
}
