import type React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/lib/types'

const statusLabel: Record<Project['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  on_hold: 'On Hold',
  complete: 'Complete',
}

const statusStyle: Record<Project['status'], React.CSSProperties> = {
  draft:    { background: 'var(--surface-2)', color: 'var(--ink-3)'  },
  active:   { background: 'var(--ok-soft)',   color: 'var(--ok)'     },
  on_hold:  { background: 'var(--warn-soft)', color: 'var(--warn)'   },
  complete: { background: 'var(--info-soft)', color: 'var(--info)'   },
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
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Projects</h1>
          <p className="mt-1" style={{ color: 'var(--ink-3)' }}>
            {projects?.length ?? 0} project{projects?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors"
          style={{ background: 'var(--accent)' }}
        >
          + New project
        </Link>
      </div>

      {!projects || projects.length === 0 ? (
        <div
          className="text-center py-24 rounded-xl border border-dashed"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-lg mb-4" style={{ color: 'var(--ink-4)' }}>No projects yet</p>
          <Link
            href="/projects/new"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors"
            style={{ background: 'var(--accent)' }}
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
              className="block rounded-xl p-6 transition-all"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{project.name}</h2>
                <span
                  className="shrink-0 text-xs font-medium px-2 py-1 rounded-full"
                  style={statusStyle[project.status]}
                >
                  {statusLabel[project.status]}
                </span>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-3)' }}>{project.address}</p>
              <div className="flex gap-4 text-xs" style={{ color: 'var(--ink-4)' }}>
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
