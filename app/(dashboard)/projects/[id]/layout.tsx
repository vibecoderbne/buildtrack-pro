import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProjectNav from './ProjectNav'

export default async function ProjectLayout(props: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const [
    { data: project },
    { data: { user } },
    { data: tasks },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, address, status, job_type, start_date, target_completion')
      .eq('id', id)
      .single(),
    supabase.auth.getUser(),
    supabase
      .from('tasks')
      .select('name, contract_value, progress_pct, is_milestone, current_start, current_end, planned_end')
      .eq('project_id', id),
  ])

  if (!project) notFound()

  const { data: profile } = user
    ? await supabase.from('users').select('role').eq('id', user.id).single()
    : { data: null }

  // ── Metric calculations ───────────────────────────────────────────────────
  const taskList = tasks ?? []
  const nonMilestones = taskList.filter(t => !t.is_milestone)

  const totalContract = nonMilestones.reduce((s, t) => s + (t.contract_value ?? 0), 0)
  const weightedNum   = nonMilestones.reduce((s, t) => s + (t.contract_value ?? 0) * (t.progress_pct ?? 0), 0)
  const overallProgress = totalContract > 0
    ? Math.round(weightedNum / totalContract)
    : nonMilestones.length > 0
      ? Math.round(nonMilestones.reduce((s, t) => s + (t.progress_pct ?? 0), 0) / nonMilestones.length)
      : 0

  const earnedToDate = nonMilestones.reduce(
    (s, t) => s + (t.contract_value ?? 0) * (t.progress_pct ?? 0) / 100,
    0
  )

  const latestPlanned = nonMilestones.map(t => t.planned_end).filter(Boolean).sort().at(-1) ?? null
  const latestCurrent = nonMilestones.map(t => t.current_end).filter(Boolean).sort().at(-1) ?? null
  const variance = latestPlanned && latestCurrent
    ? Math.round((new Date(latestCurrent).getTime() - new Date(latestPlanned).getTime()) / 86400000)
    : null

  const today    = new Date().toISOString().split('T')[0]
  const startStr = project.start_date ?? today
  const startMs  = new Date(startStr + 'T00:00:00').getTime()
  const todayMs  = new Date(today + 'T00:00:00').getTime()
  const dayX     = Math.max(1, Math.round((todayMs - startMs) / 86400000) + 1)
  const totalDays = project.target_completion
    ? Math.round((new Date(project.target_completion + 'T00:00:00').getTime() - startMs) / 86400000)
    : null

  const nextMilestone = taskList
    .filter(t => t.is_milestone && (t.current_start ?? '') >= today)
    .sort((a, b) => (a.current_start ?? '').localeCompare(b.current_start ?? ''))
    [0] ?? null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ProjectNav
        project={project}
        userRole={profile?.role ?? null}
        jobType={project.job_type ?? 'fixed_price'}
        metrics={{
          totalContract,
          overallProgress,
          earnedToDate,
          variance,
          nextMilestone: nextMilestone
            ? { name: nextMilestone.name, date: nextMilestone.current_start! }
            : null,
          dayX,
          totalDays,
        }}
      />
      {/* overflow-y-auto intentionally omitted: the Gantt chart manages its own
          internal scrollbars and needs an unclipped container. Other tab pages
          (delays, payments, etc.) that need scrolling add their own wrapper. */}
      <div className="flex-1 flex flex-col min-h-0">{props.children}</div>
    </div>
  )
}
