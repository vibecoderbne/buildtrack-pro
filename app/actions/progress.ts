'use server'

import { createClient } from '@/lib/supabase/server'
import type { ClaimStatus } from '@/lib/types'

// ── Exported types ─────────────────────────────────────────────────────────────

export interface TaskProgress {
  id: string
  name: string
  contractValue: number
  previousPct: number
  currentPct: number
  movement: number
  claimAmount: number   // (movement / 100) * contractValue
}

export interface PhaseProgress {
  id: string
  name: string
  color: string
  previousPct: number   // weighted by contract value
  currentPct: number
  movement: number
  movingTasks: TaskProgress[]  // only tasks where movement > 0
}

export interface ClaimHistoryItem {
  id: string
  claimNumber: number
  periodStart: string
  periodEnd: string
  status: ClaimStatus
  grossAmount: number
  netAmount: number
  submittedAt: string | null
  createdAt: string
}

export interface ClaimLineItemDetail {
  id: string
  taskId: string
  taskName: string
  phaseName: string
  phaseColor: string
  contractValue: number
  previousPct: number
  currentPct: number
  valueToDate: number
  valuePrevious: number
  thisClaimValue: number
}

export interface ProgressReport {
  periodStart: string
  periodEnd: string
  phases: PhaseProgress[]
  overall: {
    previousPct: number
    currentPct: number
    totalTasks: number
    inProgress: number
    complete: number
  }
  claimSummary: {
    valueToDate: number
    previousClaims: number
    thisClaimGross: number
    retention: number
    netPayable: number
    retentionPct: number
  }
  projectStartDate: string
  paymentTermsDays: number
  draftClaim: ClaimHistoryItem | null
  claimHistory: ClaimHistoryItem[]
}

// ── Internal helper ────────────────────────────────────────────────────────────

