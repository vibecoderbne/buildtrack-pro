'use client'

import React, { useState, useTransition, useMemo } from 'react'
import { lockProjectBaseline } from '@/app/actions/variations'
import { createApprovedVariation, type LineItemInput } from '@/app/actions/approved-variations'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phase { id: string; name: string; sort_order: number }

interface Task {
  id: string
  name: string
  phase_id: string
  current_start: string | null
  current_end: string | null
  contract_value: number
  sort_order: number
}

interface ApprovedScheduleRow {
  task_id: string
  approved_start_date: string
  approved_end_date: string
  approved_contract_value: number | null
}

interface VariationChange {
  id: string
  change_type: 'add_task' | 'modify_task' | 'change_value'
  task_id: string | null
  prev_start_date: string | null
  new_start_date: string | null
  prev_end_date: string | null
  new_end_date: string | null
  prev_contract_value: number | null
  new_contract_value: number | null
  new_task_name: string | null
  new_task_trade: string | null
}

interface ApprovedVariation {
  id: string
  variation_number: number
  title: string
  description: string | null
  approved_at: string
  approved_by: string | null
  created_at: string
  approved_variation_changes: VariationChange[]
}

interface Props {
  projectId: string
  baselineLockedAt: string | null
  lockedByName: string | null
  phases: Phase[]
  tasks: Task[]
  approvedVariations: ApprovedVariation[]
  approvedSchedule: ApprovedScheduleRow[]
  userNames: Record<string, string>
  nextVariationNumber: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  return `${d} ${MONTHS[m-1]} ${y}`
}

