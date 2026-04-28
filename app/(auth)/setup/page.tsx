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
        <h1 className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>Set up your organisation</h1>
        <p className="mt-2" style={{ color: 'var(--ink-3)' }}>
          This is the company account all your projects will live under.
        </p>
      </div>

      <div className="rounded-xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
        <SetupForm action={createOrganisation} />
      </div>

      <p className="mt-4 text-center text-xs" style={{ color: 'var(--ink-4)' }}>
        You&apos;ll be set up as the Consultant — you can invite builders and subcontractors later.
      </p>
    </div>
  )
}