function weightedAvg(items: { pct: number; weight: number }[]): number {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  if (totalWeight === 0) {
    return items.length > 0
      ? items.reduce((s, i) => s + i.pct, 0) / items.length
      : 0
  }
  return items.reduce((s, i) => s + i.pct * i.weight, 0) / totalWeight
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

// ── Main server action ─────────────────────────────────────────────────────────

export async function getProgressReport(
  projectId: string,
  claimDate: string    // YYYY-MM-DD — this becomes the period end
): Promise<ProgressReport> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Step 1: tasks + project start_date
  const [{ data: rawTasks }, { data: project }] = await Promise.all([
    supabase.from('tasks')
      .select('id, name, phase_id, contract_value, progress_pct')
      .eq('project_id', projectId)
      .order('sort_order'),
    supabase.from('projects')
      .select('start_date')
      .eq('id', projectId)
      .single(),
  ])

  const tasks = rawTasks ?? []
  const taskIds = tasks.map((t) => t.id)
  const projectStartDate = project?.start_date ?? claimDate

  // Step 2: parallel fetches
  const [
    { data: rawPhases },
    logsResult,
    { data: contract },
    { data: allClaims },
  ] = await Promise.all([
    supabase.from('phases')
      .select('id, name, color, sort_order')
      .eq('project_id', projectId)
      .order('sort_order'),

    taskIds.length > 0
      ? supabase.from('task_progress_logs')
          .select('task_id, progress_pct, logged_at')
          .in('task_id', taskIds)
          .lte('logged_at', `${claimDate}T23:59:59.999Z`)
          .order('logged_at', { ascending: true })
      : Promise.resolve({ data: [] as { task_id: string; progress_pct: number; logged_at: string }[], error: null }),

    supabase.from('contracts')
      .select('retention_pct, payment_terms_days')
      .eq('project_id', projectId)
      .maybeSingle(),

    supabase.from('payment_claims')
      .select('id, claim_number, claim_period_start, claim_period_end, status, this_claim_amount, net_claim_amount, submitted_at, created_at')
      .eq('project_id', projectId)
      .order('claim_number', { ascending: false }),
  ])

  const phases = rawPhases ?? []
  const logs   = logsResult.data ?? []
  const claims = allClaims ?? []

  // Step 3: compute period start from last submitted/approved/paid claim
  const lastFinalisedClaim = claims
    .filter((c) => ['submitted', 'approved', 'paid'].includes(c.status))
    .sort((a, b) => b.claim_period_end.localeCompare(a.claim_period_end))[0]

  const periodStart = lastFinalisedClaim
    ? addDays(lastFinalisedClaim.claim_period_end, 1)
    : projectStartDate

  const periodEnd = claimDate

  // Step 4: group logs by task
  const logsByTask: Record<string, { pct: number; date: string }[]> = {}
  for (const log of logs) {
    const date = log.logged_at.substring(0, 10)
    if (!logsByTask[log.task_id]) logsByTask[log.task_id] = []
    logsByTask[log.task_id].push({ pct: log.progress_pct, date })
  }

  // Step 5: snapshot each task at period boundaries
  const snap: Record<string, { prev: number; curr: number }> = {}

  for (const task of tasks) {
    const taskLogs = logsByTask[task.id] ?? []
    const hasLogs  = taskLogs.length > 0

    const beforeStart = taskLogs.filter((l) => l.date < periodStart)
    const prev = beforeStart.length > 0
      ? beforeStart[beforeStart.length - 1].pct
      : 0

    const curr = hasLogs
      ? taskLogs[taskLogs.length - 1].pct
      : Number(task.progress_pct)

    snap[task.id] = { prev, curr }
  }

  // Step 6: build per-phase data
  const phaseList: PhaseProgress[] = phases.map((phase) => {
    const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)

    const previousPct = weightedAvg(phaseTasks.map((t) => ({
      pct:    snap[t.id]?.prev ?? 0,
      weight: Number(t.contract_value),
    })))
    const currentPct = weightedAvg(phaseTasks.map((t) => ({
      pct:    snap[t.id]?.curr ?? 0,
      weight: Number(t.contract_value),
    })))

    const movingTasks: TaskProgress[] = phaseTasks
      .map((t) => {
        const prev     = snap[t.id]?.prev ?? 0
        const curr     = snap[t.id]?.curr ?? 0
        const movement = curr - prev
        const cv       = Number(t.contract_value)
        return {
          id:            t.id,
          name:          t.name,
          contractValue: cv,
          previousPct:   prev,
          currentPct:    curr,
          movement,
          claimAmount:   movement > 0 ? (movement / 100) * cv : 0,
        }
      })
      .filter((t) => t.movement > 0)

    return {
      id:          phase.id,
      name:        phase.name,
      color:       phase.color,
      previousPct,
      currentPct,
      movement:    currentPct - previousPct,
      movingTasks,
    }
  })

  // Step 7: overall progress
  const overallPrev = weightedAvg(tasks.map((t) => ({ pct: snap[t.id]?.prev ?? 0, weight: Number(t.contract_value) })))
  const overallCurr = weightedAvg(tasks.map((t) => ({ pct: snap[t.id]?.curr ?? 0, weight: Number(t.contract_value) })))
  const complete    = tasks.filter((t) => (snap[t.id]?.curr ?? 0) >= 100).length
  const inProgress  = tasks.filter((t) => { const p = snap[t.id]?.curr ?? 0; return p > 0 && p < 100 }).length

  // Step 8: claim summary
  const retentionPct   = contract?.retention_pct != null ? Number(contract.retention_pct) : 5
  const paymentTermsDays = contract?.payment_terms_days != null ? Number(contract.payment_terms_days) : 10

  const previousClaims = claims
    .filter((c) => ['submitted', 'approved', 'paid'].includes(c.status))
    .reduce((s, c) => s + Number(c.net_claim_amount), 0)

  const valueToDate    = tasks.reduce((s, t) => s + (snap[t.id]?.curr ?? 0) / 100 * Number(t.contract_value), 0)
  const thisClaimGross = Math.max(0, valueToDate - previousClaims)
  const retention      = thisClaimGross * (retentionPct / 100)
  const netPayable     = thisClaimGross - retention

  // Step 9: claim history
  const draftClaim = claims.find((c) => c.status === 'draft') ?? null
  const claimHistory = claims.filter((c) => c.status !== 'draft')

  const mapClaim = (c: typeof claims[number]): ClaimHistoryItem => ({
    id:          c.id,
    claimNumber: c.claim_number,
    periodStart: c.claim_period_start,
    periodEnd:   c.claim_period_end,
    status:      c.status as ClaimStatus,
    grossAmount: Number(c.this_claim_amount),
    netAmount:   Number(c.net_claim_amount),
    submittedAt: c.submitted_at,
    createdAt:   c.created_at,
  })

  return {
    periodStart,
    periodEnd,
    phases: phaseList,
    overall: { previousPct: overallPrev, currentPct: overallCurr, totalTasks: tasks.length, inProgress, complete },
    claimSummary: { valueToDate, previousClaims, thisClaimGross, retention, netPayable, retentionPct },
    projectStartDate,
    paymentTermsDays,
    draftClaim: draftClaim ? mapClaim(draftClaim) : null,
    claimHistory: claimHistory.map(mapClaim),
  }
}

