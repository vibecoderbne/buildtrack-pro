'use client'

import { useState, useTransition, useEffect, useMemo, Fragment } from 'react'
import type { DelayRecord, CascadePreviewItem, DelayFormInput } from '@/app/actions/delays'
import { previewDelayCascade, saveDelayAndApplyCascade, updateDelay, deleteDelay } from '@/app/actions/delays'
import type { DelayCause } from '@/lib/types'

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
          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
            {successMsg}
          </div>
        )}
        {error && !modalOpen && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Header row ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Delay Register</h1>
            <p className="text-sm text-gray-500 mt-0.5">Record and track all delays affecting this project.</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 transition-colors"
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
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center">
            <p className="text-gray-400 text-sm">No delays recorded yet.</p>
            <button onClick={openAdd} className="mt-3 text-indigo-600 text-sm font-medium hover:underline">
              Record the first delay →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-8">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Dates</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Cause</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Days</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Excusable</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Affected Tasks</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-48">Description</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {data.delays.map((delay, idx) => (
                  <Fragment key={delay.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {fmtDateShort(delay.dateFrom)}
                        {delay.dateTo && delay.dateTo !== delay.dateFrom
                          ? ` – ${fmtDateShort(delay.dateTo)}`
                          : ''}
                        {!delay.dateTo && (
                          <span className="ml-1 text-amber-500 text-xs">ongoing</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {CAUSE_LABELS[delay.cause] ?? delay.cause}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-gray-900">
                        {delay.delayDays}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {delay.isExcusable ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Yes</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AffectedTaskChips tasks={delay.affectedTasks} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">
                        <p className="line-clamp-2">{delay.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openEdit(delay)}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(delay.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline delete confirmation */}
                    {deleteConfirmId === delay.id && (
                      <tr className="border-b border-red-100 bg-red-50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-red-700">
                              Delete this delay? This cannot be undone. <span className="font-medium">Gantt dates are not reversed.</span>
                            </span>
                            <button
                              onClick={() => handleDelete(delay.id)}
                              disabled={deletePending}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletePending ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-white"
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
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900">
                {step === 'form'
                  ? (editingId ? 'Edit Delay' : 'Add Delay')
                  : 'Preview: Programme Impact'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
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
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
              {step === 'form' ? (
                <>
                  <button onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700">
                    Cancel
                  </button>
                  <button
                    onClick={handlePreview}
                    disabled={!formValid || previewPending}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {previewPending ? 'Calculating…' : (editingId ? 'Save Changes' : 'Preview Impact →')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setStep('form'); setError(null) }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    ← Back to Form
                  </button>
                  <button
                    onClick={handleConfirmSave}
                    disabled={actionPending}
                    className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400'
  const labelCls = 'flex flex-col gap-1.5'
  const spanCls  = 'text-xs font-medium text-gray-500'

  return (
    <div className="space-y-5">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Cause */}
      <label className={labelCls}>
        <span className={spanCls}>Cause <span className="text-red-400">*</span></span>
        <select
          className={inputCls + ' bg-white'}
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
        <span className={spanCls}>Description <span className="text-red-400">*</span></span>
        <textarea
          rows={2}
          className={inputCls + ' resize-none'}
          placeholder="e.g. Heavy rainfall prevented earthworks on site"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>

      {/* Dates + Days row */}
      <div className="grid grid-cols-3 gap-4">
        <label className={labelCls}>
          <span className={spanCls}>Date From <span className="text-red-400">*</span></span>
          <input
            type="date" className={inputCls}
            value={form.dateFrom}
            onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>
        <label className={labelCls}>
          <span className={spanCls}>Date To <span className="text-gray-400 font-normal">(leave blank if ongoing)</span></span>
          <input
            type="date" className={inputCls}
            value={form.dateTo ?? ''}
            min={form.dateFrom}
            onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value || null }))}
          />
        </label>
        <label className={labelCls}>
          <span className={spanCls}>Delay Days <span className="text-red-400">*</span></span>
          <input
            type="number" min={1} className={inputCls}
            value={form.delayDays}
            onChange={(e) => setForm((f) => ({ ...f, delayDays: parseInt(e.target.value) || 1 }))}
          />
        </label>
      </div>

      {/* Excusable */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-300 text-indigo-600"
          checked={form.isExcusable}
          onChange={(e) => setForm((f) => ({ ...f, isExcusable: e.target.checked }))}
        />
        <span className="text-sm text-gray-700">
          Excusable delay{' '}
          <span className="text-xs text-gray-400">(builder entitled to time extension under contract)</span>
        </span>
      </label>

      {/* Supporting evidence */}
      <label className={labelCls}>
        <span className={spanCls}>Supporting Evidence</span>
        <textarea
          rows={2}
          className={inputCls + ' resize-none'}
          placeholder="e.g. BOM rainfall data, council notice, variation order ref"
          value={form.supportingEvidence ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, supportingEvidence: e.target.value || null }))}
        />
      </label>

      {/* Affected tasks multi-select */}
      <div>
        <span className={spanCls + ' block mb-2'}>
          Affected Tasks{' '}
          <span className="text-gray-400 font-normal">
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
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Search */}
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50">
        <input
          type="text"
          placeholder="Search tasks…"
          className="w-full text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Phase / task list */}
      <div className="max-h-56 overflow-y-auto">
        {phases.map((phase) => {
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
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => togglePhase(phase.id)}
              >
                {/* Phase all-select checkbox */}
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={(e) => { e.stopPropagation(); togglePhaseAll(phase.id) }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: phase.color }}
                />
                <span className="text-xs font-semibold text-gray-700 flex-1">{phase.name}</span>
                {selectedCount > 0 && (
                  <span className="text-xs text-indigo-600 font-medium">{selectedCount}</span>
                )}
                <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </div>

              {/* Tasks */}
              {isExpanded && (
                <div>
                  {(search.trim() ? phaseTasks : phaseTasksAll).map((task) => (
                    <label
                      key={task.id}
                      className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-indigo-50/60 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
                    >
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600"
                        checked={selectedSet.has(task.id)}
                        onChange={() => toggleTask(task.id)}
                      />
                      <span className="text-sm text-gray-700">{task.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {filteredTasks.length === 0 && search.trim() && (
          <p className="px-4 py-4 text-sm text-gray-400 text-center">No tasks match "{search}"</p>
        )}
        {!search.trim() && (
          <p className="px-4 py-2 text-xs text-gray-400 text-center">
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
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          Editing a delay does not re-cascade programme dates. To adjust task dates, use drag-to-reschedule in the Programme tab.
        </div>
        <p className="text-sm text-gray-600">Your changes to the delay record and affected task links will be saved.</p>
      </div>
    )
  }

  if (cascade.length === 0) {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
          No tasks selected — this delay will be recorded in the register without shifting any programme dates.
        </div>
      </div>
    )
  }

  const direct   = cascade.filter((i) => i.isDirect)
  const cascaded = cascade.filter((i) => !i.isDirect)

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded">
        <div className="text-sm text-indigo-800">
          <span className="font-semibold">{cascade.length} tasks</span> will have their current dates shifted.{' '}
          <span className="font-semibold">{directCount}</span> directly affected,{' '}
          {cascadeCount > 0 && <><span className="font-semibold">{cascadeCount}</span> cascaded via dependencies.</>}
          {cascadeCount === 0 && <>no cascade through dependencies.</>}
        </div>
      </div>

      {direct.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Directly Affected ({directCount})
          </h3>
          <CascadeTable items={direct} />
        </div>
      )}

      {cascaded.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Cascaded via Dependencies ({cascadeCount})
          </h3>
          <CascadeTable items={cascaded} />
        </div>
      )}

      <p className="text-xs text-gray-400">
        Planned (baseline) dates are never modified — only current dates shift.
      </p>
    </div>
  )
}

function CascadeTable({ items }: { items: CascadePreviewItem[] }) {
  return (
    <div className="rounded border border-gray-200 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-3 py-2 text-gray-500 font-medium">Task</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Current Start</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">New Start</th>
            <th className="text-right px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Shift</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.taskId} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: item.phaseColor }}
                  />
                  <span className="text-gray-700">{item.taskName}</span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5 pl-3.5">{item.phaseName}</div>
              </td>
              <td className="px-3 py-2 text-right text-gray-500">{fmtDateShort(item.currentStart)}</td>
              <td className="px-3 py-2 text-right text-indigo-700 font-medium">{fmtDateShort(item.newStart)}</td>
              <td className="px-3 py-2 text-right text-green-600 font-medium">+{item.shiftDays}d</td>
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
  const colours = {
    green: 'text-green-700',
    red:   'text-red-700',
    amber: 'text-amber-700',
    gray:  'text-gray-900',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colours[accent]}`}>{value}</p>
    </div>
  )
}

// ── AffectedTaskChips ─────────────────────────────────────────────────────────

function AffectedTaskChips({ tasks }: { tasks: { taskId: string; taskName: string }[] }) {
  if (tasks.length === 0) return <span className="text-gray-400 text-xs">—</span>
  const show  = tasks.slice(0, 2)
  const extra = tasks.length - 2
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((t) => (
        <span
          key={t.taskId}
          className="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium whitespace-nowrap"
        >
          {t.taskName.length > 20 ? t.taskName.slice(0, 18) + '…' : t.taskName}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
          +{extra} more
        </span>
      )}
    </div>
  )
}
