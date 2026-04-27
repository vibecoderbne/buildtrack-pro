'use server'

import { refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DelayCause } from '@/lib/types'

// ── Exported types ─────────────────────────────────────────────────────────────

export interface DelayRecord {
  id: string
  cause: DelayCause
  description: string
  delayDays: number
  dateFrom: string
  dateTo: string | null
  isExcusable: boolean
  supportingEvidence: string | null
  createdAt: string
  affectedTasks: { taskId: string; taskName: string; daysImpact: number }[]
}

export interface CascadePreviewItem {
  taskId: string
  taskName: string
  phaseName: string
  phaseColor: string
  currentStart: string
  currentEnd: string
  newStart: string
  newEnd: string
  shiftDays: number
  isDirect: boolean
}

export interface DelayFormInput {
  cause: DelayCause
  description: string
  delayDays: number
  dateFrom: string
  dateTo: string | null
  isExcusable: boolean
  supportingEvidence: string | null
  affectedTaskIds: string[]
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function diffDays(later: string, earlier: string): number {
  const a = new Date(later + 'T00:00:00Z')
  const b = new Date(earlier + 'T00:00:00Z')
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Cascade algorithm ──────────────────────────────────────────────────────────
// Returns a Map<taskId, shiftDays> for every task that needs to move.
// Direct tasks always shift by delayDays. Successors shift by the amount needed
// to maintain their finish-to-start dependency (may be less if slack existed).
//
// Uses current_end ?? planned_end (and current_start ?? planned_start) so tasks
// that have never been manually moved still participate in the cascade.

function computeCascade(
  tasks: { id: string; current_start: string | null; current_end: string | null; planned_start: string | null; planned_end: string | null }[],
  deps: { task_id: string; depends_on_task_id: string; dependency_type: string; lag_days: number }[],
  directIds: Set<string>,
  delayDays: number
): Map<string, number> {
  const shifts = new Map<string, number>()
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  // Effective dates: fall back to planned when current is null
  const effectiveEnd   = (t: typeof tasks[0]) => t.current_end   ?? t.planned_end
  const effectiveStart = (t: typeof tasks[0]) => t.current_start ?? t.planned_start

  // Seed direct affected tasks
  for (const id of directIds) {
    if (taskMap.has(id)) shifts.set(id, delayDays)
  }

  // Build predecessor → successors map (finish-to-start only)
  const succMap = new Map<string, { taskId: string; lagDays: number }[]>()
  for (const dep of deps) {
    if (dep.dependency_type !== 'finish_to_start') continue
    const predId = dep.depends_on_task_id
    if (!succMap.has(predId)) succMap.set(predId, [])
    succMap.get(predId)!.push({ taskId: dep.task_id, lagDays: dep.lag_days ?? 0 })
  }

  // BFS relaxation — only re-enqueue when shift increases
  const queue = [...directIds].filter((id) => taskMap.has(id))

  while (queue.length > 0) {
    const predId = queue.shift()!
    const predShift = shifts.get(predId) ?? 0
    const pred = taskMap.get(predId)!
    const predEnd = effectiveEnd(pred)
    if (!predEnd) continue

    const newPredEnd = addDays(predEnd, predShift)

    for (const { taskId: succId, lagDays } of succMap.get(predId) ?? []) {
      const succ = taskMap.get(succId)
      const succStart = succ ? effectiveStart(succ) : null
      if (!succStart) continue

      const requiredStart = addDays(newPredEnd, lagDays)
      const neededShift = Math.max(0, diffDays(requiredStart, succStart))
      const existingShift = shifts.get(succId) ?? 0

      if (neededShift > existingShift) {
        shifts.set(succId, neededShift)
        queue.push(succId)
      }
    }
  }

  return shifts
}

// ── getDelaysPageData ──────────────────────────────────────────────────────────

export async function getDelaysPageData(projectId: string): Promise<{
  delays: DelayRecord[]
  targetCompletion: string | null
  adjustedCompletion: string | null
  excusableDays: number
  nonExcusableDays: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const [
    { data: rawDelays },
    { data: project },
    { data: rawTasks },
  ] = await Promise.all([
    supabase.from('delays')
      .select('id, cause, description, delay_days, date_from, date_to, is_excusable, supporting_evidence, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase.from('projects')
      .select('target_completion')
      .eq('id', projectId)
      .single(),
    supabase.from('tasks')
      .select('id, current_end')
      .eq('project_id', projectId)
      .not('current_end', 'is', null),
  ])

  const delays = rawDelays ?? []
  const delayIds = delays.map((d) => d.id)

  // Fetch affected task links + task names
  const { data: rawAffected } = delayIds.length > 0
    ? await supabase.from('delay_affected_tasks')
        .select('delay_id, task_id, days_impact')
        .in('delay_id', delayIds)
    : { data: [] }

  const affected = rawAffected ?? []
  const taskIds = [...new Set(affected.map((a) => a.task_id))]

  const { data: rawTaskNames } = taskIds.length > 0
    ? await supabase.from('tasks').select('id, name').in('id', taskIds)
    : { data: [] }

  const nameMap = new Map((rawTaskNames ?? []).map((t) => [t.id, t.name]))

  // Group affected tasks by delay_id
  const affectedByDelay = new Map<string, { taskId: string; taskName: string; daysImpact: number }[]>()
  for (const a of affected) {
    if (!affectedByDelay.has(a.delay_id)) affectedByDelay.set(a.delay_id, [])
    affectedByDelay.get(a.delay_id)!.push({
      taskId: a.task_id,
      taskName: nameMap.get(a.task_id) ?? '(deleted)',
      daysImpact: a.days_impact,
    })
  }

  const delayRecords: DelayRecord[] = delays.map((d) => ({
    id: d.id,
    cause: d.cause as DelayCause,
    description: d.description,
    delayDays: d.delay_days,
    dateFrom: d.date_from,
    dateTo: d.date_to,
    isExcusable: d.is_excusable,
    supportingEvidence: d.supporting_evidence,
    createdAt: d.created_at,
    affectedTasks: affectedByDelay.get(d.id) ?? [],
  }))

  const excusableDays = delays.filter((d) => d.is_excusable).reduce((s, d) => s + d.delay_days, 0)
  const nonExcusableDays = delays.filter((d) => !d.is_excusable).reduce((s, d) => s + d.delay_days, 0)

  // Adjusted completion = latest current_end across all tasks
  const ends = (rawTasks ?? []).map((t) => t.current_end as string)
  const adjustedCompletion = ends.length > 0 ? [...ends].sort().at(-1)! : null

  return { delays: delayRecords, targetCompletion: project?.target_completion ?? null, adjustedCompletion, excusableDays, nonExcusableDays }
}

// ── previewDelayCascade ────────────────────────────────────────────────────────

export async function previewDelayCascade(
  projectId: string,
  affectedTaskIds: string[],
  delayDays: number
): Promise<CascadePreviewItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  if (delayDays <= 0) return []

  // Fetch all project tasks (include planned dates as fallback for current)
  const { data: rawTasks } = await supabase
    .from('tasks')
    .select('id, name, phase_id, current_start, current_end, planned_start, planned_end')
    .eq('project_id', projectId)

  const tasks = rawTasks ?? []
  const projectTaskIds = tasks.map((t) => t.id)

  // Fetch deps and phases in parallel
  const [{ data: rawDeps }, { data: rawPhases }] = await Promise.all([
    projectTaskIds.length > 0
      ? supabase.from('task_dependencies')
          .select('task_id, depends_on_task_id, dependency_type, lag_days')
          .in('task_id', projectTaskIds)
      : Promise.resolve({ data: [] as { task_id: string; depends_on_task_id: string; dependency_type: string; lag_days: number }[], error: null }),
    supabase.from('phases').select('id, name, color').eq('project_id', projectId),
  ])

  const deps = rawDeps ?? []
  const phaseMap = new Map((rawPhases ?? []).map((p) => [p.id, p]))

  const directIds = new Set(
    affectedTaskIds.filter((id) => projectTaskIds.includes(id))
  )
  const shifts = computeCascade(tasks, deps, directIds, delayDays)

  // Build preview items — use current ?? planned as the effective current position
  const items: CascadePreviewItem[] = []
  for (const [taskId, shiftDays] of shifts) {
    const task = tasks.find((t) => t.id === taskId)
    const effectiveStart = task?.current_start ?? task?.planned_start
    const effectiveEnd   = task?.current_end   ?? task?.planned_end
    if (!task || !effectiveStart || !effectiveEnd) continue
    const phase = phaseMap.get(task.phase_id)
    items.push({
      taskId,
      taskName: task.name,
      phaseName: phase?.name ?? '',
      phaseColor: phase?.color ?? '#888',
      currentStart: effectiveStart,
      currentEnd:   effectiveEnd,
      newStart: addDays(effectiveStart, shiftDays),
      newEnd:   addDays(effectiveEnd, shiftDays),
      shiftDays,
      isDirect: directIds.has(taskId),
    })
  }

  // Sort: direct first, then cascaded; within each group sort by currentStart
  items.sort((a, b) => {
    if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1
    return a.currentStart.localeCompare(b.currentStart)
  })

  return items
}

// ── saveDelayAndApplyCascade ───────────────────────────────────────────────────

export async function saveDelayAndApplyCascade(
  projectId: string,
  input: DelayFormInput
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // 1. Insert delay record
  const { data: delay, error: delayErr } = await supabase
    .from('delays')
    .insert({
      project_id:          projectId,
      cause:               input.cause,
      description:         input.description,
      delay_days:          input.delayDays,
      date_from:           input.dateFrom,
      date_to:             input.dateTo,
      is_excusable:        input.isExcusable,
      supporting_evidence: input.supportingEvidence,
      recorded_by:         user.id,
    })
    .select('id')
    .single()

  if (delayErr || !delay) throw new Error(delayErr?.message ?? 'Failed to save delay')

  // 2. Compute cascade — fetch planned dates too so null current_* falls back gracefully
  const { data: rawTasks } = await supabase
    .from('tasks')
    .select('id, name, phase_id, current_start, current_end, planned_start, planned_end, days_delayed')
    .eq('project_id', projectId)

  const tasks = rawTasks ?? []
  const projectTaskIds = tasks.map((t) => t.id)

  console.log('[saveDelayAndApplyCascade] total tasks in project:', tasks.length)
  console.log('[saveDelayAndApplyCascade] directIds from input:', input.affectedTaskIds)

  const { data: rawDeps } = projectTaskIds.length > 0
    ? await supabase.from('task_dependencies')
        .select('task_id, depends_on_task_id, dependency_type, lag_days')
        .in('task_id', projectTaskIds)
    : { data: [] }

  console.log('[saveDelayAndApplyCascade] dependencies found:', rawDeps?.length ?? 0)

  const directIds = new Set(
    input.affectedTaskIds.filter((id) => projectTaskIds.includes(id))
  )

  console.log('[saveDelayAndApplyCascade] valid directIds:', directIds.size, 'of', input.affectedTaskIds.length, 'requested')

  const shifts = computeCascade(tasks, rawDeps ?? [], directIds, input.delayDays)

  console.log('[saveDelayAndApplyCascade] cascade shifts computed:', shifts.size, 'tasks to move')
  for (const [taskId, days] of shifts) {
    const t = tasks.find(x => x.id === taskId)
    console.log(`  → task "${t?.name ?? taskId}" shifts ${days} days (current_start: ${t?.current_start ?? t?.planned_start})`)
  }

  // 3. Insert delay_affected_tasks for all shifted tasks
  const affectedRows = [...shifts.entries()].map(([taskId, daysImpact]) => ({
    delay_id:    delay.id,
    task_id:     taskId,
    days_impact: daysImpact,
  }))

  if (affectedRows.length > 0) {
    const { error: affErr } = await supabase
      .from('delay_affected_tasks')
      .insert(affectedRows)
    if (affErr) throw new Error(affErr.message)
  }

  // 4. Apply cascade: update current_start / current_end for shifted tasks
  //    Use current ?? planned as the base so tasks not yet manually moved still shift.
  if (shifts.size > 0) {
    const updateResults = await Promise.all(
      [...shifts.entries()].map(async ([taskId, shiftDays]) => {
        const task = tasks.find((t) => t.id === taskId)
        const baseStart = task?.current_start ?? task?.planned_start
        const baseEnd   = task?.current_end   ?? task?.planned_end
        if (!baseStart || !baseEnd) {
          console.warn('[saveDelayAndApplyCascade] skipping task with no dates:', taskId)
          return null
        }
        const newStart   = addDays(baseStart, shiftDays)
        const newEnd     = addDays(baseEnd,   shiftDays)
        const newDelayed = (task?.days_delayed ?? 0) + shiftDays
        const { error } = await supabase.from('tasks').update({
          current_start: newStart,
          current_end:   newEnd,
          days_delayed:  newDelayed,
        }).eq('id', taskId)
        if (error) {
          console.error('[saveDelayAndApplyCascade] failed to update task', taskId, error.message)
          return error
        }
        console.log(`[saveDelayAndApplyCascade] updated task ${taskId}: ${baseStart} → ${newStart}, days_delayed=${newDelayed}`)
        return null
      })
    )

    const errors = updateResults.filter(Boolean)
    if (errors.length > 0) {
      throw new Error(`Failed to update ${errors.length} task(s) — check server logs`)
    }

    // 5. Update project.current_completion = latest current_end
    const { data: latestTask } = await supabase
      .from('tasks')
      .select('current_end')
      .eq('project_id', projectId)
      .not('current_end', 'is', null)
      .order('current_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestTask?.current_end) {
      await supabase
        .from('projects')
        .update({ current_completion: latestTask.current_end })
        .eq('id', projectId)
    }
  } else {
    console.log('[saveDelayAndApplyCascade] no shifts computed — nothing updated')
  }

  refresh()
}

// ── updateDelay ────────────────────────────────────────────────────────────────
// Updates delay record and affected task links only. Does NOT re-cascade dates.

export async function updateDelay(
  delayId: string,
  projectId: string,
  input: DelayFormInput
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Update delay record
  const { error: delayErr } = await supabase
    .from('delays')
    .update({
      cause:               input.cause,
      description:         input.description,
      delay_days:          input.delayDays,
      date_from:           input.dateFrom,
      date_to:             input.dateTo,
      is_excusable:        input.isExcusable,
      supporting_evidence: input.supportingEvidence,
    })
    .eq('id', delayId)

  if (delayErr) throw new Error(delayErr.message)

  // Replace affected tasks: delete old, insert new (direct only — no cascade re-apply)
  await supabase.from('delay_affected_tasks').delete().eq('delay_id', delayId)

  const directRows = input.affectedTaskIds.map((taskId) => ({
    delay_id:    delayId,
    task_id:     taskId,
    days_impact: input.delayDays,
  }))

  if (directRows.length > 0) {
    const { error: affErr } = await supabase.from('delay_affected_tasks').insert(directRows)
    if (affErr) throw new Error(affErr.message)
  }

  refresh()
}

// ── deleteDelay ────────────────────────────────────────────────────────────────
// Reverses the date shifts this delay applied before deleting it.
// Only this delay's contribution is removed — other delays remain applied.

export async function deleteDelay(delayId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // 1. Load the delay record to get project_id for later revalidation
  const { data: delay } = await supabase
    .from('delays')
    .select('id, project_id, delay_days')
    .eq('id', delayId)
    .single()

  if (!delay) throw new Error('Delay not found')

  // 2. Load the affected-task records — each stores exactly how much this delay
  //    shifted that particular task (direct + cascaded shifts differ due to slack)
  const { data: affectedRows } = await supabase
    .from('delay_affected_tasks')
    .select('task_id, days_impact')
    .eq('delay_id', delayId)

  const affected = affectedRows ?? []

  // 3. Reverse the shift for each affected task
  if (affected.length > 0) {
    const taskIds = affected.map((a) => a.task_id)

    const { data: taskRows } = await supabase
      .from('tasks')
      .select('id, current_start, current_end, planned_start, planned_end, days_delayed')
      .in('id', taskIds)

    const taskMap = new Map((taskRows ?? []).map((t) => [t.id, t]))

    await Promise.all(
      affected.map(async ({ task_id, days_impact }) => {
        const task = taskMap.get(task_id)
        if (!task) return

        const baseStart = task.current_start ?? task.planned_start
        const baseEnd   = task.current_end   ?? task.planned_end
        if (!baseStart || !baseEnd) return

        const newStart   = addDays(baseStart, -days_impact)
        const newEnd     = addDays(baseEnd,   -days_impact)
        // Clamp days_delayed to 0 — it should never go negative even if records
        // were written before days_delayed tracking was added
        const newDelayed = Math.max(0, (task.days_delayed ?? 0) - days_impact)

        const { error } = await supabase.from('tasks').update({
          current_start: newStart,
          current_end:   newEnd,
          days_delayed:  newDelayed,
        }).eq('id', task_id)

        if (error) {
          console.error('[deleteDelay] failed to revert task', task_id, error.message)
        }
      })
    )

    // 4. Update project.current_completion to the new latest current_end
    const { data: latestTask } = await supabase
      .from('tasks')
      .select('current_end')
      .eq('project_id', delay.project_id)
      .not('current_end', 'is', null)
      .order('current_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestTask?.current_end) {
      await supabase
        .from('projects')
        .update({ current_completion: latestTask.current_end })
        .eq('id', delay.project_id)
    }
  }

  // 5. Delete links then the delay record
  await supabase.from('delay_affected_tasks').delete().eq('delay_id', delayId)

  const { error } = await supabase.from('delays').delete().eq('id', delayId)
  if (error) throw new Error(error.message)

  refresh()
}
