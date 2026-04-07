import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/app/(dashboard)/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from('users')
        .select('full_name, role, organisation_id')
        .eq('id', user.id)
        .single()
    : { data: null }

  // Guard: if the user has no organisation yet, send them to set one up
  if (!profile?.organisation_id) {
    redirect('/setup')
  }

  return (
    <div className="flex" style={{ height: '100vh' }}>
      <Sidebar userRole={profile.role} userName={profile.full_name} />
      <main className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>{children}</main>
    </div>
  )
}