// ── Fetch claim detail with line items ─────────────────────────────────────────

export async function getClaimWithLineItems(claimId: string): Promise<{
  claim: ClaimHistoryItem
  lineItems: ClaimLineItemDetail[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const [{ data: claim }, { data: rawLineItems }] = await Promise.all([
    supabase.from('payment_claims')
      .select('id, claim_number, claim_period_start, claim_period_end, status, this_claim_amount, net_claim_amount, submitted_at, created_at')
      .eq('id', claimId)
      .single(),
    supabase.from('claim_line_items')
      .select('id, task_id, contract_value, progress_pct_current, progress_pct_previous, value_to_date, value_previous, this_claim_value')
      .eq('claim_id', claimId),
  ])

  if (!claim) throw new Error('Claim not found')

  const lineItems = rawLineItems ?? []
  const taskIds = lineItems.map((li) => li.task_id)

  // Fetch task names and phases
  const { data: rawTasks } = taskIds.length > 0
    ? await supabase.from('tasks')
        .select('id, name, phase_id')
        .in('id', taskIds)
    : { data: [] }

  const taskMap = new Map((rawTasks ?? []).map((t) => [t.id, t]))
  const phaseIds = [...new Set((rawTasks ?? []).map((t) => t.phase_id).filter(Boolean))]

  const { data: rawPhases } = phaseIds.length > 0
    ? await supabase.from('phases').select('id, name, color').in('id', phaseIds)
    : { data: [] }

  const phaseMap = new Map((rawPhases ?? []).map((p) => [p.id, p]))

  const mappedLineItems: ClaimLineItemDetail[] = lineItems.map((li) => {
    const task  = taskMap.get(li.task_id)
    const phase = task ? phaseMap.get(task.phase_id) : undefined
    return {
      id:            li.id,
      taskId:        li.task_id,
      taskName:      task?.name ?? '(deleted task)',
      phaseName:     phase?.name ?? '',
      phaseColor:    phase?.color ?? '#888',
      contractValue: Number(li.contract_value),
      previousPct:   Number(li.progress_pct_previous),
      currentPct:    Number(li.progress_pct_current),
      valueToDate:   Number(li.value_to_date),
      valuePrevious: Number(li.value_previous),
      thisClaimValue: Number(li.this_claim_value),
    }
  })

  return {
    claim: {
      id:          claim.id,
      claimNumber: claim.claim_number,
      periodStart: claim.claim_period_start,
      periodEnd:   claim.claim_period_end,
      status:      claim.status as ClaimStatus,
      grossAmount: Number(claim.this_claim_amount),
      netAmount:   Number(claim.net_claim_amount),
      submittedAt: claim.submitted_at,
      createdAt:   claim.created_at,
    },
    lineItems: mappedLineItems,
  }
}
