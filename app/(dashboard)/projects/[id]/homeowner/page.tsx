import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getHomeownerUpdatesPage } from '@/app/actions/homeowner'
import HomeownerUpdatesClient from './HomeownerUpdatesClient'

export default async function HomeownerBuilderPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const pageData = await getHomeownerUpdatesPage(id)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>Homeowner Updates</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Compose and publish updates for the homeowner</p>
        </div>
        <Link
          href={`/homeowner/${id}`}
          target="_blank"
          className="text-sm font-medium flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors"
          style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Preview homeowner view
        </Link>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <HomeownerUpdatesClient
          projectId={id}
          initialData={pageData}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
        />
      </div>
    </div>
  )
}
