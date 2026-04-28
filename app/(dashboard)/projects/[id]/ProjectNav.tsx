'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useTransition } from 'react'
import { deleteProject } from '@/app/actions/projects'

const statusStyle: Record<string, React.CSSProperties> = {
  draft:    { background: 'var(--surface-2)',  color: 'var(--ink-3)'  },
  active:   { background: 'var(--ok-soft)',    color: 'var(--ok)'     },
  on_hold:  { background: 'var(--warn-soft)',  color: 'var(--warn)'   },
  complete: { background: 'var(--info-soft)',  color: 'var(--info)'   },
}

const tabs = [
  { label: 'Programme',       href: 'programme'      },
  { label: 'Tasks',           href: 'tasks'          },
  { label: 'Contract',        href: 'payments'       },
  { label: 'Progress Claims', href: 'progress'       },
  { label: 'Delay Register',  href: 'delays'         },
  { label: 'Variations',      href: 'variations'     },
  { label: 'Homeowner',       href: 'homeowner'      },
  { label: 'Subcontractor',   href: 'subcontractors' },
]

export default function ProjectNav({
  project,
  userRole,
}: {
  project: { id: string; name: string; address: string; status: string }
  userRole: string | null
}) {
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!window.confirm(
      'Are you sure you want to delete this project? This will permanently delete all phases, tasks, dependencies, and related data.'
    )) return
    startTransition(() => { deleteProject(project.id) })
  }

  return (
    <div
      className="px-8 pt-6 pb-0 flex-shrink-0"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Breadcrumb + title */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link href="/dashboard" className="text-xs transition-colors" style={{ color: 'var(--ink-4)' }}>
            ← Projects
          </Link>
          <h1 className="text-xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{project.name}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{project.address}</p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full capitalize"
            style={statusStyle[project.status] ?? statusStyle.draft}
          >
            {project.status.replace('_', ' ')}
          </span>
          {userRole === 'consultant' && (
            <button
              onClick={handleDelete}
              disabled={pending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ border: '1px solid var(--bad-soft)', color: 'var(--bad)', background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bad-soft)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {pending ? 'Deleting…' : 'Delete Project'}
            </button>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const href = `/projects/${project.id}/${tab.href}`
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={tab.href}
              href={href}
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
              style={isActive
                ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                : { borderColor: 'transparent', color: 'var(--ink-3)' }
              }
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
