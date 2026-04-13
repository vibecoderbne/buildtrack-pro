import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomeownerLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: project }, { data: org }] = await Promise.all([
    supabase.from('projects').select('name, address, organisation_id').eq('id', projectId).single(),
    supabase.from('projects')
      .select('organisation_id')
      .eq('id', projectId)
      .single()
      .then(async ({ data }) => {
        if (!data?.organisation_id) return { data: null }
        return supabase.from('organisations').select('name').eq('id', data.organisation_id).single()
      }),
  ])

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Minimal header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>
            {project?.name ?? 'Project Update'}
          </div>
          {project?.address && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{project.address}</div>
          )}
        </div>
        {org && (
          <div style={{ fontSize: 13, color: '#6b7280' }}>{(org as any).name}</div>
        )}
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
        {children}
      </main>
    </div>
  )
}
