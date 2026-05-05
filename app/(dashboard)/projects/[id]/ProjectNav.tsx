'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import React, { useTransition, useState } from 'react'
import { deleteProject } from '@/app/actions/projects'

const statusStyle: Record<string, React.CSSProperties> = {
  draft:    { background: 'var(--surface-2)',  color: 'var(--ink-3)'  },
  active:   { background: 'var(--ok-soft)',    color: 'var(--ok)'     },
  on_hold:  { background: 'var(--warn-soft)',  color: 'var(--warn)'   },
  complete: { background: 'var(--info-soft)',  color: 'var(--info)'   },
}

const FIXED_PRICE_TABS = [
  { label: 'Programme',       href: 'programme'  },
  { label: 'Tasks',           href: 'tasks'      },
  { label: 'Contract',        href: 'payments'   },
  { label: 'Progress Claims', href: 'progress'   },
  { label: 'Delay Register',  href: 'delays'     },
  { label: 'Variations',      href: 'variations' },
]

const COST_PLUS_TABS = [
  { label: 'Costs',           href: 'costs'      },
  { label: 'Tasks',           href: 'tasks'      },
  { label: 'Programme',       href: 'programme'  },
  { label: 'Contract',        href: 'payments'   },
  { label: 'Progress Claims', href: 'progress'   },
  { label: 'Delay Register',  href: 'delays'     },
  { label: 'Variations',      href: 'variations' },
  { label: 'Settings',        href: 'settings'   },
]

const MSG_TEXT: Record<string, string> = {
  'progress-reports-unavailable': 'Progress Reports is not available on Cost Plus projects. Use Payment Claims instead.',
  'labour-invoices-unavailable':  'Labour and Invoice tracking is only available on Cost Plus projects.',
}

export default function ProjectNav({
  project,
  userRole,
  jobType,
}: {
  project: { id: string; name: string; address: string; status: string }
  userRole: string | null
  jobType: string
}) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [msgDismissed, setMsgDismissed] = useState(false)

  const tabs = jobType === 'cost_plus' ? COST_PLUS_TABS : FIXED_PRICE_TABS
  const flashMsg = !msgDismissed ? (MSG_TEXT[searchParams.get('msg') ?? ''] ?? null) : null

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
      {/* Flash message */}
      {flashMsg && (
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-lg mb-4 text-sm"
          style={{ background: 'var(--info-soft)', border: '1px solid var(--info)', color: 'var(--info)' }}
        >
          <span>{flashMsg}</span>
          <button
            onClick={() => setMsgDismissed(true)}
            className="ml-4 text-xs font-semibold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Breadcrumb + title */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link href="/dashboard" className="text-xs transition-colors" style={{ color: 'var(--ink-4)' }}>
            ← Projects
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{project.name}</h1>
            {jobType === 'cost_plus' && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--accent-soft, #eff6ff)', color: 'var(--accent)' }}
              >
                Cost Plus
              </span>
            )}
          </div>
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
