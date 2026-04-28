'use client'

import { useState, useTransition, useEffect, useMemo, Fragment } from 'react'
import type { DelayRecord, CascadePreviewItem, DelayFormInput } from '@/app/actions/delays'
import { previewDelayCascade, saveDelayAndApplyCascade, updateDelay, deleteDelay } from '@/app/actions/delays'
import type { DelayCause } from '@/lib/types'
import { getPhaseColor } from '@/lib/phase-colors'

// ── Constants ─────────────────────────────────────────────────────────────────

const CAUSE_LABELS: Record<string, string> = {
  weather:              'Weather',
  client_variation:     'Client Variation',
  site_conditions:      'Site Conditions',
  subcontractor:        'Subcontractor',
  material_supply:      'Material Supply',
  authority_approval:   'Authority Approval',
  other:                'Other',
}

const CAUSE_OPTIONS: DelayCause[] = [
  'weather', 'client_variation', 'site_conditions', 'subcontractor',
  'material_supply', 'authority_approval', 'other',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhaseRow { id: string; name: string; color: string; sort_order: number }
interface TaskRow  { id: string; name: string; phase_id: string; sort_order: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

const fmtDateShort = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

function diffCalendarDays(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z')
  const b = new Date(to   + 'T00:00:00Z')
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

function emptyForm(): DelayFormInput {
  return {
    cause:              'weather',
    description:        '',
    delayDays:          1,
    dateFrom:           new Date().toISOString().split('T')[0],
    dateTo:             null,
    isExcusable:        true,
    supportingEvidence: null,
    affectedTaskIds:    [],
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DelayRegisterClient({
  projectId,
  initialData,
  phases,
  tasks,
}: {
  projectId:   string
  initialData: {
    delays:             DelayRecord[]
    targetCompletion:   string | null
    adjustedCompletion: string | null
    excusableDays:      number
    nonExcusableDays:   number
  }
  phases: PhaseRow[]
  tasks:  TaskRow[]
}) {
  // ── Data state (re-built from server on refresh) ─────────────────────────
  const [data, setData] = useState(initialData)

  // Re-sync when server re-renders with new data (after refresh())
  useEffect(() => { setData(initialData) }, [initialData])

  // ── Modal state ───────────────────────────────────────────────────────────
  type Step = 'form' | 'preview'
  const [modalOpen, setModalOpen]     = useState(false)
  const [step, setStep]               = useState<Step>('form')
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState<DelayFormInput>(emptyForm)
  const [cascade, setCascade]         = useState<CascadePreviewItem[]>([])

  const [actionPending, startAction]  = useTransition()
  const [previewPending, startPreview]= useTransition()
  const [error, setError]             = useState<string | null>(null)
  const [successMsg, setSuccessMsg]   = useState<string | null>(null)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletePending, startDelete]  = useTransition()

  // ── Auto-calculate delay_days from dates ──────────────────────────────────
  useEffect(() => {
    if (form.dateFrom && form.dateTo) {
      const days = diffCalendarDays(form.dateFrom, form.dateTo)
      setForm((f) => ({ ...f, delayDays: days }))
    }
  }, [form.dateFrom, form.dateTo])

  // ── Open / close helpers ──────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm())
    setEditingId(null)
    setStep('form')
    setError(null)
    setModalOpen(true)
  }

  const openEdit = (delay: DelayRecord) => {
    setForm({
      cause:              delay.cause,
      description:        delay.description,
      delayDays:          delay.delayDays,
      dateFrom:           delay.dateFrom,
      dateTo:             delay.dateTo,
      isExcusable:        delay.isExcusable,
      supportingEvidence: delay.supportingEvidence,
      affectedTaskIds:    delay.affectedTasks.map((t) => t.taskId),
    })
    setEditingId(delay.id)
    setStep('form')
    setError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (actionPending || previewPending) return
    setModalOpen(false)
    setStep('form')
    setCascade([])
    setError(null)
  }

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  // ── Validate form ─────────────────────────────────────────────────────────
  const formValid = form.cause && form.description.trim() && form.delayDays > 0 && form.dateFrom

  // ── Step 1 → 2: preview cascade ───────────────────────────────────────────
  const handlePreview = () => {
    setError(null)
    startPreview(async () => {
      try {
        const preview = await previewDelayCascade(projectId, form.affectedTaskIds, form.delayDays)
        setCascade(preview)
        setStep('preview')
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to preview cascade')
      }
    })
  }

  // ── Step 2: confirm & save ────────────────────────────────────────────────
  const handleConfirmSave = () => {
    setError(null)
    startAction(async () => {
      try {
        if (editingId) {
          await updateDelay(editingId, projectId, form)
          showSuccess('Delay updated.')
        } else {
          await saveDelayAndApplyCascade(projectId, form)
          showSuccess('Delay recorded and programme updated.')
        }
        closeModal()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to save delay')
        setStep('form')
      }
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (delayId: string) => {
    startDelete(async () => {
      try {
        await deleteDelay(delayId)
        showSuccess('Delay deleted.')
        setDeleteConfirmId(null)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to delete delay')
      }
    })
  }

  // ── Cascade counts ────────────────────────────────────────────────────────
  const directCount   = cascade.filter((i) => i.isDirect).length
  const cascadeCount  = cascade.filter((i) => !i.isDirect).length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-y-auto flex-1">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">

        {/* ── Banners ──────────────────────────────────────────────────────── */}
        {successMsg && (
          <div className="px-4 py-3 rounded-lg text-sm font-medium" style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok)', color: 'var(--ok)' }}>
            {successMsg}
          </div>
        )}
        {error && !modalOpen && (
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
            {error}
          </div>
        )}

        {/* ── Header row ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Delay Register</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Record and track all delays affecting this project.</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 text-white text-sm font-semibold rounded transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            + Add Delay
          </button>
        </div>

        {/* ── Summary cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Excusable Days" value={`${data.excusableDays} days`} accent="green" />
          <SummaryCard label="Non-excusable Days" value={`${data.nonExcusableDays} days`} accent="red" />
          <SummaryCard
            label="Original Completion"
            value={data.targetCompletion ? fmtDate(data.targetCompletion) : 'Not set'}
            accent="gray"
          />
          <SummaryCard
            label="Adjusted Completion"
            value={data.adjustedCompletion ? fmtDate(data.adjustedCompletion) : '—'}
            accent={data.adjustedCompletion && data.targetCompletion && data.adjustedCompletion > data.targetCompletion ? 'amber' : 'gray'}
          />
        </div>

        {/* ── Delay table ──────────────────────────────────────────────────── */}
        {data.delays.length === 0 ? (
          <div className="rounded-lg px-6 py-16 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--ink-4)' }}>No delays recorded yet.</p>
            <button onClick={openAdd} className="mt-3 text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
              Record the first delay →
            </button>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-medium w-8" style={{ color: 'var(--ink-3)' }}>#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Dates</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Cause</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Days</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Excusable</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Affected Tasks</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium w-48" style={{ color: 'var(--ink-3)' }}>Description</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {data.delays.map((delay, idx) => (
                  <Fragment key={delay.id}>
                    <tr className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--ink-4)' }}>{idx + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--ink-3)' }}>
                        {fmtDateShort(delay.dateFrom)}
                        {delay.dateTo && delay.dateTo !== delay.dateFrom
                          ? ` – ${fmtDateShort(delay.dateTo)}`
                          : ''}
                        {!delay.dateTo && (
                          <span className="ml-1 text-xs" style={{ color: 'var(--warn)' }}>ongoing</span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--ink-2)' }}>
                        {CAUSE_LABELS[delay.cause] ?? delay.cause}
                      </td>
                      <td className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ink)' }}>
                        {delay.delayDays}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {delay.isExcusable ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>Yes</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AffectedTaskChips tasks={delay.affectedTasks} />
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs" style={{ color: 'var(--ink-3)' }}>
                        <p className="line-clamp-2">{delay.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openEdit(delay)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(delay.id)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--bad)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline delete confirmation */}
                    {deleteConfirmId === delay.id && (
                      <tr style={{ borderBottom: '1px solid var(--bad-soft)', background: 'var(--bad-soft)' }}>
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-4">
                            <span className="text-sm" style={{ color: 'var(--bad)' }}>
                              Delete this delay? Task dates will be reversed. This cannot be undone.
                            </span>
                            <button
                              onClick={() => handleDelete(delay.id)}
                              disabled={deletePending}
                              className="px-3 py-1 text-xs text-white rounded disabled:opacity-50"
                              style={{ background: 'var(--bad)' }}
                            >
                              {deletePending ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-1 text-xs rounded"
                              style={{ border: '1px solid var(--border)', color: 'var(--ink-3)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── Modal overlay ──────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
          />

          {/* Modal panel */}
          <div className="relative rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ background: 'var(--surface)' }}>

            {/* Modal header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                {step === 'form'
                  ? (editingId ? 'Edit Delay' : 'Add Delay')
                  : 'Preview: Programme Impact'}
              </h2>
              <button
                onClick={closeModal}
                className="text-xl leading-none"
                style={{ color: 'var(--ink-4)' }}
              >
                ×
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              {step === 'form' && (
                <DelayForm
                  form={form}
                  setForm={setForm}
                  phases={phases}
                  tasks={tasks}
                  error={error}
                />
              )}

              {step === 'preview' && (
                <CascadePreview
                  cascade={cascade}
                  delayDays={form.delayDays}
                  directCount={directCount}
                  cascadeCount={cascadeCount}
                  isEdit={!!editingId}
                />
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 flex justify-between items-center flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              {step === 'form' ? (
                <>
                  <button onClick={closeModal} className="text-sm" style={{ color: 'var(--ink-3)' }}>
                    Cancel
                  </button>
                  <button
                    onClick={handlePreview}
                    disabled={!formValid || previewPending}
                    className="px-5 py-2 text-white text-sm font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ background: 'var(--accent)' }}
                  >
                    {previewPending ? 'Calculating…' : (editingId ? 'Save Changes' : 'Preview Impact →')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setStep('form'); setError(null) }}
                    className="text-sm"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    ← Back to Form
                  </button>
                  <button
                    onClick={handleConfirmSave}
                    disabled={actionPending}
                    className="px-5 py-2 text-white text-sm font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ background: 'var(--accent)' }}
                  >
                    {actionPending ? 'Saving…' : (editingId ? 'Save Changes' : 'Confirm & Apply')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DelayForm sub-component ────────────────────────────────────────────────────

function DelayForm({
  form, setForm, phases, tasks, error,
}: {
  form: DelayFormInput
  setForm: React.Dispatch<React.SetStateAction<DelayFormInput>>
  phases: { id: string; name: string; color: string }[]
  tasks:  { id: string; name: string; phase_id: string }[]
  error:  string | null
}) {
  const inputStyle = {
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--ink)',
  }
  const inputCls = 'w-full px-3 py-2 rounded text-sm focus:outline-none'
  const labelCls = 'flex flex-col gap-1.5'
  const spanCls  = 'text-xs font-medium'

  return (
    <div className="space-y-5">
      {error && (
        <div className="px-4 py-3 rounded text-sm" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
          {error}
        </div>
      )}

      {/* Cause */}
      <label className={labelCls}>
        <span className={spanCls} style={{ color: 'var(--ink-3)' }}>Cause <span style={{ color: 'var(--bad)' }}>*</span></span>
        <select
          className={inputCls}
          style={inputStyle}
          value={form.cause}
          onChange={(e) => setForm((f) => ({ ...f, cause: e.target.value as DelayCause }))}
        >
          {CAUSE_OPTIONS.map((c) => (
            <option key={c} value={c}>{CAUSE_LABELS[c]}</option>
          ))}
        </select>
      </label>

      {/* Description */}
      <label className={labelCls}>
        <span className={spanCls} style={{ color: 'var(--ink-3)' }}>Description <span style={{ color: 'var(--bad)' }}>*</span></span>
        <textarea
          rows={2}
          className={inputCls + ' resize-none'}
          style={inputStyle}
          placeholder="e.g. Heavy rainfall prevented earthworks on site"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>

      {/* Dates + Days row */}
      <div className="grid grid-cols-3 gap-4">
        <label className={labelCls}>
          <span className={spanCls} style={{ color: 'var(--ink-3)' }}>Date From <span style={{ color: 'var(--bad)' }}>*</span></span>
          <input
            type="date" className={inputCls}
            style={inputStyle}
            value={form.dateFrom}
            onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>
        <label className={labelCls}>
          <span className={spanCls} style={{ color: 'var(--ink-3)' }}>Date To <span className="font-normal" style={{ color: 'var(--ink-4)' }}>(leave blank if ongoing)</span></span>
          <input
            type="date" className={inputCls}
            style={inputStyle}
            value={form.dateTo ?? ''}
            min={form.dateFrom}
            onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value || null }))}
          />
        </label>
        <label className={labelCls}>
          <span className={spanCls} style={{ color: 'var(--ink-3)' }}>Delay Days <span style={{ color: 'var(--bad)' }}>*</span></span>
          <input
            type="number" min={1} className={inputCls}
            style={inputStyle}
            value={form.delayDays}
            onChange={(e) => setForm((f) => ({ ...f, delayDays: parseInt(e.target.value) || 1 }))}
          />
        </label>
      </div>

      {/* Excusable */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded cursor-pointer"
          checked={form.isExcusable}
          onChange={(e) => setForm((f) => ({ ...f, isExcusable: e.target.checked }))}
        />
        <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
          Excusable delay{' '}
          <span className="text-xs" style={{ color: 'var(--ink-4)' }}>(builder entitled to time extension under contract)</span>
        </span>
      </label>

      {/* Supporting evidence */}
      <label className={labelCls}>
        <span className={spanCls} style={{ color: 'var(--ink-3)' }}>Supporting Evidence</span>
        <textarea
          rows={2}
          className={inputCls + ' resize-none'}
          style={inputStyle}
          placeholder="e.g. BOM rainfall data, council notice, variation order ref"
          value={form.supportingEvidence ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, supportingEvidence: e.target.value || null }))}
        />
      </label>

      {/* Affected tasks multi-select */}
      <div>
        <span className="block mb-2 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>
          Affected Tasks{' '}
          <span className="font-normal" style={{ color: 'var(--ink-4)' }}>
            — {form.affectedTaskIds.length} selected
          </span>
        </span>
        <TaskMultiSelect
          phases={phases}
          tasks={tasks}
          selectedIds={form.affectedTaskIds}
          onChange={(ids) => setForm((f) => ({ ...f, affectedTaskIds: ids }))}
        />
      </div>
    </div>
  )
}

// ── TaskMultiSelect sub-component ─────────────────────────────────────────────

function TaskMultiSelect({
  phases, tasks, selectedIds, onChange,
}: {
  phases:      { id: string; name: string; color: string }[]
  tasks:       { id: string; name: string; phase_id: string }[]
  selectedIds: string[]
  onChange:    (ids: string[]) => void
}) {
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Filter tasks by search
  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return tasks
    return tasks.filter((t) => t.name.toLowerCase().includes(q))
  }, [tasks, search])

  // Auto-expand phases that have matching tasks when searching
  useEffect(() => {
    if (!search.trim()) return
    const matchingPhaseIds = new Set(filteredTasks.map((t) => t.phase_id))
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of matchingPhaseIds) next.add(id)
      return next
    })
  }, [search, filteredTasks])

  const togglePhase = (phaseId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId)
      return next
    })

  const toggleTask = (taskId: string) => {
    const next = new Set(selectedSet)
    next.has(taskId) ? next.delete(taskId) : next.add(taskId)
    onChange([...next])
  }

  const togglePhaseAll = (phaseId: string) => {
    const phaseTasks = filteredTasks.filter((t) => t.phase_id === phaseId)
    const allSelected = phaseTasks.every((t) => selectedSet.has(t.id))
    const next = new Set(selectedSet)
    for (const t of phaseTasks) {
      allSelected ? next.delete(t.id) : next.add(t.id)
    }
    onChange([...next])
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {/* Search */}
      <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <input
          type="text"
          placeholder="Search tasks…"
          className="w-full text-sm bg-transparent focus:outline-none"
          style={{ color: 'var(--ink-2)' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Phase / task list */}
      <div className="max-h-56 overflow-y-auto">
        {phases.map((phase, i) => {
          const phaseTasks = filteredTasks.filter((t) => t.phase_id === phase.id)
          if (phaseTasks.length === 0 && search.trim()) return null
          if (tasks.filter((t) => t.phase_id === phase.id).length === 0) return null

          const isExpanded = expanded.has(phase.id)
          const phaseTasksAll = tasks.filter((t) => t.phase_id === phase.id)
          const selectedCount = phaseTasksAll.filter((t) => selectedSet.has(t.id)).length
          const allSelected   = phaseTasksAll.length > 0 && phaseTasksAll.every((t) => selectedSet.has(t.id))
          const someSelected  = selectedCount > 0 && !allSelected

          return (
            <div key={phase.id}>
              {/* Phase header */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors select-none"
                style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                onClick={() => togglePhase(phase.id)}
              >
                {/* Phase all-select checkbox */}
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded cursor-pointer"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={(e) => { e.stopPropagation(); togglePhaseAll(phase.id) }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: getPhaseColor(i) }}
                />
                <span className="text-xs font-semibold flex-1" style={{ color: 'var(--ink-2)' }}>{phase.name}</span>
                {selectedCount > 0 && (
                  <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{selectedCount}</span>
                )}
                <span className="text-xs" style={{ color: 'var(--ink-4)' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {/* Tasks */}
              {isExpanded && (
                <div>
                  {(search.trim() ? phaseTasks : phaseTasksAll).map((task) => (
                    <label
                      key={task.id}
                      className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                        checked={selectedSet.has(task.id)}
                        onChange={() => toggleTask(task.id)}
                      />
                      <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{task.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {filteredTasks.length === 0 && search.trim() && (
          <p className="px-4 py-4 text-sm text-center" style={{ color: 'var(--ink-4)' }}>No tasks match "{search}"</p>
        )}
        {!search.trim() && (
          <p className="px-4 py-2 text-xs text-center" style={{ color: 'var(--ink-4)' }}>
            Expand a phase to select affected tasks
          </p>
        )}
      </div>
    </div>
  )
}

// ── CascadePreview sub-component ───────────────────────────────────────────────

function CascadePreview({
  cascade, delayDays, directCount, cascadeCount, isEdit,
}: {
  cascade:      CascadePreviewItem[]
  delayDays:    number
  directCount:  number
  cascadeCount: number
  isEdit:       boolean
}) {
  if (isEdit) {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 rounded text-sm" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>
          Editing a delay does not re-cascade programme dates. To adjust task dates, use drag-to-reschedule in the Programme tab.
        </div>
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Your changes to the delay record and affected task links will be saved.</p>
      </div>
    )
  }

  if (cascade.length === 0) {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink-3)' }}>
          No tasks selected — this delay will be recorded in the register without shifting any programme dates.
        </div>
      </div>
    )
  }

  const direct   = cascade.filter((i) => i.isDirect)
  const cascaded = cascade.filter((i) => !i.isDirect)

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 px-4 py-3 rounded" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }}>
        <div className="text-sm" style={{ color: 'var(--info)' }}>
          <span className="font-semibold">{cascade.length} tasks</span> will have their current dates shifted.{' '}
          <span className="font-semibold">{directCount}</span> directly affected,{' '}
          {cascadeCount > 0 && <><span className="font-semibold">{cascadeCount}</span> cascaded via dependencies.</>}
          {cascadeCount === 0 && <>no cascade through dependencies.</>}
        </div>
      </div>

      {direct.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-3)' }}>
            Directly Affected ({directCount})
          </h3>
          <CascadeTable items={direct} />
        </div>
      )}

      {cascaded.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-3)' }}>
            Cascaded via Dependencies ({cascadeCount})
          </h3>
          <CascadeTable items={cascaded} />
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
        Planned (baseline) dates are never modified — only current dates shift.
      </p>
    </div>
  )
}

function CascadeTable({ items }: { items: CascadePreviewItem[] }) {
  return (
    <div className="rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--ink-3)' }}>Task</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Current Start</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>New Start</th>
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Shift</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.taskId} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: item.phaseColor }}
                  />
                  <span style={{ color: 'var(--ink-2)' }}>{item.taskName}</span>
                </div>
                <div className="text-xs mt-0.5 pl-3.5" style={{ color: 'var(--ink-4)' }}>{item.phaseName}</div>
              </td>
              <td className="px-3 py-2 text-right" style={{ color: 'var(--ink-3)' }}>{fmtDateShort(item.currentStart)}</td>
              <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--accent)' }}>{fmtDateShort(item.newStart)}</td>
              <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--ok)' }}>+{item.shiftDays}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── SummaryCard ────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: {
  label:  string
  value:  string
  accent: 'green' | 'red' | 'amber' | 'gray'
}) {
  const colourVar = {
    green: 'var(--ok)',
    red:   'var(--bad)',
    amber: 'var(--warn)',
    gray:  'var(--ink)',
  }
  return (
    <div className="rounded-lg px-5 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>{label}</p>
      <p className="text-lg font-bold" style={{ color: colourVar[accent] }}>{value}</p>
    </div>
  )
}

// ── AffectedTaskChips ─────────────────────────────────────────────────────────

function AffectedTaskChips({ tasks }: { tasks: { taskId: string; taskName: string }[] }) {
  if (tasks.length === 0) return <span className="text-xs" style={{ color: 'var(--ink-4)' }}>—</span>
  const show  = tasks.slice(0, 2)
  const extra = tasks.length - 2
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((t) => (
        <span
          key={t.taskId}
          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {t.taskName.length > 20 ? t.taskName.slice(0, 18) + '…' : t.taskName}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
          +{extra} more
        </span>
      )}
    </div>
  )
}
