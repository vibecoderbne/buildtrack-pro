'use server'

import { refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ── Shared types ───────────────────────────────────────────────────────────────

export interface PhaseStatus {
  id: string
  name: string
  color: string
  sortOrder: number
  status: 'done' | 'in_progress' | 'upcoming'
  taskCount: number
  completedCount: number
  progressPct: number
  estimatedEnd: string | null
}

export interface HomeownerUpdateRecord {
  id: string
  title: string
  body: string
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  photoIds: string[]
  milestoneIds: string[]
  photos: { id: string; storagePath: string; caption: string | null; taskName: string }[]
  milestones: { id: string; name: string }[]
}

export interface HomeownerUpdateInput {
  title: string
  body: string
  photoIds: string[]
  milestoneIds: string[]
}

// ── Homeowner dashboard data ───────────────────────────────────────────────────

export interface HomeownerDashboardData {
  project: {
    name: string
    address: string
    startDate: string
    targetCompletion: string | null
    currentCompletion: string | null
  }
  orgName: string
  phases: PhaseStatus[]
  latestUpdate: HomeownerUpdateRecord | null
  upcomingMilestones: { id: string; name: string; phaseName: string; estimatedDate: string | null }[]
}

export async function getHomeownerDashboard(projectId: string): Promise<HomeownerDashboardData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const [
    { data: project },
    { data: rawPhases },
    { data: rawTasks },
    { data: rawUpdates },
  ] = await Promise.all([
    supabase.from('projects')
      .select('name, address, start_date, target_completion, current_completion, organisation_id')
      .eq('id', projectId)
      .single(),
    supabase.from('phases')
      .select('id, name, color, sort_order')
      .eq('project_id', projectId)
      .order('sort_order'),
    supabase.from('tasks')
      .select('id, name, phase_id, progress_pct, is_milestone, current_end')
      .eq('project_id', projectId),
    supabase.from('homeowner_updates')
      .select('id, title, body, is_published, published_at, created_at, photos, milestones_reached')
      .eq('project_id', projectId)
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(1),
  ])

  const { data: org } = project?.organisation_id
    ? await supabase.from('organisations').select('name').eq('id', project.organisation_id).single()
    : { data: null }

  const phases   = rawPhases ?? []
  const tasks    = rawTasks  ?? []
  const updates  = rawUpdates ?? []

  // ── Phase statuses ───────────────────────────────────────────────────────
  const phaseStatuses: PhaseStatus[] = phases.map((phase) => {
    const phaseTasks     = tasks.filter((t) => t.phase_id === phase.id)
    const completedCount = phaseTasks.filter((t) => t.progress_pct >= 100).length
    const startedCount   = phaseTasks.filter((t) => t.progress_pct > 0).length
    const taskCount      = phaseTasks.length

    let status: PhaseStatus['status'] = 'upcoming'
    if (taskCount === 0 || completedCount === taskCount) status = 'done'
    else if (startedCount > 0) status = 'in_progress'

    const progressPct = taskCount > 0
      ? phaseTasks.reduce((s, t) => s + Number(t.progress_pct), 0) / taskCount
      : 0

    const ends = phaseTasks.map((t) => t.current_end).filter(Boolean) as string[]
    const estimatedEnd = ends.length > 0 ? ends.sort().at(-1)! : null

    return { id: phase.id, name: phase.name, color: phase.color, sortOrder: phase.sort_order,
      status, taskCount, completedCount, progressPct, estimatedEnd }
  })

  // ── Upcoming milestones ──────────────────────────────────────────────────
  const upcomingMilestones = tasks
    .filter((t) => t.is_milestone && Number(t.progress_pct) < 100)
    .sort((a, b) => (a.current_end ?? '9999-12-31').localeCompare(b.current_end ?? '9999-12-31'))
    .slice(0, 5)
    .map((t) => ({
      id:            t.id,
      name:          t.name,
      phaseName:     phases.find((p) => p.id === t.phase_id)?.name ?? '',
      estimatedDate: t.current_end,
    }))

  // ── Latest published update with photos ──────────────────────────────────
  let latestUpdate: HomeownerUpdateRecord | null = null
  if (updates.length > 0) {
    const upd         = updates[0]
    const photoIds    = (upd.photos            ?? []) as string[]
    const milestoneIds = (upd.milestones_reached ?? []) as string[]

    const { data: photos } = photoIds.length > 0
      ? await supabase.from('task_photos').select('id, storage_path, caption, task_id').in('id', photoIds)
      : { data: [] }

    const photoTaskIds = [...new Set((photos ?? []).map((p) => p.task_id))]
    const { data: photoTasks } = photoTaskIds.length > 0
      ? await supabase.from('tasks').select('id, name').in('id', photoTaskIds)
      : { data: [] }

    const taskNameMap = new Map((photoTasks ?? []).map((t) => [t.id, t.name]))

    latestUpdate = {
      id:          upd.id,
      title:       upd.title,
      body:        upd.body,
      isPublished: upd.is_published,
      publishedAt: upd.published_at,
      createdAt:   upd.created_at,
      photoIds,
      milestoneIds,
      photos:     (photos ?? []).map((p) => ({
        id:          p.id,
        storagePath: p.storage_path,
        caption:     p.caption,
        taskName:    taskNameMap.get(p.task_id) ?? '',
      })),
      milestones: milestoneIds.map((mid) => ({
        id:   mid,
        name: tasks.find((t) => t.id === mid)?.name ?? '(milestone)',
      })),
    }
  }

  return {
    project: {
      name:              project?.name            ?? '',
      address:           project?.address         ?? '',
      startDate:         project?.start_date      ?? '',
      targetCompletion:  project?.target_completion  ?? null,
      currentCompletion: project?.current_completion ?? null,
    },
    orgName: org?.name ?? '',
    phases:  phaseStatuses,
    latestUpdate,
    upcomingMilestones,
  }
}

