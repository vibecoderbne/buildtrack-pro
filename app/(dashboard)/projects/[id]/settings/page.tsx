import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProjectSettingsClient from './ProjectSettingsClient'

export default async function ProjectSettingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, job_type, labour_markup_percent, materials_markup_percent, default_hourly_rate, default_daily_rate')
    .eq('id', id)
    .single()

  if (!project) notFound()

  return (
    <div className="overflow-y-auto flex-1">
      <div className="max-w-2xl mx-auto px-8 py-8">
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Project Settings</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>{project.name}</p>
        <ProjectSettingsClient
          projectId={id}
          jobType={project.job_type ?? 'fixed_price'}
          labourMarkupPercent={Number(project.labour_markup_percent ?? 0)}
          materialsMarkupPercent={Number(project.materials_markup_percent ?? 0)}
          defaultHourlyRate={project.default_hourly_rate != null ? Number(project.default_hourly_rate) : null}
          defaultDailyRate={project.default_daily_rate != null ? Number(project.default_daily_rate) : null}
        />
      </div>
    </div>
  )
}
