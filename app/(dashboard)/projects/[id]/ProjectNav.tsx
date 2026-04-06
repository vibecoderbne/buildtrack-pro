'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const statusColour: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  complete: 'bg-blue-100 text-blue-700',
}

const tabs = [
  { label: 'Programme', href: 'programme' },
  { label: 'Progress Report', href: 'progress' },
  { label: 'Delay Register', href: 'delays' },
  { label: 'Contract & Payments', href: 'payments' },
  { label: 'Homeowner Updates', href: 'homeowner' },
  { label: 'Subcontractors', href: 'subcontractors' },
]

export default function ProjectNav({
  project,
}: {
  project: { id: string; name: string; address: string; status: string }
}) {
  const pathname = usePathname()

  return (
    <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0 flex-shrink-0">
      {/* Breadcrumb + title */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600">
            ← Projects
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{project.name}</h1>
          <p className="text-sm text-gray-500">{project.address}</p>
        </div>
        <span
          className={`mt-1 text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColour[project.status] ?? statusColour.draft}`}
        >
          {project.status.replace('_', ' ')}
        </span>
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
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
