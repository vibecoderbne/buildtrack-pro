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
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Homeowner Updates</h1>
          <p className="text-sm text-gray-500 mt-0.5">Compose and publish updates for the homeowner</p>
        </div>
        <Link
          href={`/homeowner/${id}`}
          target="_blank"
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
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
