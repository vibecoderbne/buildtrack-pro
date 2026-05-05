'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import React, { useTransition, useState } from 'react'
import { deleteProject } from '@/app/actions/projects'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectMetrics {
  totalContract: number
  overallProgress: number
  earnedToDate: number
  variance: number | null
  nextMilestone: { name: string; date: string } | null
  dayX: number
  totalDays: number | null
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const FIXED_PRICE_TABS = [
  { label: 'Programme',      href: 'programme'  },
  { label: 'Tasks',          href: 'tasks'      },
  { label: 'Contract',       href: 'payments'   },
  { label: 'Progress Claims', href: 'progress'  },
  { label: 'Delay Register', href: 'delays'     },
  { label: 'Variations',     href: 'variations' },
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

// ── Status pill styles ────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:    { background: 'var(--surface-2)', color: 'var(--ink-3)'  },
  active:   { background: 'var(--ok-soft)',   color: 'var(--ok)'     },
  on_hold:  { background: 'var(--warn-soft)', color: 'var(--warn)'   },
  complete: { background: 'var(--info-soft)', color: 'var(--info)'   },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number) {
  const k = Math.round(n / 1000)
  return `$${k.toLocaleString()}k`
}

function fmtVariance(v: number | null) {
  if (v === null) return '—'
  if (v === 0) return 'On track'
  return v > 0 ? `+${v}d` : `${v}d`
}

function varianceColor(v: number | null): string | undefined {
  if (v === null || v === 0) return undefined
  return v > 0 ? 'var(--bad)' : 'var(--ok)'
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function FileTextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  valueColor,
  narrow = false,
}: {
  label: string
  value: string
  sub: string
  valueColor?: string
  narrow?: boolean
}) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 rounded-xl"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        minWidth: narrow ? 148 : 120,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>
        {label}
      </span>
      <span
        style={{
          fontSize: narrow ? 13 : 22,
          fontWeight: 600,
          color: valueColor ?? 'var(--ink)',
          lineHeight: 1.15,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: narrow ? 136 : undefined,
        }}
        title={value}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{sub}</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectNav({
  project,
  userRole,
  jobType,
  metrics,
}: {
  project: {
    id: string
    name: string
    address: string
    status: string
    start_date: string
    target_completion: string | null
  }
  userRole: string | null
  jobType: string
  metrics: ProjectMetrics
}) {
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [msgDismissed, setMsgDismissed] = useState(false)

  const tabs     = jobType === 'cost_plus' ? COST_PLUS_TABS : FIXED_PRICE_TABS
  const flashMsg = !msgDismissed ? (MSG_TEXT[searchParams.get('msg') ?? ''] ?? null) : null

  const { totalContract, overallProgress, earnedToDate, variance, nextMilestone, dayX, totalDays } = metrics

  const handleDelete = () => {
    if (!window.confirm(
      'Are you sure you want to delete this project? This will permanently delete all phases, tasks, dependencies, and related data.'
    )) return
    startTransition(() => { deleteProject(project.id) })
  }

  return (
    <div className="flex-shrink-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>

      {/* Flash message */}
      {flashMsg && (
        <div className="flex items-center justify-between px-8 py-2.5 text-sm" style={{ background: 'var(--info-soft)', borderBottom: '1px solid var(--info)', color: 'var(--info)' }}>
          <span>{flashMsg}</span>
          <button onClick={() => setMsgDismissed(true)} className="ml-4 text-xs font-semibold opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Project header */}
      <div className="px-8 pt-5 pb-4">

        {/* Breadcrumb row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-sm flex-wrap">
            <Link href="/dashboard" style={{ color: 'var(--ink-4)' }}>Projects</Link>
            <span style={{ color: 'var(--ink-4)' }}>›</span>
            <span className="font-medium" style={{ color: 'var(--ink-3)' }}>{project.name}</span>
            <span
              className="ml-0.5 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
              style={STATUS_STYLE[project.status] ?? STATUS_STYLE.draft}
            >
              {project.status.replace('_', ' ')}
            </span>
            {jobType === 'cost_plus' && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--accent-soft, #eff6ff)', color: 'var(--accent)' }}
              >
                Cost Plus
              </span>
            )}
          </div>
          {userRole === 'consultant' && (
            <button
              onClick={handleDelete}
              disabled={pending}
              className="text-xs transition-colors disabled:opacity-50 hover:underline"
              style={{ color: 'var(--ink-4)' }}
            >
              {pending ? 'Deleting…' : 'Delete project'}
            </button>
          )}
        </div>

        {/* Title + metric cards */}
        <div className="flex items-end justify-between gap-6">

          {/* Left: project name + sub-line */}
          <div className="min-w-0 flex-shrink">
            <h1 className="text-2xl font-bold truncate" style={{ color: 'var(--ink)' }}>
              {project.name}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Started {fmtDate(project.start_date)}
              {totalContract > 0 && ` · ${fmtK(totalContract)} contract`}
              {totalDays !== null && ` · Day ${dayX} of ${totalDays}`}
            </p>
          </div>

          {/* Right: 4 metric cards + action buttons */}
          <div className="flex items-stretch gap-2.5 flex-shrink-0">
            <MetricCard
              label="Overall Progress"
              value={`${overallProgress}%`}
              sub="by contract value"
            />
            <MetricCard
              label="Variance"
              value={fmtVariance(variance)}
              sub="vs baseline"
              valueColor={varianceColor(variance)}
            />
            <MetricCard
              label="Earned to Date"
              value={totalContract > 0 ? fmtK(earnedToDate) : '—'}
              sub={totalContract > 0 ? `of ${fmtK(totalContract)}` : 'no contract values'}
              valueColor={earnedToDate > 0 ? 'var(--ok)' : undefined}
            />
            <MetricCard
              label="Next Milestone"
              value={nextMilestone?.name ?? '—'}
              sub={nextMilestone ? fmtDate(nextMilestone.date) : 'none upcoming'}
              valueColor={nextMilestone ? 'var(--accent)' : undefined}
              narrow
            />

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-1 self-center">
              <button
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}
              >
                <UploadIcon /> Share
              </button>
              <Link
                href={`/projects/${project.id}/progress`}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ background: 'var(--ink)', color: 'var(--surface)' }}
              >
                <FileTextIcon /> Generate claim
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <nav className="px-8 -mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const href = `/projects/${project.id}/${tab.href}`
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={tab.href}
              href={href}
              className="whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
              style={isActive
                ? { borderColor: 'var(--ink)', color: 'var(--ink)', fontWeight: 600 }
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