// ── Update composer actions ────────────────────────────────────────────────────

export async function getHomeownerUpdatesPage(projectId: string): Promise<{
  updates:    HomeownerUpdateRecord[]
  milestones: { id: string; name: string; phaseName: string }[]
  photos:     { id: string; storagePath: string; caption: string | null; taskName: string }[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const [
    { data: rawUpdates },
    { data: milestoneTasks },
    { data: rawPhotos },
    { data: rawPhases },
  ] = await Promise.all([
    supabase.from('homeowner_updates')
      .select('id, title, body, is_published, published_at, created_at, photos, milestones_reached')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase.from('tasks')
      .select('id, name, phase_id')
      .eq('project_id', projectId)
      .eq('is_milestone', true),
    supabase.from('task_photos')
      .select('id, storage_path, caption, task_id')
      .in('task_id',
        // We need task IDs for this project — do it as a subquery via a separate fetch
        // Handled below sequentially
        []
      ),
    supabase.from('phases')
      .select('id, name')
      .eq('project_id', projectId)
      .order('sort_order'),
  ])

  // Get all project task IDs to filter photos
  const { data: allTasks } = await supabase
    .from('tasks').select('id, name').eq('project_id', projectId)

  const allTaskIds = (allTasks ?? []).map((t) => t.id)
  const taskNameMap = new Map((allTasks ?? []).map((t) => [t.id, t.name]))
  const phaseMap    = new Map((rawPhases ?? []).map((p) => [p.id, p.name]))

  const { data: projectPhotos } = allTaskIds.length > 0
    ? await supabase.from('task_photos').select('id, storage_path, caption, task_id').in('task_id', allTaskIds)
    : { data: [] }

  const updates = rawUpdates ?? []
  const allPhotoIds = [...new Set(updates.flatMap((u) => (u.photos ?? []) as string[]))]
  const milestoneTaskIds = [...new Set(updates.flatMap((u) => (u.milestones_reached ?? []) as string[]))]

  const updateRecords: HomeownerUpdateRecord[] = updates.map((u) => {
    const photoIds    = (u.photos             ?? []) as string[]
    const milestoneIds = (u.milestones_reached ?? []) as string[]
    return {
      id:          u.id,
      title:       u.title,
      body:        u.body,
      isPublished: u.is_published,
      publishedAt: u.published_at,
      createdAt:   u.created_at,
      photoIds,
      milestoneIds,
      photos: [],       // not needed for list view
      milestones: [],   // not needed for list view
    }
  })

  return {
    updates: updateRecords,
    milestones: (milestoneTasks ?? []).map((t) => ({
      id:         t.id,
      name:       t.name,
      phaseName:  phaseMap.get(t.phase_id) ?? '',
    })),
    photos: (projectPhotos ?? []).map((p) => ({
      id:          p.id,
      storagePath: p.storage_path,
      caption:     p.caption,
      taskName:    taskNameMap.get(p.task_id) ?? '',
    })),
  }
}

export async function createHomeownerUpdate(
  projectId: string,
  input: HomeownerUpdateInput
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('homeowner_updates').insert({
    project_id:          projectId,
    title:               input.title,
    body:                input.body,
    is_published:        false,
    photos:              input.photoIds,
    milestones_reached:  input.milestoneIds,
    created_by:          user.id,
  })

  if (error) throw new Error(error.message)
  refresh()
}

export async function updateHomeownerUpdate(
  updateId: string,
  input: HomeownerUpdateInput
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('homeowner_updates').update({
    title:              input.title,
    body:               input.body,
    photos:             input.photoIds,
    milestones_reached: input.milestoneIds,
  }).eq('id', updateId)

  if (error) throw new Error(error.message)
  refresh()
}

export async function publishHomeownerUpdate(updateId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('homeowner_updates').update({
    is_published: true,
    published_at: new Date().toISOString(),
  }).eq('id', updateId)

  if (error) throw new Error(error.message)
  refresh()
}

export async function unpublishHomeownerUpdate(updateId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('homeowner_updates').update({
    is_published: false,
    published_at: null,
  }).eq('id', updateId)

  if (error) throw new Error(error.message)
  refresh()
}

export async function deleteHomeownerUpdate(updateId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase.from('homeowner_updates').delete().eq('id', updateId)
  if (error) throw new Error(error.message)
  refresh()
}
