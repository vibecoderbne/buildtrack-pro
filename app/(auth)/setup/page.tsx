import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createOrganisation } from '@/app/actions/organisations'
import SetupForm from './SetupForm'

export default async function SetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // If they already have an org, skip setup
  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (profile?.organisation_id) redirect('/dashboard')

  return (
    <div className="w-full max-w-lg">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Set up your organisation</h1>
        <p className="mt-2 text-gray-600">
          This is the company account all your projects will live under.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <SetupForm action={createOrganisation} />
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        You&apos;ll be set up as the Consultant — you can invite builders and subcontractors later.
      </p>
    </div>
  )
}
