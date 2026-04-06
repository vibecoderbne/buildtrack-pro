import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/lib/types'

const statusLabel: Record<Project['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  on_hold: 'On Hold',
  complete: 'Complete',
}

const statusColour: Record<Project['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  complete: 'bg-blue-100 text-blue-700',
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">
            {projects?.length ?? 0} project{projects?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          + New project
        </Link>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-gray-400 text-lg mb-4">No projects yet</p>
          <Link
            href="/projects/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block bg-white rounded-2xl border border-gray-200 p-6 hover:border-indigo-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="font-semibold text-gray-900 leading-tight">{project.name}</h2>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${statusColour[project.status]}`}
                >
                  {statusLabel[project.status]}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4">{project.address}</p>
              <div className="flex gap-4 text-xs text-gray-400">
                {project.start_date && (
                  <span>Started {new Date(project.start_date).toLocaleDateString('en-AU')}</span>
                )}
                {project.target_completion && (
                  <span>
                    Due {new Date(project.target_completion).toLocaleDateString('en-AU')}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