function fmtCurrency(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function daysDiff(a: string, b: string) {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function fmtDays(n: number) {
  if (n === 0) return '0d'
  return n > 0 ? `+${n}d` : `${n}d`
}

function fmtValue(n: number) {
  if (n === 0) return '$0'
  const sign = n > 0 ? '+' : ''
  return sign + new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function varianceColor(n: number): string {
  if (n > 0) return 'var(--bad)'
  if (n < 0) return 'var(--ok)'
  return 'var(--ink-3)'
}

function voNumber(n: number) {
  return `VO-${String(n).padStart(3, '0')}`
}

// Compute schedule + value impact for a single variation
function computeImpact(changes: VariationChange[]) {
  let scheduleDays = 0
  let valueChange = 0
  for (const c of changes) {
    if ((c.change_type === 'modify_task') && c.prev_end_date && c.new_end_date) {
      scheduleDays += daysDiff(c.new_end_date, c.prev_end_date)
    }
    if ((c.change_type === 'change_value') && c.prev_contract_value != null && c.new_contract_value != null) {
      valueChange += c.new_contract_value - c.prev_contract_value
    }
    if (c.change_type === 'add_task' && c.new_contract_value != null) {
      valueChange += c.new_contract_value
    }
  }
  return { scheduleDays, valueChange }
}

// ─── Modal line item state ────────────────────────────────────────────────────

interface LineItemState {
  _id: string
  type: 'modify_task' | 'change_value' | 'add_task'
  taskId: string
  newStartDate: string
  newEndDate: string
  newContractValue: string
  taskName: string
  taskTrade: string
  phaseId: string
  startDate: string
  endDate: string
  contractValue: string
}

function newLineItem(): LineItemState {
  return {
    _id: crypto.randomUUID(),
    type: 'modify_task',
    taskId: '',
    newStartDate: '',
    newEndDate: '',
    newContractValue: '',
    taskName: '',
    taskTrade: '',
    phaseId: '',
    startDate: '',
    endDate: '',
    contractValue: '',
  }
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VariationsClient({
  projectId, baselineLockedAt, lockedByName,
  phases, tasks, approvedVariations, approvedSchedule, userNames, nextVariationNumber,
}: Props) {
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)
  const [lockPending, startLockTransition] = useTransition()

  const [modalOpen, setModalOpen] = useState(false)
  const [savePending, startSaveTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Modal form state ─────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const [varNumber, setVarNumber] = useState(nextVariationNumber)
  const [varTitle, setVarTitle] = useState('')
  const [varDesc, setVarDesc] = useState('')
  const [varDate, setVarDate] = useState(today)
  const [lineItems, setLineItems] = useState<LineItemState[]>([newLineItem()])

  function openModal() {
    setVarNumber(nextVariationNumber)
    setVarTitle('')
    setVarDesc('')
    setVarDate(today)
    setLineItems([newLineItem()])
    setSaveError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setSaveError(null)
  }

  // ── Approved schedule map for prev-value lookup ──────────────────────────
  const scheduleMap = useMemo(() => {
    const m = new Map<string, ApprovedScheduleRow>()
    for (const r of approvedSchedule) m.set(r.task_id, r)
    return m
  }, [approvedSchedule])

  const taskMap = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of tasks) m.set(t.id, t)
    return m
  }, [tasks])

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let scheduleDays = 0, valueChange = 0
    for (const v of approvedVariations) {
      const { scheduleDays: sd, valueChange: vc } = computeImpact(v.approved_variation_changes)
      scheduleDays += sd
      valueChange  += vc
    }
    return { scheduleDays, valueChange }
  }, [approvedVariations])

  // ── Modal line item helpers ──────────────────────────────────────────────
  function updateLineItem(id: string, patch: Partial<LineItemState>) {
    setLineItems(prev => prev.map(li => li._id === id ? { ...li, ...patch } : li))
  }

  function removeLineItem(id: string) {
    setLineItems(prev => prev.filter(li => li._id !== id))
  }

  // Modal running totals
  const modalTotals = useMemo(() => {
    let sd = 0, vc = 0
    for (const li of lineItems) {
      if (li.type === 'modify_task' && li.taskId) {
        const sched = scheduleMap.get(li.taskId)
        if (sched && li.newEndDate && sched.approved_end_date) {
          sd += daysDiff(li.newEndDate, sched.approved_end_date)
        }
      }
      if (li.type === 'change_value' && li.taskId && li.newContractValue) {
        const sched = scheduleMap.get(li.taskId)
        const prev = sched?.approved_contract_value ?? taskMap.get(li.taskId)?.contract_value ?? 0
        vc += (parseFloat(li.newContractValue) || 0) - prev
      }
      if (li.type === 'add_task' && li.contractValue) {
        vc += parseFloat(li.contractValue) || 0
      }
    }
    return { sd, vc }
  }, [lineItems, scheduleMap, taskMap])

  // ── Lock handler ─────────────────────────────────────────────────────────
  function handleLockConfirm() {
    setLockError(null)
    startLockTransition(async () => {
      const { error } = await lockProjectBaseline(projectId)
      if (error) setLockError(error)
      else setLockConfirmOpen(false)
    })
  }

  // ── Save variation ───────────────────────────────────────────────────────
  function handleSave() {
    if (!varTitle.trim()) { setSaveError('Title is required'); return }
    if (!varDate) { setSaveError('Approved date is required'); return }
    if (lineItems.length === 0) { setSaveError('At least one change is required'); return }

    const items: LineItemInput[] = lineItems.map(li => {
      if (li.type === 'modify_task') {
        const sched = scheduleMap.get(li.taskId)
        return {
          type: 'modify_task',
          taskId: li.taskId,
          prevStartDate: sched?.approved_start_date ?? null,
          newStartDate:  li.newStartDate || null,
          prevEndDate:   sched?.approved_end_date ?? null,
          newEndDate:    li.newEndDate || null,
        }
      }
      if (li.type === 'change_value') {
        const sched = scheduleMap.get(li.taskId)
        return {
          type: 'change_value',
          taskId: li.taskId,
          prevContractValue: sched?.approved_contract_value ?? taskMap.get(li.taskId)?.contract_value ?? null,
          newContractValue: parseFloat(li.newContractValue) || null,
        }
      }
      return {
        type: 'add_task',
        taskName: li.taskName,
        taskTrade: li.taskTrade || null,
        phaseId: li.phaseId,
        startDate: li.startDate,
        endDate: li.endDate,
        contractValue: parseFloat(li.contractValue) || null,
      }
    })

    setSaveError(null)
    startSaveTransition(async () => {
      const { error } = await createApprovedVariation({
        projectId,
        variationNumber: varNumber,
        title: varTitle.trim(),
        description: varDesc.trim() || null,
        approvedAt: varDate,
        lineItems: items,
      })
      if (error) setSaveError(error)
      else closeModal()
    })
  }

  const inputStyle = {
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
  }

  const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const sortedTasks  = [...tasks].sort((a, b) => a.sort_order - b.sort_order)

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">
    <div className="flex-1 overflow-auto px-8 py-8">

      {/* ── Baseline lock status ──────────────────────────────────────────── */}
      {!baselineLockedAt ? (
        <div className="flex items-center justify-between rounded-lg p-4 mb-6" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Lock the contract to start tracking approved variations.
          </p>
          <button
            onClick={() => setLockConfirmOpen(true)}
            className="ml-6 flex-shrink-0 px-4 py-2 text-sm font-medium text-white rounded-md"
            style={{ background: 'var(--accent)' }}
          >
            Lock contract
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
          <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ok)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>
            Contract locked{lockedByName ? <> by <strong>{lockedByName}</strong></> : ''} on <strong>{fmtDate(baselineLockedAt.split('T')[0])}</strong>
          </span>
        </div>
      )}

      {/* ── Header: title + add button + summary ─────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Approved variations</h2>
        {baselineLockedAt && (
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: 'var(--ink)' }}
          >
            <span>+</span> Add approved variation
          </button>
        )}
      </div>

      {approvedVariations.length > 0 && (
        <p className="text-sm mb-5" style={{ color: 'var(--ink-3)' }}>
          {approvedVariations.length} approved variation{approvedVariations.length !== 1 ? 's' : ''}
          {' · '}
          <span style={{ color: varianceColor(totals.scheduleDays) }}>
            Schedule: {fmtDays(totals.scheduleDays)}
          </span>
          {' · '}
          <span style={{ color: varianceColor(totals.valueChange) }}>
            Value: {fmtValue(totals.valueChange)}
          </span>
        </p>
      )}

      {/* ── Variation list ───────────────────────────────────────────────── */}
      {approvedVariations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sm" style={{ color: 'var(--ink-4)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--ink-3)' }}>No approved variations yet</p>
          {baselineLockedAt
            ? <button onClick={openModal} className="mt-3 text-sm hover:underline" style={{ color: 'var(--accent)' }}>+ Add approved variation</button>
            : <p>Lock the contract to start tracking variations</p>
          }
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Table header */}
          <div
            className="grid text-xs font-semibold uppercase tracking-wide px-4 py-2.5"
            style={{ gridTemplateColumns: '80px 1fr 110px 80px 100px 30px', background: 'var(--surface-2)', color: 'var(--ink-4)', borderBottom: '1px solid var(--border)' }}
          >
            <span>#</span>
            <span>Title</span>
            <span>Approved</span>
            <span className="text-right">Schedule</span>
            <span className="text-right">Value</span>
            <span />
          </div>

          {approvedVariations.map((v, i) => {
            const { scheduleDays, valueChange } = computeImpact(v.approved_variation_changes)
            const isExpanded = expandedId === v.id
            return (
              <div key={v.id} style={{ borderBottom: i < approvedVariations.length - 1 ? '1px solid var(--border)' : undefined }}>
                {/* Row */}
                <div
                  className="grid items-center px-4 py-3 cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ gridTemplateColumns: '80px 1fr 110px 80px 100px 30px', background: 'var(--surface)' }}
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                >
                  <span className="text-sm font-mono font-medium" style={{ color: 'var(--ink-3)' }}>{voNumber(v.variation_number)}</span>
                  <span className="text-sm font-medium truncate pr-4" style={{ color: 'var(--ink)' }}>{v.title}</span>
                  <span className="text-sm" style={{ color: 'var(--ink-3)' }}>{fmtDate(v.approved_at)}</span>
                  <span className="text-sm text-right font-medium" style={{ color: varianceColor(scheduleDays) }}>{fmtDays(scheduleDays)}</span>
                  <span className="text-sm text-right font-medium" style={{ color: varianceColor(valueChange) }}>{fmtValue(valueChange)}</span>
                  <span className="text-right text-sm" style={{ color: 'var(--ink-4)' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded line items */}
                {isExpanded && (
                  <div className="px-6 pb-4 pt-1" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                    {v.description && (
                      <p className="text-sm mb-3" style={{ color: 'var(--ink-3)' }}>{v.description}</p>
                    )}
                    <div className="space-y-2">
                      {v.approved_variation_changes.map(c => (
                        <div key={c.id} className="text-xs flex items-start gap-2" style={{ color: 'var(--ink-2)' }}>
                          <span
                            className="flex-shrink-0 px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: c.change_type === 'add_task' ? 'var(--ok-soft)' : c.change_type === 'modify_task' ? 'var(--info-soft)' : 'var(--warn-soft)',
                              color: c.change_type === 'add_task' ? 'var(--ok)' : c.change_type === 'modify_task' ? 'var(--info)' : 'var(--warn)',
                              fontSize: 10,
                            }}
                          >
                            {c.change_type === 'add_task' ? 'New task' : c.change_type === 'modify_task' ? 'Date change' : 'Value change'}
                          </span>
                          <span>
                            {c.change_type === 'add_task' && `${c.new_task_name}${c.new_task_trade ? ` (${c.new_task_trade})` : ''} — ${fmtDate(c.new_start_date)} → ${fmtDate(c.new_end_date)}${c.new_contract_value != null ? ` · ${fmtCurrency(c.new_contract_value)}` : ''}`}
                            {c.change_type === 'modify_task' && `${taskMap.get(c.task_id ?? '')?.name ?? 'Task'} — end ${fmtDate(c.prev_end_date)} → ${fmtDate(c.new_end_date)}`}
                            {c.change_type === 'change_value' && `${taskMap.get(c.task_id ?? '')?.name ?? 'Task'} — value ${fmtCurrency(c.prev_contract_value)} → ${fmtCurrency(c.new_contract_value)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                    {v.approved_by && (
                      <p className="text-xs mt-3" style={{ color: 'var(--ink-4)' }}>
                        Approved by {userNames[v.approved_by] ?? 'Unknown'} on {fmtDate(v.approved_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>

    {/* ── Lock confirmation modal ───────────────────────────────────────────── */}
    {lockConfirmOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-lg shadow-xl w-full max-w-md mx-4" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Lock contract</h2>
            <button onClick={() => { setLockConfirmOpen(false); setLockError(null) }} style={{ color: 'var(--ink-4)' }}>✕</button>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Locking the contract will snapshot the current programme as the baseline. This cannot be undone. Continue?
            </p>
            {lockError && <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>{lockError}</p>}
          </div>
          <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => { setLockConfirmOpen(false); setLockError(null) }} disabled={lockPending}
              className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
              style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}>Cancel</button>
            <button onClick={handleLockConfirm} disabled={lockPending}
              className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {lockPending ? 'Locking…' : 'Lock contract'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Add approved variation modal ─────────────────────────────────────── */}
    {modalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ background: 'var(--surface)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Add approved variation</h2>
            <button onClick={closeModal} style={{ color: 'var(--ink-4)', fontSize: 20 }}>×</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Variation details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <SectionLabel>Variation number</SectionLabel>
                <input type="number" value={varNumber} onChange={e => setVarNumber(parseInt(e.target.value) || 1)}
                  style={inputStyle} />
              </div>
              <div>
                <SectionLabel>Approved date *</SectionLabel>
                <input type="date" value={varDate} onChange={e => setVarDate(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <SectionLabel>Title *</SectionLabel>
              <input type="text" value={varTitle} onChange={e => setVarTitle(e.target.value)}
                placeholder="e.g. Extended footing duration" style={inputStyle} />
            </div>

            <div>
              <SectionLabel>Description</SectionLabel>
              <textarea value={varDesc} onChange={e => setVarDesc(e.target.value)}
                placeholder="Optional notes…" rows={2}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {/* Line items */}
            <div>
              <SectionLabel>Changes</SectionLabel>
              <div className="space-y-3">
                {lineItems.map((li, idx) => (
                  <div key={li._id} className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Change {idx + 1}</span>
                      {lineItems.length > 1 && (
                        <button onClick={() => removeLineItem(li._id)} className="text-xs" style={{ color: 'var(--bad)' }}>Remove</button>
                      )}
                    </div>

                    <div>
                      <SectionLabel>Change type</SectionLabel>
                      <select value={li.type}
                        onChange={e => updateLineItem(li._id, { type: e.target.value as LineItemState['type'], taskId: '', newStartDate: '', newEndDate: '', newContractValue: '' })}
                        style={inputStyle}>
                        <option value="modify_task">Modify task dates</option>
                        <option value="change_value">Change contract value</option>
                        <option value="add_task">Add new task</option>
                      </select>
                    </div>

                    {/* Modify task */}
                    {li.type === 'modify_task' && (
                      <>
                        <div>
                          <SectionLabel>Task</SectionLabel>
                          <select value={li.taskId} onChange={e => updateLineItem(li._id, { taskId: e.target.value })} style={inputStyle}>
                            <option value="">Select task…</option>
                            {sortedTasks.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        {li.taskId && (() => {
                          const sched = scheduleMap.get(li.taskId)
                          return (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <SectionLabel>New start date</SectionLabel>
                                <input type="date" value={li.newStartDate}
                                  onChange={e => updateLineItem(li._id, { newStartDate: e.target.value })}
                                  style={inputStyle} />
                                {sched && <div className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Current: {fmtDate(sched.approved_start_date)}</div>}
                              </div>
                              <div>
                                <SectionLabel>New end date</SectionLabel>
                                <input type="date" value={li.newEndDate}
                                  onChange={e => updateLineItem(li._id, { newEndDate: e.target.value })}
                                  style={inputStyle} />
                                {sched && <div className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Current: {fmtDate(sched.approved_end_date)}</div>}
                              </div>
                            </div>
                          )
                        })()}
                      </>
                    )}

                    {/* Change value */}
                    {li.type === 'change_value' && (
                      <>
                        <div>
                          <SectionLabel>Task</SectionLabel>
                          <select value={li.taskId} onChange={e => updateLineItem(li._id, { taskId: e.target.value })} style={inputStyle}>
                            <option value="">Select task…</option>
                            {sortedTasks.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        {li.taskId && (() => {
                          const sched = scheduleMap.get(li.taskId)
                          const prev = sched?.approved_contract_value ?? taskMap.get(li.taskId)?.contract_value ?? 0
                          return (
                            <div>
                              <SectionLabel>New contract value (AUD)</SectionLabel>
                              <input type="number" min={0} step={0.01} value={li.newContractValue}
                                onChange={e => updateLineItem(li._id, { newContractValue: e.target.value })}
                                placeholder="0.00" style={inputStyle} />
                              <div className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Current approved: {fmtCurrency(prev)}</div>
                            </div>
                          )
                        })()}
                      </>
                    )}

                    {/* Add task */}
                    {li.type === 'add_task' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <SectionLabel>Task name *</SectionLabel>
                            <input type="text" value={li.taskName}
                              onChange={e => updateLineItem(li._id, { taskName: e.target.value })}
                              placeholder="e.g. Retaining wall" style={inputStyle} />
                          </div>
                          <div>
                            <SectionLabel>Trade</SectionLabel>
                            <input type="text" value={li.taskTrade}
                              onChange={e => updateLineItem(li._id, { taskTrade: e.target.value })}
                              placeholder="e.g. Concreter" style={inputStyle} />
                          </div>
                        </div>
                        <div>
                          <SectionLabel>Phase *</SectionLabel>
                          <select value={li.phaseId} onChange={e => updateLineItem(li._id, { phaseId: e.target.value })} style={inputStyle}>
                            <option value="">Select phase…</option>
                            {sortedPhases.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <SectionLabel>Start date *</SectionLabel>
                            <input type="date" value={li.startDate}
                              onChange={e => updateLineItem(li._id, { startDate: e.target.value })} style={inputStyle} />
                          </div>
                          <div>
                            <SectionLabel>End date *</SectionLabel>
                            <input type="date" value={li.endDate}
                              onChange={e => updateLineItem(li._id, { endDate: e.target.value })} style={inputStyle} />
                          </div>
                          <div>
                            <SectionLabel>Value (AUD)</SectionLabel>
                            <input type="number" min={0} step={0.01} value={li.contractValue}
                              onChange={e => updateLineItem(li._id, { contractValue: e.target.value })}
                              placeholder="0" style={inputStyle} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => setLineItems(prev => [...prev, newLineItem()])}
                  className="text-sm font-medium hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  + Add change
                </button>
              </div>
            </div>

            {/* Running totals */}
            {lineItems.length > 0 && (
              <div className="flex gap-6 text-sm pt-1" style={{ color: 'var(--ink-3)' }}>
                <span>Schedule impact: <strong style={{ color: varianceColor(modalTotals.sd) }}>{fmtDays(modalTotals.sd)}</strong></span>
                <span>Value impact: <strong style={{ color: varianceColor(modalTotals.vc) }}>{fmtValue(modalTotals.vc)}</strong></span>
              </div>
            )}

            {saveError && (
              <p className="text-sm" style={{ color: 'var(--bad)' }}>{saveError}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={closeModal} disabled={savePending}
              className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
              style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}>Cancel</button>
            <button onClick={handleSave} disabled={savePending}
              className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
              style={{ background: 'var(--ink)' }}>
              {savePending ? 'Saving…' : 'Save variation'}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}
